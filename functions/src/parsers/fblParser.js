const fs = require('fs');
const xlsx = require('xlsx');
const { PDFParse } = require('pdf-parse');
const BaseParser = require('./baseParser');
const { normalizeDate } = require('../utils/dateUtils');

class FblParser extends BaseParser {
  async parse(input, password = null) {
    const buffer = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
    // Check if PDF (starts with %PDF)
    if (buffer.slice(0, 4).toString() === '%PDF') {
      return this.parsePdf(buffer, password);
    }
    // Otherwise treat as Excel (.xls / .xlsx)
    return this.parseExcel(buffer);
  }

  parseExcel(input) {
    const wb = Buffer.isBuffer(input) ? xlsx.read(input, { type: 'buffer' }) : xlsx.readFile(input);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false });

    const transactions = [];
    let accountNumber = this.config.defaultAccountId;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r.length) continue;

      // Check header info
      if (r[9] === 'Account Number:' && r[11]) {
        accountNumber = String(r[11]).trim();
      }
      if (r[9] === 'IBAN:' && r[11]) {
        accountNumber = String(r[11]).trim();
      }

      // Ignore header rows and disclaimers
      if (
        r[1] === 'Date' ||
        r[1] === 'Statement Date:' ||
        r[1] === 'From Date:' ||
        r[1] === 'To Date:' ||
        r[1] === 'Currency:' ||
        r[1] === 'Opening Balance as on:' ||
        r[1] === 'Closing Balance as on:' ||
        r[1] === 'ACCOUNT STATEMENT' ||
        r[1] === 'Disclaimer Statement' ||
        !r[1]
      ) {
        continue;
      }

      // Check date format in col 1
      const dateStr = String(r[1]).trim();
      if (!/^[A-Za-z]{3}\s+\d{1,2},\s*\d{4}$/.test(dateStr)) {
        continue;
      }

      const txId = r[2] ? String(r[2]).trim() : '';
      const desc = r[5] ? String(r[5]).trim() : '';
      const withdrawalStr = r[10] ? String(r[10]).replace(/,/g, '').trim() : '0';
      const depositStr = r[11] ? String(r[11]).replace(/,/g, '').trim() : '0';

      const withdrawal = parseFloat(withdrawalStr) || 0;
      const deposit = parseFloat(depositStr) || 0;

      let type = 'debit';
      let amount = withdrawal;

      if (deposit > 0 && withdrawal === 0) {
        type = 'credit';
        amount = deposit;
      } else if (withdrawal > 0 && deposit === 0) {
        type = 'debit';
        amount = withdrawal;
      } else if (deposit > 0) {
        type = 'credit';
        amount = deposit;
      }

      transactions.push(this.createTransaction({
        date: normalizeDate(dateStr),
        time: '',
        bank: this.config.name,
        accountId: accountNumber,
        currency: this.config.currency,
        type,
        amount,
        description: desc,
        transactionId: txId
      }));
    }

    return transactions;
  }

  async parsePdf(buffer, password = null) {
    const parser = new PDFParse({ data: buffer, password: password || '' });
    let text = '';
    try {
      await parser.load();
      const res = await parser.getText();
      text = res ? res.text : '';
    } finally {
      await parser.destroy();
    }

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const transactions = [];
    const dateRegex = /^([A-Za-z]{3}\s+\d{1,2},\s*\d{4})\s+(.*)$/;
    const amountsRegex = /([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/;

    let accountNumber = this.config.defaultAccountId || 'FBL-PKR';
    const ibanMatch = text.match(/IBAN:\s*([A-Za-z0-9-]+)/i);
    const accMatch = text.match(/Account\s*#:\s*([0-9X-]+)/i);
    if (ibanMatch) {
      accountNumber = ibanMatch[1].trim();
    } else if (accMatch) {
      accountNumber = accMatch[1].trim();
    }

    let rawTxs = [];
    let current = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip header / footer lines
      if (
        line.startsWith('For further details') ||
        line.startsWith('Website:') ||
        line.startsWith('Page') ||
        line.startsWith('Account Statement') ||
        line.startsWith('Statement Issuance Date:') ||
        line.startsWith('Title:') ||
        line.startsWith('Mailing') ||
        line.startsWith('Account #:') ||
        line.startsWith('Branch') ||
        line.startsWith('Date Description Withdrawals') ||
        /^-- \d+ of \d+ --$/.test(line) ||
        /^\d+$/.test(line)
      ) {
        continue;
      }

      const dMatch = line.match(dateRegex);
      if (dMatch) {
        if (current) rawTxs.push(current);
        current = {
          date: dMatch[1],
          lines: [dMatch[2]]
        };
        continue;
      }

      if (current) {
        current.lines.push(line);
      }
    }
    if (current) rawTxs.push(current);

    for (const tx of rawTxs) {
      const combined = tx.lines.join(' ');
      if (combined.startsWith('Opening Balance')) continue;

      const m = combined.match(amountsRegex);
      if (!m) continue;

      const wdr = parseFloat(m[1].replace(/,/g, ''));
      const dep = parseFloat(m[2].replace(/,/g, ''));
      const desc = combined.substring(0, combined.lastIndexOf(m[1])).trim();

      let type = 'debit';
      let amount = wdr;
      if (dep > 0 && wdr === 0) {
        type = 'credit';
        amount = dep;
      }

      transactions.push(this.createTransaction({
        date: normalizeDate(tx.date),
        time: '',
        bank: this.config.name,
        accountId: accountNumber,
        currency: this.config.currency,
        type,
        amount,
        description: desc
      }));
    }

    return transactions;
  }
}

module.exports = FblParser;
