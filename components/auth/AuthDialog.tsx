"use client";

import { type ReactNode, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LoginForm } from "@/components/auth/LoginForm";
import { SignupForm } from "@/components/auth/SignupForm";

type AuthMode = "login" | "signup";

const TITLES: Record<AuthMode, string> = {
  login: "Entrar",
  signup: "Criar conta",
};

interface AuthDialogProps {
  /** Form shown when the dialog opens; the footer links switch in place. */
  initialMode: AuthMode;
  /** The trigger element, e.g. a Button — rendered via DialogTrigger asChild. */
  children: ReactNode;
}

/**
 * Login/signup modal — the app's only authentication UI (the old /login and
 * /signup pages were removed; proxy.ts redirects those URLs). Desktop:
 * centered dialog over a blurred backdrop. Mobile: bottom sheet sliding up
 * from the edge (same pattern as bonitour/photos-front).
 */
export function AuthDialog({ initialMode, children }: AuthDialogProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [notice, setNotice] = useState<string | null>(null);

  function switchTo(next: AuthMode) {
    setMode(next);
    setNotice(null);
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) {
          setMode(initialMode);
          setNotice(null);
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        overlayClassName="bg-black/50 supports-backdrop-filter:backdrop-blur-sm"
        className="p-6 max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:duration-300 max-sm:data-open:zoom-in-100 max-sm:data-open:slide-in-from-bottom-[100%] max-sm:data-closed:zoom-out-100 max-sm:data-closed:slide-out-to-bottom-[100%]"
      >
        <DialogHeader>
          <DialogTitle className="text-lg">{TITLES[mode]}</DialogTitle>
        </DialogHeader>

        {notice ? (
          <p role="status" className="text-sm text-healthy">
            {notice}
          </p>
        ) : null}

        {mode === "login" ? (
          <LoginForm onSwitchToSignup={() => switchTo("signup")} />
        ) : (
          <SignupForm
            onSwitchToLogin={() => switchTo("login")}
            onSuccess={() => {
              setMode("login");
              setNotice("Conta criada! Entre com seu e-mail e senha.");
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
