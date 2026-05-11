import { useState, useCallback, useRef, useEffect } from "preact/hooks";

export interface ToastMessage {
  id: string;
  type: "success" | "error";
  message: string;
}

const MAX_TOASTS = 5;

export function useToast(defaultDuration = 3000) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (type: "success" | "error", message: string, duration?: number) => {
      const id = crypto.randomUUID();
      setToasts((prev) => {
        const next = [...prev, { id, type, message }];
        return next.length > MAX_TOASTS ? next.slice(-MAX_TOASTS) : next;
      });
      const timer = setTimeout(() => dismiss(id), duration ?? defaultDuration);
      timersRef.current.set(id, timer);
    },
    [defaultDuration, dismiss],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  return { toasts, show, dismiss };
}
