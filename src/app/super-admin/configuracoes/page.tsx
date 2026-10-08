import { updatePlatformSettingsAction } from "@/app/actions/platform-admin";
import { getPlatformSettings } from "@/lib/platform-settings";

export const dynamic = "force-dynamic";

export default async function PlatformSettingsPage() {
  const settings = await getPlatformSettings();

  return (
    <main className="admin-page">
      <div className="admin-toolbar">
        <div><span className="badge">Configuração global</span><h1>Site & sistema</h1><p className="muted">Configurações persistidas no banco e aplicadas à experiência pública.</p></div>
      </div>
      <form action={updatePlatformSettingsAction} className="admin-settings-grid">
        <section className="admin-form-section">
          <h2>Site público</h2>
          <label>Nome da plataforma<input name="siteName" defaultValue={settings.siteName} required /></label>
          <label>Badge principal<input name="heroBadge" defaultValue={settings.heroBadge} required /></label>
          <label>Título da Home<input name="heroTitle" defaultValue={settings.heroTitle} required /></label>
          <label>Descrição da Home<textarea name="heroSubtitle" rows={5} defaultValue={settings.heroSubtitle} required /></label>
          <label>E-mail de suporte<input name="supportEmail" type="email" defaultValue={settings.supportEmail ?? ""} /></label>
          <label>WhatsApp de suporte<input name="supportWhatsapp" defaultValue={settings.supportWhatsapp ?? ""} /></label>
        </section>
        <section className="admin-form-section">
          <h2>Sistema</h2>
          <label>Duração padrão do trial<input name="trialDays" type="number" min="1" max="90" defaultValue={settings.trialDays} required /></label>
          <label className="checkbox-line">
            <input name="publicSignupEnabled" type="checkbox" defaultChecked={settings.publicSignupEnabled} />
            <span><strong>Cadastro público habilitado</strong><br/><span className="muted">Permite novas contas pela página /cadastro.</span></span>
          </label>
          <label className="checkbox-line">
            <input name="maintenanceMode" type="checkbox" defaultChecked={settings.maintenanceMode} />
            <span><strong>Modo manutenção do site</strong><br/><span className="muted">Exibe aviso global na Home sem bloquear o acesso administrativo.</span></span>
          </label>
          <div className="admin-note"><strong>Segredos ficam fora daqui.</strong><br/><span className="muted">Tokens de pagamento, banco e webhooks continuam protegidos por variáveis de ambiente.</span></div>
          <button className="btn btn-primary" type="submit">Salvar configurações</button>
        </section>
      </form>
    </main>
  );
}
