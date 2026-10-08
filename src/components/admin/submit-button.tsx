"use client";

import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

export function AdminSubmitButton({
  children,
  pendingLabel = "Salvando...",
  variant = "primary",
  className = "",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
}) {
  const { pending } = useFormStatus();

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
