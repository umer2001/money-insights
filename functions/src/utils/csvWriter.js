const fs = require('fs');
const path = require('path');
const CONFIG = require('../config');

function escapeCsvField(val) {
  if (val === null || val === undefined) return '';
  let str = String(val);
  // Replace newlines inside strings with spaces or preserve them with quotes
  // To keep standard single-line rows clean in Excel/CSV viewers, collapse internal linebreaks into ' '
  str = str.replace(/\r?\n+/g, ' ').trim();
  if (str.includes(',') || str.includes('"') || str.includes(';') || str.includes('\n')) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateCsvString(transactions, columns = CONFIG.schemaColumns) {
  const headerLine = columns.join(',');
  const rows = transactions.map(tx => {
    return columns.map(col => escapeCsvField(tx[col])).join(',');
  });
  return [headerLine, ...rows].join('\n');
}

function writeCsv(filePath, transactions, columns = CONFIG.schemaColumns) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const content = generateCsvString(transactions, columns);
  fs.writeFileSync(filePath, content, 'utf8');
}

module.exports = {
  writeCsv,
  generateCsvString,
  escapeCsvField
};

