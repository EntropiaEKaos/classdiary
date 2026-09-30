import Link from "next/link";
import { BookOpenCheck, CheckCircle2, GraduationCap, LineChart, School, ShieldCheck, Users } from "lucide-react";

export default function Home() {
  return (
    <>
      <header className="container topbar">
        <div className="brand"><span className="logo"><BookOpenCheck size={21}/></span> ClassDiary</div>
        <nav className="nav">
          <a href="#recursos">Recursos</a>
          <a href="#saas">Para escolas</a>
          <a href="#seguranca">Segurança</a>
          <Link className="btn btn-light" href="/login">Entrar</Link><Link className="btn btn-primary" href="/cadastro">Testar grátis</Link>
        </nav>
      </header>

      <main>
        <section className="container hero">
          <div>
            <span className="badge"><CheckCircle2 size={15}/> Diário de classe 100% online</span>
            <h1>A escola inteira em um só lugar.</h1>
            <p>Presença, notas, aulas, alunos, professores, comunicados e gestão escolar em uma plataforma SaaS moderna, rápida e preparada para crescer com cada instituição.</p>
            <div className="hero-actions">
              <Link className="btn btn-primary" href="/cadastro">Começar 14 dias grátis</Link>
              <a className="btn btn-light" href="#recursos">Conhecer recursos</a>
            </div>
          </div>

          <div className="preview" aria-label="Prévia do painel ClassDiary">
            <div className="preview-inner">
              <div className="fake-head"><div><strong>Bom dia, Coordenação</strong><div className="muted">Visão geral de hoje</div></div><span className="avatar"/></div>
              <div className="grid">
                <div className="card"><span className="muted">Alunos ativos</span><div className="metric">486</div><div className="progress"><span style={{width:"82%"}}/></div></div>
                <div className="card"><span className="muted">Presença hoje</span><div className="metric">94,2%</div><div className="progress"><span style={{width:"94%"}}/></div></div>
                <div className="card"><span className="muted">Turmas</span><div className="metric">18</div><div className="progress"><span style={{width:"68%"}}/></div></div>
                <div className="card"><span className="muted">Aulas registradas</span><div className="metric">72</div><div className="progress"><span style={{width:"76%"}}/></div></div>
              </div>
              <div className="card" style={{marginTop:12}}>
                <strong>Atividade recente</strong>
                <p className="muted">7º Ano A · Matemática · Chamada concluída</p>
                <p className="muted">8º Ano B · Ciências · Notas atualizadas</p>
                <p className="muted">3º Ano A · Comunicado enviado aos responsáveis</p>
              </div>
            </div>
          </div>
        </section>

        <section className="feature-section" id="recursos">
          <div className="container">
            <div className="section-title"><span className="badge">Feito para a rotina escolar</span><h2>Do diário do professor à gestão da escola</h2><p className="muted">Uma base única para reduzir retrabalho, organizar dados acadêmicos e aproximar escola, professores, alunos e responsáveis.</p></div>
            <div className="features">
              <div className="feature"><div className="feature-icon"><GraduationCap/></div><h3>Diário completo</h3><p className="muted">Aulas, conteúdo ministrado, tarefas, frequência, avaliações e notas por período.</p></div>
              <div className="feature"><div className="feature-icon"><Users/></div><h3>Perfis e permissões</h3><p className="muted">Administrador, coordenação, professor, secretaria, responsável e aluno, cada um com acesso próprio.</p></div>
              <div className="feature"><div className="feature-icon"><School/></div><h3>Multi-escola SaaS</h3><p className="muted">Cada instituição trabalha em ambiente isolado, com plano, assinatura, usuários e configurações próprias.</p></div>
              <div className="feature"><div className="feature-icon"><LineChart/></div><h3>Indicadores</h3><p className="muted">Acompanhe presença, desempenho, pendências de lançamento e evolução acadêmica.</p></div>
              <div className="feature" id="seguranca"><div className="feature-icon"><ShieldCheck/></div><h3>Auditoria e segurança</h3><p className="muted">Registro de ações críticas e estrutura preparada para políticas de acesso e LGPD.</p></div>
              <div className="feature" id="saas"><div className="feature-icon"><BookOpenCheck/></div><h3>Pronto para evoluir</h3><p className="muted">Arquitetura preparada para boletins, calendário, mensagens, documentos, integrações e aplicativo PWA.</p></div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
