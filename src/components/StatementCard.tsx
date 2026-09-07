import React, { useState } from "react";
import {
  FileText,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Trash2,
  Loader2,
  Lock,
  Building,
} from "lucide-react";
import { StatementFileItem } from "../types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

interface StatementCardProps {
  item: StatementFileItem;
  onRemove: (id: string) => void;
  onBankChange: (id: string, bank: string) => void;
  onPasswordSubmit: (id: string, password: string) => void;
}

const BANK_OPTIONS = [
  { value: "abl", label: "Allied Bank (ABL)" },
  { value: "fbl", label: "Faysal Bank (FBL)" },
  { value: "hbl", label: "Habib Bank (HBL)" },
  { value: "ubl", label: "United Bank (UBL)" },
  { value: "sadaPay", label: "SadaPay" },
  { value: "easyPaisa", label: "easypaisa" },
  { value: "nayaPay", label: "NayaPay" },
  { value: "payoneer", label: "Payoneer (USD)" },
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export const StatementCard: React.FC<StatementCardProps> = ({
  item,
  onRemove,
  onBankChange,
  onPasswordSubmit,
}) => {
  const [passwordInput, setPasswordInput] = useState(item.password || "");

  const isPdf = item.name.toLowerCase().endsWith(".pdf");
  const isExcel =
    item.name.toLowerCase().endsWith(".xlsx") ||
    item.name.toLowerCase().endsWith(".xls");

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput.trim()) {
      onPasswordSubmit(item.id, passwordInput.trim());
    }
  };

  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-xl border bg-card/80 backdrop-blur-sm shadow-xs transition-all hover:shadow-md">
      {/* File Info */}
      <div className="flex items-center gap-3.5 min-w-[240px] max-w-full">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary">
          {isPdf ? (
            <FileText className="w-5 h-5" />
          ) : (
            <FileSpreadsheet className="w-5 h-5" />
          )}
        </div>

        <div className="overflow-hidden">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm truncate max-w-[200px] md:max-w-[260px]">
              {item.name}
            </p>
            <span className="text-[11px] text-muted-foreground shrink-0">
              ({formatBytes(item.size)})
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1">
            {/* Status Badge */}
            {item.status === "detecting" && (
              <Badge variant="secondary" className="text-[11px] gap-1 py-0">
                <Loader2 className="w-3 h-3 animate-spin" />
                Detecting bank...
              </Badge>
            )}

            {item.status === "parsing" && (
              <Badge variant="secondary" className="text-[11px] gap-1 py-0">
                <Loader2 className="w-3 h-3 animate-spin" />
                Parsing transactions...
              </Badge>
            )}

            {item.status === "success" && (
              <Badge
                variant="outline"
                className="text-[11px] gap-1 py-0 text-emerald-600 bg-emerald-500/10 border-emerald-500/20"
              >
                <CheckCircle2 className="w-3 h-3" />
                {item.transactions.length} rows standardized
              </Badge>
            )}

            {item.status === "password_required" && (
              <Badge
                variant="destructive"
                className="text-[11px] gap-1 py-0 bg-amber-500/10 text-amber-600 border border-amber-500/30"
              >
                <Lock className="w-3 h-3" />
                Password Required
              </Badge>
            )}

            {item.status === "error" && (
              <Badge variant="destructive" className="text-[11px] gap-1 py-0">
                <AlertCircle className="w-3 h-3" />
                Parsing Failed
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Middle: Bank selector and password prompt */}
      <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-start md:justify-end flex-1">
        {/* Bank Dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
            <Building className="w-3 h-3" /> Bank:
          </span>
          <Select
            value={item.bank}
            onValueChange={(val) => onBankChange(item.id, val)}
          >
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="Select bank" />
            </SelectTrigger>
            <SelectContent>
              {BANK_OPTIONS.map((b) => (
                <SelectItem key={b.value} value={b.value} className="text-xs">
                  {b.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Password Prompt for protected statement */}
        {item.status === "password_required" && (
          <form
            onSubmit={handlePasswordSubmit}
            className="flex items-center gap-1.5"
          >
            <Input
              type="password"
              placeholder="Enter PDF PIN / password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="h-8 w-44 text-xs"
            />
            <Button type="submit" size="sm" className="h-8 text-xs gap-1">
              <KeyRound className="w-3 h-3" /> Unlock
            </Button>
          </form>
        )}

        {/* Validation Mini Summary */}
        {item.status === "success" && item.validation && (
          <div className="hidden lg:flex items-center gap-2 text-xs bg-muted/50 rounded-lg px-2.5 py-1 text-muted-foreground border">
            <span>
              Debits:{" "}
              <strong className="text-foreground">
                {item.validation.totalDebit.toLocaleString()} {item.currency}
              </strong>
            </span>
            <span>•</span>
            <span>
              Credits:{" "}
              <strong className="text-foreground">
                {item.validation.totalCredit.toLocaleString()} {item.currency}
              </strong>
            </span>
          </div>
        )}

        {/* Error message */}
        {item.status === "error" && item.error && (
          <span className="text-xs text-destructive truncate max-w-xs">
            {item.error}
          </span>
        )}

        {/* Remove Button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onRemove(item.id)}
          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};
