import { LoadingOverlay } from "@/components/ui/loading-overlay";

/**
 * Dev-only preview: renders the full-screen loading state indefinitely so the
 * Nelore draw-on animation can be inspected. Not linked from the app shell —
 * visit /preview/loading directly (requires being logged in, like any
 * non-auth route).
 */
export default function LoadingPreviewPage() {
  return <LoadingOverlay fullScreen message="Carregando dados do rebanho…" />;
}
