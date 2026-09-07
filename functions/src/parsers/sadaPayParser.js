const fs = require('fs');
const { PDFParse } = require('pdf-parse');
const BaseParser = require('./baseParser');
const { normalizeDate } = require('../utils/dateUtils');

class SadaPayParser extends BaseParser {
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

    let iban = this.config.defaultAccountId;
    for (const line of lines) {
      if (line.startsWith('IBAN:')) {
        iban = line.replace('IBAN:', '').trim().replace(/\s+/g, '');
        break;
      }
    }

    const rawTxs = [];
    let currentTx = null;

    const dateRegex = /^(\d{1,2}\s+[A-Za-z]{3},\s+\d{4})$/;
    const timeRegex = /^(\d{1,2}:\d{2}\s+(?:AM|PM))$/;
    const amountEndRegex = /([-+]\s*[\d,]+(?:\.\d{2}))$/;
    const foreignRegex = /^\(([A-Z]{3})\s*([\d,]+(?:\.\d{2}))\)$/;

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // Ignore page footers/headers
      if (
        line.startsWith('Note: This is a system generated') ||
        line.startsWith('Generated on:') ||
        /^-- \d+ of \d+ --$/.test(line) ||
        line.startsWith('IBAN:') ||
        line.startsWith('Account Statement') ||
        line.startsWith('Name:') ||
        line.startsWith('Account Currency:') ||
        line.startsWith('Total debit') ||
        line.startsWith('Total credit') ||
        line.startsWith('Account transactions from') ||
        line === 'Date Description Debit/Credit' ||
        (/^\d+(\.\d+)?$/.test(line) && i < 15) // total amounts in header
      ) {
        i++;
        continue;
      }

      // Check if date and time start
      const dateMatch = line.match(dateRegex);
      if (dateMatch && i + 1 < lines.length && timeRegex.test(lines[i + 1])) {
        if (currentTx) {
          rawTxs.push(currentTx);
        }
        currentTx = {
          date: dateMatch[1],
          time: lines[i + 1],
          descLines: [],
          amount: null,
          type: null,
          foreignCurrency: null,
          foreignAmount: null
        };
        i += 2;
        continue;
      }

      if (currentTx) {
        // Check if line contains foreign currency
        const fMatch = line.match(foreignRegex);
        if (fMatch) {
          currentTx.foreignCurrency = fMatch[1];
          currentTx.foreignAmount = parseFloat(fMatch[2].replace(/,/g, ''));
          i++;
          continue;
        }

        // Check if line contains amount
        const amtMatch = line.match(amountEndRegex);
        if (amtMatch) {
          const amtStr = amtMatch[1];
          const descPart = line.substring(0, line.length - amtStr.length).trim();
          if (descPart) currentTx.descLines.push(descPart);

          const cleanAmt = parseFloat(amtStr.replace(/[\s,]/g, ''));
          currentTx.amount = Math.abs(cleanAmt);
          currentTx.type = amtStr.startsWith('+') ? 'credit' : 'debit';
          i++;
          continue;
        }

        // Otherwise part of description
        currentTx.descLines.push(line);
      }

      i++;
    }

    if (currentTx) {
      rawTxs.push(currentTx);
    }

    const transactions = rawTxs.map(tx => {
      const description = tx.descLines.join(' ');
      let extra = '';
      if (tx.foreignCurrency && tx.foreignAmount) {
        extra = `Foreign: ${tx.foreignCurrency} ${tx.foreignAmount}`;
      }

      return this.createTransaction({
        date: normalizeDate(tx.date),
        time: tx.time,
        bank: this.config.name,
        accountId: iban,
        currency: this.config.currency,
        type: tx.type || 'debit',
        amount: tx.amount || 0,
        description,
        extra
      });
    });

    return transactions;
  }
}

module.exports = SadaPayParser;
