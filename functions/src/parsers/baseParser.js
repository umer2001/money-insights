/**
 * Base Parser class
 * Defines common transaction structure and helper methods
 */

class BaseParser {
  constructor(bankKey, bankConfig) {
    this.bankKey = bankKey;
    this.config = bankConfig;
  }

  /**
   * Parse given file path
   * @param {string} filePath 
   * @returns {Promise<Array<Object>>}
   */
  async parse(filePath) {
    throw new Error(`Method 'parse()' must be implemented in ${this.constructor.name}`);
  }

  /**
   * Helper to construct a standard transaction record (without balance)
   */
  createTransaction({
    date,
    time = '',
    bank = this.config.name,
    accountId = this.config.defaultAccountId,
    currency = this.config.currency,
    type,
    amount,
    signedAmount = null,
    debit = null,
    credit = null,
    description = '',
    transactionId = '',
    extra = ''
  }) {
    const numAmount = Math.abs(Number(amount));
    const isCredit = type === 'credit';

    return {
      date: date || '',
      time: time || '',
      bank: bank || this.config.name,
      account_id: accountId || this.config.defaultAccountId,
      currency: currency || this.config.currency,
      type: isCredit ? 'credit' : 'debit',
      amount: numAmount,
      signed_amount: signedAmount !== null ? signedAmount : (isCredit ? numAmount : -numAmount),
      debit: isCredit ? '' : numAmount,
      credit: isCredit ? numAmount : '',
      description: String(description || '').trim(),
      transaction_id: String(transactionId || '').trim(),
      extra: String(extra || '').trim()
    };
  }
}

module.exports = BaseParser;
