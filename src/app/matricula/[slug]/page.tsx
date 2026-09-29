import { createPublicEnrollmentLeadAction } from "@/app/actions/enrollment-finance";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await db.organization.findFirst({ where: { slug, active: true } });
  if (!org || org.slug === "classdiary-platform") notFound();

  return (
    <main className="auth-page">
      <section className="auth-card wide">
        <span className="badge">Pré-inscrição online</span>
        <h1>{org.name}</h1>
        <p className="muted">Envie os dados iniciais para a secretaria entrar em contato.</p>
        <form action={createPublicEnrollmentLeadAction} className="form-grid">
          <input type="hidden" name="organizationSlug" value={org.slug} />
          <input name="studentName" required placeholder="Nome do aluno" />
          <input name="birthDate" type="date" />
          <input name="guardianName" required placeholder="Responsável" />
          <input name="guardianEmail" type="email" placeholder="E-mail do responsável" />
          <input name="guardianPhone" required placeholder="Telefone/WhatsApp" />
          <input name="desiredGrade" placeholder="Série desejada" />
          <input name="desiredShift" placeholder="Turno desejado" />
          <input name="notes" placeholder="Observações" />
          <button className="btn btn-primary">Enviar pré-inscrição</button>
        </form>
      </section>
    </main>
  );
}
