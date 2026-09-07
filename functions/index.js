const { setGlobalOptions } = require('firebase-functions/v2');
const { onRequest } = require('firebase-functions/v2/https');
const Busboy = require('busboy');
const cors = require('cors')({ origin: true });

setGlobalOptions({ maxInstances: 10, timeoutSeconds: 120, memory: '512MiB' });

let cachedModules = null;
function getModules() {
  if (!cachedModules) {
    const CONFIG = require('./src/config');
    const AblParser = require('./src/parsers/ablParser');
    const FblParser = require('./src/parsers/fblParser');
    const SadaPayParser = require('./src/parsers/sadaPayParser');
    const EasyPaisaParser = require('./src/parsers/easyPaisaParser');
    const NayaPayParser = require('./src/parsers/nayaPayParser');
    const PayoneerParser = require('./src/parsers/payoneerParser');
    const { detectBankFormat } = require('./src/parsers/detector');
    const { validateTransactions } = require('./src/utils/validator');
    const { generateCsvString } = require('./src/utils/csvWriter');
    const { generateExcelBuffer } = require('./src/utils/excelWriter');

    cachedModules = {
      CONFIG,
      detectBankFormat,
      validateTransactions,
      generateCsvString,
      generateExcelBuffer,
      parserMap: {
        abl: { Class: AblParser, config: CONFIG.banks.abl },
        fbl: { Class: FblParser, config: CONFIG.banks.fbl },
        sadaPay: { Class: SadaPayParser, config: CONFIG.banks.sadaPay },
        easyPaisa: { Class: EasyPaisaParser, config: CONFIG.banks.easyPaisa },
        nayaPay: { Class: NayaPayParser, config: CONFIG.banks.nayaPay },
        payoneer: { Class: PayoneerParser, config: CONFIG.banks.payoneer }
      }
    };
  }
  return cachedModules;
}

/**
 * Parse multipart body
 */
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    const fields = {};
    let fileBuffer = null;
    let fileName = '';
    let mimeType = '';

    busboy.on('file', (fieldname, file, info) => {
      fileName = info.filename;
      mimeType = info.mimeType;
      const chunks = [];
      file.on('data', chunk => chunks.push(chunk));
      file.on('end', () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    busboy.on('field', (fieldname, val) => {
      fields[fieldname] = val;
    });

    busboy.on('finish', () => {
      resolve({
        fields,
        file: fileBuffer ? { buffer: fileBuffer, filename: fileName, mimeType } : null
      });
    });

    busboy.on('error', reject);

    if (req.rawBody) {
      busboy.end(req.rawBody);
    } else {
      req.pipe(busboy);
    }
  });
}

exports.api = onRequest({ cors: true }, (req, res) => {
  cors(req, res, async () => {
    const path = req.path.replace(/^\/api/, '') || '/';

    try {
      // 1. Healthcheck
      if (req.method === 'GET' && (path === '/health' || path === '/')) {
        return res.json({
          status: 'ok',
          service: 'money-insight-api',
          timestamp: new Date().toISOString()
        });
      }

      const {
        detectBankFormat,
        validateTransactions,
        generateCsvString,
        generateExcelBuffer,
        parserMap
      } = getModules();

      // 2. Format detection
      if (req.method === 'POST' && path === '/detect') {
        const { fields, file } = await parseMultipart(req);
        if (!file) {
          return res.status(400).json({ error: 'No file uploaded' });
        }

        const password = fields.password || '';
        const detected = await detectBankFormat(file.filename, file.buffer, password);
        const bankInfo = detected.bank !== 'unknown' ? parserMap[detected.bank]?.config : null;

        return res.json({
          detected: {
            ...detected,
            bankName: bankInfo ? bankInfo.name : 'Unknown Bank',
            fullName: bankInfo ? bankInfo.fullName : 'Unknown Format',
            currency: bankInfo ? bankInfo.currency : 'PKR'
          }
        });
      }

      // 3. Parse Statement
      if (req.method === 'POST' && path === '/parse') {
        const { fields, file } = await parseMultipart(req);
        if (!file) {
          return res.status(400).json({ error: 'No file uploaded' });
        }

        const password = fields.password || '';
        let bankKey = fields.bank;

        if (!bankKey || bankKey === 'auto' || bankKey === 'unknown') {
          const detection = await detectBankFormat(file.filename, file.buffer, password);
          bankKey = detection.bank;
        } else if (password) {
          const detection = await detectBankFormat(file.filename, file.buffer, password);
          if (detection.bank !== 'unknown' && detection.confidence > 0.8) {
            bankKey = detection.bank;
          }
        }

        const parserDef = parserMap[bankKey];
        if (!parserDef) {
          return res.status(400).json({
            error: `Unsupported or unrecognized statement format: ${bankKey || 'unknown'}. Please specify bank manually.`
          });
        }

        try {
          const parser = new parserDef.Class(bankKey, parserDef.config);
          const transactions = await parser.parse(file.buffer, password);
          const validation = validateTransactions(transactions);

          return res.json({
            success: true,
            bank: bankKey,
            bankName: parserDef.config.name,
            fullName: parserDef.config.fullName,
            currency: parserDef.config.currency,
            filename: file.filename,
            transactions,
            validation: {
              isValid: validation.isValid,
              totalDebit: validation.totalDebit,
              totalCredit: validation.totalCredit,
              netChange: validation.netChange,
              openingBalance: validation.openingBalance,
              closingBalance: validation.closingBalance,
              closingMatches: validation.closingMatches,
              invalidRowsCount: (validation.invalidRows || []).length
            }
          });
        } catch (err) {
          const errMsg = (err.message || '').toLowerCase();
          const errName = (err.name || '').toLowerCase();
          const isPasswordError =
            errName.includes('password') ||
            errMsg.includes('password') ||
            errMsg.includes('encrypt') ||
            errMsg.includes('bad decrypt');

          if (isPasswordError) {
            return res.status(422).json({
              error: 'Statement is password protected or password was incorrect.',
              code: 'PASSWORD_REQUIRED',
              bank: bankKey
            });
          }

          return res.status(500).json({
            error: `Failed to parse statement: ${errMsg}`,
            bank: bankKey
          });
        }
      }

      // 4. Export individual or consolidated file
      if (req.method === 'POST' && path === '/export') {
        const { transactions = [], format = 'xlsx', sheetName = 'Standardized_Statement' } = req.body || {};

        if (!transactions.length) {
          return res.status(400).json({ error: 'No transactions to export' });
        }

        if (format === 'csv') {
          const csv = generateCsvString(transactions);
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="${sheetName}.csv"`);
          return res.send(csv);
        } else {
          const excelBuf = generateExcelBuffer(transactions, sheetName);
          res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          );
          res.setHeader('Content-Disposition', `attachment; filename="${sheetName}.xlsx"`);
          return res.send(excelBuf);
        }
      }

      // 5. Consolidate Multiple Statements by Currency
      if (req.method === 'POST' && path === '/consolidate') {
        const { statements = [], format = 'xlsx' } = req.body || {};
        if (!statements.length) {
          return res.status(400).json({ error: 'No statements provided for consolidation' });
        }

        // Aggregate all transactions
        const allTransactions = [];
        for (const stmt of statements) {
          if (Array.isArray(stmt.transactions)) {
            allTransactions.push(...stmt.transactions);
          }
        }

        // Group by currency
        const byCurrency = {};
        for (const tx of allTransactions) {
          const cur = tx.currency || 'PKR';
          if (!byCurrency[cur]) byCurrency[cur] = [];
          byCurrency[cur].push(tx);
        }

        // Sort chronologically
        for (const cur of Object.keys(byCurrency)) {
          byCurrency[cur].sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return (a.time || '').localeCompare(b.time || '');
          });
        }

        // Produce currency summaries and export data
        const summary = {};
        const exports = {};

        for (const [cur, txs] of Object.entries(byCurrency)) {
          const val = validateTransactions(txs);
          summary[cur] = {
            transactionCount: txs.length,
            totalDebit: val.totalDebit,
            totalCredit: val.totalCredit,
            netChange: val.netChange,
            isValid: val.isValid
          };

          if (format === 'csv') {
            exports[cur] = {
              filename: `consolidated_${cur.toLowerCase()}.csv`,
              contentBase64: Buffer.from(generateCsvString(txs)).toString('base64'),
              mimeType: 'text/csv'
            };
          } else {
            exports[cur] = {
              filename: `consolidated_${cur.toLowerCase()}.xlsx`,
              contentBase64: generateExcelBuffer(txs, `Consolidated_${cur}`).toString('base64'),
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            };
          }
        }

        return res.json({
          success: true,
          totalTransactions: allTransactions.length,
          currencies: Object.keys(byCurrency),
          summary,
          exports
        });
      }

      return res.status(404).json({ error: `Not found: ${req.method} ${path}` });
    } catch (error) {
      console.error('API Error:', error);
      return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  });
});
