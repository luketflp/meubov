"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { authErrorMessage } from "@/lib/auth/errors";
import { Button } from "@/components/ui/button";

interface GoogleAuthButtonProps {
  /** Disabled by the parent form while its own submit is in flight. */
  disabled?: boolean;
  /** Called with a pt-BR message when the Google sign-in fails. */
  onError: (message: string) => void;
}

/**
 * Shared "Continuar com Google" action for the login and signup screens.
 *
 * Encapsulates the Google social sign-in (with the `/dashboard` callback) plus
 * the "ou" divider so both screens stay identical without copy/paste. Owns its
 * own loading state and shows a progress label while redirecting, so the Google
 * action gives the same feedback as the email/password submit button. On success
 * the browser is redirected to Google, so no further action is needed here.
 */
export function GoogleAuthButton({ disabled, onError }: GoogleAuthButtonProps) {
  const [redirecting, setRedirecting] = useState(false);

  async function handleGoogle() {
    setRedirecting(true);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/dashboard",
    });
    if (error) {
      onError(authErrorMessage(error));
      setRedirecting(false);
    }
  }

  return (
    <>
      <div className="my-4 flex items-center gap-3 text-xs text-ink-soft">
        <span className="h-px flex-1 bg-hairline" />
        ou
        <span className="h-px flex-1 bg-hairline" />
      </div>

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        onClick={handleGoogle}
        disabled={disabled || redirecting}
      >
        {redirecting ? "Redirecionando…" : "Continuar com Google"}
      </Button>
    </>
  );
}
