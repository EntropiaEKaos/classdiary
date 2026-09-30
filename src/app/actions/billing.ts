"use server";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {db} from "@/lib/db";
import {requirePlatformOwner} from "@/lib/auth";
import {assertTrustedMutationOrigin} from "@/lib/security";
import { PLAN_CATALOG } from "@/lib/plans";

export async function updateSubscriptionAction(fd:FormData){
  await assertTrustedMutationOrigin();
  const user=await requirePlatformOwner();
  const p=z.object({
    organizationId:z.string().min(1),
    plan:z.enum(["STARTER","PRO","ENTERPRISE"]),
    status:z.enum(["TRIAL","ACTIVE","PAST_DUE","CANCELED"]),
    seats:z.coerce.number().int().min(1).max(100000)
  }).parse({
    organizationId:String(fd.get("organizationId")??""),
    plan:String(fd.get("plan")??"STARTER"),
    status:String(fd.get("status")??"TRIAL"),
    seats:fd.get("seats")??20
  });

  const org=await db.organization.findFirst({
    where:{id:p.organizationId,slug:{not:"classdiary-platform"}}
  });
  if(!org) throw new Error("Organização inválida");

  const [activeStudents,classes,memberships]=await Promise.all([
    db.student.count({where:{organizationId:p.organizationId,active:true}}),
    db.classGroup.count({where:{organizationId:p.organizationId}}),
    db.membership.findMany({
      where:{organizationId:p.organizationId,user:{active:true}},
      distinct:["userId"],
      select:{userId:true}
    })
  ]);

  const target=PLAN_CATALOG[p.plan];
  if(target.maxStudents!==null&&activeStudents>target.maxStudents){
    throw new Error(`A escola possui ${activeStudents} alunos ativos e não cabe no plano ${target.label}.`);
  }
  if(target.maxClasses!==null&&classes>target.maxClasses){
    throw new Error(`A escola possui ${classes} turmas e não cabe no plano ${target.label}.`);
  }
  if(target.maxSeats!==null&&p.seats>target.maxSeats){
    throw new Error(`O plano ${target.label} permite no máximo ${target.maxSeats} usuários.`);
  }
  if(memberships.length>p.seats){
    throw new Error(`Existem ${memberships.length} usuários ativos. O limite contratado não pode ser menor que o uso atual.`);
  }

  const subscription=await db.subscription.upsert({
    where:{organizationId:p.organizationId},
    update:{plan:p.plan,status:p.status,seats:p.seats},
    create:{organizationId:p.organizationId,plan:p.plan,status:p.status,seats:p.seats}
  });

  await db.auditLog.create({data:{
    userId:user.id,organizationId:p.organizationId,action:"UPDATE",
    entity:"Subscription",entityId:subscription.id,
    metadata:{plan:p.plan,status:p.status,seats:p.seats}
  }});
  revalidatePath("/super-admin");
}

export async function toggleOrganizationAction(fd:FormData){
  await assertTrustedMutationOrigin();
  const user=await requirePlatformOwner();
  const organizationId=z.string().min(1).parse(String(fd.get("organizationId")??""));
  const org=await db.organization.findUnique({where:{id:organizationId}});
  if(!org||org.slug==="classdiary-platform") throw new Error("Organização inválida");
  await db.organization.update({where:{id:organizationId},data:{active:!org.active}});
  await db.auditLog.create({data:{userId:user.id,organizationId,action:org.active?"BLOCK":"UNBLOCK",entity:"Organization",entityId:organizationId}});
  revalidatePath("/super-admin");
}
