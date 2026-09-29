import Link from "next/link";
import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";
export const dynamic="force-dynamic";
export default async function Page(){const {org}=await requireModulePermission("pedagogy","view");const students=await db.student.findMany({where:{organizationId:org.id,active:true},include:{competencyAssessments:true,pedagogicalInterventions:true,pedagogicalObservations:true},orderBy:{name:"asc"}});
return <main className="main"><div className="page-head"><div><h1>Evolução longitudinal</h1><div className="muted">Histórico pedagógico acumulado por aluno.</div></div></div><section className="table-card">{students.map(s=><div className="table-row" key={s.id}><strong><Link href={"/dashboard/evolucao/"+s.id}>{s.name}</Link></strong><span>{s.competencyAssessments.length} avaliações · {s.pedagogicalInterventions.length} intervenções</span><span>{s.pedagogicalObservations.length} observações</span></div>)}</section></main>}
