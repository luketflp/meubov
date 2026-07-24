"use client";

/**
 * Manejo session route: the running curral session (digital chute line),
 * resumable at any time from /manejo or the dashboard.
 */
import { useParams } from "next/navigation";
import { ManejoSessionRunner } from "@/components/manejo/session-runner";

export default function ManejoSessionPage() {
  const params = useParams<{ id: string }>();
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-8">
      <ManejoSessionRunner sessionId={params.id} />
    </div>
  );
}
