const fs = require('fs');
const BaseParser = require('./baseParser');
const { normalizeDate } = require('../utils/dateUtils');

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const rows = [];
  
  for (const line of lines) {
    // Quick robust CSV split
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += c;
      }
    }
    fields.push(current.trim());
    rows.push(fields);
  }
  return rows;
}

class PayoneerParser extends BaseParser {
  async parse(input) {
    const content = (Buffer.isBuffer(input) ? input : fs.readFileSync(input)).toString('utf8');
    const rows = parseCsv(content);

    if (rows.length < 2) {
      return [];
    }

    const headers = rows[0].map(h => h.toLowerCase());
    const dateIdx = headers.indexOf('transaction date');
    const timeIdx = headers.indexOf('transaction time');
    const creditIdx = headers.indexOf('credit amount');
    const debitIdx = headers.indexOf('debit amount');
    const descIdx = headers.indexOf('description');
    const statusIdx = headers.indexOf('status');
    const methodIdx = headers.indexOf('payout method');

    const transactions = [];

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length < 5) continue;

      const rawDate = r[dateIdx] || '';
      const rawTime = timeIdx !== -1 ? r[timeIdx] : '';
      const creditVal = creditIdx !== -1 ? parseFloat(r[creditIdx].replace(/,/g, '')) || 0 : 0;
      const debitVal = debitIdx !== -1 ? Math.abs(parseFloat(r[debitIdx].replace(/,/g, '')) || 0) : 0;
      const desc = descIdx !== -1 ? r[descIdx] : '';
      const status = statusIdx !== -1 ? r[statusIdx] : '';
      const method = methodIdx !== -1 ? r[methodIdx] : '';

      let type = 'debit';
      let amount = debitVal;

      if (creditVal > 0) {
        type = 'credit';
        amount = creditVal;
      }

      transactions.push(this.createTransaction({
        date: normalizeDate(rawDate),
        time: rawTime,
        bank: this.config.name,
        accountId: this.config.defaultAccountId,
        currency: this.config.currency,
        type,
        amount,
        description: desc,
        extra: [status ? `Status: ${status}` : '', method ? `Method: ${method}` : ''].filter(Boolean).join(' | ')
      }));
    }

    return transactions;
  }
}

module.exports = PayoneerParser;
