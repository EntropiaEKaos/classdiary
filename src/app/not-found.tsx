import Link from "next/link";
export default function NotFound(){return <main className="auth-page"><section className="auth-card"><span className="badge">404</span><h1>Página não encontrada</h1><p className="muted">O endereço solicitado não existe ou não está disponível para seu perfil.</p><Link className="btn btn-primary" href="/dashboard">Voltar ao painel</Link></section></main>}
