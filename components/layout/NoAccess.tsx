import { DashboardButton } from "@/components/errors/ErrorActions";
import { ErrorScene } from "@/components/errors/ErrorScene";

/** What a page shows when opened by URL without access to its area. */
export function NoAccess() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-7rem)] max-w-3xl items-center justify-center px-4 py-10 md:min-h-dvh md:px-8">
      <ErrorScene
        scene="porteira-fechada"
        eyebrow="Sem acesso"
        title="Porteira fechada"
        description="Esta área não está liberada para você. Quem cuida da equipe da fazenda decide o que cada pessoa pode ver."
        actions={<DashboardButton primary />}
      />
    </div>
  );
}
