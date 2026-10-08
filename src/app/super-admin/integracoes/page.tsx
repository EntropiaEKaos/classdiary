const status = (value?: string) => value ? "Configurado" : "Não configurado";

const integrations = [
  ["PostgreSQL", process.env.DATABASE_URL, "Banco principal da aplicação"],
  ["URL pública", process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL, "Endereço canônico do ClassDiary"],
  ["Mercado Pago", process.env.MERCADO_PAGO_ACCESS_TOKEN, "Assinaturas e cobrança"],
  ["Webhook Mercado Pago", process.env.MERCADO_PAGO_WEBHOOK_SECRET, "Validação de eventos de cobrança"],
  ["Bootstrap administrativo", process.env.ADMIN_BOOTSTRAP_TOKEN, "Operações administrativas protegidas"],
];

export default function IntegrationsAdminPage() {
  return (
    <main className="admin-page">
      <div className="admin-toolbar">
        <div><span className="badge">Infraestrutura</span><h1>Integrações</h1><p className="muted">Visibilidade segura do estado das integrações, sem revelar credenciais.</p></div>
      </div>
      <section className="admin-section">
        <table className="admin-table">
          <thead><tr><th>Integração</th><th>Uso</th><th>Status</th></tr></thead>
          <tbody>
            {integrations.map(([name, value, description]) => (
              <tr key={name}>
                <td><strong>{name}</strong></td>
                <td className="muted">{description}</td>
                <td><span className={value ? "admin-status ok" : "admin-status warn"}>{status(value)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
