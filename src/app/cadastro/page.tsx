import Link from "next/link";
import { BookOpenCheck } from "lucide-react";
import { signupOwnerAction } from "@/app/actions/auth";
import { getPlatformSettings } from "@/lib/platform-settings";

export const dynamic = "force-dynamic";

export default async function Signup({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [params, settings] = await Promise.all([searchParams, getPlatformSettings()]);
  const message =
    params.error === "rate_limited"
      ? "Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente."
      : params.error === "closed"
        ? "Novos cadastros estão temporariamente fechados."
        : params.error
          ? "Não foi possível criar a conta com esses dados."
          : null;

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link href="/" className="brand">
          <span className="logo"><BookOpenCheck size={20} /></span>
          {settings.siteName}
        </Link>
        <div>
          <span className="badge">{settings.trialDays} dias grátis</span>
          <h1>Crie sua conta</h1>
          <p className="muted">Você será o administrador inicial da sua escola.</p>
        </div>
        {message ? <div className="alert">{message}</div> : null}
        {settings.publicSignupEnabled ? (
          <form action={signupOwnerAction} className="form-stack">
            <label>Seu nome<input name="name" required minLength={2} autoComplete="name" /></label>
            <label>E-mail<input name="email" type="email" required autoComplete="email" /></label>
            <label>Senha<input name="password" type="password" required minLength={10} autoComplete="new-password" /></label>
            <button className="btn btn-primary" type="submit">Começar período de teste</button>
          </form>
        ) : <div className="admin-note">O cadastro público foi desativado pelo administrador da plataforma.</div>}
        <p className="muted">Já tem conta? <Link href="/login">Entrar</Link></p>
      </section>
    </main>
  );
}
