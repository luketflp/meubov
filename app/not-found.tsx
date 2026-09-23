/**
 * 404 for any address that matches no page, in or out of the app. It is drawn
 * without the app's rail: an unknown URL may come from someone signed out.
 */
import type { Metadata } from "next";
import { BrandBar } from "@/components/errors/BrandBar";
import { BackButton, DashboardButton } from "@/components/errors/ErrorActions";
import { ErrorScene } from "@/components/errors/ErrorScene";

export const metadata: Metadata = { title: "Página não encontrada · MeuBov" };

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col bg-canvas px-4 py-5 md:px-20 md:py-10">
      <BrandBar />
      <div className="mx-auto flex w-full max-w-6xl flex-1 items-center py-10">
        <ErrorScene
          variant="hero"
          scene="pasto-404"
          eyebrow="Erro 404"
          title="Essa página saiu do pasto"
          description="O endereço não existe ou mudou de lugar. Confira o link ou volte para o Painel."
          actions={
            <>
              <DashboardButton primary />
              <BackButton />
            </>
          }
          className="w-full"
        />
      </div>
    </main>
  );
}
