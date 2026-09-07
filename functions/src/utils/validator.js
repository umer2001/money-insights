/**
 * Validator utility to audit parsed transactions, compute checksums,
 * and verify that debits, credits, and net cashflow are mathematically sound.
 */

function validateTransactions(transactions, options = {}) {
  let totalDebit = 0;
  let totalCredit = 0;
  let countDebit = 0;
  let countCredit = 0;
  const invalidRows = [];

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    
    // Validate required fields
    if (!tx.date || !tx.bank || !tx.type || tx.amount === null || tx.amount === undefined || isNaN(tx.amount)) {
      invalidRows.push({ index: i, tx, reason: 'Missing required field or invalid amount' });
      continue;
    }

    if (tx.type === 'debit') {
      totalDebit += Number(tx.amount);
      countDebit++;
    } else if (tx.type === 'credit') {
      totalCredit += Number(tx.amount);
      countCredit++;
    }
  }

  const net = totalCredit - totalDebit;

  const result = {
    totalCount: transactions.length,
    debitCount: countDebit,
    creditCount: countCredit,
    totalDebit: Number(totalDebit.toFixed(2)),
    totalCredit: Number(totalCredit.toFixed(2)),
    netChange: Number(net.toFixed(2)),
    invalidRows,
    isValid: invalidRows.length === 0
  };

  // Optional assertions
  if (options.expectedTotalDebit !== undefined) {
    result.debitDiff = Number((result.totalDebit - options.expectedTotalDebit).toFixed(2));
    result.debitMatches = Math.abs(result.debitDiff) < 0.05;
  }
  if (options.expectedTotalCredit !== undefined) {
    result.creditDiff = Number((result.totalCredit - options.expectedTotalCredit).toFixed(2));
    result.creditMatches = Math.abs(result.creditDiff) < 0.05;
  }
  if (options.expectedOpeningBalance !== undefined && options.expectedClosingBalance !== undefined) {
    const calculatedClosing = options.expectedOpeningBalance + net;
    result.closingDiff = Number((calculatedClosing - options.expectedClosingBalance).toFixed(2));
    result.closingMatches = Math.abs(result.closingDiff) < 0.05;
    result.calculatedClosingBalance = Number(calculatedClosing.toFixed(2));
  }

  return result;
}

module.exports = {
  validateTransactions
};
