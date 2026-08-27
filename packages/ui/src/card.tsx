import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "./utils";

export type CardProps = HTMLAttributes<HTMLElement> & {
  eyebrow?: string;
  title?: string;
  description?: string;
  action?: ReactNode;
};

export function Card({
  action,
  children,
  className,
  description,
  eyebrow,
  title,
  ...props
}: CardProps) {
  return (
    <article className={cn("aw-card", className)} {...props}>
      {(eyebrow ?? title ?? description ?? action) && (
        <header className="aw-card__header">
          <div>
            {eyebrow && <p className="aw-eyebrow">{eyebrow}</p>}
            {title && <h2 className="aw-card__title">{title}</h2>}
            {description && <p className="aw-card__description">{description}</p>}
          </div>
          {action && <div className="aw-card__action">{action}</div>}
        </header>
      )}
      {children && <div className="aw-card__body">{children}</div>}
    </article>
  );
}
