import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Badge — UI-SPEC §3.4
 * 기본 variant (default/secondary/outline) + 금융 세만틱 (up/down/flat).
 * - height 20px, padding 0 8px, rounded-full, 11px font
 * - up: `--up-bg` + `--up`, down: `--down-bg` + `--down`, flat: `--muted` + `--flat`
 */
const badgeVariants = cva(
  [
    "inline-flex items-center justify-center h-5 px-2 rounded-full",
    "text-[11px] font-semibold tracking-[0.01em] whitespace-nowrap",
    "border border-transparent select-none",
    "transition-[background,border-color] duration-[120ms]",
    "[&>svg]:pointer-events-none [&>svg]:size-3",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-[var(--primary)] text-[var(--primary-fg)]",
        secondary:
          "bg-[var(--secondary)] text-[var(--secondary-fg)] border-[var(--border)]",
        outline:
          "bg-transparent text-[var(--fg)] border-[var(--border)]",
        up: "bg-[var(--up-bg)] text-[var(--up)]",
        down: "bg-[var(--down-bg)] text-[var(--down)]",
        flat: "bg-[var(--muted)] text-[var(--flat)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
