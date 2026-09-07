const fs = require('fs');
const { PDFParse } = require('pdf-parse');
const BaseParser = require('./baseParser');
const { normalizeDate } = require('../utils/dateUtils');

class UblParser extends BaseParser {
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
    let accountNumber = this.config.defaultAccountId;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      const ibanMatch = line.match(/IBAN No:\s*(PK\d{2}UNIL\w+)/i);
      if (ibanMatch) {
        accountNumber = ibanMatch[1];
      } else if (accountNumber === this.config.defaultAccountId) {
        const accMatch = line.match(/Account Number:\s*(\d+)/i);
        if (accMatch) {
          accountNumber = accMatch[1];
        }
      }

      if (line.startsWith('Balance: PKR')) {
        const balMatch = line.match(/Balance:\s*PKR\s*([\d,]+\.\d{2})/);
        if (balMatch && closingBalance === null) {
          closingBalance = parseFloat(balMatch[1].replace(/,/g, ''));
        }
      }

      if (line.includes('Opening Balance')) {
        const obMatch = line.match(/Opening Balance\s+0\s+0\s+([\d,]+\.\d{2})/);
        if (obMatch && openingBalance === null) {
          openingBalance = parseFloat(obMatch[1].replace(/,/g, ''));
        }
      }
    }

    this.openingBalance = openingBalance;
    this.closingBalance = closingBalance;

    const dateRegex = /^(\d{2}-[A-Za-z]{3}-\d{4})\s+(.*)$/;
    // Columns: DEBIT CREDIT BALANCE (e.g. "100 0 9,842.82" or "0 200,000 203,762.82" or "98.66 0 4,057.48")
    const amountsRegex = /^([\d,]+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{1,2})?)\s+([\d,]+\.\d{2})$/;

    const rawTxs = [];
    let current = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip table headers, bank footers, and page numbers
      if (
        line.startsWith('Account Statement') ||
        line.startsWith('Printed on') ||
        line.startsWith('Page ') ||
        line.startsWith('DATE') ||
        line.includes('Opening Balance') ||
        line.startsWith('UBLUnitedBankLtd') ||
        line.startsWith('For latest schedule') ||
        line.startsWith('UBL website') ||
        line.startsWith('111-825-888') ||
        line.startsWith('Activity Summary') ||
        /^-- \d+ of \d+ --$/.test(line)
      ) {
        continue;
      }

      const dMatch = line.match(dateRegex);
      if (dMatch) {
        if (current && current.amounts) {
          rawTxs.push(current);
        }
        current = {
          date: dMatch[1],
          lines: [dMatch[2]],
          amounts: null
        };
        continue;
      }

      if (current) {
        const aMatch = line.match(amountsRegex);
        if (aMatch) {
          current.amounts = {
            debit: parseFloat(aMatch[1].replace(/,/g, '')),
            credit: parseFloat(aMatch[2].replace(/,/g, '')),
            balance: parseFloat(aMatch[3].replace(/,/g, ''))
          };
          rawTxs.push(current);
          current = null;
        } else {
          current.lines.push(line);
        }
      }
    }
    if (current && current.amounts) {
      rawTxs.push(current);
    }

    const transactions = [];

    for (const tx of rawTxs) {
      const combinedDesc = tx.lines.join(' ').replace(/\s+/g, ' ').trim();
      const { debit, credit } = tx.amounts;
      let type = 'debit';
      let amount = 0;

      if (credit > 0 && debit === 0) {
        type = 'credit';
        amount = credit;
      } else if (debit > 0 && credit === 0) {
        type = 'debit';
        amount = debit;
      } else if (credit > debit) {
        type = 'credit';
        amount = credit;
      } else {
        type = 'debit';
        amount = debit;
      }

      // Extract transaction ID / Reference if present in description
      let txId = '';
      const msgMatch = combinedDesc.match(/MSGID:\s*([A-Za-z0-9]+)/i);
      const refMatch = combinedDesc.match(/REF\s*#\s*(\d+)/i);
      const kuickMatch = combinedDesc.match(/KUICKPAY PAYMENT\s*(\d+)/i);
      const rtgsMatch = combinedDesc.match(/(TT\d+\.\d+|FT\d+\.\d+)/i);

      if (msgMatch) {
        txId = msgMatch[1];
      } else if (refMatch) {
        txId = refMatch[1];
      } else if (kuickMatch) {
        txId = kuickMatch[1];
      } else if (rtgsMatch) {
        txId = rtgsMatch[1];
      }

      transactions.push(this.createTransaction({
        date: normalizeDate(tx.date),
        time: '',
        bank: this.config.name,
        accountId: accountNumber,
        currency: this.config.currency,
        type,
        amount,
        description: combinedDesc,
        transactionId: txId
      }));
    }

    return transactions;
  }
}

module.exports = UblParser;
