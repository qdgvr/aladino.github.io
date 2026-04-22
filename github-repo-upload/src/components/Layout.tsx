import type { ReactNode } from "react";

export type PageKey = "today" | "practice" | "review" | "cards" | "import" | "stats" | "settings";

type LayoutProps = {
  page: PageKey;
  onNavigate: (page: PageKey) => void;
  children: ReactNode;
};

const NAV_ITEMS: Array<{ key: PageKey; label: string }> = [
  { key: "today", label: "Today" },
  { key: "practice", label: "Practice" },
  { key: "review", label: "Review" },
  { key: "cards", label: "Cards" },
  { key: "import", label: "Import" },
  { key: "stats", label: "Stats" },
  { key: "settings", label: "Settings" },
];

export function Layout({ page, onNavigate, children }: LayoutProps) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">PWA spaced repetition</p>
          <h1>Obsidian Memory</h1>
        </div>
        <p className="app-subtitle">Obsidian markdown notes, imported into your browser.</p>
      </header>

      <main className="app-main">{children}</main>

      <nav className="app-nav" aria-label="Primary">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={item.key === page ? "nav-button active" : "nav-button"}
            onClick={() => onNavigate(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
