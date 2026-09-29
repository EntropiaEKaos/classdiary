"use server";
import {compare} from "bcryptjs";import {redirect} from "next/navigation";import {z} from "zod";import {db} from "@/lib/db";import {createSession,destroySession} from "@/lib/auth";
export async function loginAction(fd:FormData){const p=z.object({email:z.string().email(),password:z.string().min(8)}).safeParse({email:String(fd.get("email")??"").trim().toLowerCase(),password:String(fd.get("password")??"")});if(!p.success)redirect("/login?error=invalid");const u=await db.user.findUnique({where:{email:p.data.email}});if(!u?.passwordHash||!u.active||!(await compare(p.data.password,u.passwordHash)))redirect("/login?error=invalid");await createSession(u.id);redirect("/dashboard");}
export async function logoutAction(){await destroySession();redirect("/login");}
