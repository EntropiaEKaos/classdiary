"use server";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {db} from "@/lib/db";
import {requirePlatformOwner} from "@/lib/auth";

export async function updateSubscriptionAction(fd:FormData){
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
  const user=await requirePlatformOwner();
  const organizationId=z.string().min(1).parse(String(fd.get("organizationId")??""));
  const org=await db.organization.findUnique({where:{id:organizationId}});
  if(!org||org.slug==="classdiary-platform") throw new Error("Organização inválida");
  await db.organization.update({where:{id:organizationId},data:{active:!org.active}});
  await db.auditLog.create({data:{userId:user.id,organizationId,action:org.active?"BLOCK":"UNBLOCK",entity:"Organization",entityId:organizationId}});
  revalidatePath("/super-admin");
}
