import { updateFinancialSettingsAction } from "@/app/actions/finance";
import { requireSchoolRole } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page(){
  const {org}=await requireSchoolRole(["SCHOOL_ADMIN"]);
  const settings=await db.financialSettings.findUnique({where:{organizationId:org.id}});
  return <main className="main"><div className="page-head"><div><h1>Configurações financeiras</h1><div className="muted">Pix, vencimentos, multa, juros e numeração de recibos.</div></div></div>
    <section className="table-card"><form action={updateFinancialSettingsAction} className="form-grid">
      <input name="legalName" placeholder="Razão social" defaultValue={settings?.legalName??""}/>
      <input name="document" placeholder="CNPJ/CPF" defaultValue={settings?.document??""}/>
      <select name="pixKeyType" defaultValue={settings?.pixKeyType??""}><option value="">Tipo de chave Pix</option><option value="CPF">CPF</option><option value="CNPJ">CNPJ</option><option value="EMAIL">E-mail</option><option value="PHONE">Telefone</option><option value="RANDOM">Aleatória</option></select>
      <input name="pixKey" placeholder="Chave Pix" defaultValue={settings?.pixKey??""}/>
      <input name="receiptPrefix" required placeholder="Prefixo recibo" defaultValue={settings?.receiptPrefix??"REC"}/>
      <input name="defaultDueDay" type="number" min="1" max="28" defaultValue={settings?.defaultDueDay??10}/>
      <input name="lateFeePercent" type="number" step=".01" min="0" max="100" defaultValue={String(settings?.lateFeePercent??2)}/>
      <input name="monthlyInterestPercent" type="number" step=".01" min="0" max="100" defaultValue={String(settings?.monthlyInterestPercent??1)}/>
      <button className="btn btn-primary">Salvar configurações</button>
    </form></section>
  </main>;
}
