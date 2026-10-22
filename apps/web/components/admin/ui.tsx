// Presentational building blocks shared by the admin screens.

import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export function PageHead({ title, children, actions }: { title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="page-head-text">
        <h1>{title}</h1>
        {children && <p className="page-head-desc">{children}</p>}
      </div>
      {actions && <div className="page-head-actions">{actions}</div>}
    </div>
  );
}

export function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="search">
      <Icon name="search" size={16} />
      <input type="search" placeholder="Filtrera…" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Filtrera" />
    </div>
  );
}

export function EmptyState({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <p>{children}</p>
    </div>
  );
}

export type Tone = "success" | "warning" | "info" | "danger" | "neutral" | "accent";

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function LoadingRow() {
  return <p className="admin-loading">Laddar…</p>;
}
