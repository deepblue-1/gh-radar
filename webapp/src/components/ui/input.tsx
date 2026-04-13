import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Input — UI-SPEC §3.5
 * - border: var(--input), rounded var(--r), bg var(--bg), color var(--fg)
 * - error: `aria-invalid="true"` 또는 `data-invalid="true"` → border `--destructive`
 * - disabled: opacity 0.5
 * - focus 는 globals.css §8.5.5 Double-Ring 전역 규칙에 위임
 */
const inputVariants = cva(
  [
    "w-full min-w-0 rounded-[var(--r)] border",
    "border-[var(--input)] bg-[var(--bg)] text-[var(--fg)]",
    "px-3 outline-none font-[inherit]",
    "transition-[border-color,box-shadow] duration-[120ms]",
    "placeholder:text-[var(--muted-fg)]",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
    "aria-invalid:border-[var(--destructive)] data-[invalid=true]:border-[var(--destructive)]",
    "file:inline-flex file:border-0 file:bg-transparent file:text-[length:var(--t-sm)] file:font-medium file:text-[var(--fg)]",
  ].join(" "),
  {
    variants: {
      size: {
        sm: "h-8 text-[length:var(--t-caption)]",
        default: "h-9 text-[length:var(--t-sm)]",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

type InputProps = Omit<React.ComponentProps<"input">, "size"> &
  VariantProps<typeof inputVariants>

function Input({ className, type, size, ...props }: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(inputVariants({ size }), className)}
      {...props}
    />
  )
}

export { Input, inputVariants }
