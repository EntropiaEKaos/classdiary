import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  backHref = "/super-admin",
  backLabel = "Voltar",
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  backHref?: string;
  backLabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="admin-page-header">
      <div className="admin-page-heading">
        <Link className="admin-back-button" href={backHref}>
          <ArrowLeft size={17} />
          <span>{backLabel}</span>
        </Link>
        <span className="admin-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children ? <div className="admin-page-actions">{children}</div> : null}
    </div>
  );
}
