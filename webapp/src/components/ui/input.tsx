import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Input — UI-SPEC §3.5
 * - border: var(--input), rounded var(--r), bg var(--bg), color var(--fg)
 * - error: `aria-invalid="true"` 또는 `data-invalid="true"` → border `--destructive`
 * - disabled: opacity 0.5
 * - focus (quick-260912-mvo Q-02): `data-focus-ring="seamless"` 로 전역 Double-Ring 을
 *   해제하고 **테두리색 변화 한 겹**(`focus-visible:border-[var(--ring)]`)으로만 말한다.
 *   입력은 이미 자기 테두리를 갖기 때문에 전역 링이 얹히면 두 겹으로 보였다.
 *   ⚠️ 둘은 한 쌍이다 — 테두리 유틸리티를 지우면 포커스가 아무 표시 없이 사라진다(WCAG 2.4.7).
 */
const inputVariants = cva(
  [
    "w-full min-w-0 rounded-[var(--r)] border",
    "border-[var(--input)] bg-[var(--bg)] text-[var(--fg)]",
    "px-3 outline-none font-[inherit]",
    "focus-visible:border-[var(--ring)]",
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
      data-focus-ring="seamless"
      className={cn(inputVariants({ size }), className)}
      {...props}
    />
  )
}

export { Input, inputVariants }
