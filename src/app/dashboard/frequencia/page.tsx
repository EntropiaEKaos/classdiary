import { markAttendanceAction } from "@/app/actions/academic";
import { requireSchoolRole } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { user, org } = await requireSchoolRole([
    "SCHOOL_ADMIN",
    "COORDINATOR",
    "TEACHER",
  ]);

  const teacherOnly = user.memberships.some(
    (membership) =>
      membership.organizationId === org.id && membership.role === "TEACHER",
  ) && !user.memberships.some(
    (membership) =>
      membership.organizationId === org.id &&
      ["SCHOOL_ADMIN", "COORDINATOR"].includes(membership.role),
  );

  const lessons = await db.lesson.findMany({
    where: {
      classGroup: { organizationId: org.id },
      ...(teacherOnly ? { teacherId: user.id } : {}),
    },
    include: {
      classGroup: {
        include: {
          enrollments: {
            where: { active: true },
            include: { student: true },
          },
        },
      },
      subject: true,
      attendance: true,
    },
    orderBy: { lessonDate: "desc" },
    take: 20,
  });

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Frequência</h1>
          <div className="muted">Chamada por aula</div>
        </div>
      </div>

      {lessons.length === 0 ? (
        <section className="table-card">
          <p className="muted">Registre uma aula antes de fazer a chamada.</p>
        </section>
      ) : (
        lessons.map((lesson) => (
          <section className="table-card" style={{ marginBottom: 16 }} key={lesson.id}>
            <h3>
              {lesson.classGroup.name} · {lesson.subject.name} · {lesson.title}
            </h3>

            {lesson.classGroup.enrollments.map((enrollment) => {
              const current =
                lesson.attendance.find(
                  (attendance) =>
                    attendance.studentId === enrollment.studentId,
                )?.status ?? "PRESENT";

              return (
                <form
                  action={markAttendanceAction}
                  className="table-row"
                  key={enrollment.id}
                >
                  <strong>{enrollment.student.name}</strong>
                  <input type="hidden" name="lessonId" value={lesson.id} />
                  <input
                    type="hidden"
                    name="studentId"
                    value={enrollment.studentId}
                  />
                  <select name="status" defaultValue={current}>
                    <option value="PRESENT">Presente</option>
                    <option value="ABSENT">Falta</option>
                    <option value="LATE">Atraso</option>
                    <option value="EXCUSED">Justificada</option>
                  </select>
                  <button className="btn btn-light">Salvar</button>
                </form>
              );
            })}
          </section>
        ))
      )}
    </main>
  );
}
