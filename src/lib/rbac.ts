import {redirect} from "next/navigation";import {activeOrganization,requireUser} from "@/lib/auth";
export async function requireSchoolRole(roles:("SCHOOL_ADMIN"|"COORDINATOR"|"TEACHER"|"SECRETARY"|"GUARDIAN"|"STUDENT")[]){
 const user=await requireUser();const org=await activeOrganization();if(!org)redirect("/onboarding");
 const ok=user.memberships.some(m=>m.organizationId===org.id&&roles.includes(m.role as any));if(!ok)redirect("/dashboard");
 return {user,org};
}
