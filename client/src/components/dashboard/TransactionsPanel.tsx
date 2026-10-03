import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Pencil,
  Printer,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Search,
  ListFilter,
} from "lucide-react";
import { bdt, dateText } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useVirtualScroll } from "@/hooks/useVirtualScroll";
import { useRowGestures } from "@/mobile/useRowGestures";
import { ScrollShadow } from "@/components/ui/scroll-shadow";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";

const PAGE_SIZE_OPTIONS = [15, 30, 50, 100];
const ROW_HEIGHT = 48; // px height per row

type TransactionRow =
  inferRouterOutputs<AppRouter>["finance"]["overview"]["transactions"][number];

export function TransactionsPanel({
  rows,
  filter,
  setFilter,
  onAdd,
  onEdit,
  onDelete,
  onVoucher,
}: {
  rows: TransactionRow[];
  filter: "all" | "income" | "expense";
  setFilter: (value: "all" | "income" | "expense") => void;
  onAdd: () => void;
  onEdit: (row: TransactionRow) => void;
  onDelete: (id: number) => void;
  onVoucher?: (row: TransactionRow) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [isVirtualMode, setIsVirtualMode] = useState(false);

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase().trim();
    return rows.filter(
      r =>
        r.note?.toLowerCase().includes(q) ||
        r.categoryName?.toLowerCase().includes(q) ||
        r.accountName?.toLowerCase().includes(q) ||
        r.paymentMethod?.toLowerCase().includes(q) ||
        String(r.amount).includes(q)
    );
  }, [rows, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const activePage = Math.min(currentPage, totalPages);

  const paginatedRows = useMemo(() => {
    if (isVirtualMode) return filteredRows;
    const start = (activePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, activePage, pageSize, isVirtualMode]);

  const virtualizer = useVirtualScroll({
    itemCount: isVirtualMode ? filteredRows.length : paginatedRows.length,
    itemHeight: ROW_HEIGHT,
    overscan: 4,
  });

  const visibleVirtualRows = useMemo(() => {
    if (!isVirtualMode) return paginatedRows;
    return filteredRows.slice(virtualizer.startIndex, virtualizer.endIndex + 1);
  }, [
    isVirtualMode,
    filteredRows,
    paginatedRows,
    virtualizer.startIndex,
    virtualizer.endIndex,
  ]);

  return (
    <article className="finance-card p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="section-kicker">লেনদেন</p>
          <div className="flex items-center gap-2">
            <h2 className="section-title">সাম্প্রতিক হিসাব</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-positive">
              মোট {filteredRows.length}টি
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[140px] flex-1 sm:w-48 sm:flex-initial">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="খুঁজুন..."
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="h-10 pl-8 text-xs rounded-xl bg-card border-border"
            />
          </div>
          <select
            className="finance-input h-10 text-sm"
            value={filter}
            onChange={event => {
              setFilter(event.target.value as typeof filter);
              setCurrentPage(1);
            }}
          >
            <option value="all">সব</option>
            <option value="income">আয়</option>
            <option value="expense">ব্যয়</option>
          </select>
          {filteredRows.length > 30 && (
            <Button
              type="button"
              variant={isVirtualMode ? "default" : "outline"}
              size="sm"
              onClick={() => setIsVirtualMode(!isVirtualMode)}
              className={`h-10 text-xs rounded-xl ${isVirtualMode ? "bg-primary text-primary-foreground" : "border-border text-foreground"}`}
              title="ভার্চুয়ালাইজড দ্রুত স্ক্রোল মোড"
            >
              <ListFilter className="h-3.5 w-3.5 mr-1" />
              {isVirtualMode ? "ভার্চুয়াল মোড" : "সাধারণ মোড"}
            </Button>
          )}
          <Button
            onClick={onAdd}
            className="h-10 rounded-xl bg-primary hover:bg-primary/90"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            লেনদেন
          </Button>
        </div>
      </div>

      <ScrollShadow
        scrollerRef={virtualizer.containerRef}
        className="mt-5"
        scrollerClassName={isVirtualMode ? "max-h-[500px] overflow-y-auto" : ""}
      >
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-y border-border text-xs text-muted-foreground sticky top-0 bg-card z-10">
            <tr>
              <th className="px-2 py-3 font-semibold">তারিখ</th>
              <th className="px-2 py-3 font-semibold">বিবরণ</th>
              <th className="px-2 py-3 font-semibold">ক্যাটাগরি</th>
              <th className="px-2 py-3 font-semibold">অ্যাকাউন্ট</th>
              <th className="px-2 py-3 text-right font-semibold">
                টাকার পরিমাণ
              </th>
              <th className="px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {visibleVirtualRows.length ? (
              visibleVirtualRows.map(row => (
                <TransactionRow
                  key={row.id}
                  row={row}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onVoucher={onVoucher}
                />
              ))
            ) : (
              <tr>
                <td colSpan={6}>
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {searchQuery
                      ? "অনুসন্ধানের সাথে কোনো লেনদেন মেলেনি"
                      : "এই ফিল্টারে কোনো লেনদেন নেই"}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ScrollShadow>

      {/* Pagination Footer */}
      {!isVirtualMode && filteredRows.length > pageSize && (
        <div className="mt-4 pt-3 border-t border-border flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>পৃষ্ঠা প্রতি প্রদর্শন:</span>
            <select
              value={pageSize}
              onChange={e => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="h-7 rounded-lg border border-border bg-card px-2 py-0.5 text-xs text-foreground"
            >
              {PAGE_SIZE_OPTIONS.map(opt => (
                <option key={opt} value={opt}>
                  {opt}টি
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span>
              পৃষ্ঠা {activePage} / {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={activePage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="h-7 w-7 p-0 rounded-lg"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={activePage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="h-7 w-7 p-0 rounded-lg"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function TransactionRow({
  row,
  onEdit,
  onDelete,
  onVoucher,
}: {
  row: TransactionRow;
  onEdit: (row: TransactionRow) => void;
  onDelete: (id: number) => void;
  onVoucher?: (row: TransactionRow) => void;
}) {
  const gestures = useRowGestures({
    row,
    onEdit,
    onDelete: target => onDelete(target.id),
    onLongPress: onEdit,
  });

  return (
    <tr
      {...gestures}
      className="border-b border-border hover:bg-card transition-colors"
      style={{ height: `${ROW_HEIGHT}px`, touchAction: "pan-y" }}
    >
      <td className="px-2 py-3 text-muted-foreground whitespace-nowrap">
        {dateText(row.occurredAt)}
      </td>
      <td className="px-2 py-3">
        <p
          className="max-w-48 truncate font-medium text-foreground"
          title={row.note ?? ""}
        >
          {row.note ?? "—"}
        </p>
      </td>
      <td className="px-2 py-3">
        <p className="font-medium text-foreground">{row.categoryName}</p>
        <p className="text-xs text-muted-foreground">{row.paymentMethod}</p>
      </td>
      <td className="px-2 py-3 text-muted-foreground">{row.accountName ?? "—"}</td>
      <td
        className={`px-2 py-3 text-right font-semibold whitespace-nowrap ${row.type === "income" ? "text-positive" : "text-destructive"}`}
      >
        {row.type === "income" ? "+" : "−"}
        {bdt(row.amount)}
      </td>
      <td className="px-2 py-3">
        <div className="flex justify-end gap-2">
          {onVoucher && (
            <button
              onClick={() => onVoucher(row)}
              aria-label="ভাউচার প্রিন্ট"
              title="ভাউচার দেখুন ও প্রিন্ট করুন"
              className="text-muted-foreground hover:text-foreground p-1"
            >
              <Printer className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => onEdit(row)}
            aria-label="সম্পাদনা"
            className="text-muted-foreground hover:text-foreground p-1"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(row.id)}
            aria-label="মুছুন"
            className="text-destructive hover:text-destructive p-1"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
