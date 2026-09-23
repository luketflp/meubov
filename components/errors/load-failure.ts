/**
 * Why the farm's data did not load, told in the farmer's words. The browser's
 * own online flag decides: offline means no signal; online means the server
 * failed to answer.
 */
import type { ErrorSceneName } from "@/components/errors/ErrorScene";

export type LoadFailure = "offline" | "error";

export function loadFailure(online: boolean): LoadFailure {
  return online ? "error" : "offline";
}

export const LOAD_FAILURE: Record<
  LoadFailure,
  { scene: ErrorSceneName; eyebrow: string; title: string; description: string }
> = {
  offline: {
    scene: "sem-sinal",
    eyebrow: "Sem conexão",
    title: "Não deu para falar com a fazenda",
    description: "O celular está sem sinal ou a internet caiu. Quando voltar, toque em tentar de novo.",
  },
  error: {
    scene: "catavento-erro",
    eyebrow: "Algo deu errado",
    title: "Os dados da fazenda não carregaram",
    description: "O servidor não respondeu desta vez. Tente de novo em instantes; nada do que já foi salvo se perdeu.",
  },
};
