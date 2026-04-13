import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Button — UI-SPEC §3.1
 * 3 size (sm 32 / default 36 / lg 40) × 5 variant.
 * 모든 색상은 globals.css 토큰 (`--primary`, `--secondary`, ...) 사용.
 * focus-visible 은 globals.css §8.5.5 Double-Ring 전역 규칙에 위임.
 */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--r)] border border-transparent font-medium whitespace-nowrap select-none",
    "transition-[background,border-color,opacity] duration-[120ms] ease",
    "outline-none disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
    "active:opacity-90 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-[var(--primary)] text-[var(--primary-fg)] hover:bg-[color-mix(in_oklch,var(--primary)_88%,black)]",
        secondary:
          "bg-[var(--secondary)] text-[var(--secondary-fg)] border-[var(--border)] hover:bg-[color-mix(in_oklch,var(--secondary)_92%,black)]",
        outline:
          "bg-transparent text-[var(--fg)] border-[var(--border)] hover:bg-[var(--muted)]",
        ghost:
          "bg-transparent text-[var(--fg)] hover:bg-[var(--muted)]",
        destructive:
          "bg-[var(--destructive)] text-[var(--destructive-fg)] hover:bg-[color-mix(in_oklch,var(--destructive)_88%,black)]",
      },
      size: {
        // UI-SPEC §3.1 height 32/36/40, padding-x 10/14/18, font 12/14/16
        sm: "h-8 px-[10px] text-[var(--t-caption)]",
        default: "h-9 px-[14px] text-[var(--t-sm)]",
        lg: "h-10 px-[18px] text-[var(--t-base)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
