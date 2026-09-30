import { acceptStudentContractAction } from "@/app/actions/enrollment-finance";
import { activeOrganization, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const org = await activeOrganization();
  if (!org) notFound();

  const { id } = await params;

  const contract = await db.studentContract.findFirst({
    where: {
      id,
      organizationId: org.id,
      student: {
        guardians: {
          some: { userId: user.id },
        },
      },
    },
    include: {
      student: true,
      organization: true,
      acceptances: true,
    },
  });

  if (!contract) notFound();

  const acceptance = contract.acceptances[0];

  return (
    <main className="auth-page">
      <section className="auth-card wide">
        <span className="badge">Contrato escolar</span>
        <h1>{contract.title}</h1>
        <p className="muted">
          {contract.organization.name} · {contract.student.name}
        </p>

        <div className="notice">
          <strong>
            Mensalidade: R$ {Number(contract.monthlyAmount).toFixed(2)}
          </strong>
          <div className="muted">
            Início {contract.startsAt.toLocaleDateString("pt-BR")}
            {contract.endsAt
              ? " · término " +
                contract.endsAt.toLocaleDateString("pt-BR")
              : ""}
          </div>

          {contract.scholarshipLabel ? (
            <div>Bolsa/convênio: {contract.scholarshipLabel}</div>
          ) : null}

          {contract.notes ? <p>{contract.notes}</p> : null}
        </div>

        {acceptance ? (
          <div className="alert">
            Contrato aceito por {acceptance.acceptedByName} em{" "}
            {acceptance.acceptedAt.toLocaleString("pt-BR")}.
          </div>
        ) : (
          <form action={acceptStudentContractAction} className="form-stack">
            <input type="hidden" name="contractId" value={contract.id} />

            <label>
              Nome do responsável
              <input name="acceptedByName" defaultValue={user.name} required />
            </label>

            <label>
              CPF/RG
              <input name="acceptedByDocument" />
            </label>

            <label>
              <input type="checkbox" required /> Declaro que li e aceito as
              condições deste contrato.
            </label>

            <button className="btn btn-primary">Aceitar contrato</button>
          </form>
        )}
      </section>
    </main>
  );
}
