"use client";

import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";
import { useEffect, useRef } from "react";
import { emitToast } from "@/components/toast-host";

export function AdminSubmitButton({
  children,
  pendingLabel = "Salvando...",
  variant = "primary",
  className = "",
  successMessage = "Ação concluída com sucesso.",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
  successMessage?: string;
}) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) emitToast(successMessage);
    wasPending.current = pending;
  }, [pending, successMessage]);

  return (
    <button
      aria-busy={pending}
      className={`btn admin-action-button admin-action-${variant} ${className}`}
      disabled={pending}
      type="submit"
    >
      {pending ? <LoaderCircle className="admin-spin" size={17} aria-hidden="true" /> : null}
      <span aria-live="polite">{pending ? pendingLabel : children}</span>
    </button>
  );
}
