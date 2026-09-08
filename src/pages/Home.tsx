import React, { useState } from "react";
import { Link } from "react-router";
import {
  Wallet,
  ShieldCheck,
  Moon,
  Sun,
  FileSpreadsheet,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Building2,
  TrendingUp,
} from "lucide-react";
import { useTheme } from "@/components/refine-ui/theme/theme-provider";
import { StatementFileItem } from "../types";
import { detectStatement, parseStatement } from "../lib/api";
import { Dropzone } from "../components/Dropzone";
import { StatementCard } from "../components/StatementCard";
import { SummaryCards } from "../components/SummaryCards";
import { TransactionGrid } from "../components/TransactionGrid";
import { ExportBar } from "../components/ExportBar";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

export const Home: React.FC = () => {
  const { isDark, setTheme } = useTheme();
  const [items, setItems] = useState<StatementFileItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Process a newly added file
  const processFile = async (file: File) => {
    const id = `${file.name}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newItem: StatementFileItem = {
      id,
      file,
      name: file.name,
      size: file.size,
      status: "detecting",
      bank: "auto",
      bankName: "Detecting...",
      fullName: "",
      currency: "PKR",
      transactions: [],
    };

    setItems((prev) => [...prev, newItem]);

    try {
      // 1. Detect format
      const detectRes = await detectStatement(file);
      const detectedBank = detectRes.detected.bank;

      setItems((prev) =>
        prev.map((i) =>
          i.id === id
            ? {
                ...i,
                bank: detectedBank,
                bankName: detectRes.detected.bankName,
                fullName: detectRes.detected.fullName,
                currency: detectRes.detected.currency,
                status: detectRes.detected.requiresPassword ? "password_required" : "parsing",
              }
            : i
        )
      );

      // If password required, pause here and wait for user input
      if (detectRes.detected.requiresPassword) {
        return;
      }

      // 2. Parse statement
      const parseRes = await parseStatement(file, detectedBank, "");
      setItems((prev) =>
        prev.map((i) =>
          i.id === id
            ? {
                ...i,
                status: "success",
                transactions: parseRes.transactions,
                validation: parseRes.validation,
              }
            : i
        )
      );
    } catch (err: any) {
      if (err.code === "PASSWORD_REQUIRED") {
        setItems((prev) =>
          prev.map((i) =>
            i.id === id ? { ...i, status: "password_required", bank: err.bank || i.bank } : i
          )
        );
      } else {
        setItems((prev) =>
          prev.map((i) =>
            i.id === id ? { ...i, status: "error", error: err.message } : i
          )
        );
      }
    }
  };

  const handleFilesSelected = async (newFiles: File[]) => {
    setIsProcessing(true);
    for (const file of newFiles) {
      await processFile(file);
    }
    setIsProcessing(false);
  };

  const handleRemove = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleBankChange = async (id: string, newBank: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    setItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, bank: newBank, status: "parsing", error: undefined } : i
      )
    );

    try {
      const parseRes = await parseStatement(item.file, newBank, item.password || "");
      setItems((prev) =>
        prev.map((i) =>
          i.id === id
            ? {
                ...i,
                status: "success",
                bank: newBank,
                bankName: parseRes.bankName,
                fullName: parseRes.fullName,
                currency: parseRes.currency,
                transactions: parseRes.transactions,
                validation: parseRes.validation,
              }
            : i
        )
      );
    } catch (err: any) {
      if (err.code === "PASSWORD_REQUIRED") {
        setItems((prev) =>
          prev.map((i) => (i.id === id ? { ...i, status: "password_required" } : i))
        );
      } else {
        setItems((prev) =>
          prev.map((i) => (i.id === id ? { ...i, status: "error", error: err.message } : i))
        );
      }
    }
  };

  const handlePasswordSubmit = async (id: string, password: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, password, status: "parsing", error: undefined }
          : i
      )
    );

    try {
      const parseRes = await parseStatement(item.file, item.bank, password);
      setItems((prev) =>
        prev.map((i) =>
          i.id === id
            ? {
                ...i,
                bank: parseRes.bank || i.bank,
                bankName: parseRes.bankName || i.bankName,
                fullName: parseRes.fullName || i.fullName,
                currency: parseRes.currency || i.currency,
                status: "success",
                transactions: parseRes.transactions,
                validation: parseRes.validation,
              }
            : i
        )
      );
    } catch (err: any) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === id
            ? {
                ...i,
                status: "password_required",
                error: "Invalid password or corrupted file.",
              }
            : i
        )
      );
    }
  };

  const handleReset = () => {
    if (items.length > 0 && confirm("Clear all uploaded statements and start over?")) {
      setItems([]);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-b from-background via-background/95 to-muted/20 text-foreground pb-24">
      {/* Top Navigation Bar */}
      <header className="border-b bg-background/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-linear-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-md shadow-emerald-500/20 text-white">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base tracking-tight">MoneyInsight</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-medium">
                    Financial Utility
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground hidden sm:block">
                  Bank Statement Standardization & Consolidation
                </p>
              </div>
            </div>

            {/* Navigation Switcher */}
            <nav className="hidden md:flex items-center gap-1.5 p-1 bg-muted/60 rounded-xl border">
              <Link
                to="/"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-background text-foreground shadow-xs flex items-center gap-1.5"
              >
                <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                Bank Statements
              </Link>
              <Link
                to="/trading"
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
              >
                <TrendingUp className="w-3.5 h-3.5 text-purple-600" />
                EClear Trading
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hidden md:flex items-center gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              100% Client-Side Privacy
            </Badge>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className="rounded-xl w-9 h-9 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-foreground" />
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Hero Tagline */}
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Fast & Privacy-First Statement Standardizer</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Standardize & Consolidate Your Bank Statements
          </h1>

          <p className="text-sm text-muted-foreground">
            Drop statements from Pakistani and global banks. Automatically extract transactions, reconcile debits and credits, and export clean, consolidated Excel and CSV spreadsheets.
          </p>
        </div>

        {/* Smallpdf-style Dropzone */}
        <Dropzone onFilesSelected={handleFilesSelected} isProcessing={isProcessing} />

        {/* Uploaded Statements List */}
        {items.length > 0 && (
          <div className="max-w-4xl mx-auto space-y-3 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Uploaded Statements ({items.length})
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="text-xs text-muted-foreground hover:text-destructive gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Clear All
              </Button>
            </div>

            <div className="space-y-2.5">
              {items.map((item) => (
                <StatementCard
                  key={item.id}
                  item={item}
                  onRemove={handleRemove}
                  onBankChange={handleBankChange}
                  onPasswordSubmit={handlePasswordSubmit}
                />
              ))}
            </div>
          </div>
        )}

        {/* Financial Audit Summary Cards */}
        {items.some((i) => i.status === "success") && (
          <div className="pt-2">
            <SummaryCards items={items} />
          </div>
        )}

        {/* Transaction Data Table */}
        {items.some((i) => i.status === "success") && (
          <div className="pt-2">
            <TransactionGrid items={items} />
          </div>
        )}

        {/* Sticky Export Action Bar */}
        {items.some((i) => i.status === "success") && (
          <ExportBar items={items} onReset={handleReset} />
        )}
      </main>
    </div>
  );
};
