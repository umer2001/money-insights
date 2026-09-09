const xlsx = require('xlsx');
const { escapeCsvField } = require('./csvWriter');

const TRADING_EXPORT_COLUMNS = [
  'date',
  'symbol/description',
  'side',
  'action',
  'qty',
  'rate',
  'amount',
  'balance'
];

/**
 * Normalizes description to key category token for matching cash/fee movements
 */
function getCategoryToken(desc = '') {
  const d = desc.toUpperCase();
  if (d.includes('ESL ACCOUNT MAINTENANCE')) return 'ESL_MAINT';
  if (d.includes('FUND ONLINE TRANSFER')) return 'ONLINE_TRANSFER';
  if (d.includes('RECEIVED FROM')) return 'RECEIVED_FUNDS';
  if (d.includes('PROFIT DISTRIBUTION')) return 'PROFIT_DIST';
  if (d.includes('WITHHOLDING') && d.includes('BANK PROFIT')) return 'WHT_PROFIT';
  if (d.includes('CDC BILLING')) return 'CDC_BILLING';
  if (d.includes('NCCPL')) return 'NCCPL';
  if (d.includes('KYC')) return 'KYC';
  if (d.includes('CGT')) return 'CGT';
  return d.replace(/[^A-Z0-9]/g, '');
}

/**
 * Check if two transactions are duplicate representations of the same economic event
 */
function areTransactionsDuplicate(a, b) {
  // 1. Must match date and action (credit/debit)
  if (a.date !== b.date) return false;
  if (a.action !== b.action) return false;

  // 2. If both are trades (BUY, SELL, or intraday DIFF)
  const isTradeA = (a.side === 'BUY' || a.side === 'SELL' || a.side === 'DIFF') && Boolean(a.symbol);
  const isTradeB = (b.side === 'BUY' || b.side === 'SELL' || b.side === 'DIFF') && Boolean(b.symbol);

  if (isTradeA && isTradeB) {
    if (a.symbol === b.symbol && a.side === b.side) {
      if (a.qty !== '-' && b.qty !== '-' && a.qty === b.qty) return true;
      if (Math.abs(a.amount - b.amount) < 2.0) return true;
    }
    return false;
  }

  // 3. Non-trade cash / fee transactions
  const tokA = getCategoryToken(a.description);
  const tokB = getCategoryToken(b.description);
  if (tokA && tokB && (tokA === tokB || tokA.includes(tokB) || tokB.includes(tokA))) {
    if (Math.abs(a.amount - b.amount) < 2.0) return true;
  }

  // Exact amount match on same date and action
  return Math.abs(a.amount - b.amount) < 1.0;
}

/**
 * Option C: Enriched Merge of two matching transactions
 */
function mergeTransactions(a, b) {
  const eclearTx = a.source_format === 'eclear' ? a : (b.source_format === 'eclear' ? b : null);
  const brokerTx = a.source_format === 'broker' ? a : (b.source_format === 'broker' ? b : null);

  const base = eclearTx || a;
  const companion = brokerTx || b;

  const voucher = companion.voucher || base.voucher || companion.transaction_id || base.transaction_id || '';
  const ticketNo = companion.ticket_no || base.ticket_no || '';

  const extraParts = [];
  if (voucher) extraParts.push(`Voucher: ${voucher}`);
  if (ticketNo) extraParts.push(`Ticket: ${ticketNo}`);

  return {
    ...base,
    voucher,
    ticket_no: ticketNo,
    transaction_id: voucher || base.transaction_id || '',
    extra: extraParts.join(' | '),
    // Ensure the richer description from EClear is prioritized
    description: eclearTx ? eclearTx.description : (base.description || companion.description),
    symbol: base.symbol || companion.symbol || '',
    symbol_description: base.symbol || companion.symbol || base.symbol_description || companion.symbol_description,
    side: base.side !== '-' ? base.side : companion.side,
    action: base.action,
    qty: base.qty !== '-' ? base.qty : companion.qty,
    rate: base.rate !== '-' ? base.rate : companion.rate,
    amount: base.amount,
    merged: true
  };
}

/**
 * Consolidate multiple trading statements with deduplication, enriched merge,
 * and continuous running balance calculation.
 * 
 * @param {Array<{ transactions: Array<Object>, openingBalance?: number, closingBalance?: number, accountId?: string }>} statements
 * @returns {Object} Consolidated result
 */
function consolidateTradingStatements(statements = []) {
  if (!statements || statements.length === 0) {
    return {
      transactions: [],
      openingBalance: 0,
      closingBalance: 0,
      totalDebit: 0,
      totalCredit: 0,
      netChange: 0,
      deduplicatedCount: 0,
      isValid: true
    };
  }

  // Group statements by account_id
  const byAccount = {};
  for (const stmt of statements) {
    const acc = stmt.accountId || stmt.transactions?.[0]?.account_id || 'DEFAULT_ACCOUNT';
    if (!byAccount[acc]) byAccount[acc] = [];
    byAccount[acc].push(stmt);
  }

  const allConsolidatedTransactions = [];
  let totalOpeningBalance = 0;
  let totalDeduplicatedCount = 0;

  for (const [accId, stmts] of Object.entries(byAccount)) {
    // Collect all raw transactions with statement metadata
    const rawTxs = [];
    let accOpeningBalance = 0;
    let foundOpening = false;

    for (const stmt of stmts) {
      if (!foundOpening && typeof stmt.openingBalance === 'number') {
        accOpeningBalance = stmt.openingBalance;
        foundOpening = true;
      }
      if (Array.isArray(stmt.transactions)) {
        rawTxs.push(...stmt.transactions);
      }
    }

    totalOpeningBalance += accOpeningBalance;

    // Sort chronologically
    rawTxs.sort((a, b) => a.date.localeCompare(b.date));

    // Deduplication statement-by-statement with Option C Enriched Merge
    const deduplicated = [];
    let deduplicatedCount = 0;

    for (const stmt of stmts) {
      if (!Array.isArray(stmt.transactions)) continue;
      const matchedInThisStmt = new Set();

      for (const tx of stmt.transactions) {
        let matchIndex = -1;
        for (let i = 0; i < deduplicated.length; i++) {
          if (!matchedInThisStmt.has(i) && areTransactionsDuplicate(deduplicated[i], tx)) {
            matchIndex = i;
            break;
          }
        }

        if (matchIndex >= 0) {
          matchedInThisStmt.add(matchIndex);
          deduplicated[matchIndex] = mergeTransactions(deduplicated[matchIndex], tx);
          deduplicatedCount++;
        } else {
          deduplicated.push({ ...tx });
        }
      }
    }

    totalDeduplicatedCount += deduplicatedCount;

    // Sort deduplicated chronologically
    deduplicated.sort((a, b) => a.date.localeCompare(b.date));

    // Recalculate continuous running balance across the consolidated timeline
    let runningBalance = accOpeningBalance;
    for (const tx of deduplicated) {
      if (tx.action === 'credit') {
        runningBalance += tx.amount;
      } else {
        runningBalance -= tx.amount;
      }
      tx.balance = Math.round(runningBalance * 100) / 100;
    }

    allConsolidatedTransactions.push(...deduplicated);
  }

  // Final chronological sort across accounts (if multi-account)
  allConsolidatedTransactions.sort((a, b) => a.date.localeCompare(b.date));

  // Compute summary totals
  let totalDebit = 0;
  let totalCredit = 0;
  for (const tx of allConsolidatedTransactions) {
    if (tx.action === 'credit') {
      totalCredit += tx.amount;
    } else {
      totalDebit += tx.amount;
    }
  }

  totalDebit = Math.round(totalDebit * 100) / 100;
  totalCredit = Math.round(totalCredit * 100) / 100;
  const netChange = Math.round((totalCredit - totalDebit) * 100) / 100;
  const finalBalance = Math.round((totalOpeningBalance + netChange) * 100) / 100;

  return {
    transactions: allConsolidatedTransactions,
    openingBalance: totalOpeningBalance,
    closingBalance: finalBalance,
    totalDebit,
    totalCredit,
    netChange,
    deduplicatedCount: totalDeduplicatedCount,
    isValid: true
  };
}

/**
 * Generate CSV string with the exact 7 requested columns:
 * date, symbol/description, side, action, qty, rate, balance
 */
function generateTradingCsvString(transactions = []) {
  const header = TRADING_EXPORT_COLUMNS.join(',');
  const rows = transactions.map(tx => {
    const symDesc = tx.symbol_description || tx.symbol || tx.description || '';
    return [
      escapeCsvField(tx.date),
      escapeCsvField(symDesc),
      escapeCsvField(tx.side || '-'),
      escapeCsvField(tx.action || 'debit'),
      escapeCsvField(tx.qty !== undefined && tx.qty !== null ? tx.qty : '-'),
      escapeCsvField(tx.rate !== undefined && tx.rate !== null ? tx.rate : '-'),
      escapeCsvField(typeof tx.amount === 'number' ? tx.amount.toFixed(2) : tx.amount),
      escapeCsvField(typeof tx.balance === 'number' ? tx.balance.toFixed(2) : tx.balance)
    ].join(',');
  });

  return [header, ...rows].join('\n');
}

/**
 * Generate Excel workbook buffer with the designated columns
 */
function generateTradingExcelBuffer(transactions = [], sheetName = 'Trading_Ledger') {
  const rows = transactions.map(tx => {
    const symDesc = tx.symbol_description || tx.symbol || tx.description || '';
    return {
      'date': tx.date,
      'symbol/description': symDesc,
      'side': tx.side || '-',
      'action': tx.action || 'debit',
      'qty': tx.qty !== undefined && tx.qty !== null ? tx.qty : '-',
      'rate': tx.rate !== undefined && tx.rate !== null ? tx.rate : '-',
      'amount': typeof tx.amount === 'number' ? Number(tx.amount.toFixed(2)) : tx.amount,
      'balance': typeof tx.balance === 'number' ? Number(tx.balance.toFixed(2)) : tx.balance
    };
  });

  const ws = xlsx.utils.json_to_sheet(rows, { header: TRADING_EXPORT_COLUMNS });

  // Auto column widths
  ws['!cols'] = [
    { wch: 12 }, // date
    { wch: 45 }, // symbol/description
    { wch: 10 }, // side
    { wch: 10 }, // action
    { wch: 10 }, // qty
    { wch: 12 }, // rate
    { wch: 14 }, // amount
    { wch: 16 }  // balance
  ];

  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, sheetName);
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  TRADING_EXPORT_COLUMNS,
  areTransactionsDuplicate,
  mergeTransactions,
  consolidateTradingStatements,
  generateTradingCsvString,
  generateTradingExcelBuffer
};
