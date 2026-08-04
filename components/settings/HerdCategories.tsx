"use client";

/**
 * Herd categories card: the 5 canonical categories (informative, with live
 * counts) plus the farm's custom categories — each mapped to a base category
 * that keeps the domain rules (sex, reproduction, indicators) working.
 */
import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useTemporaryMessage } from "./useTemporaryMessage";
import { activeAnimals, countByCategory } from "@/lib/store/selectors";
import { formatNumber } from "@/lib/domain/format";
import { CATEGORY_LABEL } from "@/lib/domain/labels";
import type { Category } from "@/lib/types";

interface CategoryRow {
  category: Category;
  label: string;
  description: string;
  sex: string;
}

const ROWS: readonly CategoryRow[] = [
  { category: "calf", label: "Bezerro(a)", description: "Até 12 meses", sex: "Macho ou fêmea" },
  { category: "heifer", label: "Novilha", description: "12–36 meses, sem cria", sex: "Fêmea" },
  { category: "steer", label: "Boi", description: "Acima de 12 meses", sex: "Macho" },
  { category: "cow", label: "Vaca", description: "Adulta", sex: "Fêmea" },
  { category: "bull", label: "Touro", description: "Reprodutor", sex: "Macho" },
];

const CATEGORY_LIST = Object.keys(CATEGORY_LABEL) as Category[];

/** Base categories with live counts + CRUD of the custom categories. */
export function HerdCategories() {
  const animals = useHerdStore((s) => s.animals);
  const customCategories = useHerdStore((s) => s.customCategories);
  const addCustomCategory = useHerdStore((s) => s.addCustomCategory);
  const removeCustomCategory = useHerdStore((s) => s.removeCustomCategory);
  const { addToast } = useToast();
  const [error, showError] = useTemporaryMessage(3000);

  const [name, setName] = useState("");
  const [base, setBase] = useState<Category>("steer");

  const active = activeAnimals(animals);
  const count = countByCategory(active);
  const customCount = (id: string): number =>
    active.filter((a) => a.customCategoryId === id).length;

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = name.trim();
    if (clean === "") return;
    if (!(await addCustomCategory({ name: clean, baseCategory: base }))) {
      showError("Já existe uma categoria com este nome.");
      return;
    }
    addToast({ messageType: "success", text: `Categoria "${clean}" criada` });
    setName("");
  }

  async function onRemove(id: string, categoryName: string) {
    if (!(await removeCustomCategory(id))) {
      showError("Categoria em uso — mova os animais antes de remover.");
      return;
    }
    addToast({ messageType: "success", text: `Categoria "${categoryName}" removida` });
  }

  return (
    <SectionCard title="Categorias do rebanho">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Categoria</TableHead>
            <TableHead>Descrição / faixa etária</TableHead>
            <TableHead>Sexo</TableHead>
            <TableHead className="text-right">Cabeças</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ROWS.map(({ category, label, description, sex }) => (
            <TableRow key={category}>
              <TableCell className="font-medium">{label}</TableCell>
              <TableCell className="text-ink-soft">{description}</TableCell>
              <TableCell className="text-ink-soft">{sex}</TableCell>
              <TableCell className="text-right font-mono">
                {formatNumber(count[category])}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="mt-4 border-t border-hairline pt-4">
        <p className="text-sm font-medium text-ink">Categorias personalizadas</p>
        <p className="mt-0.5 text-xs text-ink-soft">
          Cada categoria personalizada aponta para uma categoria base — as regras
          do rebanho (sexo, reprodução, indicadores) seguem a base.
        </p>

        {customCategories.length > 0 ? (
          <ul className="mt-3 divide-y divide-hairline">
            {customCategories.map((c) => (
              <li key={c.id} className="flex min-h-11 items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{c.name}</p>
                  <p className="text-xs text-ink-soft">
                    Base: {CATEGORY_LABEL[c.baseCategory]}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-sm text-ink">
                  {formatNumber(customCount(c.id))}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover categoria ${c.name}`}
                  className="size-9 shrink-0 text-ink-soft hover:text-overdue"
                  onClick={() => onRemove(c.id, c.name)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-ink-soft">Nenhuma categoria personalizada.</p>
        )}

        <form onSubmit={onAdd} className="mt-3 flex flex-wrap items-end gap-2">
          <div className="grid min-w-40 flex-1 gap-1.5">
            <Label htmlFor="custom-category-name">Nome</Label>
            <Input
              id="custom-category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Garrote"
              className="min-h-11 md:min-h-9"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="custom-category-base">Categoria base</Label>
            <Select value={base} onValueChange={(v) => setBase(v as Category)}>
              <SelectTrigger id="custom-category-base" className="min-h-11 w-40 md:min-h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_LIST.map((category) => (
                  <SelectItem key={category} value={category}>
                    {CATEGORY_LABEL[category]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="min-h-11 md:min-h-9">
            <Plus data-icon="inline-start" aria-hidden />
            Adicionar
          </Button>
        </form>
        {error ? <p className="mt-2 text-xs text-overdue">{error}</p> : null}
      </div>
    </SectionCard>
  );
}
