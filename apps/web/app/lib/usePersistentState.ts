"use client";

import { useState, useEffect, useRef } from "react";

/**
 * sessionStorage-backed useState. Survives tab navigation within a Shell
 * instance AND accidental page reloads, but resets when the browser tab
 * is closed (intentional — no cross-session leakage of run data).
 */
export function usePersistentState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const storageKey = `sentinel:${key}`;
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // quota exceeded or serialization error — silent, state still works in-memory
    }
  }, [storageKey, value]);

  return [value, setValue];
}
