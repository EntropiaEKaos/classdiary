import Link from "next/link";
import { Inbox } from "lucide-react";

export function EmptyState({
  title,
  description,
  href,
  actionLabel,
}: {
  title: string;
  description: string;
  href?: string;
  actionLabel?: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon"><Inbox size={24} /></span>
      <h3>{title}</h3>
      <p>{description}</p>
      {href && actionLabel ? <Link className="btn btn-light" href={href}>{actionLabel}</Link> : null}
    </div>
  );
}
