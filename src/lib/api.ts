import { StandardTransaction, StatementValidation } from "../types";

const API_BASE = (
  import.meta.env.PROD ||
  !import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_URL.includes("127.0.0.1") ||
  import.meta.env.VITE_API_URL.includes("localhost")
    ? "/api"
    : import.meta.env.VITE_API_URL
).trim();

export interface DetectResponse {
  detected: {
    bank: string;
    confidence: number;
    requiresPassword?: boolean;
    bankName: string;
    fullName: string;
    currency: string;
  };
}

export interface ParseResponse {
  success: boolean;
  bank: string;
  bankName: string;
  fullName: string;
  currency: string;
  filename: string;
  transactions: StandardTransaction[];
  validation: StatementValidation;
  error?: string;
  code?: string;
}

export interface ConsolidateResponse {
  success: boolean;
  totalTransactions: number;
  currencies: string[];
  summary: Record<string, {
    transactionCount: number;
    totalDebit: number;
    totalCredit: number;
    netChange: number;
    isValid: boolean;
  }>;
  exports: Record<string, {
    filename: string;
    contentBase64: string;
    mimeType: string;
  }>;
}

export async function detectStatement(file: File, password = ""): Promise<DetectResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (password) formData.append("password", password);

  const res = await fetch(`${API_BASE}/detect`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Detection failed: ${res.statusText}`);
  }

  return res.json();
}

export async function parseStatement(
  file: File,
  bank = "auto",
  password = ""
): Promise<ParseResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (bank) formData.append("bank", bank);
  if (password) formData.append("password", password);

  const res = await fetch(`${API_BASE}/parse`, {
    method: "POST",
    body: formData,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data.error || `Parsing failed: ${res.statusText}`);
    (err as any).code = data.code;
    (err as any).bank = data.bank;
    throw err;
  }

  return data;
}

export async function consolidateStatements(
  statements: { bank: string; currency: string; transactions: StandardTransaction[] }[],
  format: "xlsx" | "csv" = "xlsx"
): Promise<ConsolidateResponse> {
  const res = await fetch(`${API_BASE}/consolidate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ statements, format }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Consolidation failed: ${res.statusText}`);
  }

  return res.json();
}

export async function exportTransactions(
  transactions: StandardTransaction[],
  format: "xlsx" | "csv",
  sheetName = "Standardized_Statement"
): Promise<Blob> {
  const res = await fetch(`${API_BASE}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transactions, format, sheetName }),
  });

  if (!res.ok) {
    throw new Error(`Export failed: ${res.statusText}`);
  }

  return res.blob();
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadBase64(base64: string, filename: string, mimeType: string) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mimeType });
  downloadBlob(blob, filename);
}
