import { calculateAnnualResultAction } from "@/app/actions/secretary";
import { requireSchoolRole } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page(){
  const {org}=await requireSchoolRole(["SCHOOL_ADMIN","COORDINATOR"]);
  const year=await db.schoolYear.findFirst({where:{organizationId:org.id,active:true}});
  const [students,results]=await Promise.all([
    db.student.findMany({where:{organizationId:org.id,active:true},orderBy:{name:"asc"}}),
    year?db.annualResult.findMany({where:{organizationId:org.id,schoolYearId:year.id},include:{student:true},orderBy:{student:{name:"asc"}}}):Promise.resolve([])
  ]);
  return <main className="main"><div className="page-head"><div><h1>Resultados anuais</h1><div className="muted">Promoção/retenção conforme nota mínima e frequência configuradas.</div></div></div>
    <section className="table-card"><form action={calculateAnnualResultAction} className="form-grid compact">
      <select name="studentId">{students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <button className="btn btn-primary">Calcular resultado</button>
    </form></section>
    <section className="table-card" style={{marginTop:16}}>{results.map(r=><div className="table-row" key={r.id}><strong>{r.student.name}</strong><span>Média {r.finalAverage?String(r.finalAverage):"0"} · Freq. {r.attendancePercent?String(r.attendancePercent):"100"}%</span><span className="status">{r.status}</span></div>)}</section>
  </main>;
}
