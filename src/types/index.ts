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
