"use client";

/**
 * The frame every document page shares: a back link to Relatórios, the header
 * with "Baixar planilha" and "Imprimir ou salvar PDF", the parameters card and
 * the live A4 preview beside it (above it on the phone).
 *
 * On paper only the sheet prints: the header and the parameters are
 * print:hidden, and the preview frame drops its padding, border and colour.
 */
import { usePrintStore } from "@/lib/store/usePrintStore";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, FileSpreadsheet, Printer } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/** 210mm at 96 dpi: the width the sheet is drawn at before it is scaled to fit. */
const A4_WIDTH_PX = 794;

interface ReportScreenProps {
  title: string;
  subtitle?: string;
  /** Writes the document's tables as xlsx; no "Baixar planilha" without it. */
  onDownload?: () => void;
  downloading?: boolean;
  /** False while the document cannot be drawn (e.g. a price is missing). */
  ready?: boolean;
  params: ReactNode;
  /** The A4Sheet, or what to show instead while it cannot be drawn. */
  children: ReactNode;
}

export function ReportScreen({
  title,
  subtitle,
  onDownload,
  downloading = false,
  ready = true,
  params,
  children,
}: ReportScreenProps) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pt-6 md:px-8 print:max-w-none print:p-0">
      <div className="flex flex-col gap-1 print:hidden">
        <ReportsBackLink />
        <PageHeader
          title={title}
          subtitle={subtitle}
          actions={
            <>
              {onDownload ? (
                <Button
                  variant="outline"
                  className="min-h-11 md:min-h-8"
                  onClick={onDownload}
                  disabled={!ready || downloading}
                >
                  <FileSpreadsheet aria-hidden />
                  {downloading ? "Gerando…" : "Baixar planilha"}
                </Button>
              ) : null}
              <Button className="min-h-11 md:min-h-8" onClick={() => {
                // A list job left behind would hide this page on paper.
                usePrintStore.getState().clear();
                window.print();
              }} disabled={!ready}>
                <Printer aria-hidden />
                Imprimir ou salvar PDF
              </Button>
            </>
          }
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)] print:block">
        <div className="lg:sticky lg:top-4 print:hidden">
          <SectionCard title="Parâmetros" bodyClassName="flex flex-col gap-4">
            {params}
          </SectionCard>
        </div>
        <SheetPreview>{children}</SheetPreview>
      </div>
    </div>
  );
}

function ReportsBackLink() {
  return (
    <Link
      href="/relatorios"
      className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink md:min-h-0"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Relatórios
    </Link>
  );
}

/**
 * A soft frame holding the sheet, scaled down to fit when the column is
 * narrower than A4. The scale is a CSS zoom through a variable, so on paper
 * `print:[zoom:1]` puts the sheet back at full size.
 */
function SheetPreview({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setZoom(Math.min(1, entry.contentRect.width / A4_WIDTH_PX));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-w-0 rounded-lg border border-hairline bg-hairline/70 p-3 sm:p-6 print:rounded-none print:border-0 print:bg-transparent print:p-0">
      <div ref={ref} className="w-full">
        <div
          className="[zoom:var(--sheet-zoom)] print:[zoom:1]"
          style={{ "--sheet-zoom": zoom } as CSSProperties}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** A labelled control of the parameters card, with an optional hint under it. */
export function ParamField({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-ink-soft">{hint}</p> : null}
    </div>
  );
}

/** A date input of the parameters card. */
export function DateInput({
  id,
  value,
  onChange,
  max,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  max?: string;
}) {
  return (
    <Input
      id={id}
      type="date"
      value={value}
      max={max}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-11 font-mono md:min-h-9"
    />
  );
}

/** A number input with a unit before or after it: "R$ 315,00 /@". */
export function AffixInput({
  id,
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
  ariaLabel,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <div className="relative">
      {prefix ? (
        <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-ink-soft">
          {prefix}
        </span>
      ) : null}
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
        className={cn("min-h-11 font-mono md:min-h-9", prefix && "pl-9", suffix && "pr-9")}
      />
      {suffix ? (
        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-ink-soft">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

/** An on/off row of the "Incluir" group. */
export function ParamToggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 md:min-h-8">
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** What the preview frame shows while the document cannot be drawn. */
export function PreviewMessage({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-64 max-w-md items-center justify-center rounded-lg border border-dashed border-ink-soft/30 bg-panel px-6 py-10 text-center text-sm text-ink-soft print:hidden">
      {children}
    </div>
  );
}
