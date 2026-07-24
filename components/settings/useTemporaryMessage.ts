"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Feedback message that clears itself after `durationMs`.
 * Returns the current message (or null) and the function to show it.
 */
export function useTemporaryMessage(
  durationMs: number
): [string | null, (message: string) => void] {
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (next: string) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setMessage(next);
      timeoutRef.current = setTimeout(() => setMessage(null), durationMs);
    },
    [durationMs]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return [message, show];
}
