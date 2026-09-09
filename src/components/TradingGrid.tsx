import React, { useState, useMemo } from "react";
import { Search, ArrowUpDown, ChevronLeft, ChevronRight, Download, Filter, Layers } from "lucide-react";
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
import { exportTradingTransactions } from "../lib/tradingApi";

interface TradingGridProps {
  transactions: TradingTransaction[];
  title?: string;
  isConsolidated?: boolean;
}

export const TradingGrid: React.FC<TradingGridProps> = ({
  transactions,
  title = "Trading Activity Ledger",
  isConsolidated = false,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [sideFilter, setSideFilter] = useState<"all" | "BUY" | "SELL" | "DIFF" | "other">("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Filter
  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      const symDesc = (tx.symbol_description || tx.symbol || tx.description || "").toLowerCase();
      const voucher = (tx.voucher || tx.transaction_id || "").toLowerCase();
      const s = searchTerm.toLowerCase();

      const matchesSearch =
        !searchTerm ||
        symDesc.includes(s) ||
        voucher.includes(s) ||
        tx.date.includes(s) ||
        (tx.ticket_no && tx.ticket_no.includes(s));

      let matchesSide = true;
      if (sideFilter === "BUY") matchesSide = tx.side === "BUY";
      else if (sideFilter === "SELL") matchesSide = tx.side === "SELL";
      else if (sideFilter === "DIFF") matchesSide = tx.side === "DIFF";
      else if (sideFilter === "other") matchesSide = tx.side === "-" || !tx.side;

      return matchesSearch && matchesSide;
    });
  }, [transactions, searchTerm, sideFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const handleExport = (format: "xlsx" | "csv") => {
    exportTradingTransactions(
      filtered,
      format,
      isConsolidated ? "EClear_Consolidated_Trading" : "EClear_Trading_Statement"
    );
  };

  if (transactions.length === 0) return null;

  return (
    <div className="w-full space-y-4 pt-2">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <Badge variant="secondary" className="font-mono text-xs">
            {transactions.length} Records
          </Badge>
          {isConsolidated && (
            <Badge className="bg-purple-500/10 text-purple-600 border-purple-500/20 text-xs">
              Consolidated & Deduplicated
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport("xlsx")}
            className="h-8 gap-1.5 text-xs font-medium"
          >
            <Download className="w-3.5 h-3.5" />
            Export Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport("csv")}
            className="h-8 gap-1.5 text-xs font-medium"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search symbol, narration, voucher..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            className="pl-8 h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant={sideFilter === "all" ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setSideFilter("all");
              setPage(1);
            }}
          >
            All
          </Button>
          <Button
            variant={sideFilter === "BUY" ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs text-emerald-600"
            onClick={() => {
              setSideFilter("BUY");
              setPage(1);
            }}
          >
            BUY
          </Button>
          <Button
            variant={sideFilter === "SELL" ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs text-amber-600"
            onClick={() => {
              setSideFilter("SELL");
              setPage(1);
            }}
          >
            SELL
          </Button>
          <Button
            variant={sideFilter === "DIFF" ? "default" : "outline"}
            size="sm"
            className={`h-8 text-xs ${
              sideFilter === "DIFF"
                ? "bg-cyan-600 hover:bg-cyan-700 text-white"
                : "text-cyan-600 border-cyan-500/30 hover:bg-cyan-500/10"
            }`}
            onClick={() => {
              setSideFilter("DIFF");
              setPage(1);
            }}
          >
            DIFF
          </Button>
          <Button
            variant={sideFilter === "other" ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setSideFilter("other");
              setPage(1);
            }}
          >
            Cash & Fees
          </Button>
        </div>
      </div>

      {/* Table Container */}
      <div className="rounded-xl border bg-card/60 backdrop-blur-md shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[110px] text-xs font-semibold">Date</TableHead>
                <TableHead className="text-xs font-semibold">Symbol / Description</TableHead>
                <TableHead className="w-[90px] text-xs font-semibold text-center">Side</TableHead>
                <TableHead className="w-[90px] text-xs font-semibold text-center">Action</TableHead>
                <TableHead className="w-[85px] text-xs font-semibold text-right">Qty</TableHead>
                <TableHead className="w-[95px] text-xs font-semibold text-right">Rate</TableHead>
                <TableHead className="w-[110px] text-xs font-semibold text-right">Amount (PKR)</TableHead>
                <TableHead className="w-[120px] text-xs font-semibold text-right">Balance (PKR)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-xs">
                    No transactions match your search filter.
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((tx, idx) => {
                  const isCredit = tx.action === "credit";
                  const isBuy = tx.side === "BUY";
                  const isSell = tx.side === "SELL";
                  const isDiff = tx.side === "DIFF";
                  const symDesc = tx.symbol_description || tx.symbol || tx.description;

                  return (
                    <TableRow key={idx} className="hover:bg-muted/30 transition-colors">
                      {/* Date */}
                      <TableCell className="font-mono text-xs py-2.5 font-medium">
                        {tx.date}
                      </TableCell>

                      {/* Symbol / Description */}
                      <TableCell className="py-2.5 max-w-[340px]">
                        <div className="flex flex-col">
                          <span className="text-xs font-medium truncate" title={symDesc}>
                            {symDesc}
                          </span>
                          {tx.voucher && (
                            <span className="text-[10px] font-mono text-muted-foreground">
                              Voucher: {tx.voucher} {tx.ticket_no ? `| Ticket: #${tx.ticket_no}` : ""}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* Side */}
                      <TableCell className="py-2.5 text-center">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-bold py-0 ${
                            isBuy
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              : isSell
                              ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                              : isDiff
                              ? "bg-cyan-500/10 text-cyan-600 border-cyan-500/20 dark:bg-cyan-500/20 dark:text-cyan-400"
                              : "bg-slate-500/10 text-slate-500 border-slate-500/20"
                          }`}
                        >
                          {tx.side || "-"}
                        </Badge>
                      </TableCell>

                      {/* Action */}
                      <TableCell className="py-2.5 text-center">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-semibold uppercase py-0 ${
                            isCredit
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-600 border-rose-500/20"
                          }`}
                        >
                          {tx.action}
                        </Badge>
                      </TableCell>

                      {/* Qty */}
                      <TableCell className="text-right font-mono text-xs py-2.5 text-muted-foreground">
                        {typeof tx.qty === "number" ? tx.qty.toLocaleString() : tx.qty || "-"}
                      </TableCell>

                      {/* Rate */}
                      <TableCell className="text-right font-mono text-xs py-2.5 text-muted-foreground">
                        {typeof tx.rate === "number"
                          ? tx.rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : tx.rate || "-"}
                      </TableCell>

                      {/* Amount */}
                      <TableCell
                        className={`text-right font-mono text-xs font-semibold py-2.5 ${
                          isCredit ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {isCredit ? "+" : "-"}
                        {Number(tx.amount).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>

                      {/* Balance */}
                      <TableCell className="text-right font-mono text-xs font-semibold py-2.5">
                        {Number(tx.balance).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 text-xs text-muted-foreground">
          <span>
            Showing <strong>{filtered.length > 0 ? (page - 1) * pageSize + 1 : 0}</strong> -{" "}
            <strong>{Math.min(page * pageSize, filtered.length)}</strong> of{" "}
            <strong>{filtered.length}</strong> records
          </span>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="font-mono px-1">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
