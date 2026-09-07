import React, { useState, useMemo } from "react";
import { Search, Filter, ArrowUpDown, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { StandardTransaction, StatementFileItem } from "../types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";

interface TransactionGridProps {
  items: StatementFileItem[];
}

export const TransactionGrid: React.FC<TransactionGridProps> = ({ items }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "debit" | "credit">("all");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const successfulItems = items.filter((i) => i.status === "success");

  // Collect and sort all transactions
  const allTransactions = useMemo(() => {
    let list: StandardTransaction[] = [];

    if (activeTab === "all") {
      list = successfulItems.flatMap((i) => i.transactions);
    } else if (activeTab === "pkr") {
      list = successfulItems
        .filter((i) => (i.currency || "PKR") === "PKR")
        .flatMap((i) => i.transactions);
    } else if (activeTab === "usd") {
      list = successfulItems
        .filter((i) => i.currency === "USD")
        .flatMap((i) => i.transactions);
    } else {
      const match = successfulItems.find((i) => i.id === activeTab);
      if (match) list = match.transactions;
    }

    // Sort chronologically: Date ASC, Time ASC
    return list.slice().sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.time || "").localeCompare(b.time || "");
    });
  }, [successfulItems, activeTab]);

  // Filter by search and type
  const filtered = useMemo(() => {
    return allTransactions.filter((tx) => {
      const matchesSearch =
        !searchTerm ||
        tx.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.transaction_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.bank.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.date.includes(searchTerm);

      const matchesType =
        typeFilter === "all" || tx.type.toLowerCase() === typeFilter;

      return matchesSearch && matchesType;
    });
  }, [allTransactions, searchTerm, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  if (successfulItems.length === 0) return null;

  return (
    <div className="w-full space-y-4 pt-2">
      {/* Tab bar & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <Tabs
          value={activeTab}
          onValueChange={(val) => {
            setActiveTab(val);
            setPage(1);
          }}
          className="w-full sm:w-auto"
        >
          <TabsList className="bg-muted/80 p-1 rounded-xl h-auto flex flex-wrap">
            <TabsTrigger value="all" className="text-xs rounded-lg px-3 py-1.5">
              All ({allTransactions.length})
            </TabsTrigger>
            <TabsTrigger value="pkr" className="text-xs rounded-lg px-3 py-1.5">
              Consolidated PKR
            </TabsTrigger>
            {successfulItems.some((i) => i.currency === "USD") && (
              <TabsTrigger value="usd" className="text-xs rounded-lg px-3 py-1.5">
                Consolidated USD
              </TabsTrigger>
            )}
            {successfulItems.map((item) => (
              <TabsTrigger
                key={item.id}
                value={item.id}
                className="text-xs rounded-lg px-3 py-1.5"
              >
                {item.bankName}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Search & Type filter */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search description, ID..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="pl-8 h-8 text-xs rounded-lg"
            />
          </div>

          <Select
            value={typeFilter}
            onValueChange={(val: any) => {
              setTypeFilter(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-28 text-xs rounded-lg">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Types</SelectItem>
              <SelectItem value="debit" className="text-xs">Debit</SelectItem>
              <SelectItem value="credit" className="text-xs">Credit</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table Container */}
      <div className="rounded-xl border bg-card/80 backdrop-blur-sm overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-[110px] text-xs font-semibold">Date</TableHead>
                <TableHead className="w-[85px] text-xs font-semibold">Time</TableHead>
                <TableHead className="w-[100px] text-xs font-semibold">Bank</TableHead>
                <TableHead className="w-[140px] text-xs font-semibold">Account</TableHead>
                <TableHead className="w-[90px] text-xs font-semibold">Type</TableHead>
                <TableHead className="w-[120px] text-xs font-semibold text-right">Amount</TableHead>
                <TableHead className="text-xs font-semibold">Description</TableHead>
                <TableHead className="w-[140px] text-xs font-semibold">Tx ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-xs">
                    No transactions match your search criteria.
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((tx, idx) => {
                  const isCredit = tx.type === "credit";
                  return (
                    <TableRow key={idx} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-mono text-xs py-2.5">{tx.date}</TableCell>
                      <TableCell className="font-mono text-xs py-2.5 text-muted-foreground">
                        {tx.time || "-"}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <Badge variant="outline" className="text-[10px] font-medium py-0">
                          {tx.bank}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-[11px] py-2.5 text-muted-foreground truncate max-w-[130px]">
                        {tx.account_id}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-semibold uppercase py-0 ${
                            isCredit
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-600 border-rose-500/20"
                          }`}
                        >
                          {tx.type}
                        </Badge>
                      </TableCell>
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
                      <TableCell className="text-xs py-2.5 max-w-[320px] truncate" title={tx.description}>
                        {tx.description}
                      </TableCell>
                      <TableCell className="font-mono text-[11px] py-2.5 text-muted-foreground truncate max-w-[120px]" title={tx.transaction_id}>
                        {tx.transaction_id || "-"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 text-xs text-muted-foreground">
          <span>
            Showing <strong>{filtered.length > 0 ? (page - 1) * pageSize + 1 : 0}</strong> -{" "}
            <strong>{Math.min(page * pageSize, filtered.length)}</strong> of{" "}
            <strong>{filtered.length}</strong> transactions
          </span>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <span className="px-2 font-medium">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
