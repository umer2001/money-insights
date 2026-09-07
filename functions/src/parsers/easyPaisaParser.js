const fs = require('fs');
const { PDFParse } = require('pdf-parse');
const BaseParser = require('./baseParser');
const { normalizeDate } = require('../utils/dateUtils');

class EasyPaisaParser extends BaseParser {
  async parse(input, passwordOverride = null) {
    const dataBuffer = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
    const password = passwordOverride || this.config.password || '';

    const parser = new PDFParse({ data: dataBuffer, password });
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
    let accountHolder = '';

    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === 'IBAN' && i + 4 < lines.length && lines[i + 4].startsWith('PK')) {
        iban = lines[i + 4].trim();
      }
      if (lines[i] === 'Account Holder Name' && i + 4 < lines.length) {
        accountHolder = lines[i + 4].trim();
      }
    }

    // Filter headers/footers
    const cleanLines = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (
        line.startsWith('Account Holder Name') ||
        line.startsWith('Account Number') ||
        line.startsWith('IBAN') ||
        line.startsWith('Currency') ||
        (accountHolder && line === accountHolder) ||
        (iban && line === iban) ||
        /^03\d{9}$/.test(line) ||
        /^\+?92\d{10}$/.test(line) ||
        /^PK\d{2}[A-Za-z0-9]+$/i.test(line) ||
        line.startsWith('Pakistani Rupees') ||
        line.startsWith('From:') ||
        line.startsWith('easypaisa Bank Limited') ||
        line.startsWith('19-C, 9th Commercial Lane') ||
        line.startsWith('Main Zamzama Boulevard') ||
        line.startsWith('Karachi, Pakistan') ||
        line.startsWith('Phone:') ||
        line.startsWith('Email:') ||
        line.startsWith('STATEMENT OF ACCOUNT') ||
        line.startsWith('Date Issued:') ||
        line.startsWith('Date Transaction Detail Opening Balance Incoming Outgoing Closing Balance') ||
        line.startsWith("This is a system generated electronic statement and doesn't require") ||
        /^-- \d+ of \d+ --$/.test(line)
      ) {
        continue;
      }
      cleanLines.push(line);
    }

    const dateRegex = /^([A-Za-z]{3}\s+\d{1,2},\s+\d{4})$/;
    const timeRegex = /^(\d{1,2}:\d{2}\s+(?:AM|PM))$/;
    const txMetaHeaderRegex = /^Transaction ID \| Amount \| Tax \| Fees \| Discount \| Total$/;
    const txMetaValsRegex = /^(\d+)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/;

    const incomingRowRegex = /([\d,]+\.\d{2})\s+\(([\d,]+\.\d{2})\)\s+-\s+([\d,]+\.\d{2})$/;
    const outgoingRowRegex = /([\d,]+\.\d{2})\s+-\s+\(([\d,]+\.\d{2})\)\s+([\d,]+\.\d{2})$/;

    const rawTxs = [];
    let i = 0;

    while (i < cleanLines.length) {
      const line = cleanLines[i];

      if (line.includes('Closing Balance B/F') || line.includes('Balance B/F')) {
        i++;
        continue;
      }

      const dMatch = line.match(dateRegex);
      if (dMatch && i + 1 < cleanLines.length && timeRegex.test(cleanLines[i + 1])) {
        const dateStr = dMatch[1];
        const timeStr = cleanLines[i + 1];
        i += 2;

        const descParts = [];
        let amount = null;
        let type = null;

        while (i < cleanLines.length && !txMetaHeaderRegex.test(cleanLines[i]) && !dateRegex.test(cleanLines[i])) {
          const curLine = cleanLines[i];
          const inMatch = curLine.match(incomingRowRegex);
          const outMatch = curLine.match(outgoingRowRegex);

          if (inMatch) {
            amount = parseFloat(inMatch[2].replace(/,/g, ''));
            type = 'credit';
            const descPrefix = curLine.substring(0, curLine.length - inMatch[0].length).trim();
            if (descPrefix) descParts.push(descPrefix);
            i++;
            break;
          } else if (outMatch) {
            amount = parseFloat(outMatch[2].replace(/,/g, ''));
            type = 'debit';
            const descPrefix = curLine.substring(0, curLine.length - outMatch[0].length).trim();
            if (descPrefix) descParts.push(descPrefix);
            i++;
            break;
          } else {
            descParts.push(curLine);
            i++;
          }
        }

        // Transaction ID line
        let txId = '';
        let fee = 0;
        let tax = 0;
        if (i < cleanLines.length && txMetaHeaderRegex.test(cleanLines[i])) {
          i++; // skip header line
          if (i < cleanLines.length) {
            const metaMatch = cleanLines[i].match(txMetaValsRegex);
            if (metaMatch) {
              txId = metaMatch[1];
              tax = parseFloat(metaMatch[3].replace(/,/g, ''));
              fee = parseFloat(metaMatch[4].replace(/,/g, ''));
            }
            i++;
          }
        }

        rawTxs.push({
          date: dateStr,
          time: timeStr,
          description: descParts.join(' ').replace(/\s+/g, ' ').trim(),
          type: type || 'debit',
          amount: amount || 0,
          txId,
          fee,
          tax
        });
        continue;
      }

      i++;
    }

    // Easypaisa lists transactions newest-first; reverse so ledger is chronological (oldest to newest)
    rawTxs.reverse();

    const transactions = rawTxs.map(tx => {
      const extraParts = [];
      if (tx.tax > 0) extraParts.push(`Tax: ${tx.tax}`);
      if (tx.fee > 0) extraParts.push(`Fee: ${tx.fee}`);
      if (accountHolder) extraParts.push(`Account Holder: ${accountHolder}`);

      return this.createTransaction({
        date: normalizeDate(tx.date),
        time: tx.time,
        bank: this.config.name,
        accountId: iban,
        currency: this.config.currency,
        type: tx.type,
        amount: tx.amount,
        description: tx.description,
        transactionId: tx.txId,
        extra: extraParts.join(' | ')
      });
    });

    return transactions;
  }
}

module.exports = EasyPaisaParser;
