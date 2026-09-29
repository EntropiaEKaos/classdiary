import Link from "next/link";
import { activeOrganization, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireUser();
  const org = await activeOrganization();
  if (!org) redirect("/onboarding");

  const [studentLinks, guardianLinks, settings] = await Promise.all([
    db.studentUser.findMany({
      where: { userId: user.id, student: { organizationId: org.id } },
      include: { student: true },
    }),
    db.studentGuardian.findMany({
      where: { userId: user.id, student: { organizationId: org.id } },
      include: { student: true },
    }),
    db.financialSettings.findUnique({ where: { organizationId: org.id } }),
  ]);

  const studentIds = [
    ...new Set([
      ...studentLinks.map((link) => link.studentId),
      ...guardianLinks.map((link) => link.studentId),
    ]),
  ];

  if (!studentIds.length) redirect("/dashboard");

  const students = await db.student.findMany({
    where: { id: { in: studentIds }, organizationId: org.id },
    include: {
      invoices: {
        include: {
          payments: true,
          receipts: true,
        },
        orderBy: { dueAt: "desc" },
      },
      receipts: {
        orderBy: { issuedAt: "desc" },
        take: 50,
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <span className="badge">Financeiro</span>
          <h1>Mensalidades e pagamentos</h1>
          <div className="muted">{org.name}</div>
        </div>
        <Link className="btn btn-light" href="/portal">Voltar ao portal</Link>
      </div>

      {settings?.pixKey ? (
        <section className="table-card">
          <h3>Pagamento via Pix</h3>
          <p className="muted">
            {settings.pixKeyType ?? "Chave"}: <strong>{settings.pixKey}</strong>
          </p>
          <p className="muted">
            Beneficiário: {settings.legalName ?? org.name}
          </p>
        </section>
      ) : null}

      {students.map((student) => {
        const open = student.invoices.filter((invoice) => invoice.status !== "PAID");
        const openBalance = open.reduce((total, invoice) => {
          const paid = invoice.payments.reduce(
            (sum, payment) => sum + Number(payment.amount),
            0,
          );
          const invoiceTotal =
            Number(invoice.amount) -
            Number(invoice.discountAmount) +
            Number(invoice.fineAmount) +
            Number(invoice.interestAmount);

          return total + Math.max(0, invoiceTotal - paid);
        }, 0);

        return (
          <section className="table-card" style={{ marginTop: 16 }} key={student.id}>
            <h2>{student.name}</h2>

            <div className="dashboard-grid">
              <div className="kpi">
                <span className="muted">Em aberto</span>
                <div className="value">{open.length}</div>
              </div>
              <div className="kpi">
                <span className="muted">Saldo</span>
                <div className="value">R$ {openBalance.toFixed(2)}</div>
              </div>
              <div className="kpi">
                <span className="muted">Recibos</span>
                <div className="value">{student.receipts.length}</div>
              </div>
            </div>

            <h3 style={{ marginTop: 20 }}>Cobranças</h3>
            {student.invoices.length === 0 ? (
              <p className="muted">Nenhuma cobrança encontrada.</p>
            ) : (
              student.invoices.map((invoice) => {
                const paid = invoice.payments.reduce(
                  (sum, payment) => sum + Number(payment.amount),
                  0,
                );
                const total =
                  Number(invoice.amount) -
                  Number(invoice.discountAmount) +
                  Number(invoice.fineAmount) +
                  Number(invoice.interestAmount);

                return (
                  <div className="notice" key={invoice.id}>
                    <strong>{invoice.description}</strong>
                    <div className="muted">
                      Vencimento {invoice.dueAt.toLocaleDateString("pt-BR")} · {invoice.status}
                    </div>
                    <div>
                      Total R$ {total.toFixed(2)} · Pago R$ {paid.toFixed(2)}
                    </div>
                    {invoice.receipts.map((receipt) => (
                      <a
                        className="btn btn-light"
                        href={"/api/recibos/" + receipt.id}
                        target="_blank"
                        key={receipt.id}
                        style={{ marginTop: 8 }}
                      >
                        Recibo {receipt.number}
                      </a>
                    ))}
                  </div>
                );
              })
            )}
          </section>
        );
      })}
    </main>
  );
}
