import { importQuestionBankCsvAction } from "@/app/actions/assessments";
import { requireModulePermission } from "@/lib/rbac";

export const dynamic="force-dynamic";

export default async function Page(){
  await requireModulePermission("assessments","create");
  return <main className="main">
    <div className="page-head"><div><h1>Importar questões</h1><div className="muted">Carga em massa para o banco de questões.</div></div></div>
    <section className="table-card">
      <p className="muted">CSV: type,prompt,correctAnswer,difficulty,tags,maxScore. Tags separadas por |. Máximo 1000 linhas.</p>
      <form action={importQuestionBankCsvAction} className="form-stack">
        <textarea name="csv" rows={18} required placeholder={"type,prompt,correctAnswer,difficulty,tags,maxScore\nTRUE_FALSE,A água ferve a 100°C?,TRUE,EASY,ciencias|temperatura,1"}/>
        <button className="btn btn-primary">Importar questões</button>
      </form>
    </section>
  </main>;
}
