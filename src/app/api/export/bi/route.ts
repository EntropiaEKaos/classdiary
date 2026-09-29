import { NextResponse } from "next/server";
import { requireModulePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

export async function GET(){
  const {org}=await requireModulePermission("bi","view");
  const [students,teachers,leads,overdue,received,expenses,medical,tickets]=await Promise.all([
    db.student.count({where:{organizationId:org.id,active:true}}),
    db.membership.count({where:{organizationId:org.id,role:"TEACHER"}}),
    db.enrollmentLead.count({where:{organizationId:org.id}}),
    db.invoice.count({where:{organizationId:org.id,status:"OVERDUE"}}),
    db.payment.aggregate({where:{organizationId:org.id},_sum:{amount:true}}),
    db.expense.aggregate({where:{organizationId:org.id,status:"PAID"},_sum:{amount:true}}),
    db.medicalRecord.count({where:{organizationId:org.id}}),
    db.maintenanceTicket.count({where:{organizationId:org.id,status:{not:"CLOSED"}}})
  ]);

  const data=[
    ["Indicador","Valor"],
    ["Alunos ativos",String(students)],
    ["Professores",String(teachers)],
    ["Leads",String(leads)],
    ["Cobranças em atraso",String(overdue)],
    ["Receita registrada",Number(received._sum.amount??0).toFixed(2)],
    ["Despesas pagas",Number(expenses._sum.amount??0).toFixed(2)],
    ["Atendimentos de saúde",String(medical)],
    ["Chamados de manutenção abertos",String(tickets)]
  ];
  const csv="\uFEFF"+data.map(row=>row.map(v=>'"'+v.replaceAll('"','""')+'"').join(",")).join("\n");
  return new NextResponse(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="classdiary-bi.csv"'}});
}
