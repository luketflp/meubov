"use client";

/**
 * Toast context (same API as bonitour/photos-front): components call
 * `useToast().addToast({ messageType, text })`; sonner renders it through the
 * <Toaster /> mounted in the root layout. Duration scales with text length.
 * Reserved for IMPORTANT actions (registrations, closures, failures) — routine
 * feedback stays inline in the forms.
 */
import { createContext, useCallback, useContext } from "react";
import { toast } from "sonner";

export type MessageTypes = "info" | "warning" | "error" | "success" | "neutral";

export interface ToastMessage {
  id: string;
  messageType?: MessageTypes;
  duration?: number;
  text: string;
}

interface ToastContextData {
  addToast(message: Omit<ToastMessage, "id">): string;
  removeToast(id: string): void;
}

const BASE_EXPIRES_IN = 3500;

/** Random hex id for dismissable toasts. */
function getRandomHex(length: number): string {
  let hex = "";
  while (hex.length < length) hex += Math.random().toString(16).slice(2);
  return hex.slice(0, length);
}

const ToastContext = createContext<ToastContextData>({} as ToastContextData);

function ToastProvider({ children }: { children: React.ReactNode }) {
  const addToast = useCallback(
    ({ messageType = "info", text, duration }: Omit<ToastMessage, "id">): string => {
      const id = getRandomHex(10);
      const expiresInMultiplier = 1 + Math.floor(text.length / 40) / 2;
      const expiresIn = duration || expiresInMultiplier * BASE_EXPIRES_IN;

      const toastFn = {
        info: toast.info,
        warning: toast.warning,
        error: toast.error,
        success: toast.success,
        neutral: toast.message,
      }[messageType];

      toastFn(text, { id, duration: expiresIn });

      return id;
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    toast.dismiss(id);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
}

function useToast(): ToastContextData {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export { ToastProvider, useToast };
