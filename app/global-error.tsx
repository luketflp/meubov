"use client";

/**
 * Last resort: the root layout itself failed, so this replaces the whole
 * document and brings its own <html> and <body>. The fonts of the root layout
 * are gone here, so the page falls back to the system faces.
 */
import "./globals.css";
import { useEffect } from "react";
import { BrandBar } from "@/components/errors/BrandBar";
import { RetryButton } from "@/components/errors/ErrorActions";
import { ErrorScene } from "@/components/errors/ErrorScene";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body className="min-h-dvh bg-canvas">
        <main className="flex min-h-dvh flex-col px-4 py-5 md:px-20 md:py-10">
          <BrandBar />
          <div className="flex flex-1 items-center justify-center py-10">
            <ErrorScene
              scene="catavento-erro"
              eyebrow="Algo deu errado"
              title="O MeuBov não abriu"
              description="Os dados já salvos da fazenda não foram afetados. Tente de novo; se continuar, fale com o suporte e informe o código."
              actions={<RetryButton onRetry={() => unstable_retry()} />}
              code={error.digest ? `Código ${error.digest}` : undefined}
            />
          </div>
        </main>
      </body>
    </html>
  );
}
