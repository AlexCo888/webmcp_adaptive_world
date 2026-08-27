import type { HTMLAttributes } from "react";

import { cn } from "./utils";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "positive" | "warning" | "critical" | "info";
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return <span className={cn("aw-badge", className)} data-tone={tone} {...props} />;
}
