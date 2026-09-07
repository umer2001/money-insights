const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');
const SAMPLE_DIR = path.join(ROOT_DIR, 'sample');

const CONFIG = {
  rootDir: ROOT_DIR,
  sampleDir: SAMPLE_DIR,
  outputDir: path.join(SAMPLE_DIR, 'output', 'standardized'),
  consolidatedDir: path.join(SAMPLE_DIR, 'output', 'consolidated'),
  
  // Standard schema columns (ordered, excluding balance)
  schemaColumns: [
    'date',
    'time',
    'bank',
    'account_id',
    'currency',
    'type',
    'amount',
    'signed_amount',
    'debit',
    'credit',
    'description',
    'transaction_id',
    'extra'
  ],

  // Bank statement configurations
  banks: {
    abl: {
      name: 'ABL',
      fullName: 'Allied Bank Limited',
      currency: 'PKR',
      defaultAccountId: 'ABL-PKR',
      inputDir: path.join(SAMPLE_DIR, 'abl-pkr'),
      outputPrefix: 'abl_pkr'
    },
    fbl: {
      name: 'FBL',
      fullName: 'Faysal Bank Limited',
      currency: 'PKR',
      defaultAccountId: 'FBL-PKR',
      inputDir: path.join(SAMPLE_DIR, 'fbl-pkr'),
      outputPrefix: 'fbl_pkr'
    },
    nayaPay: {
      name: 'NayaPay',
      fullName: 'NayaPay',
      currency: 'PKR',
      defaultAccountId: 'NayaPay-PKR',
      inputDir: path.join(SAMPLE_DIR, 'naya-pay-pkr'),
      outputPrefix: 'nayapay_pkr'
    },
    payoneer: {
      name: 'Payoneer',
      fullName: 'Payoneer',
      currency: 'USD',
      defaultAccountId: 'Payoneer-USD',
      inputDir: path.join(SAMPLE_DIR, 'payoneer-usd'),
      outputPrefix: 'payoneer_usd'
    },
    sadaPay: {
      name: 'SadaPay',
      fullName: 'SadaPay',
      currency: 'PKR',
      defaultAccountId: 'SadaPay-PKR',
      inputDir: path.join(SAMPLE_DIR, 'sada-pay-pkr'),
      outputPrefix: 'sadapay_pkr'
    },
    easyPaisa: {
      name: 'EasyPaisa',
      fullName: 'easypaisa Bank Limited',
      currency: 'PKR',
      defaultAccountId: 'EasyPaisa-PKR',
      inputDir: path.join(SAMPLE_DIR, 'easy-paisa-pkr'),
      outputPrefix: 'easypaisa_pkr',
      password: process.env.EASYPAISA_PASSWORD || ''
    },
    hbl: {
      name: 'HBL',
      fullName: 'Habib Bank Limited',
      currency: 'PKR',
      defaultAccountId: 'HBL-PKR',
      inputDir: path.join(SAMPLE_DIR, 'hbl-pkr'),
      outputPrefix: 'hbl_pkr',
      password: process.env.HBL_PASSWORD || ''
    },
    ubl: {
      name: 'UBL',
      fullName: 'United Bank Limited',
      currency: 'PKR',
      defaultAccountId: 'UBL-PKR',
      inputDir: path.join(SAMPLE_DIR, 'ubl-pkr'),
      outputPrefix: 'ubl_pkr'
    }
  }
};

module.exports = CONFIG;
