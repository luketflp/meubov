"use client";

/**
 * "Lançar despesa" dialog: date, category, total value and optional note.
 * Mirrors the other register dialogs (local pure validation + store action +
 * success toast).
 */
import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import type { ExpenseCategory } from "@/lib/types";
import { todayISO } from "@/lib/domain/dates";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/domain/labels";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const CATEGORY_LIST = Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[];

interface ExpenseFields {
  date: string;
  category: ExpenseCategory;
  amount: string;
  notes: string;
}

function createInitialFields(): ExpenseFields {
  return { date: todayISO(), category: "nutrition", amount: "", notes: "" };
}

export function RegisterExpenseDialog() {
  const addExpense = useHerdStore((s) => s.addExpense);
  const { addToast } = useToast();

  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<ExpenseFields>(createInitialFields);
  const [error, setError] = useState<string | null>(null);

  function onOpenChange(next: boolean) {
    if (next) {
      setFields(createInitialFields());
      setError(null);
    }
    setOpen(next);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (fields.date === "") {
      setError("Informe a data da despesa.");
      return;
    }
    const amountBrl = Number(fields.amount.replace(",", "."));
    if (fields.amount.trim() === "" || !Number.isFinite(amountBrl) || amountBrl <= 0) {
      setError("Informe o valor da despesa (maior que zero).");
      return;
    }
    const notes = fields.notes.trim();
    await addExpense({
      date: fields.date,
      category: fields.category,
      amountBrl,
      notes: notes === "" ? undefined : notes,
    });
    addToast({ messageType: "success", text: "Despesa lançada" });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-11 md:min-h-0">
          <Plus data-icon="inline-start" aria-hidden />
          Lançar despesa
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lançar despesa</DialogTitle>
          <DialogDescription>
            Custos da fazenda fora dos tratamentos sanitários (nutrição,
            pastagem, mão de obra…).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="expense-date">Data</Label>
              <Input
                id="expense-date"
                type="date"
                value={fields.date}
                onChange={(e) => setFields((f) => ({ ...f, date: e.target.value }))}
                className="min-h-11 font-mono"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="expense-category">Categoria</Label>
              <Select
                value={fields.category}
                onValueChange={(category) =>
                  setFields((f) => ({ ...f, category: category as ExpenseCategory }))
                }
              >
                <SelectTrigger id="expense-category" className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_LIST.map((category) => (
                    <SelectItem key={category} value={category}>
                      {EXPENSE_CATEGORY_LABEL[category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="expense-amount">Valor (R$)</Label>
            <Input
              id="expense-amount"
              type="number"
              min={0.01}
              step="0.01"
              inputMode="decimal"
              value={fields.amount}
              onChange={(e) => setFields((f) => ({ ...f, amount: e.target.value }))}
              aria-invalid={error ? true : undefined}
              className="min-h-11 font-mono"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="expense-notes">Observação (opcional)</Label>
            <Textarea
              id="expense-notes"
              value={fields.notes}
              onChange={(e) => setFields((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Ex.: ração de terminação, adubação do pasto…"
            />
          </div>

          {error ? <p className="text-xs text-overdue">{error}</p> : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" className="min-h-11">
              Lançar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
