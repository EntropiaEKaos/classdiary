"use server";
import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {z} from "zod";
import {db} from "@/lib/db";
import {activeOrganization,requireUser} from "@/lib/auth";

async function ctx(){const user=await requireUser();const org=await activeOrganization();if(!org)redirect("/onboarding");return {user,org};}

export async function enrollStudentAction(fd:FormData){
  const {user,org}=await ctx();
  const p=z.object({studentId:z.string().min(1),classGroupId:z.string().min(1)}).parse({studentId:String(fd.get("studentId")??""),classGroupId:String(fd.get("classGroupId")??"")});
  const [student,group]=await Promise.all([db.student.findFirst({where:{id:p.studentId,organizationId:org.id}}),db.classGroup.findFirst({where:{id:p.classGroupId,organizationId:org.id}})]);
  if(!student||!group)throw new Error("Aluno ou turma inválidos");
  const enrollment=await db.enrollment.upsert({where:{studentId_classGroupId:{studentId:student.id,classGroupId:group.id}},update:{active:true},create:{studentId:student.id,classGroupId:group.id}});
  await db.auditLog.create({data:{userId:user.id,organizationId:org.id,action:"UPSERT",entity:"Enrollment",entityId:enrollment.id}});
  revalidatePath("/dashboard/matriculas");revalidatePath("/dashboard/turmas");
}

export async function createSubjectAction(fd:FormData){
  const {user,org}=await ctx();
  const p=z.object({name:z.string().min(2),code:z.string().optional()}).parse({name:String(fd.get("name")??"").trim(),code:String(fd.get("code")??"").trim()});
  const subject=await db.subject.create({data:{organizationId:org.id,name:p.name,code:p.code||null}});
  await db.auditLog.create({data:{userId:user.id,organizationId:org.id,action:"CREATE",entity:"Subject",entityId:subject.id}});
  revalidatePath("/dashboard/disciplinas");
}

export async function assignSubjectAction(fd:FormData){
  const {user,org}=await ctx();
  const p=z.object({classGroupId:z.string().min(1),subjectId:z.string().min(1),teacherId:z.string().optional()}).parse({classGroupId:String(fd.get("classGroupId")??""),subjectId:String(fd.get("subjectId")??""),teacherId:String(fd.get("teacherId")??"")});
  const [group,subject]=await Promise.all([db.classGroup.findFirst({where:{id:p.classGroupId,organizationId:org.id}}),db.subject.findFirst({where:{id:p.subjectId,organizationId:org.id}})]);
  if(!group||!subject)throw new Error("Turma ou disciplina inválida");
  const link=await db.classSubject.upsert({where:{classGroupId_subjectId:{classGroupId:group.id,subjectId:subject.id}},update:{teacherId:p.teacherId||null},create:{classGroupId:group.id,subjectId:subject.id,teacherId:p.teacherId||null}});
  await db.auditLog.create({data:{userId:user.id,organizationId:org.id,action:"UPSERT",entity:"ClassSubject",entityId:link.id}});
  revalidatePath("/dashboard/disciplinas");
}

export async function createLessonAction(fd:FormData){
  const {user,org}=await ctx();
  const p=z.object({classGroupId:z.string().min(1),subjectId:z.string().min(1),teacherId:z.string().min(1),title:z.string().min(2),content:z.string().optional(),homework:z.string().optional()}).parse({classGroupId:String(fd.get("classGroupId")??""),subjectId:String(fd.get("subjectId")??""),teacherId:String(fd.get("teacherId")??""),title:String(fd.get("title")??"").trim(),content:String(fd.get("content")??"").trim(),homework:String(fd.get("homework")??"").trim()});
  const group=await db.classGroup.findFirst({where:{id:p.classGroupId,organizationId:org.id}});if(!group)throw new Error("Turma inválida");
  const lesson=await db.lesson.create({data:{...p,content:p.content||null,homework:p.homework||null,lessonDate:new Date()}});
  await db.auditLog.create({data:{userId:user.id,organizationId:org.id,action:"CREATE",entity:"Lesson",entityId:lesson.id}});
  revalidatePath("/dashboard/diarios");revalidatePath("/dashboard");
}

export async function markAttendanceAction(fd:FormData){
  const {user,org}=await ctx();
  const p=z.object({lessonId:z.string().min(1),studentId:z.string().min(1),status:z.enum(["PRESENT","ABSENT","LATE","EXCUSED"])}).parse({lessonId:String(fd.get("lessonId")??""),studentId:String(fd.get("studentId")??""),status:String(fd.get("status")??"")});
  const lesson=await db.lesson.findFirst({where:{id:p.lessonId,classGroup:{organizationId:org.id}}});if(!lesson)throw new Error("Aula inválida");
  const attendance=await db.attendance.upsert({where:{lessonId_studentId:{lessonId:p.lessonId,studentId:p.studentId}},update:{status:p.status},create:p});
  await db.auditLog.create({data:{userId:user.id,organizationId:org.id,action:"UPSERT",entity:"Attendance",entityId:attendance.id}});
  revalidatePath("/dashboard/frequencia");
}

export async function createGradeAction(fd:FormData){
  const {user,org}=await ctx();
  const p=z.object({studentId:z.string().min(1),subjectId:z.string().min(1),period:z.string().min(1),label:z.string().min(1),value:z.coerce.number().min(0).max(100),maxValue:z.coerce.number().positive().max(100),weight:z.coerce.number().positive().max(100)}).parse({studentId:String(fd.get("studentId")??""),subjectId:String(fd.get("subjectId")??""),period:String(fd.get("period")??"").trim(),label:String(fd.get("label")??"").trim(),value:fd.get("value"),maxValue:fd.get("maxValue")||10,weight:fd.get("weight")||1});
  const student=await db.student.findFirst({where:{id:p.studentId,organizationId:org.id}});if(!student)throw new Error("Aluno inválido");
  const year=await db.schoolYear.findFirst({where:{organizationId:org.id,active:true}});
  if(year&&await db.periodClosure.findUnique({where:{organizationId_schoolYearId_period:{organizationId:org.id,schoolYearId:year.id,period:p.period}}})) throw new Error("Este período já está fechado para lançamento de notas");
  const grade=await db.grade.create({data:{...p,authorId:user.id}});
  await db.auditLog.create({data:{userId:user.id,organizationId:org.id,action:"CREATE",entity:"Grade",entityId:grade.id}});
  revalidatePath("/dashboard/notas");
}

export async function closePeriodAction(fd:FormData){
  const {user,org}=await ctx();
  const period=z.string().min(1).parse(String(fd.get("period")??"").trim());
  const year=await db.schoolYear.findFirst({where:{organizationId:org.id,active:true}});
  if(!year) throw new Error("Nenhum ano letivo ativo");
  const closure=await db.periodClosure.upsert({
    where:{organizationId_schoolYearId_period:{organizationId:org.id,schoolYearId:year.id,period}},
    update:{closedAt:new Date(),closedById:user.id},
    create:{organizationId:org.id,schoolYearId:year.id,period,closedById:user.id}
  });
  await db.auditLog.create({data:{userId:user.id,organizationId:org.id,action:"CLOSE",entity:"AcademicPeriod",entityId:closure.id,metadata:{period}}});
  revalidatePath("/dashboard/boletins");
  revalidatePath("/dashboard/notas");
}
