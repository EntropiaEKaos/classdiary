"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  entityType?: string;
  entityId?: string;
  defaultCategory?: string;
  lockCategory?: boolean;
  accept?: string;
  compact?: boolean;
  buttonLabel?: string;
};

export function FileUploadForm({
  entityType,
  entityId,
  defaultCategory = "DOCUMENT",
  lockCategory = false,
  accept = ".pdf,image/jpeg,image/png,image/webp",
  compact = false,
  buttonLabel = "Enviar arquivo",
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = event.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("file");

    if (!(file instanceof File) || !file.size) {
      setStatus("Selecione um arquivo.");
      return;
    }

    const category = lockCategory
      ? defaultCategory
      : String(fd.get("category") || defaultCategory).trim();
    const resolvedEntityType =
      entityType || String(fd.get("entityType") || "").trim() || null;
    const resolvedEntityId =
      entityId || String(fd.get("entityId") || "").trim() || null;

    setBusy(true);
    setStatus("Preparando upload...");

    try {
      const metadata = {
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        category,
        entityType: resolvedEntityType,
        entityId: resolvedEntityId,
      };

      const presignResponse = await fetch("/api/files/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(metadata),
      });
      const presign = await presignResponse.json();

      if (!presignResponse.ok) {
        throw new Error(presign.error || "Não foi possível preparar o upload.");
      }

      setStatus("Enviando arquivo...");

      const uploadResponse = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: { "content-type": metadata.mimeType },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("O S3 recusou o upload. Verifique CORS e permissões do bucket.");
      }

      setStatus("Registrando arquivo...");

      const registerResponse = await fetch("/api/files/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...metadata,
          storageKey: presign.storageKey,
        }),
      });
      const registered = await registerResponse.json();

      if (!registerResponse.ok) {
        throw new Error(registered.error || "Falha ao registrar arquivo.");
      }

      form.reset();
      setStatus("Upload concluído.");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha no upload.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className={compact ? "form-grid compact" : "form-grid"}
      onSubmit={handleSubmit}
    >
      <input name="file" type="file" accept={accept} required />
      {lockCategory ? (
        <input type="hidden" name="category" value={defaultCategory} />
      ) : (
        <input
          name="category"
          defaultValue={defaultCategory}
          required
          placeholder="Categoria"
        />
      )}
      {!entityType ? (
        <input name="entityType" placeholder="Tipo da entidade (opcional)" />
      ) : null}
      {!entityId ? (
        <input name="entityId" placeholder="ID da entidade (opcional)" />
      ) : null}
      <button className="btn btn-primary" disabled={busy}>
        {busy ? "Enviando..." : buttonLabel}
      </button>
      {status ? <div className="muted">{status}</div> : null}
    </form>
  );
}
