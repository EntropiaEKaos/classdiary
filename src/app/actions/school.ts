"use server";import {redirect} from "next/navigation";import {revalidatePath} from "next/cache";import {z} from "zod";import {db} from "@/lib/db";import {requireUser} from "@/lib/auth";import {requireSchoolRole} from "@/lib/rbac";import type { Prisma } from "../../../generated/prisma/client";import {assertTrustedMutationOrigin} from "@/lib/security";import {withPlanCapacity} from "@/lib/plans";import {getPlatformSettings} from "@/lib/platform-settings";
export async function createSchoolAction(fd:FormData){
  await assertTrustedMutationOrigin();
  const u=await requireUser();
  const platformSettings=await getPlatformSettings();
  const trialDays=platformSettings.trialDays;
  const p=z.object({
    name:z.string().min(2),
    slug:z.string().min(2).regex(/^[a-z0-9-]+$/),
    email:z.string().email().optional().or(z.literal("")),
    phone:z.string().optional(),
    plan:z.enum(["STARTER","PRO","ENTERPRISE"])
  }).parse({
    name:String(fd.get("name")??"").trim(),
    slug:String(fd.get("slug")??"").trim().toLowerCase(),
    email:String(fd.get("email")??"").trim().toLowerCase(),
    phone:String(fd.get("phone")??"").trim(),
    plan:String(fd.get("plan")??"STARTER")
  });

  const alreadyOwnsSchool=await db.membership.findFirst({
    where:{userId:u.id,role:"SCHOOL_ADMIN",organization:{slug:{not:"classdiary-platform"}}}
  });
  if(alreadyOwnsSchool) redirect("/dashboard");

  const planSeats=p.plan==="STARTER"?30:p.plan==="PRO"?150:300;
  const y=new Date().getFullYear();

  const org=await db.organization.create({
    data:{
      name:p.name,
      slug:p.slug,
      email:p.email||null,
      phone:p.phone||null,
      memberships:{create:{userId:u.id,role:"SCHOOL_ADMIN"}},
      subscription:{
        create:{
          plan:p.plan,
          status:"TRIAL",
          seats:planSeats,
          trialEndsAt:new Date(Date.now()+trialDays*86400000)
        }
      },
      schoolYears:{
        create:{
          name:String(y),
          startsAt:new Date(y,0,1),
          endsAt:new Date(y,11,31),
          active:true
        }
      }
    }
  });

  await db.auditLog.create({
    data:{
      userId:u.id,
      organizationId:org.id,
      action:"CREATE",
      entity:"Organization",
      entityId:org.id,
      metadata:{source:"SELF_SERVICE_ONBOARDING",plan:p.plan,trialDays}
    }
  });
  redirect("/dashboard");
}
export async function createStudentAction(fd:FormData){await assertTrustedMutationOrigin();const {user:u,org}=await requireSchoolRole(["SCHOOL_ADMIN","COORDINATOR","SECRETARY"]);const p=z.object({name:z.string().min(2),registration:z.string().min(1),guardianName:z.string().optional(),guardianPhone:z.string().optional()}).parse({name:String(fd.get("name")??"").trim(),registration:String(fd.get("registration")??"").trim(),guardianName:String(fd.get("guardianName")??"").trim(),guardianPhone:String(fd.get("guardianPhone")??"").trim()});await withPlanCapacity(org.id,"students",async(tx)=>{const created=await tx.student.create({data:{organizationId:org.id,name:p.name,registration:p.registration,guardianName:p.guardianName||null,guardianPhone:p.guardianPhone||null}});await tx.auditLog.create({data:{userId:u.id,organizationId:org.id,action:"CREATE",entity:"Student",entityId:created.id}});return created;});revalidatePath("/dashboard/alunos");revalidatePath("/dashboard");}
export async function createClassAction(fd:FormData){await assertTrustedMutationOrigin();const {user:u,org}=await requireSchoolRole(["SCHOOL_ADMIN","COORDINATOR","SECRETARY"]);const year=await db.schoolYear.findFirst({where:{organizationId:org.id,active:true}});if(!year)throw new Error("Nenhum ano letivo ativo");const p=z.object({name:z.string().min(1),gradeLevel:z.string().optional(),shift:z.string().optional(),room:z.string().optional()}).parse({name:String(fd.get("name")??"").trim(),gradeLevel:String(fd.get("gradeLevel")??"").trim(),shift:String(fd.get("shift")??"").trim(),room:String(fd.get("room")??"").trim()});await withPlanCapacity(org.id,"classes",async(tx)=>{const created=await tx.classGroup.create({data:{organizationId:org.id,schoolYearId:year.id,...p}});await tx.auditLog.create({data:{userId:u.id,organizationId:org.id,action:"CREATE",entity:"ClassGroup",entityId:created.id}});return created;});revalidatePath("/dashboard/turmas");revalidatePath("/dashboard");}

export async function createTeacherAction(fd:FormData){
  await assertTrustedMutationOrigin();
  const {user:actor,org}=await requireSchoolRole(["SCHOOL_ADMIN","COORDINATOR"]);
  const p=z.object({name:z.string().min(2),email:z.string().email()}).parse({name:String(fd.get("name")??"").trim(),email:String(fd.get("email")??"").trim().toLowerCase()});
  const existing=await db.user.findUnique({where:{email:p.email}});
  if(existing&&!existing.active) throw new Error("Esta conta está desativada e não pode ser reativada pela escola.");

  const persist=async(tx:Prisma.TransactionClient)=>{
    const current=await tx.user.findUnique({where:{email:p.email}});
    if(current&&!current.active) throw new Error("Esta conta está desativada e não pode ser reativada pela escola.");

    const teacher=current
      ? await tx.user.update({where:{id:current.id},data:{...(!current.name?{name:p.name}:{})}})
      : await tx.user.create({data:{name:p.name,email:p.email,active:true}});

    await tx.membership.upsert({where:{organizationId_userId_role:{organizationId:org.id,userId:teacher.id,role:"TEACHER"}},update:{},create:{organizationId:org.id,userId:teacher.id,role:"TEACHER"}});
    await tx.auditLog.create({data:{userId:actor.id,organizationId:org.id,action:"UPSERT",entity:"Teacher",entityId:teacher.id}});
  };

  await withPlanCapacity(
    org.id,
    "seats",
    persist,
    async(tx)=>{
      const user=await tx.user.findUnique({where:{email:p.email},select:{id:true,active:true}});
      if(user&&!user.active) throw new Error("Esta conta está desativada e não pode ser reativada pela escola.");
      if(!user) return 1;
      const seat=await tx.membership.findFirst({where:{organizationId:org.id,userId:user.id},select:{id:true}});
      return seat?0:1;
    }
  );
  revalidatePath("/dashboard/professores");revalidatePath("/dashboard");
}
