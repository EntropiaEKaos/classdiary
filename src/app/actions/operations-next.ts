"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireModulePermission } from "@/lib/rbac";
import { assertTrustedMutationOrigin } from "@/lib/security";

export async function createMedicalRecordAction(fd:FormData){
  const {user,org}=await requireModulePermission("health","create");
  const p=z.object({studentId:z.string().min(1),type:z.string().min(1),summary:z.string().min(2),details:z.string().optional(),actionTaken:z.string().optional(),notifiedGuardian:z.boolean()}).parse({
    studentId:String(fd.get("studentId")??""),type:String(fd.get("type")??"").trim(),summary:String(fd.get("summary")??"").trim(),
    details:String(fd.get("details")??"").trim(),actionTaken:String(fd.get("actionTaken")??"").trim(),notifiedGuardian:fd.get("notifiedGuardian")==="on"
  });
  const student=await db.student.findFirst({where:{id:p.studentId,organizationId:org.id}});
  if(!student) throw new Error("Aluno inválido");
  await db.medicalRecord.create({data:{organizationId:org.id,studentId:student.id,authorId:user.id,type:p.type,summary:p.summary,details:p.details||null,actionTaken:p.actionTaken||null,notifiedGuardian:p.notifiedGuardian}});
  revalidatePath("/dashboard/enfermaria");
}

export async function createGuardianAuthorizationAction(fd:FormData){
  await assertTrustedMutationOrigin();
  const {org}=await requireModulePermission("health","create");
  const p=z.object({studentId:z.string().min(1),type:z.string().min(1),title:z.string().min(2),description:z.string().optional(),expiresAt:z.string().optional()}).parse({
    studentId:String(fd.get("studentId")??""),type:String(fd.get("type")??"").trim(),title:String(fd.get("title")??"").trim(),description:String(fd.get("description")??"").trim(),expiresAt:String(fd.get("expiresAt")??"")
  });
  const student=await db.student.findFirst({where:{id:p.studentId,organizationId:org.id,active:true}});
  if(!student) throw new Error("Aluno inválido");
  const expiresAt=p.expiresAt?new Date(p.expiresAt):null;
  if(expiresAt&&Number.isNaN(expiresAt.getTime())) throw new Error("Data de validade inválida");
  await db.guardianAuthorization.create({data:{organizationId:org.id,studentId:student.id,type:p.type,title:p.title,description:p.description||null,expiresAt}});
  revalidatePath("/dashboard/autorizacoes");
}

export async function createResourceAction(fd:FormData){
  const {org}=await requireModulePermission("resources","create");
  const p=z.object({name:z.string().min(2),type:z.string().min(1),capacity:z.coerce.number().int().min(1).optional(),location:z.string().optional()}).parse({
    name:String(fd.get("name")??"").trim(),type:String(fd.get("type")??"").trim(),capacity:fd.get("capacity")||undefined,location:String(fd.get("location")??"").trim()
  });
  await db.resource.create({data:{organizationId:org.id,name:p.name,type:p.type,capacity:p.capacity??null,location:p.location||null}});
  revalidatePath("/dashboard/recursos");
}

export async function reserveResourceAction(fd:FormData){
  const {user,org}=await requireModulePermission("resources","create");
  const p=z.object({resourceId:z.string().min(1),title:z.string().min(2),startsAt:z.string().min(1),endsAt:z.string().min(1),notes:z.string().optional()}).parse({
    resourceId:String(fd.get("resourceId")??""),title:String(fd.get("title")??"").trim(),startsAt:String(fd.get("startsAt")??""),endsAt:String(fd.get("endsAt")??""),notes:String(fd.get("notes")??"").trim()
  });
  const startsAt=new Date(p.startsAt),endsAt=new Date(p.endsAt);
  if(Number.isNaN(startsAt.getTime())||Number.isNaN(endsAt.getTime())||endsAt<=startsAt) throw new Error("Intervalo de reserva inválido");
  const resource=await db.resource.findFirst({where:{id:p.resourceId,organizationId:org.id,active:true}});
  if(!resource) throw new Error("Recurso inválido");
  const conflict=await db.resourceReservation.findFirst({where:{resourceId:resource.id,startsAt:{lt:endsAt},endsAt:{gt:startsAt}}});
  if(conflict) throw new Error("Recurso já reservado neste horário");
  await db.resourceReservation.create({data:{organizationId:org.id,resourceId:resource.id,createdById:user.id,title:p.title,startsAt,endsAt,notes:p.notes||null}});
  revalidatePath("/dashboard/recursos");
}

export async function createMaintenancePlanAction(fd:FormData){
  const {org}=await requireModulePermission("maintenance","create");
  const p=z.object({assetId:z.string().min(1),name:z.string().min(2),frequencyDays:z.coerce.number().int().min(1),nextDueAt:z.string().min(1)}).parse({
    assetId:String(fd.get("assetId")??""),name:String(fd.get("name")??"").trim(),frequencyDays:fd.get("frequencyDays"),nextDueAt:String(fd.get("nextDueAt")??"")
  });
  const asset=await db.asset.findFirst({where:{id:p.assetId,organizationId:org.id}});
  if(!asset) throw new Error("Patrimônio inválido");
  const nextDueAt=new Date(p.nextDueAt);
  if(Number.isNaN(nextDueAt.getTime())) throw new Error("Data de manutenção inválida");
  await db.maintenancePlan.create({data:{organizationId:org.id,assetId:asset.id,name:p.name,frequencyDays:p.frequencyDays,nextDueAt}});
  revalidatePath("/dashboard/manutencao");
}

export async function createMaintenanceTicketAction(fd:FormData){
  await assertTrustedMutationOrigin();
  const {user,org}=await requireModulePermission("maintenance","create");
  const p=z.object({assetId:z.string().optional(),title:z.string().min(2),description:z.string().min(2),priority:z.enum(["LOW","MEDIUM","HIGH","CRITICAL"])}).parse({
    assetId:String(fd.get("assetId")??"")||undefined,title:String(fd.get("title")??"").trim(),description:String(fd.get("description")??"").trim(),priority:String(fd.get("priority")??"MEDIUM")
  });
  if(p.assetId){
    const asset=await db.asset.findFirst({where:{id:p.assetId,organizationId:org.id}});
    if(!asset) throw new Error("Patrimônio inválido");
  }
  await db.maintenanceTicket.create({data:{organizationId:org.id,assetId:p.assetId||null,createdById:user.id,title:p.title,description:p.description,priority:p.priority}});
  revalidatePath("/dashboard/manutencao");
}

export async function closeMaintenanceTicketAction(fd:FormData){
  const {org}=await requireModulePermission("maintenance","update");
  const id=z.string().min(1).parse(String(fd.get("id")??""));
  const ticket=await db.maintenanceTicket.findFirst({where:{id,organizationId:org.id}});
  if(!ticket) throw new Error("Chamado inválido");
  await db.maintenanceTicket.update({where:{id},data:{status:"CLOSED",closedAt:new Date()}});
  revalidatePath("/dashboard/manutencao");
}

export async function createSupplierAction(fd:FormData){
  const {org}=await requireModulePermission("procurement","create");
  const p=z.object({name:z.string().min(2),document:z.string().optional(),email:z.string().email().optional().or(z.literal("")),phone:z.string().optional(),category:z.string().optional()}).parse({
    name:String(fd.get("name")??"").trim(),document:String(fd.get("document")??"").trim(),email:String(fd.get("email")??"").trim(),phone:String(fd.get("phone")??"").trim(),category:String(fd.get("category")??"").trim()
  });
  await db.supplier.create({data:{organizationId:org.id,name:p.name,document:p.document||null,email:p.email||null,phone:p.phone||null,category:p.category||null}});
  revalidatePath("/dashboard/compras");
}

export async function createPurchaseOrderAction(fd:FormData){
  await assertTrustedMutationOrigin();
  const {user,org}=await requireModulePermission("procurement","create");
  const p=z.object({supplierId:z.string().optional(),description:z.string().min(2),totalAmount:z.coerce.number().min(0)}).parse({
    supplierId:String(fd.get("supplierId")??"")||undefined,description:String(fd.get("description")??"").trim(),totalAmount:fd.get("totalAmount")||0
  });
  if(p.supplierId){
    const supplier=await db.supplier.findFirst({where:{id:p.supplierId,organizationId:org.id}});
    if(!supplier) throw new Error("Fornecedor inválido");
  }
  const number="PO-"+Date.now().toString().slice(-10);
  await db.purchaseOrder.create({data:{organizationId:org.id,supplierId:p.supplierId||null,createdById:user.id,number,description:p.description,totalAmount:p.totalAmount,status:"DRAFT"}});
  revalidatePath("/dashboard/compras");
}

export async function updatePurchaseOrderStatusAction(fd:FormData){
  const {org}=await requireModulePermission("procurement","update");
  const p=z.object({id:z.string().min(1),status:z.enum(["DRAFT","ORDERED","RECEIVED","CANCELED"])}).parse({id:String(fd.get("id")??""),status:String(fd.get("status")??"")});
  const order=await db.purchaseOrder.findFirst({where:{id:p.id,organizationId:org.id}});
  if(!order) throw new Error("Pedido inválido");
  await db.purchaseOrder.update({where:{id:order.id},data:{status:p.status,...(p.status==="ORDERED"?{orderedAt:new Date()}:{}),...(p.status==="RECEIVED"?{receivedAt:new Date()}: {})}});
  revalidatePath("/dashboard/compras");
}

export async function createAutomationRuleAction(fd:FormData){
  const {org}=await requireModulePermission("automation","create");
  const p=z.object({name:z.string().min(2),event:z.string().min(1),action:z.string().min(1),configuration:z.string().optional()}).parse({
    name:String(fd.get("name")??"").trim(),event:String(fd.get("event")??"").trim(),action:String(fd.get("action")??"").trim(),configuration:String(fd.get("configuration")??"").trim()
  });
  let configuration:Record<string,unknown>|null=null;
  if(p.configuration){try{configuration=JSON.parse(p.configuration)}catch{throw new Error("Configuração JSON inválida")}}
  await db.automationRule.create({data:{organizationId:org.id,name:p.name,event:p.event,action:p.action,configuration}});
  revalidatePath("/dashboard/automacoes");
}


export async function answerGuardianAuthorizationAction(fd:FormData){
  await assertTrustedMutationOrigin();
  const {activeOrganization,requireUser}=await import("@/lib/auth");
  const user=await requireUser();
  const org=await activeOrganization();
  if(!org) throw new Error("Nenhuma escola ativa");
  const p=z.object({id:z.string().min(1),decision:z.enum(["APPROVED","REJECTED"])}).parse({
    id:String(fd.get("id")??""),decision:String(fd.get("decision")??"")
  });
  const authorization=await db.guardianAuthorization.findFirst({
    where:{id:p.id,organizationId:org.id,status:"PENDING"},
    include:{student:{include:{guardians:true}}}
  });
  if(!authorization||!authorization.student.guardians.some(g=>g.userId===user.id)) throw new Error("Autorização inválida");
  await db.guardianAuthorization.update({
    where:{id:authorization.id},
    data:{status:p.decision,answeredAt:new Date(),answeredByName:user.name}
  });
  revalidatePath("/portal");
}


export async function runAutomationRulesAction(){
  const {user,org}=await requireModulePermission("automation","update");
  const rules=await db.automationRule.findMany({where:{organizationId:org.id,active:true}});
  const recipients=await db.membership.findMany({
    where:{organizationId:org.id,role:{in:["SCHOOL_ADMIN","COORDINATOR","SECRETARY"]}}
  });
  const userIds=[...new Set(recipients.map(r=>r.userId))];
  let created=0;

  for(const rule of rules){
    let matches:{title:string;body:string;href:string}[]=[];

    if(rule.event==="MAINTENANCE_DUE"){
      const due=await db.maintenancePlan.findMany({
        where:{organizationId:org.id,active:true,nextDueAt:{lte:new Date(Date.now()+7*86400000)}},
        include:{asset:true},take:100
      });
      matches=due.map(item=>({
        title:rule.name,
        body:`${item.asset.name}: ${item.name} vence em ${item.nextDueAt.toLocaleDateString("pt-BR")}`,
        href:"/dashboard/manutencao"
      }));
    }

    if(rule.event==="LOW_STOCK"){
      const items=await db.inventoryItem.findMany({where:{organizationId:org.id,active:true},take:500});
      matches=items.filter(item=>Number(item.quantity)<=Number(item.minQuantity)).map(item=>({
        title:rule.name,
        body:`${item.name}: saldo ${String(item.quantity)} ${item.unit}`,
        href:"/dashboard/estoque"
      }));
    }

    if(rule.event==="AUTHORIZATION_PENDING"){
      const pending=await db.guardianAuthorization.findMany({
        where:{organizationId:org.id,status:"PENDING"},include:{student:true},take:100
      });
      matches=pending.map(item=>({
        title:rule.name,
        body:`${item.student.name}: ${item.title}`,
        href:"/dashboard/autorizacoes"
      }));
    }

    if(rule.action==="CREATE_NOTIFICATION"){
      for(const match of matches){
        for(const userId of userIds){
          await db.notification.create({
            data:{organizationId:org.id,userId,type:"AUTOMATION",title:match.title,body:match.body,href:match.href}
          });
          created+=1;
        }
      }
    }
  }

  await db.auditLog.create({data:{
    userId:user.id,organizationId:org.id,action:"RUN",entity:"AutomationRule",
    metadata:{rules:rules.length,notificationsCreated:created}
  }});

  revalidatePath("/dashboard/automacoes");
  revalidatePath("/notificacoes");
}
