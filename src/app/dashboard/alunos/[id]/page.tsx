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

  const now = new Date();
  const activeEnrollment = student.enrollments.find((enrollment) => enrollment.active);
  const pendingDocuments = student.documentRequirements.filter(
    (document) => document.required && document.status === "PENDING",
  );
  const overdueInvoices = student.invoices.filter(
    (invoice) => invoice.status !== "PAID" && invoice.dueAt < now,
  );
  const profilePhoto = files.find((file) => file.category === "PROFILE_PHOTO");

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

  const profileFields = [
    student.birthDate,
    student.cpf,
    student.rg,
    student.guardianName,
    student.guardianPhone,
    student.guardianEmail,
    student.addressLine,
    student.addressCity,
    student.addressState,
    student.addressZip,
    student.emergencyContactName,
    student.emergencyContactPhone,
  ];
  const completedProfileFields = profileFields.filter(Boolean).length;
  const profileCompletion = Math.round((completedProfileFields / profileFields.length) * 100);

  const timeline = [
    ...student.academicMovements.map((item) => ({
      date: item.effectiveAt,
      label: "Movimentação acadêmica",
      detail: item.type,
    })),
    ...student.occurrences.map((item) => ({
      date: item.occurredAt,
      label: "Ocorrência",
      detail: "Registro disciplinar ou pedagógico",
    })),
    ...student.medicalRecords.map((item) => ({
      date: item.occurredAt,
      label: "Saúde",
      detail: "Registro de saúde atualizado",
    })),
    ...student.receipts.map((item) => ({
      date: item.issuedAt,
      label: "Financeiro",
      detail: "Recibo emitido",
    })),
    ...files.map((item) => ({
      date: item.createdAt,
      label: "Documento",
      detail: item.originalName,
    })),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 12);

  const birthDateLabel = student.birthDate
    ? student.birthDate.toLocaleDateString("pt-BR")
    : "Não informada";

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <div className="muted">Prontuário 360</div>
          <h1>{student.name}</h1>
          <div className="muted">
            Matrícula {student.registration} · {student.active ? "Aluno ativo" : "Aluno inativo"}
          </div>
        </div>
        <a className="btn btn-light" href={"/dashboard/evolucao/" + student.id}>
          Evolução pedagógica
        </a>
      </div>

      <section className="table-card">
        <div className="page-head">
          <div>
            <h3>Visão geral do aluno</h3>
            <div className="muted">
              Informações essenciais, alertas e situação atual em um único lugar.
            </div>
          </div>
          <div className="muted">Cadastro {profileCompletion}% completo</div>
        </div>

        <div className="dashboard-grid">
          <div className="kpi">
            <span className="muted">Turma atual</span>
            <div className="value" style={{ fontSize: 20 }}>
              {activeEnrollment?.classGroup.name ?? "Sem turma"}
            </div>
            <div className="muted">
              {activeEnrollment?.classGroup.schoolYear.name ?? "Nenhuma matrícula ativa"}
            </div>
          </div>
          <div className="kpi">
            <span className="muted">Documentação</span>
            <div className="value">{pendingDocuments.length}</div>
            <div className="muted">
              {pendingDocuments.length === 1 ? "pendência" : "pendências"} obrigatórias
            </div>
          </div>
          <div className="kpi">
            <span className="muted">Financeiro</span>
            <div className="value">R$ {openBalance.toFixed(2)}</div>
            <div className="muted">
              {overdueInvoices.length} {overdueInvoices.length === 1 ? "cobrança vencida" : "cobranças vencidas"}
            </div>
          </div>
          <div className="kpi">
            <span className="muted">Responsável</span>
            <div className="value" style={{ fontSize: 20 }}>
              {student.guardianName ?? "Não informado"}
            </div>
            <div className="muted">{student.guardianPhone ?? student.guardianEmail ?? "Sem contato"}</div>
          </div>
        </div>

        <div className="content-grid" style={{ marginTop: 16 }}>
          <div className="notice">
            <strong>Dados pessoais</strong>
            <div className="muted">Nascimento: {birthDateLabel}</div>
            <div className="muted">CPF: {student.cpf ?? "Não informado"}</div>
            <div className="muted">
              Endereço: {[student.addressLine, student.addressNumber, student.addressCity]
                .filter(Boolean)
                .join(", ") || "Não informado"}
            </div>
          </div>
          <div className="notice">
            <strong>Saúde e emergência</strong>
            <div className="muted">
              Contato: {student.emergencyContactName ?? "Não informado"}
              {student.emergencyContactPhone ? " · " + student.emergencyContactPhone : ""}
            </div>
            <div className="muted">
              {student.healthNotes ? student.healthNotes : "Nenhuma observação de saúde cadastrada."}
            </div>
          </div>
        </div>
      </section>

      {(pendingDocuments.length > 0 || overdueInvoices.length > 0 || !activeEnrollment) && (
        <section className="table-card" style={{ marginTop: 16 }}>
          <h3>Central de atenção</h3>
          <div className="content-grid">
            {pendingDocuments.length > 0 && (
              <div className="notice">
                <strong>Documentação pendente</strong>
                <div className="muted">
                  {pendingDocuments.map((document) => document.label).slice(0, 4).join(" · ")}
                  {pendingDocuments.length > 4 ? " · +" + (pendingDocuments.length - 4) : ""}
                </div>
              </div>
            )}
            {overdueInvoices.length > 0 && (
              <div className="notice">
                <strong>Financeiro requer atenção</strong>
                <div className="muted">
                  {overdueInvoices.length} {overdueInvoices.length === 1 ? "cobrança vencida" : "cobranças vencidas"}.
                </div>
              </div>
            )}
            {!activeEnrollment && (
              <div className="notice">
                <strong>Sem matrícula ativa</strong>
                <div className="muted">O aluno não está vinculado a uma turma ativa neste momento.</div>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="table-card" style={{ marginTop: 16 }}>
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
        <div className="page-head">
          <div>
            <h3>Foto e documentos do aluno</h3>
            <div className="muted">
              {profilePhoto ? "Foto de perfil cadastrada." : "Foto de perfil ainda não cadastrada."}
            </div>
          </div>
          <div className="muted">{files.length} arquivo(s)</div>
        </div>
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
        <h3>Prontuário 360 · indicadores</h3>
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
          {student.enrollments.length ? (
            student.enrollments.map((enrollment) => (
              <div className="notice" key={enrollment.id}>
                <strong>
                  {enrollment.classGroup.schoolYear.name} · {enrollment.classGroup.name}
                </strong>
                <div className="muted">{enrollment.active ? "Ativa" : "Encerrada"}</div>
              </div>
            ))
          ) : (
            <div className="muted">Nenhuma matrícula encontrada.</div>
          )}
        </section>
        <section className="table-card">
          <h3>Resultados anuais</h3>
          {student.annualResults.length ? (
            student.annualResults.map((result) => (
              <div className="notice" key={result.id}>
                <strong>
                  {result.schoolYear.name} · {result.status}
                </strong>
                <div className="muted">
                  Média {result.finalAverage ? String(result.finalAverage) : "—"} · Freq.{" "}
                  {result.attendancePercent ? String(result.attendancePercent) : "—"}%
                </div>
              </div>
            ))
          ) : (
            <div className="muted">Nenhum resultado anual consolidado.</div>
          )}
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
            <span className="muted">Vencidas</span>
            <div className="value">{overdueInvoices.length}</div>
          </div>
          <div className="kpi">
            <span className="muted">Saldo em aberto</span>
            <div className="value">R$ {openBalance.toFixed(2)}</div>
          </div>
        </div>
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Linha do tempo recente</h3>
        {timeline.length ? (
          timeline.map((event, index) => (
            <div className="table-row" key={event.date.toISOString() + "-" + index}>
              <strong>{event.label}</strong>
              <span>{event.detail}</span>
              <span>{event.date.toLocaleDateString("pt-BR")}</span>
            </div>
          ))
        ) : (
          <div className="muted">Ainda não há eventos recentes no prontuário deste aluno.</div>
        )}
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Movimentações acadêmicas</h3>
        {student.academicMovements.length ? (
          student.academicMovements.map((movement) => (
            <div className="table-row" key={movement.id}>
              <strong>{movement.type}</strong>
              <span>
                {movement.fromClassGroup?.name ?? "—"} → {movement.toClassGroup?.name ?? "—"}
              </span>
              <span>{movement.effectiveAt.toLocaleDateString("pt-BR")}</span>
            </div>
          ))
        ) : (
          <div className="muted">Nenhuma movimentação acadêmica registrada.</div>
        )}
      </section>
    </main>
  );
}
