export const ENGINE =
  process.env.NEXT_PUBLIC_ENGINE_URL ?? "http://localhost:3001";

export interface ToastDetail {
  kind: "error" | "warn" | "info";
  message: string;
}

export function emitToast(detail: ToastDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastDetail>("sentinel:toast", { detail }));
}

/**
 * fetch wrapper that returns parsed JSON on 2xx and emits a toast + throws on
 * any 4xx/5xx or network error. Use this for non-streaming JSON endpoints.
 */
export async function fetchJson<T = unknown>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emitToast({ kind: "error", message: `Network error: ${msg}` });
    throw err;
  }
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.clone().json()) as { error?: string; message?: string };
      if (body.error || body.message) message = String(body.error ?? body.message);
    } catch {
      // non-JSON body — keep status text
    }
    emitToast({ kind: "error", message });
    throw new Error(message);
  }
  return (await res.json()) as T;
}
