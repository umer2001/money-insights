const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const CONFIG = require('../config');

function generateExcelBuffer(transactions, sheetName = 'Transactions', columns = CONFIG.schemaColumns) {
  const data = transactions.map(tx => {
    const row = {};
    for (const col of columns) {
      row[col] = tx[col] !== undefined && tx[col] !== null ? tx[col] : '';
    }
    return row;
  });

  const ws = xlsx.utils.json_to_sheet(data, { header: columns });
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, sheetName);
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function writeExcel(filePath, transactions, sheetName = 'Transactions', columns = CONFIG.schemaColumns) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const buf = generateExcelBuffer(transactions, sheetName, columns);
  fs.writeFileSync(filePath, buf);
}

module.exports = {
  writeExcel,
  generateExcelBuffer
};

