/**
 * The fila (outbox): operations done on the phone that still have to reach the
 * server, in the order they were done.
 */
import type { ManejoSessionAnimal } from "@/lib/types";

export type OutboxKind =
  | "start"
  | "complete"
  | "skip"
  | "set-aside"
  | "baixa"
  | "reopen"
  | "carcass-yield"
  | "close";

export type OutboxState = "queued" | "sending" | "conflict" | "failed";

/** Why the server refused an operation (a conflito or a falha). */
export interface OutboxDetail {
  error: string;
  message?: string;
  /** The server's entry, when the refusal names one. */
  server?: ManejoSessionAnimal;
  /** The session was closed on the server: "Aplicar o meu" cannot work. */
  sessionClosed?: boolean;
}

export interface OutboxOp {
  /** uuid v4, also the `localOpId` of the records it created on the phone. */
  id: string;
  /** Monotonic per phone, assigned by `enqueue`. */
  seq: number;
  userId: string;
  farmId: number;
  sessionId: string;
  kind: OutboxKind;
  earTag?: string;
  /** Exactly the request body the online action would send (without force). */
  body: Record<string, unknown>;
  /** ISO datetime. */
  createdAt: string;
  state: OutboxState;
  detail?: OutboxDetail;
  attempts: number;
}
