"use client";

/**
 * Sonner toaster themed with the app's design tokens (same pattern as
 * bonitour/photos-front). MeuBov is light-only, so no theme switch.
 */
import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CircleCheck,
  Info,
  TriangleAlert,
  OctagonX,
  Loader2,
} from "lucide-react";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      position="top-right"
      icons={{
        success: <CircleCheck className="size-4" />,
        info: <Info className="size-4" />,
        warning: <TriangleAlert className="size-4" />,
        error: <OctagonX className="size-4" />,
        loading: <Loader2 className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
