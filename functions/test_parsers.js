const path = require('path');
const fs = require('fs');
const AblParser = require('./src/parsers/ablParser');
const FblParser = require('./src/parsers/fblParser');
const SadaPayParser = require('./src/parsers/sadaPayParser');
const EasyPaisaParser = require('./src/parsers/easyPaisaParser');
const NayaPayParser = require('./src/parsers/nayaPayParser');
const PayoneerParser = require('./src/parsers/payoneerParser');
const { detectBankFormat } = require('./src/parsers/detector');
const { validateTransactions } = require('./src/utils/validator');
const CONFIG = require('./src/config');

async function testAll() {
  console.log('Testing all parsers from functions/src...');
  const root = path.resolve(__dirname, '..');
  const sampleDir = path.join(root, 'sample');

  const tests = [
    {
      name: 'ABL PDF',
      file: path.join(sampleDir, 'abl-pkr', 'abl.pdf'),
      Parser: AblParser,
      config: CONFIG.banks.abl,
      expectedBank: 'abl'
    },
    {
      name: 'EasyPaisa PDF',
      file: path.join(sampleDir, 'easy-paisa-pkr', 'statement.pdf'),
      Parser: EasyPaisaParser,
      config: CONFIG.banks.easyPaisa,
      password: '5652',
      expectedBank: 'easyPaisa'
    },
    {
      name: 'FBL PDF',
      file: path.join(sampleDir, 'fbl-pkr', 'FBL Account Statement.pdf'),
      Parser: FblParser,
      config: CONFIG.banks.fbl,
      expectedBank: 'fbl'
    },
    {
      name: 'FBL Excel/OLE',
      file: path.join(sampleDir, 'fbl-pkr', 'statement-fbl'),
      Parser: FblParser,
      config: CONFIG.banks.fbl,
      expectedBank: 'fbl'
    },
    {
      name: 'NayaPay PDF',
      file: path.join(sampleDir, 'naya-pay-pkr', 'naya-y-2025.pdf'),
      Parser: NayaPayParser,
      config: CONFIG.banks.nayaPay,
      expectedBank: 'nayaPay'
    },
    {
      name: 'NayaPay CSV',
      file: path.join(sampleDir, 'naya-pay-pkr', 'naya-y-2025.csv'),
      Parser: NayaPayParser,
      config: CONFIG.banks.nayaPay,
      expectedBank: 'nayaPay'
    },
    {
      name: 'Payoneer CSV',
      file: path.join(sampleDir, 'payoneer-usd', 'payoneer.csv'),
      Parser: PayoneerParser,
      config: CONFIG.banks.payoneer,
      expectedBank: 'payoneer'
    },
    {
      name: 'SadaPay PDF',
      file: path.join(sampleDir, 'sada-pay-pkr', 'sadapay_account_statement_2025-07-01_2026-06-30.pdf'),
      Parser: SadaPayParser,
      config: CONFIG.banks.sadaPay,
      expectedBank: 'sadaPay'
    }
  ];

  let allPassed = true;

  for (const t of tests) {
    if (!fs.existsSync(t.file)) {
      console.log(`[SKIP] ${t.name}: File not found at ${t.file}`);
      continue;
    }

    const buf = fs.readFileSync(t.file);
    const detection = await detectBankFormat(path.basename(t.file), buf, t.password);
    const detectionCorrect = detection.bank === t.expectedBank;

    console.log(`\n=== ${t.name} ===`);
    console.log(`  Detection: ${detection.bank} (expected: ${t.expectedBank}) -> ${detectionCorrect ? 'PASS' : 'FAIL'}`);

    if (!detectionCorrect) allPassed = false;

    const parser = new t.Parser(t.expectedBank, t.config);
    const txs = await parser.parse(buf, t.password);
    const validation = validateTransactions(txs);
    console.log(`  Parsed: ${txs.length} txs | Valid: ${validation.isValid} | Debits: ${validation.totalDebit} | Credits: ${validation.totalCredit} | Net: ${validation.netChange}`);

    if (!validation.isValid || txs.length === 0) allPassed = false;
  }

  // Verify password protection behavior without password
  const epFile = path.join(sampleDir, 'easy-paisa-pkr', 'statement.pdf');
  if (fs.existsSync(epFile)) {
    console.log('\n=== EasyPaisa Password Protection Check (Without Password) ===');
    const buf = fs.readFileSync(epFile);
    const unauthenticatedDetection = await detectBankFormat('statement.pdf', buf, '');
    console.log(`  Detection without password requiresPassword: ${unauthenticatedDetection.requiresPassword} -> ${unauthenticatedDetection.requiresPassword ? 'PASS' : 'FAIL'}`);
    if (!unauthenticatedDetection.requiresPassword) allPassed = false;

    let threwExpected = false;
    try {
      const epParser = new EasyPaisaParser('easyPaisa', CONFIG.banks.easyPaisa);
      await epParser.parse(buf, '');
    } catch (e) {
      const isPassErr = (e.name || '').includes('Password') || (e.message || '').toLowerCase().includes('password');
      if (isPassErr) threwExpected = true;
    }
    console.log(`  Parse without password rejected with PasswordException: ${threwExpected ? 'PASS' : 'FAIL'}`);
    if (!threwExpected) allPassed = false;
  }

  console.log('\n=========================================');
  console.log(`OVERALL RESULT: ${allPassed ? 'ALL TESTS PASSED ✅' : 'FAILURES DETECTED ❌'}`);
  console.log('=========================================');
}

testAll().catch(console.error);
