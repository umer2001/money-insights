import React, { useState } from "react";
import {
  Download,
  FileSpreadsheet,
  FileText,
  RotateCcw,
  Sparkles,
  Loader2,
} from "lucide-react";
import { StatementFileItem } from "../types";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  consolidateStatements,
  exportTransactions,
  downloadBase64,
  downloadBlob,
} from "../lib/api";

interface ExportBarProps {
  items: StatementFileItem[];
  onReset: () => void;
}

export const ExportBar: React.FC<ExportBarProps> = ({ items, onReset }) => {
  const [isExporting, setIsExporting] = useState(false);

  const successfulItems = items.filter((i) => i.status === "success");

  if (successfulItems.length === 0) return null;

  const handleDownloadConsolidated = async (format: "xlsx" | "csv") => {
    try {
      setIsExporting(true);
      const payload = successfulItems.map((item) => ({
        bank: item.bank,
        currency: item.currency || "PKR",
        transactions: item.transactions,
      }));

      const res = await consolidateStatements(payload, format);

      // Trigger downloads for each currency
      for (const [cur, exp] of Object.entries(res.exports)) {
        downloadBase64(exp.contentBase64, exp.filename, exp.mimeType);
      }
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadIndividual = async (
    item: StatementFileItem,
    format: "xlsx" | "csv"
  ) => {
    try {
      setIsExporting(true);
      const blob = await exportTransactions(
        item.transactions,
        format,
        `${item.bank}_standardized`
      );
      downloadBlob(blob, `${item.bank}_standardized.${format}`);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="sticky bottom-4 z-40 w-full max-w-4xl mx-auto">
      <div className="p-3.5 md:p-4 rounded-2xl border bg-background/95 backdrop-blur-md shadow-xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-semibold">Ready for Tax Export</p>
            <p className="text-[11px] text-muted-foreground">
              {successfulItems.length} accounts standardized & reconciled
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Consolidated Excel Button */}
          <Button
            size="sm"
            onClick={() => handleDownloadConsolidated("xlsx")}
            disabled={isExporting}
            className="rounded-xl gap-1.5 shadow-sm font-medium"
          >
            {isExporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5" />
            )}
            Consolidated Excel (.xlsx)
          </Button>

          {/* Consolidated CSV Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDownloadConsolidated("csv")}
            disabled={isExporting}
            className="rounded-xl gap-1.5 font-medium"
          >
            <FileText className="w-3.5 h-3.5" />
            Consolidated CSV
          </Button>

          {/* Individual Export Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="rounded-xl gap-1 text-xs">
                <Download className="w-3.5 h-3.5" /> Single Files
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {successfulItems.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => handleDownloadIndividual(item, "xlsx")}
                  className="text-xs flex items-center justify-between gap-4 cursor-pointer"
                >
                  <span>{item.bankName} Excel</span>
                  <span className="text-[10px] text-muted-foreground">
                    ({item.transactions.length} txs)
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Reset Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onReset}
            title="Start Over"
            className="h-8 w-8 text-muted-foreground hover:text-destructive rounded-xl"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
};
