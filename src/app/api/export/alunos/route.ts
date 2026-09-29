import { NextResponse } from "next/server";
import { requireSchoolRole } from "@/lib/rbac";
import { db } from "@/lib/db";

function escapeCsv(value: string) {
  return '"' + value.replaceAll('"', '""') + '"';
}

export async function GET() {
  const { org } = await requireSchoolRole(["SCHOOL_ADMIN", "COORDINATOR", "SECRETARY"]);

  const students = await db.student.findMany({
    where: { organizationId: org.id },
    include: {
      enrollments: {
        where: { active: true },
        include: { classGroup: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const rows = [
    ["Nome", "Matrícula", "Turma", "Responsável", "Telefone"],
    ...students.map((student) => [
      student.name,
      student.registration,
      student.enrollments[0]?.classGroup.name ?? "",
      student.guardianName ?? "",
      student.guardianPhone ?? "",
    ]),
  ];

  const body = "\uFEFF" + rows.map((row) => row.map(escapeCsv).join(",")).join("\n");

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="classdiary-alunos.csv"',
    },
  });
}
