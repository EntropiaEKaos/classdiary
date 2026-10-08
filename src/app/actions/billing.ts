"use server";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {db} from "@/lib/db";
import {requirePlatformOwner} from "@/lib/auth";
import {assertTrustedMutationOrigin} from "@/lib/security";
import { updateSubscriptionPlan } from "@/lib/subscription-admin";

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

  await updateSubscriptionPlan({
    actorUserId:user.id,
    organizationId:p.organizationId,
    plan:p.plan,
    status:p.status,
    seats:p.seats
  });

  revalidatePath("/super-admin");
  revalidatePath("/super-admin/escolas");
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
  revalidatePath("/super-admin/escolas");
}
