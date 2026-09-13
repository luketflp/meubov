"use client";

/**
 * What /manejo/[id] shows: the chute while the session runs, its record once
 * it is closed. The record is picked by kind — a pesagem compares weights, a
 * sanitary manejo shows its plan, a troca de lote where the animals came from,
 * a compra and a venda their money. An id with no session behind it falls to
 * the chute screen, which already says so.
 */
import { useHerdStore } from "@/lib/store/useHerdStore";
import { ManejoSessionRunner } from "@/components/manejo/session-runner";
import { WeighingDetail } from "@/components/manejo/weighing-detail";
import { TreatmentDetail } from "@/components/manejo/treatment-detail";
import { TransferDetail } from "@/components/manejo/transfer-detail";
import { EntryDetail } from "@/components/manejo/entry-detail";
import { SaleDetail } from "@/components/manejo/sale-detail";

export function ManejoScreen({ sessionId }: { sessionId: string }) {
  const session = useHerdStore((s) => s.manejoSessions.find((m) => m.id === sessionId));

  if (!session || session.status === "open") {
    return <ManejoSessionRunner sessionId={sessionId} />;
  }
  switch (session.kind) {
    case "weighing":
      return <WeighingDetail session={session} />;
    case "health":
      return <TreatmentDetail session={session} />;
    case "transfer":
      return <TransferDetail session={session} />;
    case "entry":
      return <EntryDetail session={session} />;
    case "sale":
      return <SaleDetail session={session} />;
  }
}
