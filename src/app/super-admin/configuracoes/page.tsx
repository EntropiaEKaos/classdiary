import { updatePlatformSettingsAction } from "@/app/actions/platform-admin";
import { getPlatformSettings } from "@/lib/platform-settings";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminSubmitButton } from "@/components/admin/submit-button";

export const dynamic = "force-dynamic";

export default async function PlatformSettingsPage() {
  const settings = await getPlatformSettings();

  return (
    <main className="admin-page">
      <AdminPageHeader
        eyebrow="Configuração global"
        title="Site & sistema"
        description="Configurações persistidas no banco e aplicadas à experiência pública."
      >
        <span className="admin-status ok"><span className="admin-status-dot" />Persistência ativa</span>
      </AdminPageHeader>

      <form action={updatePlatformSettingsAction} className="admin-settings-grid">
        <section className="admin-form-section">
          <div className="admin-section-head"><div><h2>Site público</h2><p>Identidade e conteúdo principal da experiência pública.</p></div></div>
          <label>Nome da plataforma<input name="siteName" defaultValue={settings.siteName} required /></label>
          <label>Badge principal<input name="heroBadge" defaultValue={settings.heroBadge} required /></label>
          <label>Título da Home<input name="heroTitle" defaultValue={settings.heroTitle} required /></label>
          <label>Descrição da Home<textarea name="heroSubtitle" rows={5} defaultValue={settings.heroSubtitle} required /></label>
          <div className="admin-form-two">
            <label>E-mail de suporte<input name="supportEmail" type="email" defaultValue={settings.supportEmail ?? ""} /></label>
            <label>WhatsApp de suporte<input name="supportWhatsapp" defaultValue={settings.supportWhatsapp ?? ""} /></label>
          </div>
        </section>

        <section className="admin-form-section">
          <div className="admin-section-head"><div><h2>Sistema</h2><p>Regras globais para novos clientes e operação pública.</p></div></div>
          <label>Duração padrão do trial<input name="trialDays" type="number" min="1" max="90" defaultValue={settings.trialDays} required /></label>
          <label className="checkbox-line admin-toggle-row">
            <input name="publicSignupEnabled" type="checkbox" defaultChecked={settings.publicSignupEnabled} />
            <span><strong>Cadastro público habilitado</strong><small>Permite novas contas pela página /cadastro.</small></span>
          </label>
          <label className="checkbox-line admin-toggle-row">
            <input name="maintenanceMode" type="checkbox" defaultChecked={settings.maintenanceMode} />
            <span><strong>Modo manutenção do site</strong><small>Exibe aviso global na Home sem bloquear o acesso administrativo.</small></span>
          </label>
          <div className="admin-note"><strong>Segredos ficam protegidos.</strong><span>Tokens de pagamento, banco e webhooks continuam exclusivamente em variáveis de ambiente.</span></div>
          <div className="admin-sticky-action">
            <AdminSubmitButton pendingLabel="Salvando configurações..." className="admin-save-button">Salvar configurações</AdminSubmitButton>
          </div>
        </section>
      </form>
    </main>
  );
}
