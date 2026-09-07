const fs = require('fs');
const { PDFParse } = require('pdf-parse');
const BaseParser = require('./baseParser');
const { normalizeDate } = require('../utils/dateUtils');

/**
 * Simple robust CSV row parser that handles quoted multiline fields
 */
function parseCsvRows(text) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentField);
      if (currentRow.some(f => f.trim().length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }
  if (currentField || currentRow.length) {
    currentRow.push(currentField);
    if (currentRow.some(f => f.trim().length > 0)) {
      rows.push(currentRow);
    }
  }
  return rows;
}

class NayaPayParser extends BaseParser {
  async parse(input, password = null) {
    const buffer = Buffer.isBuffer(input) ? input : fs.readFileSync(input);

    // If PDF, parse as PDF statement
    if (buffer.slice(0, 4).toString() === '%PDF') {
      return this.parsePdf(buffer, password);
    }

    // Otherwise parse as CSV statement
    return this.parseCsv(buffer.toString('utf8'));
  }

  /**
   * Parse NayaPay PDF statement
   */
  async parsePdf(dataBuffer, password = null) {
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
      if (line.includes('PK06NAYA')) {
        const match = line.match(/PK\d{2}NAYA[A-Za-z0-9]+/i);
        if (match) iban = match[0];
      }
    }

    // Find transactions grouped by "Service Charges Rs."
    const txBlocks = [];
    let currentBlock = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('Service Charges Rs.')) {
        if (currentBlock) txBlocks.push(currentBlock);
        currentBlock = [];
      } else if (currentBlock) {
        if (
          line.startsWith('CARRIED FORWARD') ||
          line.startsWith('-- ') ||
          line.startsWith('Account Statement') ||
          line.startsWith('01 Jul 2025 - 30 Jun 2026') ||
          line.startsWith('TIME TYPE DESCRIPTION') ||
          line.startsWith('DISCLAIMER:') ||
          /^\(\d{3}\)\s+\d{3}-\d{3}-\d{3}\s+www\.nayapay\.com/.test(line)
        ) {
          continue;
        }
        currentBlock.push(line);
      }
    }
    if (currentBlock) txBlocks.push(currentBlock);

    const transactions = [];

    for (const block of txBlocks) {
      const textBlock = block.join('\n');

      // Date: \d{2}\s+[A-Za-z]{3}\s+\d{4}
      const dateMatch = textBlock.match(/(\d{2}\s+[A-Za-z]{3}\s+\d{4})/);
      const date = dateMatch ? normalizeDate(dateMatch[1]) : '';

      // Time: \d{2}:\d{2}\s+[AP]M
      const timeMatch = textBlock.match(/(\d{2}:\d{2}\s+[AP]M)/);
      const time = timeMatch ? timeMatch[1] : '';

      // Amount: ([+-])Rs.\s*([\d,]+(?:\.\d+)?)
      const amountMatch = textBlock.match(/([+-])Rs\.?\s*([\d,]+(?:\.\d+)?)/);
      let type = 'debit';
      let amount = 0;
      if (amountMatch) {
        const sign = amountMatch[1];
        amount = parseFloat(amountMatch[2].replace(/,/g, ''));
        type = sign === '+' ? 'credit' : 'debit';
      }

      // Transaction ID: Transaction ID\s*([A-Za-z0-9]+)
      const txIdMatch = textBlock.match(/Transaction ID\s*([A-Za-z0-9]+)/i);
      const transactionId = txIdMatch ? txIdMatch[1] : '';

      // Clean description
      const descLines = block.filter(l => {
        if (l.match(/^\d{2}\s+[A-Za-z]{3}\s+\d{4}$/)) return false;
        if (l.match(/^\d{2}:\d{2}\s+[AP]M$/)) return false;
        if (l.match(/^[+-]?Rs\./)) return false;
        if (l.includes('Rs.') && l.match(/[+-]Rs\./)) return false;
        if (l.startsWith('Transaction ID')) return false;
        if (l === transactionId) return false;
        return true;
      });

      const description = descLines
        .join(' ')
        .replace(/\t/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      transactions.push(
        this.createTransaction({
          date,
          time,
          accountId: iban,
          type,
          amount,
          description,
          transactionId
        })
      );
    }

    return transactions;
  }

  /**
   * Parse NayaPay CSV statement
   */
  parseCsv(text) {
    const rawRows = parseCsvRows(text);

    let iban = this.config.defaultAccountId;
    let headerIdx = -1;

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (row[0] && row[0].trim() === 'NayaPay IBAN' && row[1]) {
        iban = row[1].trim();
      }
      if (row[0] && row[0].trim() === 'TIMESTAMP') {
        headerIdx = i;
        break;
      }
    }

    if (headerIdx === -1) {
      return [];
    }

    const transactions = [];

    for (let i = headerIdx + 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || row.length < 4) continue;

      const rawTimestamp = row[0].trim();
      if (!rawTimestamp) continue;

      const tsMatch = rawTimestamp.match(/^(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\s*(.*)$/);
      const dateStr = tsMatch ? tsMatch[1] : rawTimestamp;
      const timeStr = tsMatch ? tsMatch[2].trim() : '';

      const txTypeCategory = row[1] ? row[1].trim() : '';
      const rawDesc = row[2] ? row[2].trim() : '';
      const rawAmount = row[3] ? row[3].trim() : '0';

      let txId = '';
      const txIdMatch = rawDesc.match(/Transaction ID\s+([A-Za-z0-9]+)/i);
      if (txIdMatch) {
        txId = txIdMatch[1];
      }

      const cleanAmtStr = rawAmount.replace(/,/g, '');
      const numAmount = Math.abs(parseFloat(cleanAmtStr)) || 0;
      const isCredit = cleanAmtStr.startsWith('+');

      transactions.push(
        this.createTransaction({
          date: normalizeDate(dateStr),
          time: timeStr,
          accountId: iban,
          type: isCredit ? 'credit' : 'debit',
          amount: numAmount,
          description: rawDesc,
          transactionId: txId,
          extra: `Type: ${txTypeCategory}`
        })
      );
    }

    return transactions;
  }
}

module.exports = NayaPayParser;
