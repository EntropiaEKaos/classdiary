"use client";

import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "edusync-theme";

export function ThemeToggle({
  showLabel = false,
  className = "",
}: {
  showLabel?: boolean;
  className?: string;
}) {
  function toggleTheme() {
    const root = document.documentElement;
    const current = root.dataset.theme === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";

    root.dataset.theme = next;
    root.style.colorScheme = next;
    window.localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new CustomEvent("edusync-theme-change", { detail: next }));
  }

  return (
    <button
      aria-label="Alternar tema claro e escuro"
      className={`theme-toggle ${showLabel ? "with-label" : ""} ${className}`}
      onClick={toggleTheme}
      title="Alternar tema claro e escuro"
      type="button"
    >
      <span className="theme-toggle-icon theme-icon-sun" aria-hidden="true"><Sun size={17} /></span>
      <span className="theme-toggle-icon theme-icon-moon" aria-hidden="true"><Moon size={17} /></span>
      {showLabel ? (
        <>
          <span className="theme-label-light">Modo claro</span>
          <span className="theme-label-dark">Modo noturno</span>
        </>
      ) : null}
    </button>
  );
}
