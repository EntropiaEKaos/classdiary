import {
  createDataSubjectRequestAction,
  recordPrivacyConsentAction,
} from "@/app/actions/privacy";
import { activeOrganization, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireUser();
  const org = await activeOrganization();

  if (!org) {
    return (
      <main className="main">
        <section className="table-card">
          <h1>Privacidade</h1>
          <p className="muted">Nenhuma escola ativa.</p>
        </section>
      </main>
    );
  }

  const [linkedStudents, requests, consents] = await Promise.all([
    db.student.findMany({
      where: {
        organizationId: org.id,
        OR: [
          { userLinks: { some: { userId: user.id } } },
          { guardians: { some: { userId: user.id } } },
        ],
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, registration: true },
    }),
    db.dataSubjectRequest.findMany({
      where: {
        organizationId: org.id,
        requesterUserId: user.id,
      },
      include: { student: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.privacyConsent.findMany({
      where: {
        organizationId: org.id,
        userId: user.id,
      },
      include: { student: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Centro de privacidade</h1>
          <div className="muted">
            Consentimentos, solicitações e exportação dos seus dados vinculados.
          </div>
        </div>
      </div>

      <div className="content-grid">
        <section className="table-card">
          <h3>Consentimentos</h3>

          <form action={recordPrivacyConsentAction} className="form-grid">
            <select name="studentId" defaultValue="">
              <option value="">Consentimento do próprio usuário</option>
              {linkedStudents.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                </option>
              ))}
            </select>

            <select name="type" defaultValue="PRIVACY_NOTICE">
              <option value="PRIVACY_NOTICE">Ciência do aviso de privacidade</option>
              <option value="IMAGE_USE">Uso de imagem</option>
              <option value="COMMUNICATION">Comunicações</option>
              <option value="RESEARCH">Pesquisas institucionais</option>
            </select>

            <select name="decision" defaultValue="GRANTED">
              <option value="GRANTED">Conceder</option>
              <option value="WITHDRAWN">Retirar</option>
            </select>

            <button className="btn btn-primary">
              Registrar decisão
            </button>
          </form>

          <div style={{ marginTop: 12 }}>
            {consents.length === 0 ? (
              <p className="muted">Nenhum consentimento registrado.</p>
            ) : (
              consents.map((consent) => (
                <div className="table-row" key={consent.id}>
                  <strong>{consent.type}</strong>
                  <span>
                    {consent.student?.name ?? "Usuário"}
                  </span>
                  <span className="status">{consent.status}</span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="table-card">
          <h3>Nova solicitação</h3>

          <form action={createDataSubjectRequestAction} className="form-grid">
            <select name="studentId" defaultValue="">
              <option value="">Dados do próprio usuário</option>
              {linkedStudents.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                </option>
              ))}
            </select>

            <select name="type" defaultValue="ACCESS">
              <option value="ACCESS">Acesso aos dados</option>
              <option value="EXPORT">Exportação</option>
              <option value="CORRECTION">Correção</option>
              <option value="ANONYMIZATION">Solicitar análise de anonimização</option>
              <option value="DELETION">Solicitar análise de exclusão</option>
            </select>

            <textarea
              name="description"
              required
              rows={5}
              placeholder="Descreva a solicitação e os dados envolvidos."
            />

            <button className="btn btn-primary">
              Enviar solicitação
            </button>
          </form>
        </section>
      </div>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Meus dados vinculados</h3>
        {linkedStudents.length === 0 ? (
          <p className="muted">
            Nenhum cadastro de aluno está vinculado ao seu usuário.
          </p>
        ) : (
          linkedStudents.map((student) => (
            <div className="table-row" key={student.id}>
              <strong>{student.name}</strong>
              <span>{student.registration}</span>
              <a
                className="btn btn-light"
                href={`/api/privacidade/exportar/${student.id}`}
              >
                Exportar JSON
              </a>
            </div>
          ))
        )}
      </section>

      <section className="table-card" style={{ marginTop: 16 }}>
        <h3>Histórico de solicitações</h3>
        {requests.length === 0 ? (
          <p className="muted">Nenhuma solicitação enviada.</p>
        ) : (
          requests.map((request) => (
            <div className="notice" key={request.id}>
              <strong>
                {request.type} · {request.student?.name ?? "Usuário"}
              </strong>
              <div className="muted">
                {request.createdAt.toLocaleString("pt-BR")} · {request.status}
              </div>
              <p>{request.description}</p>
              {request.resolution ? (
                <p className="muted">Resposta: {request.resolution}</p>
              ) : null}
            </div>
          ))
        )}
      </section>
    </main>
  );
}
