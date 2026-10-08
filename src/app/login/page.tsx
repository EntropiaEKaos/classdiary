import Link from "next/link";
import { BookOpenCheck } from "lucide-react";
import { loginAction } from "@/app/actions/auth";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  const message =
    params.error === "rate_limited"
      ? "Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente."
      : params.error
        ? "E-mail ou senha inválidos."
        : null;

  return (
    <main className="auth-page">
      <div className="auth-theme-control"><ThemeToggle showLabel /></div>
      <section className="auth-card">
        <Link href="/" className="brand">
          <span className="logo">
            <BookOpenCheck size={20} />
          </span>
          EduSync
        </Link>

        <div>
          <h1>Entrar</h1>
          <p className="muted">
            Acesse sua escola e continue de onde parou.
          </p>
        </div>

        {message ? <div className="alert">{message}</div> : null}

        <form action={loginAction} className="form-stack">
          <label>
            E-mail
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
            />
          </label>

          <label>
            Senha
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="current-password"
            />
          </label>

          <button className="btn btn-primary" type="submit">
            Entrar no EduSync
          </button>
        </form>
      </section>
    </main>
  );
}
