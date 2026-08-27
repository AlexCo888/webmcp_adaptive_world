import type { ReactNode } from "react";

export type AppShellProps = {
  product: string;
  section?: string;
  navigation?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

export function AppShell({
  actions,
  children,
  footer,
  navigation,
  product,
  section,
}: AppShellProps) {
  return (
    <div className="aw-shell">
      <header className="aw-shell__header">
        <a className="aw-brand" href="/" aria-label={`${product} home`}>
          <span className="aw-brand__mark" aria-hidden="true">
            AW
          </span>
          <span>
            <strong>{product}</strong>
            {section && <small>{section}</small>}
          </span>
        </a>
        {navigation && <nav className="aw-shell__nav">{navigation}</nav>}
        {actions && <div className="aw-shell__actions">{actions}</div>}
      </header>
      <main className="aw-shell__main">{children}</main>
      {footer && <footer className="aw-shell__footer">{footer}</footer>}
    </div>
  );
}

export type PageIntroProps = {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
};

export function PageIntro({ actions, description, eyebrow, title }: PageIntroProps) {
  return (
    <section className="aw-page-intro">
      <div>
        {eyebrow && <p className="aw-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="aw-page-intro__actions">{actions}</div>}
    </section>
  );
}
