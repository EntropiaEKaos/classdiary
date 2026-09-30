"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireModulePermission } from "@/lib/rbac";
import { assertTrustedMutationOrigin } from "@/lib/security";

export async function createEmployeeAction(fd:FormData){
  const {org}=await requireModulePermission("hr","create");
  const p=z.object({
    name:z.string().min(2),email:z.string().email().optional().or(z.literal("")),
    phone:z.string().optional(),document:z.string().optional(),
    jobTitle:z.string().min(2),department:z.string().optional(),
    hireDate:z.string().optional(),salary:z.coerce.number().min(0).optional()
  }).parse({
    name:String(fd.get("name")??"").trim(),
    email:String(fd.get("email")??"").trim().toLowerCase(),
    phone:String(fd.get("phone")??"").trim(),
    document:String(fd.get("document")??"").trim(),
    jobTitle:String(fd.get("jobTitle")??"").trim(),
    department:String(fd.get("department")??"").trim(),
    hireDate:String(fd.get("hireDate")??""),
    salary:fd.get("salary")||undefined
  });
  await db.employee.create({data:{
    organizationId:org.id,name:p.name,email:p.email||null,phone:p.phone||null,
    document:p.document||null,jobTitle:p.jobTitle,department:p.department||null,
    hireDate:p.hireDate?new Date(p.hireDate):null,salary:p.salary??null
  }});
  revalidatePath("/dashboard/rh");
}

export async function clockEmployeeAction(fd:FormData){
  const {org}=await requireModulePermission("hr","update");
  const employeeId=z.string().min(1).parse(String(fd.get("employeeId")??""));
  const employee=await db.employee.findFirst({where:{id:employeeId,organizationId:org.id,active:true}});
  if(!employee) throw new Error("Colaborador inválido");
  const open=await db.timeEntry.findFirst({where:{employeeId:employee.id,clockOut:null},orderBy:{clockIn:"desc"}});
  if(open){
    await db.timeEntry.update({where:{id:open.id},data:{clockOut:new Date()}});
  } else {
    await db.timeEntry.create({data:{organizationId:org.id,employeeId:employee.id,clockIn:new Date()}});
  }
  revalidatePath("/dashboard/rh");
}

export async function createAssetAction(fd:FormData){
  const {org}=await requireModulePermission("assets","create");
  const p=z.object({tag:z.string().min(1),name:z.string().min(2),category:z.string().min(1),serialNumber:z.string().optional(),location:z.string().optional(),acquisitionValue:z.coerce.number().min(0).optional()}).parse({
    tag:String(fd.get("tag")??"").trim(),name:String(fd.get("name")??"").trim(),category:String(fd.get("category")??"").trim(),
    serialNumber:String(fd.get("serialNumber")??"").trim(),location:String(fd.get("location")??"").trim(),
    acquisitionValue:fd.get("acquisitionValue")||undefined
  });
  await db.asset.create({data:{organizationId:org.id,...p,serialNumber:p.serialNumber||null,location:p.location||null,acquisitionValue:p.acquisitionValue??null}});
  revalidatePath("/dashboard/patrimonio");
}

export async function createInventoryItemAction(fd:FormData){
  const {org}=await requireModulePermission("inventory","create");
  const p=z.object({sku:z.string().min(1),name:z.string().min(2),category:z.string().optional(),unit:z.string().min(1),minQuantity:z.coerce.number().min(0),averageCost:z.coerce.number().min(0)}).parse({
    sku:String(fd.get("sku")??"").trim(),name:String(fd.get("name")??"").trim(),category:String(fd.get("category")??"").trim(),
    unit:String(fd.get("unit")??"UN").trim(),minQuantity:fd.get("minQuantity")||0,averageCost:fd.get("averageCost")||0
  });
  await db.inventoryItem.create({data:{organizationId:org.id,sku:p.sku,name:p.name,category:p.category||null,unit:p.unit,minQuantity:p.minQuantity,averageCost:p.averageCost}});
  revalidatePath("/dashboard/estoque");
}

export async function moveInventoryAction(fd:FormData){
  await assertTrustedMutationOrigin();
  const {org}=await requireModulePermission("inventory","update");
  const p=z.object({itemId:z.string().min(1),type:z.enum(["IN","OUT","ADJUST"]),quantity:z.coerce.number().positive(),unitCost:z.coerce.number().min(0).optional(),reason:z.string().optional()}).parse({
    itemId:String(fd.get("itemId")??""),type:String(fd.get("type")??"IN"),quantity:fd.get("quantity"),unitCost:fd.get("unitCost")||undefined,reason:String(fd.get("reason")??"").trim()
  });
  await db.$transaction(async tx=>{
    const item=await tx.inventoryItem.findFirst({where:{id:p.itemId,organizationId:org.id}});
    if(!item) throw new Error("Item inválido");
    const current=Number(item.quantity);
    const next=p.type==="IN"?current+p.quantity:p.type==="OUT"?current-p.quantity:p.quantity;
    if(next<0) throw new Error("Estoque insuficiente");
    await tx.inventoryMovement.create({data:{organizationId:org.id,itemId:item.id,type:p.type,quantity:p.quantity,unitCost:p.unitCost??null,reason:p.reason||null}});
    await tx.inventoryItem.update({where:{id:item.id},data:{quantity:next,...(p.unitCost!==undefined?{averageCost:p.unitCost}:{})}});
  },{isolationLevel:"Serializable"});
  revalidatePath("/dashboard/estoque");
}

export async function createLibraryBookAction(fd:FormData){
  const {org}=await requireModulePermission("library","create");
  const p=z.object({code:z.string().min(1),title:z.string().min(2),author:z.string().optional(),isbn:z.string().optional(),category:z.string().optional(),copiesTotal:z.coerce.number().int().min(1)}).parse({
    code:String(fd.get("code")??"").trim(),title:String(fd.get("title")??"").trim(),author:String(fd.get("author")??"").trim(),
    isbn:String(fd.get("isbn")??"").trim(),category:String(fd.get("category")??"").trim(),copiesTotal:fd.get("copiesTotal")||1
  });
  await db.libraryBook.create({data:{organizationId:org.id,code:p.code,title:p.title,author:p.author||null,isbn:p.isbn||null,category:p.category||null,copiesTotal:p.copiesTotal,copiesAvailable:p.copiesTotal}});
  revalidatePath("/dashboard/biblioteca");
}

export async function loanLibraryBookAction(fd:FormData){
  await assertTrustedMutationOrigin();
  const {org}=await requireModulePermission("library","update");
  const p=z.object({bookId:z.string().min(1),studentId:z.string().min(1),dueAt:z.string().min(1)}).parse({
    bookId:String(fd.get("bookId")??""),studentId:String(fd.get("studentId")??""),dueAt:String(fd.get("dueAt")??"")
  });
  const dueAt=new Date(p.dueAt);
  if(Number.isNaN(dueAt.getTime())) throw new Error("Data de devolução inválida");
  await db.$transaction(async tx=>{
    const [book,student]=await Promise.all([
      tx.libraryBook.findFirst({where:{id:p.bookId,organizationId:org.id,active:true}}),
      tx.student.findFirst({where:{id:p.studentId,organizationId:org.id,active:true}})
    ]);
    if(!book||!student||book.copiesAvailable<1) throw new Error("Livro/aluno inválido ou sem exemplar disponível");
    await tx.libraryLoan.create({data:{organizationId:org.id,bookId:book.id,studentId:student.id,dueAt}});
    await tx.libraryBook.update({where:{id:book.id},data:{copiesAvailable:{decrement:1}}});
  },{isolationLevel:"Serializable"});
  revalidatePath("/dashboard/biblioteca");
}

export async function returnLibraryBookAction(fd:FormData){
  const {org}=await requireModulePermission("library","update");
  const id=z.string().min(1).parse(String(fd.get("loanId")??""));
  const loan=await db.libraryLoan.findFirst({where:{id,organizationId:org.id,status:"BORROWED"}});
  if(!loan) throw new Error("Empréstimo inválido");
  await db.$transaction([
    db.libraryLoan.update({where:{id:loan.id},data:{status:"RETURNED",returnedAt:new Date()}}),
    db.libraryBook.update({where:{id:loan.bookId},data:{copiesAvailable:{increment:1}}})
  ]);
  revalidatePath("/dashboard/biblioteca");
}

export async function createTransportRouteAction(fd:FormData){
  const {org}=await requireModulePermission("transport","create");
  const p=z.object({name:z.string().min(2),vehiclePlate:z.string().optional(),driverName:z.string().optional(),driverPhone:z.string().optional(),capacity:z.coerce.number().int().min(1).optional()}).parse({
    name:String(fd.get("name")??"").trim(),vehiclePlate:String(fd.get("vehiclePlate")??"").trim(),driverName:String(fd.get("driverName")??"").trim(),
    driverPhone:String(fd.get("driverPhone")??"").trim(),capacity:fd.get("capacity")||undefined
  });
  await db.transportRoute.create({data:{organizationId:org.id,name:p.name,vehiclePlate:p.vehiclePlate||null,driverName:p.driverName||null,driverPhone:p.driverPhone||null,capacity:p.capacity??null}});
  revalidatePath("/dashboard/transporte");
}

export async function assignTransportStudentAction(fd:FormData){
  const {org}=await requireModulePermission("transport","update");
  const p=z.object({routeId:z.string().min(1),studentId:z.string().min(1)}).parse({routeId:String(fd.get("routeId")??""),studentId:String(fd.get("studentId")??"")});
  const [route,student]=await Promise.all([
    db.transportRoute.findFirst({where:{id:p.routeId,organizationId:org.id,active:true}}),
    db.student.findFirst({where:{id:p.studentId,organizationId:org.id,active:true}})
  ]);
  if(!route||!student) throw new Error("Rota ou aluno inválido");
  if(route.capacity){
    const count=await db.transportAssignment.count({where:{routeId:route.id,active:true}});
    if(count>=route.capacity) throw new Error("Capacidade da rota atingida");
  }
  await db.transportAssignment.upsert({
    where:{routeId_studentId:{routeId:route.id,studentId:student.id}},
    update:{active:true},
    create:{organizationId:org.id,routeId:route.id,studentId:student.id}
  });
  revalidatePath("/dashboard/transporte");
}

export async function createCanteenItemAction(fd:FormData){
  const {org}=await requireModulePermission("canteen","create");
  const p=z.object({name:z.string().min(2),category:z.string().optional(),price:z.coerce.number().positive(),stockQuantity:z.coerce.number().min(0)}).parse({
    name:String(fd.get("name")??"").trim(),category:String(fd.get("category")??"").trim(),price:fd.get("price"),stockQuantity:fd.get("stockQuantity")||0
  });
  await db.canteenItem.create({data:{organizationId:org.id,name:p.name,category:p.category||null,price:p.price,stockQuantity:p.stockQuantity}});
  revalidatePath("/dashboard/cantina");
}

export async function createCanteenSaleAction(fd:FormData){
  await assertTrustedMutationOrigin();
  const {org}=await requireModulePermission("canteen","create");
  const p=z.object({itemId:z.string().min(1),studentId:z.string().optional(),quantity:z.coerce.number().positive(),paymentMethod:z.enum(["PIX","CASH","CARD","ACCOUNT"])}).parse({
    itemId:String(fd.get("itemId")??""),studentId:String(fd.get("studentId")??"")||undefined,quantity:fd.get("quantity"),paymentMethod:String(fd.get("paymentMethod")??"CASH")
  });
  await db.$transaction(async tx=>{
    const item=await tx.canteenItem.findFirst({where:{id:p.itemId,organizationId:org.id,active:true}});
    if(!item||Number(item.stockQuantity)<p.quantity) throw new Error("Produto inválido ou estoque insuficiente");
    let studentId:string|null=null;
    if(p.studentId){
      const student=await tx.student.findFirst({where:{id:p.studentId,organizationId:org.id,active:true}});
      if(!student) throw new Error("Aluno inválido");
      studentId=student.id;
    }
    const total=Number(item.price)*p.quantity;
    const order=await tx.canteenOrder.create({data:{organizationId:org.id,studentId,status:"PAID",totalAmount:total,paymentMethod:p.paymentMethod,paidAt:new Date()}});
    await tx.canteenOrderItem.create({data:{orderId:order.id,itemId:item.id,quantity:p.quantity,unitPrice:item.price}});
    await tx.canteenItem.update({where:{id:item.id},data:{stockQuantity:{decrement:p.quantity}}});
  },{isolationLevel:"Serializable"});
  revalidatePath("/dashboard/cantina");
}
