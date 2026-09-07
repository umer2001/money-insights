import React from "react";
import {
  TrendingUp,
  TrendingDown,
  Scale,
  FileCheck,
  Layers,
} from "lucide-react";
import { StatementFileItem } from "../types";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";

interface SummaryCardsProps {
  items: StatementFileItem[];
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ items }) => {
  const successfulItems = items.filter((i) => i.status === "success");

  if (successfulItems.length === 0) return null;

  // Aggregate by currency
  const currencies: Record<
    string,
    { debit: number; credit: number; net: number; count: number }
  > = {};

  for (const item of successfulItems) {
    const cur = item.currency || "PKR";
    if (!currencies[cur]) {
      currencies[cur] = { debit: 0, credit: 0, net: 0, count: 0 };
    }
    const v = item.validation;
    if (v) {
      currencies[cur].debit += v.totalDebit;
      currencies[cur].credit += v.totalCredit;
      currencies[cur].net += v.netChange;
    }
    currencies[cur].count += item.transactions.length;
  }

  const primaryCur = "PKR";
  const pkrStats = currencies["PKR"] || { debit: 0, credit: 0, net: 0, count: 0 };
  const hasUsd = !!currencies["USD"];
  const usdStats = currencies["USD"] || { debit: 0, credit: 0, net: 0, count: 0 };

  const totalTxCount = successfulItems.reduce(
    (acc, cur) => acc + cur.transactions.length,
    0
  );

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <h4 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground">
            Financial Audit & Consolidation Summary
          </h4>
        </div>
        <Badge
          variant="outline"
          className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1.5"
        >
          <FileCheck className="w-3.5 h-3.5" />
          {successfulItems.length} Statements Audited
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Outflow (Debits) */}
        <Card className="bg-card/70 backdrop-blur-sm border shadow-xs overflow-hidden relative group hover:shadow-md transition-all">
          <div className="absolute top-0 left-0 right-0 h-1 bg-rose-500/80" />
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Total Debits (Outflow)
              </span>
              <div className="w-7 h-7 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-600">
                <TrendingDown className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5">
              <p className="text-2xl font-bold tracking-tight text-foreground">
                PKR {pkrStats.debit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              {hasUsd && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  + USD {usdStats.debit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Inflow (Credits) */}
        <Card className="bg-card/70 backdrop-blur-sm border shadow-xs overflow-hidden relative group hover:shadow-md transition-all">
          <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500/80" />
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Total Credits (Inflow)
              </span>
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5">
              <p className="text-2xl font-bold tracking-tight text-foreground">
                PKR {pkrStats.credit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              {hasUsd && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  + USD {usdStats.credit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Net Movement */}
        <Card className="bg-card/70 backdrop-blur-sm border shadow-xs overflow-hidden relative group hover:shadow-md transition-all">
          <div
            className={`absolute top-0 left-0 right-0 h-1 ${
              pkrStats.net >= 0 ? "bg-emerald-500/80" : "bg-amber-500/80"
            }`}
          />
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Net Cashflow
              </span>
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                  pkrStats.net >= 0
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "bg-amber-500/10 text-amber-600"
                }`}
              >
                <Scale className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5">
              <p
                className={`text-2xl font-bold tracking-tight ${
                  pkrStats.net >= 0 ? "text-emerald-600" : "text-amber-600"
                }`}
              >
                {pkrStats.net >= 0 ? "+" : ""}
                PKR {pkrStats.net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              {hasUsd && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {usdStats.net >= 0 ? "+" : ""}
                  USD {usdStats.net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Transaction Count */}
        <Card className="bg-card/70 backdrop-blur-sm border shadow-xs overflow-hidden relative group hover:shadow-md transition-all">
          <div className="absolute top-0 left-0 right-0 h-1 bg-primary/80" />
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Standardized Rows
              </span>
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <FileCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5">
              <p className="text-2xl font-bold tracking-tight text-foreground">
                {totalTxCount.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Across {successfulItems.length} accounts
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
