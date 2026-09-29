import {createHash,randomBytes} from "node:crypto";
import {cookies,headers} from "next/headers";
import {redirect} from "next/navigation";
import {db} from "@/lib/db";
const COOKIE="classdiary_session";
const hash=(v:string)=>createHash("sha256").update(v).digest("hex");
export async function createSession(userId:string){const token=randomBytes(32).toString("hex");const h=await headers();await db.session.create({data:{tokenHash:hash(token),userId,expiresAt:new Date(Date.now()+14*86400000),userAgent:h.get("user-agent"),ipAddress:h.get("x-forwarded-for")?.split(",")[0]?.trim()}});(await cookies()).set(COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:14*86400});}
export async function destroySession(){const c=await cookies();const token=c.get(COOKIE)?.value;if(token)await db.session.deleteMany({where:{tokenHash:hash(token)}});c.delete(COOKIE);}
export async function currentUser(){const token=(await cookies()).get(COOKIE)?.value;if(!token)return null;const s=await db.session.findUnique({where:{tokenHash:hash(token)},include:{user:{include:{memberships:{include:{organization:true}}}}}});if(!s||s.expiresAt<=new Date()||!s.user.active)return null;return s.user;}
export async function requireUser(){const u=await currentUser();if(!u)redirect("/login");return u;}
export async function activeOrganization(){const u=await requireUser();return u.memberships.find(m=>m.organization.active&&m.organization.slug!=="classdiary-platform")?.organization??null;}
