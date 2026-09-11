"use client";

import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import { formatNumber } from "@/lib/domain/format";
import { TREATMENT_TYPE_LABEL } from "@/lib/domain/labels";
import type { TreatmentType } from "@/lib/types";

const TYPES: ReadonlyArray<{ value: TreatmentType; label: string }> = [
  { value: "vaccine", label: "Vacina" },
  { value: "deworming", label: "Vermifugação" },
  { value: "medication", label: "Medicação" },
  { value: "exam", label: "Exame" },
];

const TYPE_LABEL = TREATMENT_TYPE_LABEL;

function isTreatmentType(value: string): value is TreatmentType {
  return TYPES.some((t) => t.value === value);
}

function formatInterval(months: number): string {
  return months === 1 ? "a cada 1 mês" : `a cada ${formatNumber(months)} meses`;
}

function formatWithdrawal(days: number): string {
  return days === 1 ? "1 dia" : `${formatNumber(days)} dias`;
}

const INITIAL_FORM = {
  name: "",
  type: "vaccine" as TreatmentType,
  intervalMonths: "",
  withdrawalDays: "",
  mandatory: false,
  generateSchedule: true,
};

/** Table of health protocols with removal and a new-protocol dialog. */
export function HealthProtocols() {
  const protocols = useHerdStore((s) => s.protocols);
  const addProtocol = useHerdStore((s) => s.addProtocol);
  const removeProtocol = useHerdStore((s) => s.removeProtocol);
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);

  function onOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setForm(INITIAL_FORM);
      setError(null);
    }
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = form.name.trim();
    const interval = Number(form.intervalMonths);
    const withdrawal = Number(form.withdrawalDays);
    if (cleanName === "") {
      setError("Informe o nome do protocolo.");
      return;
    }
    if (!Number.isInteger(interval) || interval < 1) {
      setError("Periodicidade deve ser um número inteiro de meses maior que zero.");
      return;
    }
    if (!Number.isInteger(withdrawal) || withdrawal < 0) {
      setError("Carência deve ser um número inteiro de dias (zero ou mais).");
      return;
    }
    await addProtocol(
      {
        name: cleanName,
        type: form.type,
        intervalMonths: interval,
        withdrawalDays: withdrawal,
        mandatory: form.mandatory,
      },
      form.generateSchedule
    );
    addToast({
      messageType: "success",
      text: form.generateSchedule
        ? `Protocolo "${cleanName}" criado e agenda gerada`
        : `Protocolo "${cleanName}" criado`,
    });
    setOpen(false);
  }

  return (
    <SectionCard
      title="Protocolos sanitários"
      action={
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="min-h-11 md:min-h-0">
              <Plus data-icon="inline-start" aria-hidden />
              Novo protocolo
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Novo protocolo</DialogTitle>
            </DialogHeader>
            <form onSubmit={onSave} className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="protocol-name">Nome</Label>
                <Input
                  id="protocol-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex.: Vacina aftosa"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="protocol-type">Tipo</Label>
                <Select
                  value={form.type}
                  onValueChange={(value) => {
                    if (isTreatmentType(value)) setForm((f) => ({ ...f, type: value }));
                  }}
                >
                  <SelectTrigger id="protocol-type" className="w-full">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="protocol-interval">Periodicidade (meses)</Label>
                  <Input
                    id="protocol-interval"
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    value={form.intervalMonths}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, intervalMonths: e.target.value }))
                    }
                    className="font-mono"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="protocol-withdrawal">Carência (dias)</Label>
                  <Input
                    id="protocol-withdrawal"
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={form.withdrawalDays}
                    onChange={(e) => setForm((f) => ({ ...f, withdrawalDays: e.target.value }))}
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="flex min-h-11 items-center gap-2 md:min-h-0">
                <Switch
                  id="protocol-mandatory"
                  checked={form.mandatory}
                  onCheckedChange={(checked) => setForm((f) => ({ ...f, mandatory: checked }))}
                />
                <Label htmlFor="protocol-mandatory">Obrigatório</Label>
              </div>
              <label className="flex min-h-11 cursor-pointer items-start gap-2 text-sm md:min-h-0">
                <input
                  type="checkbox"
                  checked={form.generateSchedule}
                  onChange={(e) => setForm((f) => ({ ...f, generateSchedule: e.target.checked }))}
                  className="mt-0.5 size-4 accent-brand"
                />
                Gerar agendamentos para o rebanho (hoje + 14 dias)
              </label>
              {error ? <p className="text-sm text-overdue">{error}</p> : null}
              <Button type="submit" className="min-h-11 md:min-h-0">
                Salvar protocolo
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Periodicidade</TableHead>
            <TableHead className="text-right">Carência</TableHead>
            <TableHead>Obrigatório</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {protocols.map((protocol) => (
            <TableRow key={protocol.id}>
              <TableCell className="font-medium">
                <span className="inline-flex items-center gap-2">
                  {protocol.name}
                  {protocol.name.toLowerCase().includes("aftosa") ? (
                    <StatusPill status="fmd" />
                  ) : null}
                </span>
              </TableCell>
              <TableCell className="text-ink-soft">{TYPE_LABEL[protocol.type]}</TableCell>
              <TableCell className="text-ink-soft">
                {formatInterval(protocol.intervalMonths)}
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatWithdrawal(protocol.withdrawalDays)}
              </TableCell>
              <TableCell>
                {protocol.mandatory ? (
                  <Badge variant="secondary">Obrigatório</Badge>
                ) : (
                  <span className="text-ink-soft">—</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeProtocol(protocol.id)}
                  aria-label={`Remover protocolo ${protocol.name}`}
                  className="min-h-11 min-w-11 text-ink-soft hover:text-overdue md:min-h-7 md:min-w-7"
                >
                  <Trash2 aria-hidden />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SectionCard>
  );
}
