/**
 * Trading Position & PnL Engine (Weighted Average Cost - WAC)
 * 
 * Reconstructs round-trip positions and calculates realized PnL,
 * tracking scale-ins, partial closes, and intraday square-offs.
 */

function calculateDaysBetween(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) return 0;
  const start = new Date(startDateStr).getTime();
  const end = new Date(endDateStr).getTime();
  if (isNaN(start) || isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
}

/**
 * Build round-trip positions and performance metrics from trade transactions
 * 
 * @param {Array<Object>} transactions
 * @returns {{ positions: Array<Object>, summary: Object }}
 */
function buildPositionsFromTransactions(transactions = []) {
  // 1. Filter and sort trade executions
  const tradeTxs = transactions
    .filter(tx => (tx.side === 'BUY' || tx.side === 'SELL' || tx.side === 'DIFF') && Boolean(tx.symbol))
    .slice()
    .sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      if (cmp !== 0) return cmp;
      // If same date, ensure BUY comes before SELL to preserve logical position flow
      if (a.side === 'BUY' && b.side === 'SELL') return -1;
      if (a.side === 'SELL' && b.side === 'BUY') return 1;
      return 0;
    });

  const positions = [];
  const openMap = {};
  let positionSeq = 1;
  const latestDate = tradeTxs.length > 0 ? tradeTxs[tradeTxs.length - 1].date : '';

  for (const tx of tradeTxs) {
    const sym = tx.symbol.toUpperCase();
    const qty = typeof tx.qty === 'number' ? tx.qty : parseInt(tx.qty, 10) || 0;
    const rate = typeof tx.rate === 'number' ? tx.rate : parseFloat(tx.rate) || 0;
    const amount = typeof tx.amount === 'number' ? tx.amount : parseFloat(tx.amount) || 0;

    // A. Intraday Day-Trading Square-off (DIFF)
    if (tx.side === 'DIFF') {
      const pnl = tx.action === 'credit' ? amount : -amount;
      const nominalVal = qty > 0 && rate > 0 ? qty * rate : amount;
      const roi = nominalVal > 0 ? (pnl / nominalVal) * 100 : 0;

      positions.push({
        id: `POS-${positionSeq++}-${sym}`,
        symbol: sym,
        status: 'INTRADAY',
        startDate: tx.date,
        endDate: tx.date,
        durationDays: 0,
        totalBoughtQty: qty,
        totalSoldQty: qty,
        openQty: 0,
        avgBuyRate: rate,
        avgSellRate: rate,
        totalCostBasis: tx.action === 'debit' ? amount : 0,
        totalProceeds: tx.action === 'credit' ? amount : 0,
        realizedPnL: Math.round(pnl * 100) / 100,
        roiPercent: Math.round(roi * 100) / 100,
        isWin: pnl > 0,
        events: [
          {
            type: 'INTRADAY_DIFF',
            date: tx.date,
            side: 'DIFF',
            action: tx.action,
            qty,
            rate,
            amount,
            remainingQty: 0,
            avgCostPerShare: rate,
            slicePnL: Math.round(pnl * 100) / 100,
            voucher: tx.voucher || tx.transaction_id || '',
            ticket_no: tx.ticket_no || '',
            description: tx.description || ''
          }
        ]
      });
      continue;
    }

    // B. Delivery BUY / SELL
    if (tx.side === 'BUY') {
      if (!openMap[sym]) {
        // Open new position
        openMap[sym] = {
          id: `POS-${positionSeq++}-${sym}`,
          symbol: sym,
          status: 'OPEN',
          startDate: tx.date,
          endDate: null,
          durationDays: 0,
          currentQty: qty,
          totalBoughtQty: qty,
          totalSoldQty: 0,
          openQty: qty,
          currentCostBasis: amount,
          totalCostBasis: amount,
          totalProceeds: 0,
          realizedPnL: 0,
          roiPercent: 0,
          events: []
        };

        const avgRate = amount / (qty || 1);
        openMap[sym].events.push({
          type: 'OPEN_POSITION',
          date: tx.date,
          side: 'BUY',
          action: 'debit',
          qty,
          rate,
          amount,
          remainingQty: qty,
          avgCostPerShare: Math.round(avgRate * 10000) / 10000,
          voucher: tx.voucher || tx.transaction_id || '',
          ticket_no: tx.ticket_no || '',
          description: tx.description || ''
        });
      } else {
        // Scale-in / Increase position
        const pos = openMap[sym];
        pos.currentQty += qty;
        pos.totalBoughtQty += qty;
        pos.currentCostBasis += amount;
        pos.totalCostBasis += amount;
        pos.openQty = pos.currentQty;

        const avgRate = pos.currentCostBasis / (pos.currentQty || 1);
        pos.events.push({
          type: 'INCREASE_POSITION',
          date: tx.date,
          side: 'BUY',
          action: 'debit',
          qty,
          rate,
          amount,
          remainingQty: pos.currentQty,
          avgCostPerShare: Math.round(avgRate * 10000) / 10000,
          voucher: tx.voucher || tx.transaction_id || '',
          ticket_no: tx.ticket_no || '',
          description: tx.description || ''
        });
      }
    } else if (tx.side === 'SELL') {
      if (!openMap[sym]) {
        // Sell without prior buy in this period (legacy position opened before statement window)
        openMap[sym] = {
          id: `POS-${positionSeq++}-${sym}`,
          symbol: sym,
          status: 'OPEN',
          startDate: tx.date,
          endDate: null,
          durationDays: 0,
          currentQty: 0,
          totalBoughtQty: 0,
          totalSoldQty: 0,
          openQty: 0,
          currentCostBasis: 0,
          totalCostBasis: 0,
          totalProceeds: 0,
          realizedPnL: 0,
          roiPercent: 0,
          events: []
        };
      }

      const pos = openMap[sym];
      const avgCostPerShare = pos.currentQty > 0 ? (pos.currentCostBasis / pos.currentQty) : rate;
      const soldQty = pos.currentQty > 0 ? Math.min(qty, pos.currentQty) : qty;
      const costSlice = soldQty * avgCostPerShare;
      const proceedsSlice = amount;
      const slicePnL = proceedsSlice - costSlice;

      pos.currentQty = Math.max(0, pos.currentQty - soldQty);
      pos.currentCostBasis = Math.max(0, pos.currentCostBasis - costSlice);
      pos.totalSoldQty += soldQty;
      pos.totalProceeds += proceedsSlice;
      pos.realizedPnL += slicePnL;
      pos.openQty = pos.currentQty;

      const isClosed = pos.currentQty === 0;

      pos.events.push({
        type: isClosed ? 'CLOSE_POSITION' : 'PARTIAL_CLOSE',
        date: tx.date,
        side: 'SELL',
        action: 'credit',
        qty: soldQty,
        rate,
        amount,
        remainingQty: pos.currentQty,
        avgCostPerShare: Math.round(avgCostPerShare * 10000) / 10000,
        slicePnL: Math.round(slicePnL * 100) / 100,
        voucher: tx.voucher || tx.transaction_id || '',
        ticket_no: tx.ticket_no || '',
        description: tx.description || ''
      });

      if (isClosed) {
        pos.status = 'CLOSED';
        pos.endDate = tx.date;
        pos.durationDays = calculateDaysBetween(pos.startDate, pos.endDate);
        pos.avgBuyRate = pos.totalBoughtQty > 0 ? (pos.totalCostBasis / pos.totalBoughtQty) : avgCostPerShare;
        pos.avgSellRate = pos.totalSoldQty > 0 ? (pos.totalProceeds / pos.totalSoldQty) : rate;
        pos.realizedPnL = Math.round(pos.realizedPnL * 100) / 100;
        pos.roiPercent = pos.totalCostBasis > 0 ? Math.round((pos.realizedPnL / pos.totalCostBasis) * 10000) / 100 : 0;
        pos.isWin = pos.realizedPnL > 0;

        positions.push(pos);
        delete openMap[sym];
      }
    }
  }

  // Any remaining open positions at the end of statement timeline
  for (const sym of Object.keys(openMap)) {
    const pos = openMap[sym];
    pos.status = 'OPEN';
    pos.openQty = pos.currentQty;
    pos.durationDays = calculateDaysBetween(pos.startDate, latestDate);
    pos.avgBuyRate = pos.totalBoughtQty > 0 ? (pos.totalCostBasis / pos.totalBoughtQty) : 0;
    pos.avgSellRate = pos.totalSoldQty > 0 ? (pos.totalProceeds / pos.totalSoldQty) : 0;
    pos.realizedPnL = Math.round(pos.realizedPnL * 100) / 100;
    pos.roiPercent = pos.totalCostBasis > 0 ? Math.round((pos.realizedPnL / pos.totalCostBasis) * 10000) / 100 : 0;
    pos.isWin = pos.realizedPnL > 0;

    positions.push(pos);
  }

  // Sort positions chronologically by startDate
  positions.sort((a, b) => a.startDate.localeCompare(b.startDate));

  // 2. Compute Overall Performance Analytics Summary
  const closedPositions = positions.filter(p => p.status === 'CLOSED');
  const openPositions = positions.filter(p => p.status === 'OPEN');
  const intradayPositions = positions.filter(p => p.status === 'INTRADAY');
  const completedPositions = [...closedPositions, ...intradayPositions];

  let totalRealizedPnL = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let totalCostBasis = 0;
  let totalProceeds = 0;
  let winsCount = 0;
  let lossesCount = 0;
  let bestTrade = null;
  let worstTrade = null;

  for (const p of completedPositions) {
    totalRealizedPnL += p.realizedPnL;
    totalCostBasis += p.totalCostBasis;
    totalProceeds += p.totalProceeds;

    if (p.realizedPnL > 0) {
      winsCount++;
      grossProfit += p.realizedPnL;
    } else if (p.realizedPnL < 0) {
      lossesCount++;
      grossLoss += Math.abs(p.realizedPnL);
    }

    if (!bestTrade || p.realizedPnL > bestTrade.pnl) {
      bestTrade = { symbol: p.symbol, pnl: p.realizedPnL, date: p.startDate };
    }
    if (!worstTrade || p.realizedPnL < worstTrade.pnl) {
      worstTrade = { symbol: p.symbol, pnl: p.realizedPnL, date: p.startDate };
    }
  }

  const completedCount = completedPositions.length;
  const winRatePercent = completedCount > 0 ? Math.round((winsCount / completedCount) * 1000) / 10 : 0;
  const profitFactor = grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : (grossProfit > 0 ? 99.99 : 1.0);
  const overallRoiPercent = totalCostBasis > 0 ? Math.round((totalRealizedPnL / totalCostBasis) * 10000) / 100 : 0;
  const avgWinAmount = winsCount > 0 ? Math.round((grossProfit / winsCount) * 100) / 100 : 0;
  const avgLossAmount = lossesCount > 0 ? Math.round((grossLoss / lossesCount) * 100) / 100 : 0;

  let openCapitalAtRisk = 0;
  for (const p of openPositions) {
    openCapitalAtRisk += p.currentCostBasis || 0;
  }

  const summary = {
    totalPositions: positions.length,
    closedPositions: closedPositions.length,
    openPositions: openPositions.length,
    intradayPositions: intradayPositions.length,
    completedPositions: completedCount,
    totalRealizedPnL: Math.round(totalRealizedPnL * 100) / 100,
    grossProfit: Math.round(grossProfit * 100) / 100,
    grossLoss: Math.round(grossLoss * 100) / 100,
    profitFactor,
    totalCostBasis: Math.round(totalCostBasis * 100) / 100,
    totalProceeds: Math.round(totalProceeds * 100) / 100,
    overallRoiPercent,
    winsCount,
    lossesCount,
    winRatePercent,
    avgWinAmount,
    avgLossAmount,
    openCapitalAtRisk: Math.round(openCapitalAtRisk * 100) / 100,
    bestTrade,
    worstTrade
  };

  return {
    positions,
    summary
  };
}

module.exports = {
  buildPositionsFromTransactions,
  calculateDaysBetween
};
