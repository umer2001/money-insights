const fs = require('fs');
const { PDFParse } = require('pdf-parse');
const BaseParser = require('./baseParser');
const { normalizeDate } = require('../utils/dateUtils');

class AblParser extends BaseParser {
  async parse(input, password = null) {
    const dataBuffer = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
    const parser = new PDFParse({ data: dataBuffer, password: password || '' });
    let text = '';
    try {
      await parser.load();
      const res = await parser.getText();
      text = res ? res.text : '';
    } finally {
      await parser.destroy();
    }

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    let openingBalance = null;
    let closingBalance = null;
    let accountTitle = '';
    let accountNumber = this.config.defaultAccountId;

    for (const line of lines) {
      if (line.startsWith('Account Number:')) {
        accountNumber = line.replace('Account Number:', '').trim();
      }
      if (line.startsWith('Account Title:')) {
        accountTitle = line.replace('Account Title:', '').trim();
      }
      if (line.startsWith('Opening Balance:') && openingBalance === null) {
        openingBalance = parseFloat(line.split(':')[1].replace(/,/g, '').trim());
      }
      if (line.startsWith('Closing Balance:') && closingBalance === null) {
        closingBalance = parseFloat(line.split(':')[1].replace(/,/g, '').trim());
      }
    }

    const dateRegex = /^(\d{2}\s+[A-Za-z]{3}\s+\d{4})\s+(.*)$/;
    const amountsEndRegex = /([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/;

    const rawTxs = [];
    let current = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (
        line.startsWith('Account Number:') ||
        line.startsWith('Account Title:') ||
        line.startsWith('Currency:') ||
        line.startsWith('Opening Balance:') ||
        line.startsWith('Closing Balance:') ||
        line.startsWith('*Note:') ||
        line.startsWith('Account Statement') ||
        line.startsWith('Date Description') ||
        /^\d+\s+\d{2}\s+[A-Za-z]{3}\s+\d{4},\s+\d{2}:\d{2}$/.test(line) ||
        /^-- \d+ of \d+ --$/.test(line)
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

    let runningBal = openingBalance;
    const transactions = [];

    for (const tx of rawTxs) {
      const combined = tx.lines.join(' ');
      const m = combined.match(amountsEndRegex);
      if (!m) continue;

      const amt = parseFloat(m[1].replace(/,/g, ''));
      const bal = parseFloat(m[2].replace(/,/g, ''));
      const desc = combined.substring(0, combined.lastIndexOf(m[1])).trim();

      // Determine debit or credit from balance delta
      let type = 'debit';
      if (runningBal !== null) {
        const diffDebit = Math.abs((runningBal - amt) - bal);
        const diffCredit = Math.abs((runningBal + amt) - bal);
        if (diffCredit < diffDebit) {
          type = 'credit';
          runningBal = runningBal + amt;
        } else {
          type = 'debit';
          runningBal = runningBal - amt;
        }
      }

      transactions.push(this.createTransaction({
        date: normalizeDate(tx.date),
        time: '',
        bank: this.config.name,
        accountId: accountNumber,
        currency: this.config.currency,
        type,
        amount: amt,
        description: desc,
        extra: accountTitle ? `Account Title: ${accountTitle}` : ''
      }));
    }

    return transactions;
  }
}

module.exports = AblParser;
