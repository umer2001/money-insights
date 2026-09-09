import { TradingTransaction } from "../types";

export type PositionStatus = 'CLOSED' | 'OPEN' | 'INTRADAY';

export type PositionEventType =
  | 'OPEN_POSITION'
  | 'INCREASE_POSITION'
  | 'PARTIAL_CLOSE'
  | 'CLOSE_POSITION'
  | 'INTRADAY_DIFF';

export interface PositionExecutionEvent {
  type: PositionEventType;
  date: string;
  side: 'BUY' | 'SELL' | 'DIFF';
  action: 'credit' | 'debit';
  qty: number;
  rate: number;
  amount: number;
  remainingQty: number;
  avgCostPerShare: number;
  slicePnL?: number;
  voucher?: string;
  ticket_no?: string;
  description?: string;
}

export interface TradingPosition {
  id: string;
  symbol: string;
  status: PositionStatus;
  startDate: string;
  endDate: string | null;
  durationDays: number;
  totalBoughtQty: number;
  totalSoldQty: number;
  openQty: number;
  avgBuyRate: number;
  avgSellRate: number;
  totalCostBasis: number;
  totalProceeds: number;
  realizedPnL: number;
  roiPercent: number;
  isWin: boolean;
  currentCostBasis?: number;
  events: PositionExecutionEvent[];
}

export interface TradingPerformanceSummary {
  totalPositions: number;
  closedPositions: number;
  openPositions: number;
  intradayPositions: number;
  completedPositions: number;
  totalRealizedPnL: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  totalCostBasis: number;
  totalProceeds: number;
  overallRoiPercent: number;
  winsCount: number;
  lossesCount: number;
  winRatePercent: number;
  avgWinAmount: number;
  avgLossAmount: number;
  openCapitalAtRisk: number;
  bestTrade: { symbol: string; pnl: number; date: string } | null;
  worstTrade: { symbol: string; pnl: number; date: string } | null;
}

export function calculateDaysBetween(startDateStr?: string | null, endDateStr?: string | null): number {
  if (!startDateStr || !endDateStr) return 0;
  const start = new Date(startDateStr).getTime();
  const end = new Date(endDateStr).getTime();
  if (isNaN(start) || isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
}

/**
 * Reconstruct round-trip positions and performance summary from trade transactions
 * using Weighted Average Cost (WAC) accounting standard.
 */
export function buildPositionsFromTransactions(transactions: TradingTransaction[] = []): {
  positions: TradingPosition[];
  summary: TradingPerformanceSummary;
} {
  const tradeTxs = transactions
    .filter((tx) => (tx.side === 'BUY' || tx.side === 'SELL' || tx.side === 'DIFF') && Boolean(tx.symbol))
    .slice()
    .sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      if (cmp !== 0) return cmp;
      if (a.side === 'BUY' && b.side === 'SELL') return -1;
      if (a.side === 'SELL' && b.side === 'BUY') return 1;
      return 0;
    });

  const positions: TradingPosition[] = [];
  const openMap: Record<string, TradingPosition & { currentQty: number; currentCostBasis: number }> = {};
  let positionSeq = 1;
  const latestDate = tradeTxs.length > 0 ? tradeTxs[tradeTxs.length - 1].date : '';

  for (const tx of tradeTxs) {
    const sym = (tx.symbol || '').toUpperCase();
    const qty = typeof tx.qty === 'number' ? tx.qty : parseInt(String(tx.qty), 10) || 0;
    const rate = typeof tx.rate === 'number' ? tx.rate : parseFloat(String(tx.rate)) || 0;
    const amount = typeof tx.amount === 'number' ? tx.amount : parseFloat(String(tx.amount)) || 0;

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
            description: tx.description || '',
          },
        ],
      });
      continue;
    }

    // B. Delivery BUY / SELL
    if (tx.side === 'BUY') {
      if (!openMap[sym]) {
        // Open new position
        const avgRate = amount / (qty || 1);
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
          isWin: false,
          avgBuyRate: Math.round(avgRate * 10000) / 10000,
          avgSellRate: 0,
          events: [
            {
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
              description: tx.description || '',
            },
          ],
        };
      } else {
        // Scale-in / Increase position
        const pos = openMap[sym];
        pos.currentQty += qty;
        pos.totalBoughtQty += qty;
        pos.currentCostBasis += amount;
        pos.totalCostBasis += amount;
        pos.openQty = pos.currentQty;

        const avgRate = pos.currentCostBasis / (pos.currentQty || 1);
        pos.avgBuyRate = Math.round(avgRate * 10000) / 10000;
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
          description: tx.description || '',
        });
      }
    } else if (tx.side === 'SELL') {
      if (!openMap[sym]) {
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
          isWin: false,
          avgBuyRate: 0,
          avgSellRate: 0,
          events: [],
        };
      }

      const pos = openMap[sym];
      const avgCostPerShare = pos.currentQty > 0 ? pos.currentCostBasis / pos.currentQty : rate;
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
        description: tx.description || '',
      });

      if (isClosed) {
        pos.status = 'CLOSED';
        pos.endDate = tx.date;
        pos.durationDays = calculateDaysBetween(pos.startDate, pos.endDate);
        pos.avgBuyRate = pos.totalBoughtQty > 0 ? Math.round((pos.totalCostBasis / pos.totalBoughtQty) * 10000) / 10000 : avgCostPerShare;
        pos.avgSellRate = pos.totalSoldQty > 0 ? Math.round((pos.totalProceeds / pos.totalSoldQty) * 10000) / 10000 : rate;
        pos.realizedPnL = Math.round(pos.realizedPnL * 100) / 100;
        pos.roiPercent = pos.totalCostBasis > 0 ? Math.round((pos.realizedPnL / pos.totalCostBasis) * 10000) / 100 : 0;
        pos.isWin = pos.realizedPnL > 0;

        positions.push({ ...pos });
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
    pos.avgBuyRate = pos.totalBoughtQty > 0 ? Math.round((pos.totalCostBasis / pos.totalBoughtQty) * 10000) / 10000 : 0;
    pos.avgSellRate = pos.totalSoldQty > 0 ? Math.round((pos.totalProceeds / pos.totalSoldQty) * 10000) / 10000 : 0;
    pos.realizedPnL = Math.round(pos.realizedPnL * 100) / 100;
    pos.roiPercent = pos.totalCostBasis > 0 ? Math.round((pos.realizedPnL / pos.totalCostBasis) * 10000) / 100 : 0;
    pos.isWin = pos.realizedPnL > 0;

    positions.push({ ...pos });
  }

  // Sort positions chronologically by startDate
  positions.sort((a, b) => a.startDate.localeCompare(b.startDate));

  // 2. Compute Overall Performance Analytics Summary
  const closedPositions = positions.filter((p) => p.status === 'CLOSED');
  const openPositions = positions.filter((p) => p.status === 'OPEN');
  const intradayPositions = positions.filter((p) => p.status === 'INTRADAY');
  const completedPositions = [...closedPositions, ...intradayPositions];

  let totalRealizedPnL = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let totalCostBasis = 0;
  let totalProceeds = 0;
  let winsCount = 0;
  let lossesCount = 0;
  let bestTrade: { symbol: string; pnl: number; date: string } | null = null;
  let worstTrade: { symbol: string; pnl: number; date: string } | null = null;

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

  const summary: TradingPerformanceSummary = {
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
    worstTrade,
  };

  return {
    positions,
    summary,
  };
}

/**
 * Client-side CSV export of positions with full metrics
 */
export function exportPositionsCsv(positions: TradingPosition[], filename = 'Trading_Positions_Report.csv') {
  const headers = [
    'Symbol',
    'Status',
    'Start Date',
    'End Date',
    'Duration (Days)',
    'Bought Qty',
    'Sold Qty',
    'Open Qty',
    'Avg Buy Rate (PKR)',
    'Avg Sell Rate (PKR)',
    'Total Cost Basis (PKR)',
    'Total Proceeds (PKR)',
    'Realized PnL (PKR)',
    'ROI (%)',
    'Outcome',
    'Total Executions',
  ];

  const escapeCsv = (val: unknown) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = positions.map((p) => [
    p.symbol,
    p.status,
    p.startDate,
    p.endDate || 'Holding',
    p.durationDays,
    p.totalBoughtQty,
    p.totalSoldQty,
    p.openQty,
    p.avgBuyRate,
    p.avgSellRate,
    p.totalCostBasis,
    p.totalProceeds,
    p.realizedPnL,
    `${p.roiPercent}%`,
    p.status === 'OPEN' ? 'OPEN' : (p.isWin ? 'WIN' : 'LOSS'),
    p.events.length,
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
