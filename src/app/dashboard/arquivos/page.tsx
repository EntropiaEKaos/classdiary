import { FileUploadForm } from "@/components/file-upload-form";
import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { org } = await requireModulePermission("secretary", "view");
  const files = await db.fileAsset.findMany({
    where: { organizationId: org.id },
    include: { uploadedBy: true },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Arquivos e anexos</h1>
          <div className="muted">
            Storage privado por escola com upload direto e acesso temporário.
          </div>
        </div>
      </div>

      <section className="table-card">
        <h3>Novo arquivo</h3>
        <FileUploadForm />
        <div className="muted" style={{ marginTop: 8 }}>
          Permitidos: PDF, JPG, PNG e WEBP. Limite de 25 MB por arquivo.
        </div>
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Arquivos</h3>
        {files.length ? (
          files.map((file) => (
            <div className="table-row" key={file.id}>
              <strong>{file.originalName}</strong>
              <span>
                {file.category} · {file.mimeType}
              </span>
              <span>{file.uploadedBy.name}</span>
              <a href={"/api/files/" + file.id} target="_blank" rel="noreferrer">
                Abrir
              </a>
            </div>
          ))
        ) : (
          <div className="muted">Nenhum arquivo enviado ainda.</div>
        )}
      </section>
    </main>
  );
}
