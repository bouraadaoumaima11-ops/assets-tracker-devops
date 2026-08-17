"use client";

import { useState, useEffect, startTransition } from "react";

/**
 * sessionStorage survives a deploy, so a stored value can name an option that
 * the current build no longer offers. Validate here rather than at each call
 * site: a consumer that forgets (`OPTIONS.find(...)!`) takes its whole route
 * down on an unknown label.
 */
export function resolvePersistedRange<T extends string>(
  stored: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  return stored !== null && allowed.includes(stored as T) ? (stored as T) : fallback;
}

export function usePersistedRange<T extends string>(
  key: string,
  initialValue: T,
  allowed: readonly T[],
) {
  const [range, setRange] = useState<T>(initialValue);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    startTransition(() => {
      setMounted(true);
      const stored = sessionStorage.getItem(`asset-tracker:range:${key}`);
      setRange(resolvePersistedRange(stored, allowed, initialValue));
    });
    // `allowed`/`initialValue` are read once on mount; re-running on a new
    // array identity would clobber a range the user just picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const setPersistedRange = (newRange: T) => {
    setRange(newRange);
    try {
      sessionStorage.setItem(`asset-tracker:range:${key}`, newRange);
    } catch (_e) {
      // Ignore sessionStorage errors (e.g. quota exceeded, private mode)
    }
  };

  return [mounted ? range : initialValue, setPersistedRange] as const;
}
