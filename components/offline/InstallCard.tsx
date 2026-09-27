"use client";

/**
 * The Painel's invitation to put MeuBov on the phone's home screen, so it
 * opens straight from there and works at the curral without signal. Android
 * (Chrome) announces its own install prompt with `beforeinstallprompt`; the
 * card keeps it and shows it on "Instalar". iOS has no prompt, so the card
 * says where Safari keeps it. "Agora não" hides it for 30 days; an installed
 * app and the desktop (md and up) never see it.
 *
 * The Painel renders only on the client (AppShell draws its children once the
 * store has loaded), so the first state can read `navigator` directly.
 */
import { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { todayISO } from "@/lib/domain/dates";
import { detectPlatform, shouldOfferInstall, type InstallDevice } from "@/lib/offline/install";

const DISMISSED_KEY = "meubov.installDismissedAt";

/** Chrome's install prompt event, missing from the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function currentDevice(): InstallDevice {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return detectPlatform(navigator.userAgent, standalone);
}

function readDismissedAt(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

export function InstallCard() {
  const [device, setDevice] = useState(currentDevice);
  const [dismissedAt, setDismissedAt] = useState(readDismissedAt);
  // ponytail: a prompt Chrome fires while another page is open is missed; stash it in AppShell if installs lag.
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      // Keeps Chrome's own mini-infobar away: the card asks instead.
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDevice((current) => ({ ...current, installed: true }));
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const offer = shouldOfferInstall({ ...device, dismissedAt, today: todayISO() });
  if (offer === null || (offer === "prompt" && promptEvent === null)) return null;

  async function install() {
    if (promptEvent === null) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    // The event serves once; Chrome fires a new one if the app can still be installed.
    setPromptEvent(null);
    if (outcome === "accepted") setDevice((current) => ({ ...current, installed: true }));
  }

  function dismiss() {
    const today = todayISO();
    try {
      window.localStorage.setItem(DISMISSED_KEY, today);
    } catch {
      // Storage blocked: the card stays hidden until the next visit.
    }
    setDismissedAt(today);
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-hairline bg-panel p-4 md:hidden">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-brand-soft"
        >
          <Smartphone className="size-[18px] text-brand" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">Instale o MeuBov no celular</p>
          <p className="mt-0.5 text-xs text-pretty text-ink-soft">
            Abre direto da tela inicial e funciona no curral sem sinal: os passes ficam guardados e
            são enviados depois.
          </p>
          {offer === "ios-hint" ? (
            <p className="mt-2 text-xs font-medium text-ink">
              No Safari, toque em Compartilhar → Adicionar à Tela de Início.
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {offer === "prompt" ? (
          <Button type="button" className="min-h-11 w-full" onClick={() => void install()}>
            <Download aria-hidden />
            Instalar
          </Button>
        ) : null}
        <Button type="button" variant="ghost" className="min-h-11 w-full" onClick={dismiss}>
          Agora não
        </Button>
      </div>
    </section>
  );
}
