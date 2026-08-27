import type { ReactNode } from "react";

export type StatProps = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
};

export function Stat({ detail, label, value }: StatProps) {
  return (
    <div className="aw-stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
      {detail && <small>{detail}</small>}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <dl className="aw-stat-grid">{children}</dl>;
}

export function EmptyState({
  action,
  description,
  title,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="aw-empty-state">
      <span className="aw-empty-state__orb" aria-hidden="true" />
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
