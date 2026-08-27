import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "./utils";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger";
  size?: "sm" | "md" | "lg";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, type = "button", variant = "primary", size = "md", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn("aw-button", className)}
      data-variant={variant}
      data-size={size}
      {...props}
    />
  );
});
