"use server";
import {createHash,randomBytes} from "node:crypto";import {hash} from "bcryptjs";import {redirect} from "next/navigation";import {revalidatePath} from "next/cache";import {z} from "zod";import {db} from "@/lib/db";import {requireSchoolRole} from "@/lib/rbac";
const digest=(v:string)=>createHash("sha256").update(v).digest("hex");
export async function createInvitationAction(fd:FormData){
 const {user,org}=await requireSchoolRole(["SCHOOL_ADMIN","COORDINATOR"]);
 const p=z.object({email:z.string().email(),role:z.enum(["TEACHER","GUARDIAN"]),studentId:z.string().optional()}).parse({email:String(fd.get("email")??"").trim().toLowerCase(),role:String(fd.get("role")??""),studentId:String(fd.get("studentId")??"")||undefined});
 const token=randomBytes(32).toString("hex");
 await db.invitation.create({data:{organizationId:org.id,email:p.email,role:p.role,studentId:p.studentId||null,tokenHash:digest(token),expiresAt:new Date(Date.now()+48*3600000),sentById:user.id}});
 redirect("/dashboard/convites?token="+token);
}
export async function acceptInvitationAction(fd:FormData){
 const token=String(fd.get("token")??"");const name=String(fd.get("name")??"").trim();const password=String(fd.get("password")??"");
 if(name.length<2||password.length<10)redirect("/aceitar-convite?token="+encodeURIComponent(token)+"&error=invalid");
 const invite=await db.invitation.findUnique({where:{tokenHash:digest(token)}});
 if(!invite||invite.acceptedAt||invite.expiresAt<new Date())redirect("/aceitar-convite?error=expired");
 const passwordHash=await hash(password,12);
 const user=await db.user.upsert({where:{email:invite.email},update:{name,passwordHash,active:true},create:{name,email:invite.email,passwordHash,active:true}});
 await db.membership.upsert({where:{organizationId_userId_role:{organizationId:invite.organizationId,userId:user.id,role:invite.role}},update:{},create:{organizationId:invite.organizationId,userId:user.id,role:invite.role}});
 if(invite.role==="GUARDIAN"&&invite.studentId)await db.studentGuardian.upsert({where:{studentId_userId:{studentId:invite.studentId,userId:user.id}},update:{},create:{studentId:invite.studentId,userId:user.id}});
 await db.invitation.update({where:{id:invite.id},data:{acceptedAt:new Date()}});
 await db.auditLog.create({data:{userId:user.id,organizationId:invite.organizationId,action:"ACCEPT",entity:"Invitation",entityId:invite.id}});
 redirect("/login");
}
