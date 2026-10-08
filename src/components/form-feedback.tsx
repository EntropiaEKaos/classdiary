"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { emitToast } from "@/components/toast-host";

export function FormFeedback({ message = "Alterações salvas com sucesso." }: { message?: string }) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) emitToast(message);
    wasPending.current = pending;
  }, [pending, message]);

  return null;
}
