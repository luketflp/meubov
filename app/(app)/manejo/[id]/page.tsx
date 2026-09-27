"use client";

/**
 * Manejo session route: the running curral session (digital chute line),
 * resumable at any time from /manejo or the dashboard, and the session's record
 * once it is closed.
 *
 * The id comes from the address, not from the route params: without signal the
 * service worker answers any /manejo/<id> with the last runner document it
 * kept (the "template"), and that document's flight data carries the params of
 * the session it was rendered for. Only the URL names this session.
 */
import { usePathname } from "next/navigation";
import { ManejoScreen } from "@/components/manejo/manejo-screen";

export default function ManejoSessionPage() {
  const pathname = usePathname();
  const sessionId = decodeURIComponent(pathname.slice(pathname.lastIndexOf("/") + 1));
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-8">
      <ManejoScreen sessionId={sessionId} />
    </div>
  );
}
