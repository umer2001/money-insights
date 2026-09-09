import React, { useState, useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronRight,
  Search,
  Download,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  Layers,
  ArrowRight,
  ShieldAlert,
  Zap,
} from "lucide-react";
import {
  TradingPosition,
  TradingPerformanceSummary,
  exportPositionsCsv,
  buildPositionsFromTransactions,
} from "../lib/tradingPositionEngine";
import { TradingTransaction } from "../types";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

interface TradingPositionsViewProps {
  transactions: TradingTransaction[];
  title?: string;
  isConsolidated?: boolean;
}

export const TradingPositionsView: React.FC<TradingPositionsViewProps> = ({
  transactions,
  title = "Position History & PnL Performance",
  isConsolidated = false,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "closed" | "open" | "diff" | "wins" | "losses">("all");
  const [sortBy, setSortBy] = useState<"date" | "pnl_desc" | "pnl_asc" | "symbol" | "duration">("date");
  const [expandedPositions, setExpandedPositions] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Build positions using Weighted Average Cost
  const { positions, summary } = useMemo(() => {
    return buildPositionsFromTransactions(transactions);
  }, [transactions]);

  // Filter & Sort
  const filteredPositions = useMemo(() => {
    return positions.filter((p) => {
      const matchesSearch =
        !searchTerm ||
        p.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.events.some((e) =>
          (e.voucher || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (e.ticket_no || "").toLowerCase().includes(searchTerm.toLowerCase())
        );

      let matchesTab = true;
      if (filterTab === "closed") matchesTab = p.status === "CLOSED";
      else if (filterTab === "open") matchesTab = p.status === "OPEN";
      else if (filterTab === "diff") matchesTab = p.status === "INTRADAY";
      else if (filterTab === "wins") matchesTab = p.isWin && p.status !== "OPEN";
      else if (filterTab === "losses") matchesTab = !p.isWin && p.status !== "OPEN";

      return matchesSearch && matchesTab;
    }).sort((a, b) => {
      if (sortBy === "date") return b.startDate.localeCompare(a.startDate);
      if (sortBy === "pnl_desc") return b.realizedPnL - a.realizedPnL;
      if (sortBy === "pnl_asc") return a.realizedPnL - b.realizedPnL;
      if (sortBy === "symbol") return a.symbol.localeCompare(b.symbol);
      if (sortBy === "duration") return b.durationDays - a.durationDays;
      return 0;
    });
  }, [positions, searchTerm, filterTab, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredPositions.length / pageSize));
  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredPositions.slice(start, start + pageSize);
  }, [filteredPositions, page, pageSize]);

  const toggleExpand = (id: string) => {
    setExpandedPositions((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleExport = () => {
    exportPositionsCsv(
      filteredPositions,
      isConsolidated ? "EClear_Consolidated_Positions_PnL.csv" : "EClear_Positions_PnL.csv"
    );
  };

  if (transactions.length === 0) return null;

  return (
    <div className="w-full space-y-6 pt-2">
      {/* 1. Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <p className="text-xs text-muted-foreground">
              Calculated using Weighted Average Cost (WAC) with scale-in averaging and partial exit matching
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          className="h-8 gap-1.5 text-xs font-medium"
        >
          <Download className="w-3.5 h-3.5" />
          Export Positions CSV
        </Button>
      </div>

      {/* 2. Top Performance Analytics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Net Realized PnL */}
        <div className="p-3.5 rounded-xl border bg-card/60 backdrop-blur-md shadow-xs space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground uppercase flex items-center gap-1">
            Realized PnL
          </span>
          <p
            className={`text-xl font-bold font-mono tracking-tight ${
              summary.totalRealizedPnL >= 0 ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {summary.totalRealizedPnL >= 0 ? "+" : ""}PKR {summary.totalRealizedPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-muted-foreground font-medium">
            ROI: {summary.overallRoiPercent >= 0 ? "+" : ""}{summary.overallRoiPercent}%
          </p>
        </div>

        {/* Win Rate */}
        <div className="p-3.5 rounded-xl border bg-card/60 backdrop-blur-md shadow-xs space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground uppercase flex items-center justify-between">
            Win Rate
            <span className="text-[10px] font-bold text-emerald-600">
              {summary.winsCount}W / {summary.lossesCount}L
            </span>
          </span>
          <p className="text-xl font-bold font-mono tracking-tight text-foreground">
            {summary.winRatePercent}%
          </p>
          {/* Mini progress bar */}
          <div className="w-full h-1.5 rounded-full bg-rose-500/20 overflow-hidden flex">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${summary.winRatePercent}%` }}
            />
          </div>
        </div>

        {/* Profit Factor */}
        <div className="p-3.5 rounded-xl border bg-card/60 backdrop-blur-md shadow-xs space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground uppercase">Profit Factor</span>
          <p className="text-xl font-bold font-mono tracking-tight text-foreground">
            {summary.profitFactor.toFixed(2)}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">
            +{(summary.grossProfit / 1000).toFixed(1)}k / -{(summary.grossLoss / 1000).toFixed(1)}k
          </p>
        </div>

        {/* Avg Win vs Avg Loss */}
        <div className="p-3.5 rounded-xl border bg-card/60 backdrop-blur-md shadow-xs space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground uppercase">Avg Trade Win/Loss</span>
          <p className="text-sm font-bold font-mono text-emerald-600">
            +PKR {Math.round(summary.avgWinAmount).toLocaleString()}
          </p>
          <p className="text-xs font-bold font-mono text-rose-600">
            -PKR {Math.round(summary.avgLossAmount).toLocaleString()}
          </p>
        </div>

        {/* Open Capital at Risk */}
        <div className="p-3.5 rounded-xl border bg-card/60 backdrop-blur-md shadow-xs space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground uppercase">Active Positions</span>
          <p className="text-xl font-bold font-mono tracking-tight text-purple-600">
            {summary.openPositions} Holding
          </p>
          <p className="text-[10px] text-muted-foreground truncate">
            PKR {Math.round(summary.openCapitalAtRisk).toLocaleString()} Capital
          </p>
        </div>

        {/* Best Trade */}
        <div className="p-3.5 rounded-xl border bg-card/60 backdrop-blur-md shadow-xs space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground uppercase">Best Trade</span>
          {summary.bestTrade ? (
            <>
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm">{summary.bestTrade.symbol}</span>
                <span className="text-xs font-bold text-emerald-600 font-mono">
                  +PKR {Math.round(summary.bestTrade.pnl).toLocaleString()}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">{summary.bestTrade.date}</p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">-</p>
          )}
        </div>
      </div>

      {/* 3. Filter Bar & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search ticker symbol, voucher..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            className="pl-8 h-9 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant={filterTab === "all" ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setFilterTab("all");
              setPage(1);
            }}
          >
            All ({positions.length})
          </Button>
          <Button
            variant={filterTab === "closed" ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs text-slate-700 dark:text-slate-300"
            onClick={() => {
              setFilterTab("closed");
              setPage(1);
            }}
          >
            Closed ({summary.closedPositions})
          </Button>
          <Button
            variant={filterTab === "open" ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs text-blue-600 border-blue-500/30"
            onClick={() => {
              setFilterTab("open");
              setPage(1);
            }}
          >
            Holding ({summary.openPositions})
          </Button>
          <Button
            variant={filterTab === "diff" ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs text-cyan-600 border-cyan-500/30"
            onClick={() => {
              setFilterTab("diff");
              setPage(1);
            }}
          >
            Intraday ({summary.intradayPositions})
          </Button>
          <Button
            variant={filterTab === "wins" ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs text-emerald-600 border-emerald-500/30"
            onClick={() => {
              setFilterTab("wins");
              setPage(1);
            }}
          >
            Wins ({summary.winsCount})
          </Button>
          <Button
            variant={filterTab === "losses" ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs text-rose-600 border-rose-500/30"
            onClick={() => {
              setFilterTab("losses");
              setPage(1);
            }}
          >
            Losses ({summary.lossesCount})
          </Button>
        </div>
      </div>

      {/* 4. Positions Table & Nested Executions */}
      <div className="rounded-xl border bg-card/60 backdrop-blur-md shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[38px]"></TableHead>
                <TableHead className="w-[120px] text-xs font-semibold">Symbol & Status</TableHead>
                <TableHead className="w-[180px] text-xs font-semibold">Timeline & Duration</TableHead>
                <TableHead className="w-[110px] text-xs font-semibold text-right">Volume (Shares)</TableHead>
                <TableHead className="w-[140px] text-xs font-semibold text-right">Avg Entry → Exit</TableHead>
                <TableHead className="w-[130px] text-xs font-semibold text-right">Capital Outflow</TableHead>
                <TableHead className="w-[130px] text-xs font-semibold text-right">Total Inflow</TableHead>
                <TableHead className="w-[130px] text-xs font-semibold text-right">Realized PnL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-xs">
                    No trading positions match your current filter.
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((pos) => {
                  const isExpanded = Boolean(expandedPositions[pos.id]);
                  const isClosed = pos.status === "CLOSED";
                  const isOpen = pos.status === "OPEN";
                  const isDiff = pos.status === "INTRADAY";

                  return (
                    <React.Fragment key={pos.id}>
                      {/* Main Position Summary Row */}
                      <TableRow
                        onClick={() => toggleExpand(pos.id)}
                        className={`cursor-pointer transition-colors ${
                          isExpanded ? "bg-muted/40 font-medium" : "hover:bg-muted/30"
                        }`}
                      >
                        {/* Expand Icon */}
                        <TableCell className="py-3 text-center pl-3 pr-0">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-purple-600" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                        </TableCell>

                        {/* Symbol & Status */}
                        <TableCell className="py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm tracking-tight">{pos.symbol}</span>
                            <Badge
                              variant="outline"
                              className={`text-[9px] font-bold py-0 px-1.5 ${
                                isClosed
                                  ? "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20"
                                  : isOpen
                                  ? "bg-blue-500/10 text-blue-600 border-blue-500/20 animate-pulse"
                                  : "bg-cyan-500/10 text-cyan-600 border-cyan-500/20"
                              }`}
                            >
                              {pos.status}
                            </Badge>
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {pos.events.length} execution{pos.events.length > 1 ? "s" : ""}
                          </span>
                        </TableCell>

                        {/* Date Range & Duration */}
                        <TableCell className="py-3">
                          <div className="flex flex-col text-xs">
                            <span className="font-mono text-[11px] font-medium">
                              {pos.startDate} {pos.endDate ? `→ ${pos.endDate}` : "→ Holding"}
                            </span>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {isDiff ? "Intraday" : `${pos.durationDays} day${pos.durationDays === 1 ? "" : "s"} holding`}
                            </span>
                          </div>
                        </TableCell>

                        {/* Volume */}
                        <TableCell className="py-3 text-right font-mono text-xs">
                          <div>
                            {pos.totalBoughtQty.toLocaleString()} shs
                          </div>
                          {isOpen && (
                            <div className="text-[10px] text-blue-600 font-semibold">
                              {pos.openQty.toLocaleString()} open
                            </div>
                          )}
                        </TableCell>

                        {/* Avg Rates */}
                        <TableCell className="py-3 text-right text-xs">
                          <div className="font-mono font-medium">
                            PKR {pos.avgBuyRate.toFixed(2)}
                            {pos.avgSellRate > 0 && (
                              <span className="text-muted-foreground"> → {pos.avgSellRate.toFixed(2)}</span>
                            )}
                          </div>
                        </TableCell>

                        {/* Cost Basis */}
                        <TableCell className="py-3 text-right font-mono text-xs text-muted-foreground">
                          PKR {Math.round(pos.totalCostBasis).toLocaleString()}
                        </TableCell>

                        {/* Proceeds */}
                        <TableCell className="py-3 text-right font-mono text-xs text-muted-foreground">
                          PKR {Math.round(pos.totalProceeds).toLocaleString()}
                        </TableCell>

                        {/* Realized PnL */}
                        <TableCell className="py-3 text-right">
                          {isOpen && pos.realizedPnL === 0 ? (
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-xs">
                              Unrealized (Open)
                            </Badge>
                          ) : (
                            <div className="flex flex-col items-end">
                              <span
                                className={`text-xs font-bold font-mono ${
                                  pos.realizedPnL >= 0 ? "text-emerald-600" : "text-rose-600"
                                }`}
                              >
                                {pos.realizedPnL >= 0 ? "+" : ""}PKR {pos.realizedPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              {pos.roiPercent !== 0 && (
                                <span
                                  className={`text-[10px] font-semibold ${
                                    pos.roiPercent >= 0 ? "text-emerald-600" : "text-rose-600"
                                  }`}
                                >
                                  {pos.roiPercent >= 0 ? "+" : ""}{pos.roiPercent.toFixed(2)}%
                                </span>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>

                      {/* Expanded Nested Executions Timeline */}
                      {isExpanded && (
                        <TableRow className="bg-muted/15 hover:bg-muted/20 border-t border-b border-purple-500/20">
                          <TableCell colSpan={8} className="py-4 pl-12 pr-6">
                            <div className="space-y-2.5">
                              <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
                                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                  <Layers className="w-3.5 h-3.5 text-purple-600" />
                                  Execution Sequence ({pos.events.length} order{pos.events.length > 1 ? "s" : ""})
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  WAC Matching • Ticker: <strong className="text-foreground">{pos.symbol}</strong>
                                </span>
                              </div>

                              <div className="space-y-2">
                                {pos.events.map((ev, evIdx) => {
                                  const isOpening = ev.type === "OPEN_POSITION";
                                  const isIncrease = ev.type === "INCREASE_POSITION";
                                  const isPartial = ev.type === "PARTIAL_CLOSE";
                                  const isFullClose = ev.type === "CLOSE_POSITION";
                                  const isEventDiff = ev.type === "INTRADAY_DIFF";

                                  return (
                                    <div
                                      key={evIdx}
                                      className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-card border border-border/50 text-xs shadow-2xs"
                                    >
                                      {/* Left side: Type & Action */}
                                      <div className="flex items-center gap-2.5">
                                        {/* Step badge */}
                                        <Badge
                                          variant="outline"
                                          className={`text-[10px] font-bold px-2 py-0.5 ${
                                            isOpening
                                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                              : isIncrease
                                              ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                                              : isPartial
                                              ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                              : isFullClose
                                              ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
                                              : "bg-cyan-500/10 text-cyan-600 border-cyan-500/20"
                                          }`}
                                        >
                                          {isOpening && "Opened Position"}
                                          {isIncrease && "Increased (Scale-In)"}
                                          {isPartial && "Partially Closed"}
                                          {isFullClose && "Closed Position"}
                                          {isEventDiff && "Intraday Diff"}
                                        </Badge>

                                        <span className="font-mono text-muted-foreground text-[11px]">
                                          {ev.date}
                                        </span>

                                        <span className="font-mono font-semibold">
                                          {ev.side} {ev.qty.toLocaleString()} @ PKR {ev.rate.toFixed(2)}
                                        </span>
                                      </div>

                                      {/* Right side: Amount, PnL, New Balance */}
                                      <div className="flex items-center gap-4 text-right">
                                        <div>
                                          <span className="text-muted-foreground text-[10px]">Amount: </span>
                                          <span className="font-mono font-medium">
                                            PKR {ev.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </span>
                                        </div>

                                        {/* Slice PnL if sell or diff */}
                                        {ev.slicePnL !== undefined && (
                                          <div className="min-w-[110px]">
                                            <span className="text-muted-foreground text-[10px]">Slice PnL: </span>
                                            <span
                                              className={`font-mono font-bold ${
                                                ev.slicePnL >= 0 ? "text-emerald-600" : "text-rose-600"
                                              }`}
                                            >
                                              {ev.slicePnL >= 0 ? "+" : ""}PKR {ev.slicePnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                          </div>
                                        )}

                                        {/* Remaining holding & avg rate */}
                                        <div className="text-[10px] text-muted-foreground">
                                          <span>Held: </span>
                                          <strong className="text-foreground font-mono">{ev.remainingQty.toLocaleString()} shs</strong>
                                        </div>

                                        {/* Voucher/ticket badge */}
                                        {ev.voucher && (
                                          <Badge variant="secondary" className="font-mono text-[9px] py-0">
                                            {ev.voucher} {ev.ticket_no ? `#${ev.ticket_no}` : ""}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 text-xs">
            <span className="text-muted-foreground">
              Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredPositions.length)} of {filteredPositions.length} positions
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-xs font-medium">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={page === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
