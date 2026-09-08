const fs = require('fs');
const { PDFParse } = require('pdf-parse');
const BaseParser = require('./baseParser');
const { normalizeDate } = require('../utils/dateUtils');

/**
 * EClear & PSX Broker Statement Parser
 * Handles:
 * 1. EClear JasperReports PDF statements (e.g. Account Statement-*.pdf)
 * 2. PSX Broker Oracle 12c PDF statements (e.g. sf5498-*.pdf from Syed Faraz Equities)
 */
class EclearParser extends BaseParser {
  constructor(bankKey = 'eclear', bankConfig = null) {
    super(bankKey, bankConfig || {
      name: 'EClear Trading',
      fullName: 'EClear Services Limited (ESL) / PSX Trading',
      currency: 'PKR',
      defaultAccountId: 'EClear-PKR'
    });
  }

  async parse(input, password = null) {
    const buffer = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
    const format = await this.detectFormat(buffer);

    if (format === 'broker') {
      return this.parseBrokerOracle(buffer);
    } else {
      return this.parseEclearJasper(buffer);
    }
  }

  /**
   * Detect whether PDF is EClear JasperReports or Broker Oracle 12c
   */
  async detectFormat(buffer) {
    const parser = new PDFParse({ data: buffer });
    let text = '';
    try {
      await parser.load();
      const res = await parser.getText();
      text = res ? res.text : '';
    } finally {
      await parser.destroy();
    }

    if (
      text.includes('TREC HOLDER') ||
      text.includes('TREC NO') ||
      text.includes('CDC ID') ||
      text.includes('SYED FARAZ EQUITIES') ||
      text.includes('Oracle Reports') ||
      text.includes('STATEMENT OF ACCOUNT')
    ) {
      return 'broker';
    }

    return 'eclear';
  }

  /**
   * Parse EClear JasperReports PDF format
   */
  async parseEclearJasper(buffer) {
    const parser = new PDFParse({ data: buffer });
    let text = '';
    try {
      await parser.load();
      const res = await parser.getText();
      text = res ? res.text : '';
    } finally {
      await parser.destroy();
    }

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let accountId = this.config.defaultAccountId;
    let openingBalance = 0;
    let closingBalance = 0;
    const transactions = [];

    for (const line of lines) {
      if (line.includes('Account No :')) {
        const m = line.match(/Account No\s*:\s*([A-Za-z0-9]+)/);
        if (m) accountId = m[1];
      }
      if (line.includes('Opening Balance')) {
        const m = line.match(/Opening Balance\s+([\d,]+\.?\d*)/);
        if (m) openingBalance = parseFloat(m[1].replace(/,/g, ''));
      }
      if (line.includes('Net Balance')) {
        const m = line.match(/Net Balance\s+([\d,]+\.?\d*)/);
        if (m) closingBalance = parseFloat(m[1].replace(/,/g, ''));
      }

      // Tab separated transaction rows
      const parts = line.split('\t');
      if (
        parts.length >= 4 &&
        !line.includes('Opening Balance') &&
        !line.includes('Net Balance') &&
        !line.includes('Credit\tDebit') &&
        !line.includes('Account Statement')
      ) {
        const creditStr = parts[0].trim();
        const debitStr = parts[1].trim();
        const descBalStr = parts[2].trim();
        const dateStr = parts[3].trim();

        const credit = parseFloat(creditStr.replace(/,/g, '')) || 0;
        const debit = parseFloat(debitStr.replace(/,/g, '')) || 0;
        const amount = credit > 0 ? credit : debit;
        const action = credit > 0 ? 'credit' : 'debit';

        // Extract balance and description
        const balMatch = descBalStr.match(/^(.*?)\s+([\-]?[\d,]+\.\d{2})$/);
        let desc = descBalStr;
        let balance = 0;
        if (balMatch) {
          desc = balMatch[1].trim();
          balance = parseFloat(balMatch[2].replace(/,/g, ''));
        }

        // Clean trailing WHT placeholder if present
        desc = desc.replace(/\s+WHT$/, '').trim();

        // Check trade details
        const tradeMatch = desc.match(/T\+\d+\s+(Buy|Sell)\s+([A-Z0-9]+)\s+(\d+)\s+@\s+([\d.]+)/i);
        let side = '-';
        let symbol = '';
        let qty = '-';
        let rate = '-';
        let symbol_description = desc;

        if (tradeMatch) {
          side = tradeMatch[1].toUpperCase();
          symbol = tradeMatch[2].toUpperCase();
          qty = parseInt(tradeMatch[3], 10);
          rate = parseFloat(tradeMatch[4]);
          symbol_description = symbol;
        }

        const dateIso = normalizeDate(dateStr);

        transactions.push({
          date: dateIso,
          time: '',
          bank: this.config.name,
          account_id: accountId,
          currency: this.config.currency,
          type: action,
          amount,
          signed_amount: action === 'credit' ? amount : -amount,
          debit: action === 'debit' ? amount : '',
          credit: action === 'credit' ? amount : '',
          description: desc,
          transaction_id: '',
          extra: '',
          // Trading-specific schema
          symbol_description,
          symbol,
          side,
          action,
          qty,
          rate,
          balance,
          voucher: '',
          ticket_no: '',
          source_format: 'eclear',
          raw_date: dateStr
        });
      }
    }

    if (transactions.length > 0 && !closingBalance) {
      closingBalance = transactions[transactions.length - 1].balance;
    }

    transactions.openingBalance = openingBalance;
    transactions.closingBalance = closingBalance;
    transactions.accountId = accountId;
    transactions.format = 'eclear';

    return transactions;
  }

  /**
   * Parse PSX Broker Oracle 12c PDF format
   */
  async parseBrokerOracle(buffer) {
    const parser = new PDFParse({ data: buffer });
    await parser.load();

    let accountId = this.config.defaultAccountId;
    let openingBalance = 0;
    let closingBalance = 0;
    const transactions = [];

    const footerKeywords = [
      'CLIENT CONFIRMATION',
      'CONFIRMATION SUMMARY',
      'INVENTORY POSITION',
      'FLOATING POSITION',
      'MFS/ MTS POSITION',
      'STRN :',
      'Trade Date :',
      'Settlement Date :',
      'OFFICE NO.',
      'TREC NO:',
      'TEL:',
      'EMAIL:',
      'STATEMENT OF ACCOUNT',
      'Entry # Date Narration'
    ];

    try {
      for (let p = 1; p <= parser.doc.numPages; p++) {
        const page = await parser.doc.getPage(p);
        const textContent = await page.getTextContent();
        const rows = [];

        for (const item of textContent.items) {
          if (!item.str || !item.str.trim()) continue;
          const x = Math.round(item.transform[4]);
          const y = Math.round(item.transform[5]);
          let row = rows.find(r => Math.abs(r.y - y) <= 3);
          if (!row) {
            row = { y, items: [] };
            rows.push(row);
          }
          row.items.push({ x, str: item.str.trim() });
        }

        // Sort descending by Y (top of page to bottom)
        rows.sort((a, b) => b.y - a.y);

        for (const r of rows) {
          r.items.sort((a, b) => a.x - b.x);

          // Header account detection
          const accItem = r.items.find(i => /SF\d+/.test(i.str));
          if (accItem && accountId === this.config.defaultAccountId) {
            const m = accItem.str.match(/SF\d+/);
            if (m) accountId = m[0];
          }

          const dateItem = r.items.find(i => /^\d{2}-\d{2}-\d{2}$/.test(i.str) && i.x >= 30 && i.x < 100);
          const voucherItem = r.items.find(i => /^[A-Z]{2}\d{6}$/.test(i.str) && i.x < 30);

          if (dateItem) {
            // Main transaction row
            const voucher = voucherItem ? voucherItem.str : '';
            const rawDate = dateItem.str;

            // Narration text items (x between 65 and 300)
            const desc = r.items.filter(i => i.x >= 65 && i.x < 300).map(i => i.str).join(' ');

            // Debit amount (x between 300 and 355)
            const debitItem = r.items.find(i => i.x >= 300 && i.x < 355);
            // Credit amount (x between 355 and 415)
            const creditItem = r.items.find(i => i.x >= 355 && i.x < 415);

            const debit = debitItem ? parseFloat(debitItem.str.replace(/,/g, '')) : 0;
            const credit = creditItem ? parseFloat(creditItem.str.replace(/,/g, '')) : 0;
            const amount = credit > 0 ? credit : debit;
            const action = credit > 0 ? 'credit' : 'debit';

            // Balance amount (x between 415 and 480)
            const balItem = r.items.find(i => i.x >= 415 && i.x < 480);
            let balance = 0;
            if (balItem) {
              balance = parseFloat(balItem.str.replace(/[^\d.]/g, '')) || 0;
            }

            // Dr/Cr indicator
            const drCrItem = r.items.find(i => i.x >= 480 && i.x < 500 && (i.str === 'Cr' || i.str === 'Dr'));
            const isDr = drCrItem && drCrItem.str === 'Dr';
            if (isDr) balance = -balance;

            // Parse trade info
            const tradeMatch = desc.match(/T\+\d+\s+(BUY|SELL)\s+#?\s*(\d+)?\s+([A-Z0-9]+)\s+(\d+)\s+@\s+([\d.]+)/i);
            let side = '-';
            let symbol = '';
            let qty = '-';
            let rate = '-';
            let ticket_no = '';
            let symbol_description = desc;

            if (tradeMatch) {
              side = tradeMatch[1].toUpperCase();
              ticket_no = tradeMatch[2] || '';
              symbol = tradeMatch[3].toUpperCase();
              qty = parseInt(tradeMatch[4], 10);
              rate = parseFloat(tradeMatch[5]);
              symbol_description = symbol;
            }

            const dateIso = normalizeDate(rawDate);

            transactions.push({
              date: dateIso,
              time: '',
              bank: this.config.name,
              account_id: accountId,
              currency: this.config.currency,
              type: action,
              amount,
              signed_amount: action === 'credit' ? amount : -amount,
              debit: action === 'debit' ? amount : '',
              credit: action === 'credit' ? amount : '',
              description: desc,
              transaction_id: voucher,
              extra: ticket_no ? `Ticket: ${ticket_no}` : '',
              // Trading-specific schema
              symbol_description,
              symbol,
              side,
              action,
              qty,
              rate,
              balance,
              voucher,
              ticket_no,
              source_format: 'broker',
              raw_date: rawDate
            });
          } else if (transactions.length > 0) {
            // Continuation line for narration
            const hasNumbers = r.items.some(i => i.x >= 300);
            const continuationItems = r.items.filter(i => i.x >= 65 && i.x < 300);
            if (!hasNumbers && continuationItems.length > 0) {
              const contText = continuationItems.map(i => i.str).join(' ');
              const isIgnored = footerKeywords.some(kw => contText.includes(kw));
              if (!isIgnored) {
                const lastTx = transactions[transactions.length - 1];
                lastTx.description = `${lastTx.description} ${contText}`.trim();
                if (lastTx.side === '-') {
                  lastTx.symbol_description = lastTx.description;
                }
              }
            }
          }
        }
      }
    } finally {
      await parser.destroy();
    }

    if (transactions.length > 0) {
      closingBalance = transactions[transactions.length - 1].balance;
    }

    transactions.openingBalance = openingBalance;
    transactions.closingBalance = closingBalance;
    transactions.accountId = accountId;
    transactions.format = 'broker';

    return transactions;
  }
}

module.exports = EclearParser;
