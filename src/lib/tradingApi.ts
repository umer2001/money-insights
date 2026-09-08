import { TradingTransaction, TradingConsolidationResult } from "../types";

const API_BASE = (
  import.meta.env.PROD ||
    !import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_URL.includes("127.0.0.1") ||
    import.meta.env.VITE_API_URL.includes("localhost")
    ? "/api"
    : import.meta.env.VITE_API_URL
).trim();

export interface ParseTradingResponse {
  success: boolean;
  filename: string;
  format: 'eclear' | 'broker';
  accountId: string;
  openingBalance: number;
  closingBalance: number;
  transactions: TradingTransaction[];
  error?: string;
}

export async function parseTradingStatement(file: File): Promise<ParseTradingResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/trading/parse`, {
    method: "POST",
    body: formData,
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Failed to parse trading statement");
  }

  return data;
}

export async function consolidateTrading(
  statements: Array<{
    transactions: TradingTransaction[];
    openingBalance?: number;
    closingBalance?: number;
    accountId?: string;
  }>,
  format: "xlsx" | "csv" = "xlsx"
): Promise<TradingConsolidationResult> {
  const res = await fetch(`${API_BASE}/trading/consolidate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ statements, format }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Failed to consolidate trading statements");
  }

  return data;
}

export async function exportTradingTransactions(
  transactions: TradingTransaction[],
  format: "xlsx" | "csv" = "xlsx",
  sheetName = "EClear_Trading"
): Promise<void> {
  const res = await fetch(`${API_BASE}/trading/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transactions, format, sheetName }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Export failed");
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sheetName}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
