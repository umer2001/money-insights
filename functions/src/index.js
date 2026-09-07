const fs = require('fs');
const path = require('path');
const CONFIG = require('./config');
const { writeCsv } = require('./utils/csvWriter');
const { writeExcel } = require('./utils/excelWriter');
const { validateTransactions } = require('./utils/validator');

const AblParser = require('./parsers/ablParser');
const FblParser = require('./parsers/fblParser');
const NayaPayParser = require('./parsers/nayaPayParser');
const PayoneerParser = require('./parsers/payoneerParser');
const SadaPayParser = require('./parsers/sadaPayParser');
const EasyPaisaParser = require('./parsers/easyPaisaParser');

const PARSERS = {
  abl: {
    parserClass: AblParser,
    config: CONFIG.banks.abl,
    resolveFile: () => {
      const p = path.join(CONFIG.banks.abl.inputDir, 'abl.pdf');
      return fs.existsSync(p) ? p : null;
    },
    validationOptions: {
      expectedOpeningBalance: 19309.32,
      expectedClosingBalance: 1822.36
    }
  },
  fbl: {
    parserClass: FblParser,
    config: CONFIG.banks.fbl,
    resolveFile: () => {
      const excelPath = path.join(CONFIG.banks.fbl.inputDir, 'statement-fbl');
      if (fs.existsSync(excelPath)) return excelPath;
      const pdfPath = path.join(CONFIG.banks.fbl.inputDir, 'FBL Account Statement.pdf');
      if (fs.existsSync(pdfPath)) return pdfPath;
      return null;
    },
    validationOptions: {
      expectedOpeningBalance: 50153.83,
      expectedClosingBalance: 54080.72
    }
  },
  nayaPay: {
    parserClass: NayaPayParser,
    config: CONFIG.banks.nayaPay,
    resolveFile: () => {
      const csvPath = path.join(CONFIG.banks.nayaPay.inputDir, 'naya-y-2025.csv');
      if (fs.existsSync(csvPath)) return csvPath;
      return null;
    },
    validationOptions: {
      expectedOpeningBalance: 11.56,
      expectedClosingBalance: 648.56
    }
  },
  payoneer: {
    parserClass: PayoneerParser,
    config: CONFIG.banks.payoneer,
    resolveFile: () => {
      const csvPath = path.join(CONFIG.banks.payoneer.inputDir, 'payoneer.csv');
      if (fs.existsSync(csvPath)) return csvPath;
      return null;
    },
    validationOptions: {}
  },
  sadaPay: {
    parserClass: SadaPayParser,
    config: CONFIG.banks.sadaPay,
    resolveFile: () => {
      const files = fs.readdirSync(CONFIG.banks.sadaPay.inputDir);
      const stmt = files.find(f => f.startsWith('sadapay_account_statement') && f.endsWith('.pdf'));
      return stmt ? path.join(CONFIG.banks.sadaPay.inputDir, stmt) : null;
    },
    validationOptions: {
      expectedTotalDebit: 552148.79,
      expectedTotalCredit: 551832.59
    }
  },
  easyPaisa: {
    parserClass: EasyPaisaParser,
    config: CONFIG.banks.easyPaisa,
    resolveFile: () => {
      const p = path.join(CONFIG.banks.easyPaisa.inputDir, 'statement.pdf');
      return fs.existsSync(p) ? p : null;
    },
    validationOptions: {
      expectedOpeningBalance: 1410.61,
      expectedClosingBalance: 87.41
    }
  }
};

async function run() {
  const args = process.argv.slice(2);
  const shouldConsolidate = args.includes('--consolidate');

  console.log('===============================================================');
  console.log('         Bank Statements Standardization Pipeline             ');
  console.log('===============================================================\n');

  // Ensure output directory exists
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }

  const resultsSummary = [];
  const allTransactions = [];

  for (const [key, entry] of Object.entries(PARSERS)) {
    const filePath = entry.resolveFile();
    if (!filePath) {
      console.warn(`[WARN] No statement file found for ${entry.config.fullName} in ${entry.config.inputDir}`);
      continue;
    }

    console.log(`Processing ${entry.config.fullName} (${entry.config.name})...`);
    console.log(`  Source: ${filePath}`);

    try {
      const parser = new entry.parserClass(key, entry.config);
      const txs = await parser.parse(filePath);
      console.log(`  Parsed: ${txs.length} transactions`);

      // Validation
      const validation = validateTransactions(txs, entry.validationOptions);
      console.log(`  Auditing: Debits = ${validation.totalDebit.toLocaleString()} ${entry.config.currency}, Credits = ${validation.totalCredit.toLocaleString()} ${entry.config.currency}, Net = ${validation.netChange.toLocaleString()} ${entry.config.currency}`);
      
      let status = 'PASS';
      if (!validation.isValid) {
        status = 'FAIL';
        console.error(`  [ERROR] Validation failed for ${entry.config.name}:`, validation.invalidRows);
      } else if (validation.closingMatches === false || validation.debitMatches === false || validation.creditMatches === false) {
        status = 'WARNING';
      }

      // Output files
      const csvPath = path.join(CONFIG.outputDir, `${entry.config.outputPrefix}_standardized.csv`);
      const excelPath = path.join(CONFIG.outputDir, `${entry.config.outputPrefix}_standardized.xlsx`);

      writeCsv(csvPath, txs);
      writeExcel(excelPath, txs, entry.config.name);
      console.log(`  Output generated:`);
      console.log(`    CSV:   ${csvPath}`);
      console.log(`    Excel: ${excelPath}\n`);

      resultsSummary.push({
        Bank: entry.config.name,
        Currency: entry.config.currency,
        Transactions: txs.length,
        'Total Debits': validation.totalDebit.toLocaleString(),
        'Total Credits': validation.totalCredit.toLocaleString(),
        'Net Cashflow': validation.netChange.toLocaleString(),
        Status: status
      });

      allTransactions.push(...txs);
    } catch (err) {
      console.error(`[ERROR] Failed to process ${entry.config.fullName}:`, err.message);
      resultsSummary.push({
        Bank: entry.config.name,
        Currency: entry.config.currency,
        Transactions: 0,
        'Total Debits': '-',
        'Total Credits': '-',
        'Net Cashflow': '-',
        Status: `ERROR: ${err.message}`
      });
    }
  }

  // Summary table
  console.log('---------------------------------------------------------------');
  console.log('                    Standardization Summary                    ');
  console.log('---------------------------------------------------------------');
  console.table(resultsSummary);

  // Optional consolidation
  if (shouldConsolidate) {
    console.log('\n===============================================================');
    console.log('                 Consolidating by Currency                     ');
    console.log('===============================================================\n');

    if (!fs.existsSync(CONFIG.consolidatedDir)) {
      fs.mkdirSync(CONFIG.consolidatedDir, { recursive: true });
    }

    const byCurrency = {};
    for (const tx of allTransactions) {
      const cur = tx.currency || 'UNKNOWN';
      if (!byCurrency[cur]) byCurrency[cur] = [];
      byCurrency[cur].push(tx);
    }

    for (const [cur, txs] of Object.entries(byCurrency)) {
      // Sort chronologically: date ASC, then time ASC
      txs.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.time || '').localeCompare(b.time || '');
      });

      const consCsv = path.join(CONFIG.consolidatedDir, `consolidated_${cur.toLowerCase()}.csv`);
      const consXlsx = path.join(CONFIG.consolidatedDir, `consolidated_${cur.toLowerCase()}.xlsx`);

      writeCsv(consCsv, txs);
      writeExcel(consXlsx, txs, `Consolidated_${cur}`);

      console.log(`Consolidated ${cur}: ${txs.length} transactions`);
      console.log(`  CSV:   ${consCsv}`);
      console.log(`  Excel: ${consXlsx}`);
    }
  }

  console.log('\nAll done! You can re-run this anytime with: npm run convert');
}

if (require.main === module) {
  run().catch(console.error);
}

module.exports = { run, PARSERS, CONFIG };
