"use client";

/**
 * A screen of the app broke while rendering. The rail stays, so the farmer
 * can go elsewhere; "Tentar de novo" re-renders the segment, and the digest
 * gives support something to look up in the server logs.
 */
import { useEffect } from "react";
import { DashboardButton, RetryButton } from "@/components/errors/ErrorActions";
import { ErrorScene } from "@/components/errors/ErrorScene";

export default function AppError({
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
    <div className="mx-auto flex min-h-[calc(100dvh-7rem)] max-w-3xl items-center justify-center px-4 py-10 md:min-h-dvh md:px-8">
      <ErrorScene
        scene="catavento-erro"
        eyebrow="Algo deu errado"
        title="Esta tela não carregou"
        description="Os dados já salvos da fazenda não foram afetados. Tente de novo; se continuar, fale com o suporte e informe o código."
        actions={
          <>
            <RetryButton onRetry={() => unstable_retry()} />
            <DashboardButton />
          </>
        }
        code={error.digest ? `Código ${error.digest}` : undefined}
      />
    </div>
  );
}
