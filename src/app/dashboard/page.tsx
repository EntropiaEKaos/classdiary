import { BookOpenCheck, CalendarDays, ClipboardCheck, GraduationCap, LayoutDashboard, Megaphone, School, Settings, Users } from "lucide-react";

const menu = [
  ["Visão geral", LayoutDashboard],
  ["Alunos", GraduationCap],
  ["Turmas", School],
  ["Professores", Users],
  ["Diários", BookOpenCheck],
  ["Frequência", ClipboardCheck],
  ["Calendário", CalendarDays],
  ["Comunicados", Megaphone],
  ["Configurações", Settings],
] as const;

export default function Dashboard() {
  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand"><span className="logo"><BookOpenCheck size={20}/></span> ClassDiary</div>
        {menu.map(([label, Icon], index) => <a className={`side-link ${index===0?"active":""}`} href="#" key={label}><Icon size={18}/>{label}</a>)}
      </aside>
      <main className="main">
        <div className="page-head">
          <div><h1>Visão geral</h1><div className="muted">Terça-feira, 29 de setembro · Ano letivo 2026</div></div>
          <button className="btn btn-primary">+ Novo registro</button>
        </div>
        <div className="dashboard-grid">
          <div className="kpi"><span className="muted">Alunos ativos</span><div className="value">486</div><span className="status">+12 este mês</span></div>
          <div className="kpi"><span className="muted">Presença hoje</span><div className="value">94,2%</div><span className="status">Dentro da meta</span></div>
          <div className="kpi"><span className="muted">Turmas ativas</span><div className="value">18</div><span className="status">Manhã e tarde</span></div>
          <div className="kpi"><span className="muted">Pendências</span><div className="value">7</div><span className="status">Requer atenção</span></div>
        </div>
        <div className="content-grid">
          <section className="table-card">
            <div className="page-head" style={{marginBottom:6}}><div><strong>Aulas de hoje</strong><div className="muted">Acompanhamento dos registros docentes</div></div></div>
            <div className="table-row"><strong>7º Ano A · Matemática</strong><span>08:00</span><span className="status">Concluída</span></div>
            <div className="table-row"><strong>8º Ano B · Ciências</strong><span>09:40</span><span className="status">Concluída</span></div>
            <div className="table-row"><strong>6º Ano C · Português</strong><span>11:20</span><span className="status">Em andamento</span></div>
            <div className="table-row"><strong>9º Ano A · História</strong><span>14:00</span><span className="status">Agendada</span></div>
          </section>
          <section className="table-card">
            <strong>Comunicados recentes</strong>
            <div className="notice"><b>Reunião de responsáveis</b><div className="muted">Enviado para 8 turmas · hoje</div></div>
            <div className="notice"><b>Semana de avaliações</b><div className="muted">Toda a escola · ontem</div></div>
            <div className="notice"><b>Atualização do calendário</b><div className="muted">Equipe pedagógica · 26 set</div></div>
          </section>
        </div>
      </main>
    </div>
  );
}
