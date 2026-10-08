"use client";

import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { useEffect, useState } from "react";

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; message: string; kind: ToastKind };

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    let sequence = 0;
    const listener = (event: Event) => {
      const custom = event as CustomEvent<{ message?: string; kind?: ToastKind }>;
      const message = custom.detail?.message?.trim();
      if (!message) return;
      const id = ++sequence;
      const item: ToastItem = { id, message, kind: custom.detail?.kind ?? "success" };
      setItems((current) => [...current.slice(-3), item]);
      window.setTimeout(() => {
        setItems((current) => current.filter((toast) => toast.id !== id));
      }, 3600);
    };

    window.addEventListener("edusync-toast", listener);
    return () => window.removeEventListener("edusync-toast", listener);
  }, []);

  return (
    <div className="toast-host" aria-live="polite" aria-atomic="false">
      {items.map((item) => {
        const Icon = item.kind === "error" ? CircleAlert : item.kind === "info" ? Info : CheckCircle2;
        return (
          <div className={"toast toast-" + item.kind} role="status" key={item.id}>
            <Icon size={18} />
            <span>{item.message}</span>
            <button
              aria-label="Fechar aviso"
              onClick={() => setItems((current) => current.filter((toast) => toast.id !== item.id))}
              type="button"
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function emitToast(message: string, kind: ToastKind = "success") {
  window.dispatchEvent(new CustomEvent("edusync-toast", { detail: { message, kind } }));
}
