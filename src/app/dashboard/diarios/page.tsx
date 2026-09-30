import { createLessonAction } from "@/app/actions/academic";
import { db } from "@/lib/db";
import { requireModulePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { user, org } = await requireModulePermission("academic", "view");

  const roles = user.memberships
    .filter((membership) => membership.organizationId === org.id)
    .map((membership) => membership.role);

  const teacherOnly =
    roles.includes("TEACHER") &&
    !roles.some((role) => ["SCHOOL_ADMIN", "COORDINATOR"].includes(role));

  const [classSubjects, teachers, lessons] = await Promise.all([
    db.classSubject.findMany({
      where: {
        classGroup: { organizationId: org.id },
        subject: { organizationId: org.id },
        ...(teacherOnly ? { teacherId: user.id } : {}),
      },
      include: { classGroup: true, subject: true },
      orderBy: { classGroup: { name: "asc" } },
    }),
    teacherOnly
      ? Promise.resolve([])
      : db.membership.findMany({
          where: { organizationId: org.id, role: "TEACHER" },
          include: { user: true },
          orderBy: { user: { name: "asc" } },
        }),
    db.lesson.findMany({
      where: {
        classGroup: { organizationId: org.id },
        ...(teacherOnly ? { teacherId: user.id } : {}),
      },
      include: { classGroup: true, subject: true, teacher: true },
      orderBy: { lessonDate: "desc" },
      take: 50,
    }),
  ]);

  const classMap = new Map(classSubjects.map((link) => [link.classGroup.id, link.classGroup]));
  const subjectMap = new Map(classSubjects.map((link) => [link.subject.id, link.subject]));

  return <main className="main">
    <div className="page-head"><div><h1>Diário de classe</h1><div className="muted">Aulas e conteúdos ministrados</div></div></div>

    <section className="table-card">
      <form action={createLessonAction} className="form-grid">
        <select name="classGroupId">{[...classMap.values()].map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select name="subjectId">{[...subjectMap.values()].map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
        {teacherOnly
          ? <input type="hidden" name="teacherId" value={user.id}/>
          : <select name="teacherId">{teachers.map((item)=><option key={item.user.id} value={item.user.id}>{item.user.name}</option>)}</select>}
        <input name="title" required placeholder="Tema da aula"/>
        <input name="content" placeholder="Conteúdo ministrado"/>
        <input name="homework" placeholder="Tarefa de casa"/>
        <button className="btn btn-primary">Registrar aula</button>
      </form>
    </section>

    <section className="table-card" style={{marginTop:16}}>
      {lessons.map((lesson)=><div className="table-row" key={lesson.id}>
        <strong>{lesson.title}</strong>
        <span>{lesson.classGroup.name} · {lesson.subject.name}</span>
        <span>{lesson.teacher.name}</span>
      </div>)}
    </section>
  </main>;
}
