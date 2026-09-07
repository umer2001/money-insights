const fs = require('fs');
const { PDFParse } = require('pdf-parse');
const BaseParser = require('./baseParser');
const { normalizeDate } = require('../utils/dateUtils');

class HblParser extends BaseParser {
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

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('Account Title:')) {
        accountTitle = line.replace('Account Title:', '').trim();
      }
      if (line.startsWith('IBAN:')) {
        accountNumber = line.replace('IBAN:', '').trim();
      }

      // Opening & Closing Balance row: e.g. "18157900032403 4230141998619 PKR 27,987.00 27,770.66"
      const balMatch = line.match(/(?:PKR|USD|[A-Z]{3})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/);
      if (balMatch && openingBalance === null) {
        openingBalance = parseFloat(balMatch[1].replace(/,/g, ''));
        closingBalance = parseFloat(balMatch[2].replace(/,/g, ''));
      }
    }

    this.openingBalance = openingBalance;
    this.closingBalance = closingBalance;

    const dateRegex = /^(\d{2}-\d{2}-\d{4})\s+(\d{2}-\d{2}-\d{4})\s+(.*)$/;
    const amountRegex = /^([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/;

    const rawTxs = [];
    let current = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip non-transactional headers and footers
      if (
        line.startsWith('Account Activity') ||
        line.startsWith('Branch:') ||
        line.startsWith('Account Title:') ||
        line.startsWith('Address:') ||
        line.startsWith('IBAN:') ||
        line.startsWith('Statement Duration:') ||
        line.startsWith('Account Number') ||
        line.startsWith('Transaction') ||
        line.startsWith('Date Value Date') ||
        /^-- \d+ of \d+ --$/.test(line)
      ) {
        continue;
      }

      const dMatch = line.match(dateRegex);
      if (dMatch) {
        if (current && current.amount !== undefined) {
          rawTxs.push(current);
        }
        current = {
          date: dMatch[1],
          valueDate: dMatch[2],
          lines: [dMatch[3]]
        };
        continue;
      }

      if (current) {
        const aMatch = line.match(amountRegex);
        if (aMatch) {
          current.amount = parseFloat(aMatch[1].replace(/,/g, ''));
          current.balance = parseFloat(aMatch[2].replace(/,/g, ''));
          rawTxs.push(current);
          current = null;
        } else {
          current.lines.push(line);
        }
      }
    }
    if (current && current.amount !== undefined) {
      rawTxs.push(current);
    }

    // HBL PDF statements list entries in reverse chronological order (newest first).
    // Reversing to chronological order allows seamless reconciliation against openingBalance.
    const chronological = [...rawTxs].reverse();

    let runningBal = openingBalance;
    const transactions = [];

    for (const tx of chronological) {
      const combinedDesc = tx.lines.join(' ').replace(/\s+/g, ' ').trim();
      let type = 'debit';

      if (runningBal !== null && tx.balance !== undefined) {
        const diffDebit = Math.abs((runningBal - tx.amount) - tx.balance);
        const diffCredit = Math.abs((runningBal + tx.amount) - tx.balance);
        if (diffCredit < diffDebit) {
          type = 'credit';
          runningBal += tx.amount;
        } else {
          type = 'debit';
          runningBal -= tx.amount;
        }
      } else {
        if (/\bFRM\b/i.test(combinedDesc) || /\bCREDIT\b/i.test(combinedDesc)) {
          type = 'credit';
        } else {
          type = 'debit';
        }
      }

      // Extract transaction ID / Reference if present in description
      let txId = '';
      const refMatch = combinedDesc.match(/(?:Thru Digital Banking|Raast|Ref|SWITCH)\s*([A-Za-z0-9]+)/i) ||
                       combinedDesc.match(/\b(\d{14,18})\b/);
      if (refMatch) {
        txId = refMatch[1];
      }

      transactions.push(this.createTransaction({
        date: normalizeDate(tx.date, 'DD-MM-YYYY'),
        time: '',
        bank: this.config.name,
        accountId: accountNumber,
        currency: this.config.currency,
        type,
        amount: tx.amount,
        description: combinedDesc,
        transactionId: txId,
        extra: accountTitle ? `Account Title: ${accountTitle}` : ''
      }));
    }

    return transactions;
  }
}

module.exports = HblParser;
