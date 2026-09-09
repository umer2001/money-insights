import React, { useState, useMemo, useRef } from "react";
import { Link } from "react-router";
import {
  TrendingUp,
  Building2,
  UploadCloud,
  FileSpreadsheet,
  Download,
  Trash2,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sun,
  Moon,
  ShieldCheck
} from "lucide-react";
import { useTheme } from "@/components/refine-ui/theme/theme-provider";
import { TradingFileItem, TradingTransaction, TradingConsolidationResult } from "../types";
import { parseTradingStatement, consolidateTrading, exportTradingTransactions } from "../lib/tradingApi";
import { TradingGrid } from "../components/TradingGrid";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";

export const Trading: React.FC = () => {
  const { isDark, setTheme } = useTheme();
  const [items, setItems] = useState<TradingFileItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("consolidated");
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Process uploaded trading file
  const processFile = async (file: File) => {
    const id = `${file.name}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newItem: TradingFileItem = {
      id,
      file,
      name: file.name,
      size: file.size,
      status: "parsing",
      transactions: [],
    };

    setItems((prev) => [...prev, newItem]);

    try {
      const res = await parseTradingStatement(file);
      setItems((prev) =>
        prev.map((i) =>
          i.id === id
            ? {
                ...i,
                status: "success",
                format: res.format,
                accountId: res.accountId,
                openingBalance: res.openingBalance,
                closingBalance: res.closingBalance,
                transactions: res.transactions,
              }
            : i
        )
      );
    } catch (err: any) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, status: "error", error: err.message } : i
        )
      );
    }
  };

  const handleFilesSelected = async (files: File[]) => {
    setIsProcessing(true);
    for (const file of files) {
      await processFile(file);
    }
    setIsProcessing(false);
  };

  const handleRemove = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const successfulItems = items.filter((i) => i.status === "success");

  // Client-side consolidation memo
  const consolidatedResult = useMemo<TradingConsolidationResult | null>(() => {
    if (successfulItems.length === 0) return null;

    // Use fast local consolidation
    const stmts = successfulItems.map((item) => ({
      transactions: item.transactions,
      openingBalance: item.openingBalance,
      closingBalance: item.closingBalance,
      accountId: item.accountId,
    }));

    // If single statement, return clean presentation
    if (stmts.length === 1) {
      const s = stmts[0];
      let totalDebit = 0;
      let totalCredit = 0;
      for (const tx of s.transactions) {
        if (tx.action === "credit") totalCredit += tx.amount;
        else totalDebit += tx.amount;
      }
      return {
        transactions: s.transactions,
        openingBalance: s.openingBalance || 0,
        closingBalance: s.closingBalance || 0,
        totalDebit,
        totalCredit,
        netChange: totalCredit - totalDebit,
        deduplicatedCount: 0,
        isValid: true,
      };
    }

    // Multiple statements: Group and deduplicate
    const byAccount: Record<string, typeof stmts> = {};
    for (const s of stmts) {
      const acc = s.accountId || "DEFAULT";
      if (!byAccount[acc]) byAccount[acc] = [];
      byAccount[acc].push(s);
    }

    const allTxs: TradingTransaction[] = [];
    let totalDeduplicated = 0;
    let totalOpen = 0;

    for (const [acc, accountStmts] of Object.entries(byAccount)) {
      let openBal = accountStmts[0].openingBalance || 0;
      totalOpen += openBal;

      const deduplicated: TradingTransaction[] = [];

      for (const stmt of accountStmts) {
        const matchedInThis = new Set<number>();
        for (const tx of stmt.transactions) {
          let matchIdx = -1;
          for (let i = 0; i < deduplicated.length; i++) {
            if (!matchedInThis.has(i)) {
              const existing = deduplicated[i];
              if (existing.date === tx.date && existing.action === tx.action) {
                const isTradeA = (existing.side === "BUY" || existing.side === "SELL" || existing.side === "DIFF") && Boolean(existing.symbol);
                const isTradeB = (tx.side === "BUY" || tx.side === "SELL" || tx.side === "DIFF") && Boolean(tx.symbol);

                if (isTradeA && isTradeB) {
                  if (existing.symbol === tx.symbol && existing.side === tx.side) {
                    if (existing.qty !== "-" && tx.qty !== "-" && existing.qty === tx.qty) {
                      matchIdx = i;
                      break;
                    }
                    if (Math.abs(existing.amount - tx.amount) < 2.0) {
                      matchIdx = i;
                      break;
                    }
                  }
                } else if (Math.abs(existing.amount - tx.amount) < 2.0) {
                  matchIdx = i;
                  break;
                }
              }
            }
          }

          if (matchIdx >= 0) {
            matchedInThis.add(matchIdx);
            totalDeduplicated++;
            const base = deduplicated[matchIdx];
            const companion = tx;
            const voucher = companion.voucher || base.voucher || "";
            const ticketNo = companion.ticket_no || base.ticket_no || "";
            const extra = [voucher ? `Voucher: ${voucher}` : "", ticketNo ? `Ticket: #${ticketNo}` : ""].filter(Boolean).join(" | ");

            deduplicated[matchIdx] = {
              ...base,
              voucher,
              ticket_no: ticketNo,
              extra,
              description: base.source_format === "eclear" ? base.description : companion.description,
              merged: true,
            };
          } else {
            deduplicated.push({ ...tx });
          }
        }
      }

      deduplicated.sort((a, b) => a.date.localeCompare(b.date));

      let currentBalance = openBal;
      for (const tx of deduplicated) {
        if (tx.action === "credit") currentBalance += tx.amount;
        else currentBalance -= tx.amount;
        tx.balance = Math.round(currentBalance * 100) / 100;
      }

      allTxs.push(...deduplicated);
    }

    allTxs.sort((a, b) => a.date.localeCompare(b.date));

    let totalDebit = 0;
    let totalCredit = 0;
    for (const tx of allTxs) {
      if (tx.action === "credit") totalCredit += tx.amount;
      else totalDebit += tx.amount;
    }

    totalDebit = Math.round(totalDebit * 100) / 100;
    totalCredit = Math.round(totalCredit * 100) / 100;
    const netChange = Math.round((totalCredit - totalDebit) * 100) / 100;
    const finalBalance = Math.round((totalOpen + netChange) * 100) / 100;

    return {
      transactions: allTxs,
      openingBalance: totalOpen,
      closingBalance: finalBalance,
      totalDebit,
      totalCredit,
      netChange,
      deduplicatedCount: totalDeduplicated,
      isValid: true,
    };
  }, [successfulItems]);

  const displayedTransactions = useMemo(() => {
    if (activeTab === "consolidated") {
      return consolidatedResult ? consolidatedResult.transactions : [];
    }
    const match = successfulItems.find((i) => i.id === activeTab);
    return match ? match.transactions : [];
  }, [activeTab, consolidatedResult, successfulItems]);

  return (
    <div className="min-h-screen bg-linear-to-b from-background via-background/95 to-muted/20 text-foreground pb-20">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-purple-600 flex items-center justify-center text-white shadow-md shadow-purple-500/20">
                <TrendingUp className="h-5 w-5" />
              </div>
              <span className="text-lg font-bold tracking-tight bg-linear-to-r from-foreground to-foreground/70 bg-clip-text">
                MoneyInsight <span className="text-purple-600 font-extrabold text-sm ml-1 px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20">Trading</span>
              </span>
            </Link>

            {/* Navigation Switcher */}
            <nav className="hidden md:flex items-center gap-1.5 p-1 bg-muted/60 rounded-xl border">
              <Link
                to="/"
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
              >
                <Building2 className="w-3.5 h-3.5" />
                Bank Statements
              </Link>
              <Link
                to="/trading"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-background text-foreground shadow-xs flex items-center gap-1.5"
              >
                <TrendingUp className="w-3.5 h-3.5 text-purple-600" />
                EClear Trading
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-xl"
              onClick={() => setTheme(isDark ? "light" : "dark")}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 space-y-8">
        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-300 text-xs font-semibold">
            <Sparkles className="h-3.5 w-3.5 text-purple-600" />
            Zero Data Persistence • In-Memory Processing • SECP & PSX Compliant
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            EClear & PSX Broker Statement Consolidator
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            Drop 1 or more <strong>EClear Custody</strong> or <strong>Broker Back-Office Statements</strong> with overlapping date ranges. Automatically deduplicates colliding transactions with Option C Enriched Merging and exports standardized trading spreadsheets.
          </p>
        </div>

        {/* Dropzone Area */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              handleFilesSelected(Array.from(e.dataTransfer.files));
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-200 ${
            isDragOver
              ? "border-purple-500 bg-purple-500/5 scale-[1.005]"
              : "border-border hover:border-purple-500/50 hover:bg-muted/30"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFilesSelected(Array.from(e.target.files));
              }
            }}
          />

          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="h-14 w-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 shadow-xs">
              <UploadCloud className="h-7 w-7" />
            </div>

            <div className="space-y-1">
              <p className="text-base font-semibold">
                Drop your EClear or Broker Statements here, or <span className="text-purple-600 underline">browse</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Supports EClear Web Statements (JasperReports) and PSX Broker Statements (Oracle 12c) in PDF format
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <Badge variant="outline" className="text-[11px] bg-purple-500/5 border-purple-500/20 text-purple-600">
                EClear Services Limited (ESL)
              </Badge>
              <Badge variant="outline" className="text-[11px] bg-blue-500/5 border-blue-500/20 text-blue-600">
                Syed Faraz Equities (TREC 995)
              </Badge>
              <Badge variant="outline" className="text-[11px] bg-emerald-500/5 border-emerald-500/20 text-emerald-600">
                Oracle 12c Back-Office
              </Badge>
            </div>
          </div>
        </div>

        {/* Uploaded Statements List */}
        {items.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Uploaded Statements ({items.length})
              </h3>
              {items.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setItems([])}
                  className="h-7 text-xs text-muted-foreground hover:text-rose-500"
                >
                  Clear All
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-xl border bg-card/60 backdrop-blur-md shadow-xs space-y-2 relative"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate" title={item.name}>
                        {item.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {(item.size / 1024).toFixed(1)} KB
                      </p>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-rose-600"
                      onClick={() => handleRemove(item.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-between pt-1 text-xs">
                    {item.status === "parsing" ? (
                      <span className="text-amber-600 flex items-center gap-1">
                        <RefreshCw className="h-3 w-3 animate-spin" /> Parsing...
                      </span>
                    ) : item.status === "success" ? (
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-medium py-0 ${
                            item.format === "eclear"
                              ? "bg-purple-500/10 text-purple-600 border-purple-500/20"
                              : "bg-blue-500/10 text-blue-600 border-blue-500/20"
                          }`}
                        >
                          {item.format === "eclear" ? "EClear Custody" : "Broker Back-Office"}
                        </Badge>
                        <span className="text-muted-foreground font-mono text-[11px]">
                          {item.transactions.length} txs
                        </span>
                      </div>
                    ) : (
                      <span className="text-rose-600 flex items-center gap-1 text-[11px]">
                        <AlertCircle className="h-3 w-3" /> {item.error || "Failed"}
                      </span>
                    )}

                    {item.status === "success" && (
                      <span className="font-mono font-semibold text-[11px]">
                        Bal: PKR {Number(item.closingBalance || 0).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Consolidated Summary Metrics */}
        {consolidatedResult && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="p-4 rounded-xl border bg-card/60 backdrop-blur-md shadow-xs space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground uppercase">Unique Records</span>
              <p className="text-2xl font-bold font-mono tracking-tight text-foreground">
                {consolidatedResult.transactions.length}
              </p>
              {consolidatedResult.deduplicatedCount > 0 && (
                <p className="text-[10px] text-purple-600 font-semibold">
                  {consolidatedResult.deduplicatedCount} Collisions Merged
                </p>
              )}
            </div>

            <div className="p-4 rounded-xl border bg-card/60 backdrop-blur-md shadow-xs space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground uppercase">Opening Balance</span>
              <p className="text-2xl font-bold font-mono tracking-tight text-foreground">
                PKR {consolidatedResult.openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-muted-foreground">Timeline initial state</p>
            </div>

            <div className="p-4 rounded-xl border bg-card/60 backdrop-blur-md shadow-xs space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground uppercase">Total Inflows</span>
              <p className="text-2xl font-bold font-mono tracking-tight text-emerald-600">
                +PKR {consolidatedResult.totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-muted-foreground">Sells & Deposits</p>
            </div>

            <div className="p-4 rounded-xl border bg-card/60 backdrop-blur-md shadow-xs space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground uppercase">Total Outflows</span>
              <p className="text-2xl font-bold font-mono tracking-tight text-rose-600">
                -PKR {consolidatedResult.totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-muted-foreground">Buys & Charges</p>
            </div>

            <div className="p-4 rounded-xl border bg-card/60 backdrop-blur-md shadow-xs space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground uppercase">Closing Balance</span>
              <p className="text-2xl font-bold font-mono tracking-tight text-purple-600">
                PKR {consolidatedResult.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-emerald-600 font-medium">Reconciled Continuity</p>
            </div>
          </div>
        )}

        {/* Tab Switcher & Data Grid */}
        {successfulItems.length > 0 && (
          <div className="space-y-4">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="bg-muted/80 p-1 rounded-xl h-auto flex flex-wrap">
                <TabsTrigger value="consolidated" className="text-xs font-semibold py-1.5 px-3">
                  <Layers className="w-3.5 h-3.5 mr-1.5 text-purple-600" />
                  Consolidated Timeline ({consolidatedResult?.transactions.length || 0})
                </TabsTrigger>

                {successfulItems.map((item) => (
                  <TabsTrigger key={item.id} value={item.id} className="text-xs py-1.5 px-3">
                    <span className="truncate max-w-[150px]">{item.name}</span>
                    <Badge variant="secondary" className="ml-1.5 text-[9px] py-0">
                      {item.transactions.length}
                    </Badge>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <TradingGrid
              transactions={displayedTransactions}
              title={activeTab === "consolidated" ? "Consolidated Deduplicated Trading Ledger" : "Individual Statement Ledger"}
              isConsolidated={activeTab === "consolidated"}
            />
          </div>
        )}
      </main>
    </div>
  );
};
