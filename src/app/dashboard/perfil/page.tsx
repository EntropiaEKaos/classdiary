import { LockKeyhole, Settings2, UserCircle2 } from "lucide-react";
import { changePasswordAction, updatePreferencesAction, updateProfileAction } from "@/app/actions/profile";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { FormFeedback } from "@/components/form-feedback";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();
  const preference = await db.userPreference.findUnique({ where: { userId: user.id } });

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <span className="badge">Minha conta</span>
          <h1>Perfil e preferências</h1>
          <div className="muted">Controle seus dados, aparência e notificações.</div>
        </div>
      </div>

      <div className="profile-grid">
        <section className="table-card">
          <div className="section-icon-title">
            <UserCircle2 size={20}/>
            <div><strong>Dados pessoais</strong><span>Informações exibidas dentro da escola.</span></div>
          </div>
          <form action={updateProfileAction} className="form-stack">
            <label>Nome<input name="name" defaultValue={user.name} required /></label>
            <label>E-mail<input value={user.email} disabled /></label>
            <label>URL do avatar<input name="avatarUrl" type="url" defaultValue={user.avatarUrl ?? ""} placeholder="https://..." /></label>
            <button className="btn btn-primary">Salvar perfil</button>
            <FormFeedback message="Perfil atualizado." />
          </form>
        </section>

        <section className="table-card">
          <div className="section-icon-title">
            <Settings2 size={20}/>
            <div><strong>Preferências</strong><span>Personalize a experiência do EduSync.</span></div>
          </div>
          <div className="preference-theme-row">
            <span><strong>Aparência</strong><small>Claro ou noturno</small></span>
            <ThemeToggle showLabel />
          </div>
          <form action={updatePreferencesAction} className="form-stack">
            <label className="checkbox-line">
              <input type="checkbox" name="inAppNotifications" defaultChecked={preference?.inAppNotifications ?? true}/>
              <span><strong>Notificações no aplicativo</strong><small>Receber alertas e atualizações na Central.</small></span>
            </label>
            <label className="checkbox-line">
              <input type="checkbox" name="compactMode" defaultChecked={preference?.compactMode ?? false}/>
              <span><strong>Modo compacto</strong><small>Reduz espaçamentos para trabalhar com mais informação.</small></span>
            </label>
            <button className="btn btn-primary">Salvar preferências</button>
            <FormFeedback message="Preferências atualizadas." />
          </form>
        </section>

        <section className="table-card">
          <div className="section-icon-title">
            <LockKeyhole size={20}/>
            <div><strong>Segurança</strong><span>Troque sua senha de acesso.</span></div>
          </div>
          <form action={changePasswordAction} className="form-stack">
            <label>Senha atual<input type="password" name="currentPassword" minLength={8} required autoComplete="current-password"/></label>
            <label>Nova senha<input type="password" name="newPassword" minLength={10} required autoComplete="new-password"/></label>
            <button className="btn btn-primary">Alterar senha</button>
            <FormFeedback message="Senha alterada." />
          </form>
        </section>
      </div>
    </main>
  );
}
