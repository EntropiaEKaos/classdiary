import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { markNotificationReadAction } from "@/app/actions/engagement";
import { activeOrganization, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

export const dynamic="force-dynamic";

export default async function Page(){
  const user=await requireUser();const org=await activeOrganization();if(!org)redirect("/onboarding");
  const rows=await db.notification.findMany({where:{organizationId:org.id,userId:user.id},orderBy:{createdAt:"desc"},take:200});
  return <main className="main"><div className="page-head"><div><Link className="page-back-button" href="/dashboard"><ArrowLeft size={16} />Voltar ao dashboard</Link><h1>Notificações</h1><div className="muted">{rows.filter(r=>!r.readAt).length} não lidas</div></div></div><section className="table-card">{rows.length===0?<p className="muted">Nenhuma notificação.</p>:rows.map(r=><div className="notice" key={r.id}><strong>{r.title}</strong><div className="muted">{r.body}</div><div style={{display:"flex",gap:8,marginTop:8}}>{r.href?<Link className="btn btn-light" href={r.href}>Abrir</Link>:null}{!r.readAt?<form action={markNotificationReadAction}><input type="hidden" name="notificationId" value={r.id}/><button className="btn btn-light">Marcar como lida</button></form>:<span className="status">Lida</span>}</div></div>)}</section></main>;
}
