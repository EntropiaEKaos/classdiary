"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type MobileItem = { href: string; label: string };

export function DashboardMobileNav({ items }: { items: MobileItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        aria-expanded={open}
        aria-label="Abrir navegação da escola"
        className="dashboard-mobile-menu-button"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Menu size={21} />
      </button>

      {open ? (
        <div className="dashboard-mobile-drawer-layer">
          <button
            aria-label="Fechar navegação ao tocar fora"
            className="dashboard-mobile-drawer-backdrop"
            onClick={() => setOpen(false)}
            type="button"
          />
          <aside className="dashboard-mobile-drawer" aria-label="Navegação móvel da escola">
            <div className="dashboard-mobile-drawer-head">
              <div>
                <strong>EduSync</strong>
                <span>Navegação da escola</span>
              </div>
              <button
                aria-label="Fechar navegação da escola"
                className="dashboard-mobile-close"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X size={20} />
              </button>
            </div>

            <nav aria-label="Módulos da escola">
              {items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));

                return (
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={`dashboard-mobile-link ${active ? "active" : ""}`}
                    href={item.href}
                    key={item.href}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      ) : null}
    </>
  );
}
