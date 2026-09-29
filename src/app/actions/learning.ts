"use server";
import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {z} from "zod";
import {db} from "@/lib/db";
import {requireSchoolRole} from "@/lib/rbac";
import {requireUser,activeOrganization} from "@/lib/auth";

export async function createAssignmentAction(fd:FormData){
  const {user,org}=await requireSchoolRole(["SCHOOL_ADMIN","COORDINATOR","TEACHER"]);
  const p=z.object({
    classGroupId:z.string().min(1),subjectId:z.string().min(1),title:z.string().min(2),
    description:z.string().optional(),dueAt:z.string().optional()
  }).parse({
    classGroupId:String(fd.get("classGroupId")??""),subjectId:String(fd.get("subjectId")??""),
    title:String(fd.get("title")??"").trim(),description:String(fd.get("description")??"").trim(),
    dueAt:String(fd.get("dueAt")??"")
  });
  await db.assignment.create({data:{
    organizationId:org.id,classGroupId:p.classGroupId,subjectId:p.subjectId,authorId:user.id,
    title:p.title,description:p.description||null,dueAt:p.dueAt?new Date(p.dueAt):null
  }});
  revalidatePath("/dashboard/atividades");
}

export async function submitAssignmentAction(fd:FormData){
  const user=await requireUser();const org=await activeOrganization();if(!org)redirect("/login");
  const assignmentId=String(fd.get("assignmentId")??"");
  const content=String(fd.get("content")??"").trim();
  const fileUrl=String(fd.get("fileUrl")??"").trim();
  if(fileUrl && !z.string().url().safeParse(fileUrl).success) throw new Error("URL do anexo inválida");
  const link=await db.studentUser.findFirst({where:{userId:user.id,student:{organizationId:org.id}},include:{student:true}});
  if(!link)throw new Error("Perfil de aluno não encontrado");
  const assignment=await db.assignment.findFirst({where:{id:assignmentId,organizationId:org.id,classGroup:{enrollments:{some:{studentId:link.studentId,active:true}}}}});
  if(!assignment)throw new Error("Atividade inválida");
  await db.assignmentSubmission.upsert({
    where:{assignmentId_studentId:{assignmentId,studentId:link.studentId}},
    update:{content,fileUrl:fileUrl||null,userId:user.id,submittedAt:new Date()},
    create:{assignmentId,studentId:link.studentId,userId:user.id,content,fileUrl:fileUrl||null}
  });
  revalidatePath("/aluno");
}

export async function createRecoveryAction(fd:FormData){
  const {org}=await requireSchoolRole(["SCHOOL_ADMIN","COORDINATOR","TEACHER"]);
  const p=z.object({studentId:z.string().min(1),subjectId:z.string().min(1),period:z.string().min(1),value:z.coerce.number().min(0).max(10),notes:z.string().optional()}).parse({
    studentId:String(fd.get("studentId")??""),subjectId:String(fd.get("subjectId")??""),
    period:String(fd.get("period")??"").trim(),value:fd.get("value"),notes:String(fd.get("notes")??"").trim()
  });
  const student=await db.student.findFirst({where:{id:p.studentId,organizationId:org.id}});
  if(!student)throw new Error("Aluno inválido");
  await db.recoveryGrade.create({data:{...p,notes:p.notes||null}});
  revalidatePath("/dashboard/recuperacao");
}

export async function createCouncilDecisionAction(fd:FormData){
  const {user,org}=await requireSchoolRole(["SCHOOL_ADMIN","COORDINATOR"]);
  const year=await db.schoolYear.findFirst({where:{organizationId:org.id,active:true}});
  if(!year)throw new Error("Ano letivo não encontrado");
  const p=z.object({studentId:z.string().min(1),period:z.string().min(1),decision:z.string().min(2),notes:z.string().optional()}).parse({
    studentId:String(fd.get("studentId")??""),period:String(fd.get("period")??"").trim(),
    decision:String(fd.get("decision")??"").trim(),notes:String(fd.get("notes")??"").trim()
  });
  await db.councilDecision.create({data:{organizationId:org.id,studentId:p.studentId,authorId:user.id,schoolYearId:year.id,period:p.period,decision:p.decision,notes:p.notes||null}});
  revalidatePath("/dashboard/conselho");
}

export async function createAcademicDocumentAction(fd:FormData){
  const {user,org}=await requireSchoolRole(["SCHOOL_ADMIN","COORDINATOR","SECRETARY"]);
  const p=z.object({studentId:z.string().min(1),type:z.string().min(2),title:z.string().min(2)}).parse({
    studentId:String(fd.get("studentId")??""),type:String(fd.get("type")??"").trim(),title:String(fd.get("title")??"").trim()
  });
  await db.academicDocument.create({data:{organizationId:org.id,studentId:p.studentId,authorId:user.id,type:p.type,title:p.title,payload:{issuedAt:new Date().toISOString()}}});
  revalidatePath("/dashboard/documentos");
}
