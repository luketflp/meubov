"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/domain/format";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ELLIPSIS,
  PAGE_SIZES,
  pageWindow,
  rangeLabel,
  type Page,
  type PageSize,
} from "@/components/herd/pagination";

interface HerdPaginationProps {
  page: Omit<Page<unknown>, "items">;
  pageSize: PageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: PageSize, firstVisible: number) => void;
}

const STEP_CLASS = "size-11 md:size-8";

/**
 * Pager under the herd list: the range and page size on one side, the page
 * window on the other (a compact "3 de 20" on phones). Hidden while the whole
 * list fits in the smallest page.
 */
export function HerdPagination({ page, pageSize, onPageChange, onPageSizeChange }: HerdPaginationProps) {
  if (page.total <= PAGE_SIZES[0]) return null;

  const isFirst = page.page === 1;
  const isLast = page.page === page.pageCount;

  return (
    <nav
      aria-label="Paginação"
      className="flex flex-col-reverse items-center gap-3 md:flex-row md:justify-between"
    >
      <div className="flex items-center gap-3 text-sm text-ink-soft">
        <span aria-live="polite">{rangeLabel(page.from, page.to, page.total)}</span>
        <Select
          value={String(pageSize)}
          onValueChange={(value) => onPageSizeChange(Number(value) as PageSize, page.from)}
        >
          <SelectTrigger aria-label="Animais por página" className="min-h-11 bg-panel md:min-h-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} por página
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {page.pageCount > 1 ? (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={STEP_CLASS}
            disabled={isFirst}
            onClick={() => onPageChange(page.page - 1)}
            aria-label="Página anterior"
          >
            <ChevronLeft aria-hidden />
          </Button>

          <span className="min-w-24 text-center text-sm text-ink md:hidden">
            {formatNumber(page.page)} de {formatNumber(page.pageCount)}
          </span>

          <ul className="hidden items-center gap-1 md:flex">
            {pageWindow(page.page, page.pageCount).map((slot, index) =>
              slot === ELLIPSIS ? (
                <li
                  key={`ellipsis-${index}`}
                  aria-hidden
                  className="w-8 text-center text-sm text-ink-soft"
                >
                  …
                </li>
              ) : (
                <li key={slot}>
                  <Button
                    variant={slot === page.page ? "default" : "ghost"}
                    className={cn("min-w-8 px-2 font-mono", slot === page.page && "pointer-events-none")}
                    aria-current={slot === page.page ? "page" : undefined}
                    aria-label={`Página ${slot}`}
                    onClick={() => onPageChange(slot)}
                  >
                    {formatNumber(slot)}
                  </Button>
                </li>
              )
            )}
          </ul>

          <Button
            variant="ghost"
            size="icon"
            className={STEP_CLASS}
            disabled={isLast}
            onClick={() => onPageChange(page.page + 1)}
            aria-label="Próxima página"
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
      ) : null}
    </nav>
  );
}
