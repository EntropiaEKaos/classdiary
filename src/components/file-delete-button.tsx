"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function FileDeleteButton({ fileId }: { fileId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (busy) return;
    if (!window.confirm("Excluir este arquivo do storage? Esta ação não pode ser desfeita.")) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/files/" + fileId, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Falha ao excluir arquivo.");
      }
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Falha ao excluir arquivo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn btn-light" type="button" onClick={remove} disabled={busy}>
      {busy ? "Excluindo..." : "Excluir"}
    </button>
  );
}
