import { requirePlatformOwner } from "@/lib/auth";
import { AdminNavigation } from "@/components/admin/admin-navigation";

export default async function SuperAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requirePlatformOwner();

  return (
    <div className="admin-center-shell">
      <AdminNavigation />
      <section className="admin-center-content">{children}</section>
    </div>
  );
}
