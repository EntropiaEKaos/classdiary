import Link from "next/link";
import { Search } from "lucide-react";
import { activeOrganization, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { EmptyState } from "@/components/empty-state";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUser();
  const org = await activeOrganization();
  if (!org) redirect("/onboarding");

  const { q: raw } = await searchParams;
  const q = String(raw ?? "").trim();

  const [students, classes, subjects, people] = q.length >= 2
    ? await Promise.all([
        db.student.findMany({
          where: {
            organizationId: org.id,
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { registration: { contains: q, mode: "insensitive" } },
            ],
          },
          take: 12,
          orderBy: { name: "asc" },
        }),
        db.classGroup.findMany({
          where: { organizationId: org.id, name: { contains: q, mode: "insensitive" } },
          take: 10,
          orderBy: { name: "asc" },
        }),
        db.subject.findMany({
          where: { organizationId: org.id, name: { contains: q, mode: "insensitive" } },
          take: 10,
          orderBy: { name: "asc" },
        }),
        db.membership.findMany({
          where: {
            organizationId: org.id,
            user: {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            },
          },
          include: { user: true },
          take: 12,
          orderBy: { user: { name: "asc" } },
        }),
      ])
    : [[], [], [], []];

  const total = students.length + classes.length + subjects.length + people.length;

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <span className="badge">Busca global</span>
          <h1>Encontre qualquer coisa</h1>
          <div className="muted">Alunos, turmas, disciplinas e pessoas da escola.</div>
        </div>
      </div>

      <form className="global-search-page" action="/dashboard/buscar" method="get">
        <Search size={19}/>
        <input
          autoFocus
          name="q"
          defaultValue={q}
          placeholder="Digite nome, matrícula, turma, disciplina ou e-mail..."
        />
        <button className="btn btn-primary">Buscar</button>
      </form>

      {q.length < 2 ? (
        <EmptyState
          title="Comece digitando"
          description="Use pelo menos 2 caracteres para pesquisar a escola inteira."
        />
      ) : total === 0 ? (
        <EmptyState title="Nada encontrado" description={"Não encontramos resultados para “" + q + "”."}/>
      ) : (
        <div className="search-results-grid">
          {students.length ? (
            <section className="table-card">
              <h3>Alunos</h3>
              {students.map((item) => (
                <Link className="search-result" href="/dashboard/alunos" key={item.id}>
                  <strong>{item.name}</strong>
                  <span>Matrícula {item.registration}</span>
                </Link>
              ))}
            </section>
          ) : null}

          {classes.length ? (
            <section className="table-card">
              <h3>Turmas</h3>
              {classes.map((item) => (
                <Link className="search-result" href="/dashboard/turmas" key={item.id}>
                  <strong>{item.name}</strong>
                  <span>{item.gradeLevel ?? "Turma"}</span>
                </Link>
              ))}
            </section>
          ) : null}

          {subjects.length ? (
            <section className="table-card">
              <h3>Disciplinas</h3>
              {subjects.map((item) => (
                <Link className="search-result" href="/dashboard/disciplinas" key={item.id}>
                  <strong>{item.name}</strong>
                  <span>{item.code ?? "Disciplina"}</span>
                </Link>
              ))}
            </section>
          ) : null}

          {people.length ? (
            <section className="table-card">
              <h3>Pessoas</h3>
              {people.map((item) => (
                <div className="search-result" key={item.id}>
                  <strong>{item.user.name}</strong>
                  <span>{item.user.email} · {item.role}</span>
                </div>
              ))}
            </section>
          ) : null}
        </div>
      )}
    </main>
  );
}
