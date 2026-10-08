import { createSchoolAction } from "@/app/actions/school";
import { activeOrganization, requireUser } from "@/lib/auth";
import { getPlatformSettings } from "@/lib/platform-settings";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-dynamic";

export default async function Onboarding() {
  await requireUser();
  if (await activeOrganization()) redirect("/dashboard");
  const settings = await getPlatformSettings();

  return (
    <main className="auth-page">
      <div className="auth-theme-control"><ThemeToggle showLabel /></div>
      <section className="auth-card wide">
        <div>
          <span className="badge">{settings.trialDays} dias grátis</span>
          <h1>Configure sua escola</h1>
          <p className="muted">Escolha o plano inicial. Você poderá alterar depois sem perder dados.</p>
        </div>
        <form action={createSchoolAction} className="form-grid">
          <label>Nome da escola<input name="name" required /></label>
          <label>Identificador<input name="slug" required pattern="[a-z0-9-]+" placeholder="colegio-exemplo" /></label>
          <label>E-mail institucional<input name="email" type="email" /></label>
          <label>Telefone<input name="phone" /></label>
          <label>
            Plano inicial
            <select name="plan" defaultValue="STARTER">
              <option value="STARTER">Starter · até 150 alunos · 30 usuários</option>
              <option value="PRO">Pro · até 800 alunos · 150 usuários</option>
              <option value="ENTERPRISE">Enterprise · capacidade ampliada</option>
            </select>
          </label>
          <div className="notice">
            <strong>Trial completo por {settings.trialDays} dias</strong>
            <p className="muted">O ambiente já nasce isolado, com você como administrador e o ano letivo atual configurado.</p>
          </div>
          <button className="btn btn-primary" type="submit">Criar escola e iniciar trial</button>
        </form>
      </section>
    </main>
  );
}
