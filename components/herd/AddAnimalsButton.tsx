"use client";

/**
 * "Cadastrar" in the Rebanho header: asks how the animals come in before any
 * form opens. "Um animal" opens the single-animal dialog; "Vários animais" goes
 * to /herd/cadastrar-varios, where a group shares one padrão.
 */
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Plus, Tag, Tags, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RegisterAnimalDialog } from "@/components/herd/RegisterAnimalDialog";

const CHOICE_CLASS =
  "flex min-h-11 w-full items-center gap-3 rounded-lg border border-hairline bg-panel p-3 text-left transition-colors hover:border-brand/45 hover:bg-surface focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

function ChoiceBody({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-brand-soft">
        <Icon aria-hidden className="size-[18px] text-brand" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-xs text-pretty text-ink-soft">{children}</span>
      </span>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-soft" />
    </>
  );
}

export function AddAnimalsButton() {
  const [chooserOpen, setChooserOpen] = useState(false);
  const [singleOpen, setSingleOpen] = useState(false);
  // A new key per open remounts the dialog, so its form never keeps old input.
  const [singleKey, setSingleKey] = useState(0);

  function openSingle() {
    setChooserOpen(false);
    setSingleKey((key) => key + 1);
    setSingleOpen(true);
  }

  return (
    <>
      <Dialog open={chooserOpen} onOpenChange={setChooserOpen}>
        <DialogTrigger asChild>
          <Button className="min-h-11">
            <Plus aria-hidden />
            Cadastrar
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cadastrar animais</DialogTitle>
            <DialogDescription>Como você quer registrar?</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <button type="button" onClick={openSingle} className={CHOICE_CLASS}>
              <ChoiceBody icon={Tag} title="Um animal">
                Brinco, categoria, raça, lote e peso de um animal só.
              </ChoiceBody>
            </button>
            <Link
              href="/herd/cadastrar-varios"
              onClick={() => setChooserOpen(false)}
              className={CHOICE_CLASS}
            >
              <ChoiceBody icon={Tags} title="Vários animais">
                Um padrão para o grupo e uma linha por brinco. Para uma compra, uma
                desmama, uma leva de bezerros.
              </ChoiceBody>
            </Link>
          </div>
        </DialogContent>
      </Dialog>
      <RegisterAnimalDialog key={singleKey} open={singleOpen} onOpenChange={setSingleOpen} />
    </>
  );
}
