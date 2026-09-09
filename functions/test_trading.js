const path = require('path');
const fs = require('fs');
const EclearParser = require('./src/parsers/eclearParser');
const {
  consolidateTradingStatements,
  generateTradingCsvString,
  generateTradingExcelBuffer,
  TRADING_EXPORT_COLUMNS
} = require('./src/utils/tradingConsolidator');

async function testTradingPipeline() {
  console.log('===============================================================');
  console.log('       Testing EClear Trading Parser & Consolidator            ');
  console.log('===============================================================\n');

  const root = path.resolve(__dirname, '..');
  const sampleDir = path.join(root, 'sample', 'cdc-trading-pkr');
  const eclearFile = path.join(sampleDir, 'Account Statement-Jun 17, 2026.pdf');
  const brokerFile = path.join(sampleDir, 'sf5498-a.pdf');

  if (!fs.existsSync(eclearFile) || !fs.existsSync(brokerFile)) {
    console.error('Missing sample PDF files in sample/cdc-trading-pkr');
    process.exit(1);
  }

  const parser = new EclearParser();

  // Test 1: Parse EClear JasperReports PDF
  console.log('1. Testing EClear Statement parsing...');
  const eclearTxs = await parser.parse(eclearFile);
  console.log(`   Detected format: ${eclearTxs.format}`);
  console.log(`   Account ID: ${eclearTxs.accountId}`);
  console.log(`   Transactions extracted: ${eclearTxs.length}`);
  console.log(`   Opening Balance: ${eclearTxs.openingBalance}`);
  console.log(`   Closing Balance: ${eclearTxs.closingBalance}`);

  if (eclearTxs.format !== 'eclear' || eclearTxs.length !== 188) {
    throw new Error(`Expected format 'eclear' and 188 txs, got ${eclearTxs.format} and ${eclearTxs.length}`);
  }
  console.log('   [PASS] EClear PDF parsed successfully.\n');

  // Test 2: Parse Broker Oracle 12c PDF
  console.log('2. Testing Broker Statement parsing...');
  const brokerTxs = await parser.parse(brokerFile);
  console.log(`   Detected format: ${brokerTxs.format}`);
  console.log(`   Account ID: ${brokerTxs.accountId}`);
  console.log(`   Transactions extracted: ${brokerTxs.length}`);
  console.log(`   Opening Balance: ${brokerTxs.openingBalance}`);
  console.log(`   Closing Balance: ${brokerTxs.closingBalance}`);

  if (brokerTxs.format !== 'broker' || brokerTxs.length !== 193) {
    throw new Error(`Expected format 'broker' and 193 txs, got ${brokerTxs.format} and ${brokerTxs.length}`);
  }
  console.log('   [PASS] Broker PDF parsed successfully.\n');

  // Test 3: Consolidate both statements with deduplication & Option C enriched merge
  console.log('3. Testing Statement Consolidation & Deduplication (Option C)...');
  const consolidated = consolidateTradingStatements([
    {
      transactions: eclearTxs,
      openingBalance: eclearTxs.openingBalance,
      closingBalance: eclearTxs.closingBalance,
      accountId: eclearTxs.accountId
    },
    {
      transactions: brokerTxs,
      openingBalance: brokerTxs.openingBalance,
      closingBalance: brokerTxs.closingBalance,
      accountId: brokerTxs.accountId
    }
  ]);

  console.log(`   Raw Input Count: ${eclearTxs.length + brokerTxs.length}`);
  console.log(`   Deduplicated Collisions: ${consolidated.deduplicatedCount}`);
  console.log(`   Consolidated Unique Count: ${consolidated.transactions.length}`);
  console.log(`   Opening Balance: ${consolidated.openingBalance}`);
  console.log(`   Closing Balance: ${consolidated.closingBalance}`);
  console.log(`   Total Debits: ${consolidated.totalDebit}`);
  console.log(`   Total Credits: ${consolidated.totalCredit}`);

  if (consolidated.transactions.length !== 193) {
    throw new Error(`Expected 193 consolidated transactions, got ${consolidated.transactions.length}`);
  }

  if (consolidated.deduplicatedCount !== 188) {
    throw new Error(`Expected 188 deduplicated collisions, got ${consolidated.deduplicatedCount}`);
  }

  // Verify Option C enriched merge on trade (BOP on 2025-09-04)
  const bopTrade = consolidated.transactions.find(tx => tx.date === '2025-09-04' && tx.symbol === 'BOP');
  if (!bopTrade) throw new Error('BOP trade not found in consolidated transactions');
  if (!bopTrade.voucher || !bopTrade.ticket_no) {
    throw new Error('Option C enrichment missing voucher or ticket_no on BOP trade');
  }
  console.log(`   Enriched trade verified: ${bopTrade.symbol} | Voucher: ${bopTrade.voucher} | Ticket: ${bopTrade.ticket_no}`);

  // Verify Option C enriched merge on intraday difference trade (FFL on 2025-12-31)
  const fflDiff = consolidated.transactions.find(tx => tx.date === '2025-12-31' && tx.symbol === 'FFL' && tx.side === 'DIFF');
  if (!fflDiff) throw new Error('FFL DIFF trade not found in consolidated transactions');
  if (fflDiff.qty !== 1500 || fflDiff.rate !== 0.38 || fflDiff.voucher !== 'CV120118' || fflDiff.ticket_no !== '21652') {
    throw new Error(`FFL DIFF trade mismatch: ${JSON.stringify(fflDiff)}`);
  }
  const diffCount = consolidated.transactions.filter(tx => tx.side === 'DIFF').length;
  if (diffCount !== 9) {
    throw new Error(`Expected 9 DIFF trades, got ${diffCount}`);
  }
  console.log(`   Enriched intraday DIFF verified: ${fflDiff.symbol} | Qty: ${fflDiff.qty} | Rate: ${fflDiff.rate} | Voucher: ${fflDiff.voucher} | Ticket: ${fflDiff.ticket_no}`);
  console.log('   [PASS] Consolidation and Option C Enriched Merge verified.\n');

  // Test 4: Verify 7-column CSV & Excel export output
  console.log('4. Testing Export Generator (7 designated columns)...');
  const csv = generateTradingCsvString(consolidated.transactions);
  const firstCsvLine = csv.split(/\r?\n/)[0];
  const expectedHeader = TRADING_EXPORT_COLUMNS.join(',');
  if (firstCsvLine !== expectedHeader) {
    throw new Error(`CSV header mismatch. Expected: "${expectedHeader}", got: "${firstCsvLine}"`);
  }

  const excelBuf = generateTradingExcelBuffer(consolidated.transactions);
  if (!Buffer.isBuffer(excelBuf) || excelBuf.length === 0) {
    throw new Error('Excel buffer generation failed');
  }
  console.log(`   CSV Header: ${firstCsvLine}`);
  console.log(`   Excel Buffer size: ${excelBuf.length} bytes`);
  console.log('   [PASS] Export generators produce correct columns.\n');

  console.log('===============================================================');
  console.log('          ALL TRADING TESTS PASSED SUCCESSFULLY!               ');
  console.log('===============================================================\n');
}

testTradingPipeline().catch(err => {
  console.error('Trading Test Failed:', err);
  process.exit(1);
});
