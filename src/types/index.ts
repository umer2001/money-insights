export interface StandardTransaction {
  date: string;
  time: string;
  bank: string;
  account_id: string;
  currency: string;
  type: 'debit' | 'credit';
  amount: number;
  signed_amount: number;
  debit: number | string;
  credit: number | string;
  description: string;
  transaction_id: string;
  extra?: string;
}

export interface StatementValidation {
  isValid: boolean;
  totalDebit: number;
  totalCredit: number;
  netChange: number;
  openingBalance?: number | null;
  closingBalance?: number | null;
  closingMatches?: boolean;
  invalidRowsCount?: number;
}

export interface StatementFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'pending' | 'detecting' | 'parsing' | 'success' | 'error' | 'password_required';
  bank: string; // 'abl' | 'fbl' | 'sadaPay' | 'easyPaisa' | 'nayaPay' | 'payoneer' | 'hbl' | 'ubl' | 'unknown'
  bankName: string;
  fullName: string;
  currency: string;
  password?: string;
  transactions: StandardTransaction[];
  validation?: StatementValidation;
  error?: string;
}

export interface CurrencyConsolidation {
  currency: string;
  transactionCount: number;
  totalDebit: number;
  totalCredit: number;
  netChange: number;
  isValid: boolean;
  excelBase64?: string;
  csvBase64?: string;
}

export interface TradingTransaction {
  date: string;
  symbol_description: string;
  side: 'BUY' | 'SELL' | '-';
  action: 'credit' | 'debit';
  qty: number | string;
  rate: number | string;
  balance: number;
  amount: number;
  voucher?: string;
  ticket_no?: string;
  source_format?: 'eclear' | 'broker';
  account_id?: string;
  raw_description?: string;
  description?: string;
  symbol?: string;
  time?: string;
  bank?: string;
  currency?: string;
  transaction_id?: string;
  extra?: string;
  merged?: boolean;
}

export interface TradingFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'pending' | 'parsing' | 'success' | 'error';
  format?: 'eclear' | 'broker';
  accountId?: string;
  transactions: TradingTransaction[];
  openingBalance?: number;
  closingBalance?: number;
  error?: string;
}

export interface TradingConsolidationResult {
  transactions: TradingTransaction[];
  openingBalance: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
  netChange: number;
  deduplicatedCount: number;
  isValid: boolean;
  export?: {
    filename: string;
    contentBase64: string;
    mimeType: string;
  };
}
