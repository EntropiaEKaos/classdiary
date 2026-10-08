import { notFound } from "next/navigation";
import { updateStudentProfileAction, upsertStudentDocumentAction } from "@/app/actions/secretary";
import { FileUploadForm } from "@/components/file-upload-form";
import { requireSchoolRole } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { org } = await requireSchoolRole(["SCHOOL_ADMIN", "COORDINATOR", "SECRETARY"]);
  const { id } = await params;

  const [student, files] = await Promise.all([
    db.student.findFirst({
      where: { id, organizationId: org.id },
      include: {
        enrollments: {
          include: { classGroup: { include: { schoolYear: true } } },
          orderBy: { createdAt: "desc" },
        },
        documents: true,
        documentRequirements: true,
        academicMovements: {
          include: { fromClassGroup: true, toClassGroup: true },
          orderBy: { effectiveAt: "desc" },
        },
        annualResults: {
          include: { schoolYear: true },
          orderBy: { createdAt: "desc" },
        },
        contracts: true,
        invoices: {
          include: { payments: true },
          orderBy: { dueAt: "desc" },
          take: 50,
        },
        receipts: { orderBy: { issuedAt: "desc" }, take: 20 },
        medicalRecords: { orderBy: { occurredAt: "desc" }, take: 20 },
        occurrences: { orderBy: { occurredAt: "desc" }, take: 20 },
      },
    }),
    db.fileAsset.findMany({
      where: {
        organizationId: org.id,
        entityType: "Student",
        entityId: id,
      },
      include: { uploadedBy: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  if (!student) notFound();

  const openBalance = student.invoices
    .filter((invoice) => invoice.status !== "PAID")
    .reduce(
      (sum, invoice) =>
        sum +
        Math.max(
          0,
          Number(invoice.amount) -
            Number(invoice.discountAmount) +
            Number(invoice.fineAmount) +
            Number(invoice.interestAmount) -
            invoice.payments.reduce((paymentSum, payment) => paymentSum + Number(payment.amount), 0),
        ),
      0,
    );

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>{student.name}</h1>
          <div className="muted">Matrícula {student.registration}</div>
        </div>
        <a className="btn btn-light" href={"/dashboard/evolucao/" + student.id}>
          Evolução pedagógica
        </a>
      </div>

      <section className="table-card">
        <h3>Ficha cadastral</h3>
        <form action={updateStudentProfileAction} className="form-grid">
          <input type="hidden" name="studentId" value={student.id} />
          <input
            name="birthDate"
            type="date"
            defaultValue={student.birthDate ? student.birthDate.toISOString().slice(0, 10) : ""}
          />
          <input name="cpf" placeholder="CPF" defaultValue={student.cpf ?? ""} />
          <input name="rg" placeholder="RG" defaultValue={student.rg ?? ""} />
          <input name="guardianName" placeholder="Responsável" defaultValue={student.guardianName ?? ""} />
          <input
            name="guardianPhone"
            placeholder="Telefone responsável"
            defaultValue={student.guardianPhone ?? ""}
          />
          <input
            name="guardianEmail"
            type="email"
            placeholder="E-mail responsável"
            defaultValue={student.guardianEmail ?? ""}
          />
          <input name="addressLine" placeholder="Endereço" defaultValue={student.addressLine ?? ""} />
          <input name="addressNumber" placeholder="Número" defaultValue={student.addressNumber ?? ""} />
          <input name="addressDistrict" placeholder="Bairro" defaultValue={student.addressDistrict ?? ""} />
          <input name="addressCity" placeholder="Cidade" defaultValue={student.addressCity ?? ""} />
          <input name="addressState" placeholder="UF" defaultValue={student.addressState ?? ""} />
          <input name="addressZip" placeholder="CEP" defaultValue={student.addressZip ?? ""} />
          <input
            name="emergencyContactName"
            placeholder="Contato de emergência"
            defaultValue={student.emergencyContactName ?? ""}
          />
          <input
            name="emergencyContactPhone"
            placeholder="Telefone emergência"
            defaultValue={student.emergencyContactPhone ?? ""}
          />
          <input
            name="healthNotes"
            placeholder="Observações de saúde"
            defaultValue={student.healthNotes ?? ""}
          />
          <button className="btn btn-primary">Salvar ficha</button>
        </form>
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Foto e documentos do aluno</h3>
        <FileUploadForm
          entityType="Student"
          entityId={student.id}
          defaultCategory="STUDENT_DOCUMENT"
          compact
        />
        <div className="muted" style={{ marginTop: 8 }}>
          Upload privado no storage da escola. Use a categoria PROFILE_PHOTO para a foto principal.
        </div>
        {files.length ? (
          files.map((file) => (
            <div className="table-row" key={file.id}>
              <strong>{file.originalName}</strong>
              <span>{file.category}</span>
              <span>{file.uploadedBy.name}</span>
              <a href={"/api/files/" + file.id} target="_blank" rel="noreferrer">
                Abrir
              </a>
            </div>
          ))
        ) : (
          <div className="muted" style={{ marginTop: 12 }}>
            Nenhum arquivo anexado ao aluno.
          </div>
        )}
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Documentos obrigatórios</h3>
        <form action={upsertStudentDocumentAction} className="form-grid compact">
          <input type="hidden" name="studentId" value={student.id} />
          <input name="code" required placeholder="Ex.: RG" />
          <input name="label" required placeholder="Nome do documento" />
          <select name="status">
            <option value="PENDING">Pendente</option>
            <option value="RECEIVED">Recebido</option>
            <option value="WAIVED">Dispensado</option>
          </select>
          <input name="fileUrl" type="url" placeholder="Link legado do arquivo (opcional)" />
          <input name="notes" placeholder="Observação" />
          <button className="btn btn-primary">Salvar documento</button>
        </form>
        {student.documentRequirements.map((document) => (
          <div className="table-row" key={document.id}>
            <strong>{document.label}</strong>
            <span>{document.status}</span>
            <span>{document.receivedAt ? document.receivedAt.toLocaleDateString("pt-BR") : "—"}</span>
          </div>
        ))}
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Prontuário 360 · visão consolidada</h3>
        <div className="dashboard-grid">
          <div className="kpi">
            <span className="muted">Arquivos</span>
            <div className="value">{files.length}</div>
          </div>
          <div className="kpi">
            <span className="muted">Ocorrências</span>
            <div className="value">{student.occurrences.length}</div>
          </div>
          <div className="kpi">
            <span className="muted">Registros de saúde</span>
            <div className="value">{student.medicalRecords.length}</div>
          </div>
          <div className="kpi">
            <span className="muted">Contratos</span>
            <div className="value">{student.contracts.length}</div>
          </div>
        </div>
      </section>

      <div className="content-grid">
        <section className="table-card">
          <h3>Matrículas</h3>
          {student.enrollments.map((enrollment) => (
            <div className="notice" key={enrollment.id}>
              <strong>
                {enrollment.classGroup.schoolYear.name} · {enrollment.classGroup.name}
              </strong>
              <div className="muted">{enrollment.active ? "Ativa" : "Encerrada"}</div>
            </div>
          ))}
        </section>
        <section className="table-card">
          <h3>Resultados anuais</h3>
          {student.annualResults.map((result) => (
            <div className="notice" key={result.id}>
              <strong>
                {result.schoolYear.name} · {result.status}
              </strong>
              <div className="muted">
                Média {result.finalAverage ? String(result.finalAverage) : "—"} · Freq.{" "}
                {result.attendancePercent ? String(result.attendancePercent) : "—"}%
              </div>
            </div>
          ))}
        </section>
      </div>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Resumo financeiro</h3>
        <div className="dashboard-grid">
          <div className="kpi">
            <span className="muted">Contratos</span>
            <div className="value">{student.contracts.length}</div>
          </div>
          <div className="kpi">
            <span className="muted">Cobranças abertas</span>
            <div className="value">{student.invoices.filter((invoice) => invoice.status !== "PAID").length}</div>
          </div>
          <div className="kpi">
            <span className="muted">Recibos</span>
            <div className="value">{student.receipts.length}</div>
          </div>
          <div className="kpi">
            <span className="muted">Saldo em aberto</span>
            <div className="value">R$ {openBalance.toFixed(2)}</div>
          </div>
        </div>
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Movimentações acadêmicas</h3>
        {student.academicMovements.map((movement) => (
          <div className="table-row" key={movement.id}>
            <strong>{movement.type}</strong>
            <span>
              {movement.fromClassGroup?.name ?? "—"} → {movement.toClassGroup?.name ?? "—"}
            </span>
            <span>{movement.effectiveAt.toLocaleDateString("pt-BR")}</span>
          </div>
        ))}
      </section>
    </main>
  );
}
