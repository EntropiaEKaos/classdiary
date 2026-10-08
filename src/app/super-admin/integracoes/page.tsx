import { AdminPageHeader } from "@/components/admin/page-header";

const status = (value?: string) => value ? "Configurado" : "Não configurado";

const integrations = [
  ["PostgreSQL", process.env.DATABASE_URL, "Banco principal da aplicação"],
  ["URL pública", process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL, "Endereço canônico do ClassDiary"],
  ["Mercado Pago", process.env.MERCADO_PAGO_ACCESS_TOKEN, "Assinaturas e cobrança"],
  ["Webhook Mercado Pago", process.env.MERCADO_PAGO_WEBHOOK_SECRET, "Validação de eventos de cobrança"],
  ["Bootstrap administrativo", process.env.ADMIN_BOOTSTRAP_TOKEN, "Operações administrativas protegidas"],
];

export default function IntegrationsAdminPage() {
  const configured = integrations.filter(([, value]) => Boolean(value)).length;

  return (
    <main className="admin-page">
      <AdminPageHeader
        eyebrow="Infraestrutura"
        title="Integrações"
        description="Visibilidade segura do estado das integrações, sem revelar credenciais."
      >
        <span className="admin-count-pill">{configured}/{integrations.length} configuradas</span>
      </AdminPageHeader>

      <section className="admin-section admin-table-section">
        <div className="admin-table-wrap">
          <table className="admin-table admin-responsive-table">
            <thead><tr><th>Integração</th><th>Uso</th><th>Status</th></tr></thead>
            <tbody>
              {integrations.map(([name, value, description]) => (
                <tr key={name}>
                  <td data-label="Integração"><strong>{name}</strong></td>
                  <td data-label="Uso" className="muted">{description}</td>
                  <td data-label="Status"><span className={value ? "admin-status ok" : "admin-status warn"}><span className="admin-status-dot" />{status(value)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="admin-note admin-wide-note"><strong>Segurança por padrão.</strong><span>Nenhuma credencial ou segredo é renderizado nesta tela.</span></div>
    </main>
  );
}
