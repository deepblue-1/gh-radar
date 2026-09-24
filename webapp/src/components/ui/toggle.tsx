"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Toggle as TogglePrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * B(260924-vj1): `outline`(세그먼트) 은 무테 raised 채움(`--muted`), 선택(`data-[state=on]` ·
 * `aria-pressed`)은 세그먼트 선택 면 `--seg-on-bg`/`--seg-on-fg` + `--seg-on-shadow`(라이트만 보임).
 * `default`(고스트 — 관심종목 하트 등)는 선택 색을 소비처가 직접 정하므로 기존 `bg-muted` 그대로.
 * ⚠️ toggle-group 컨테이너 패딩은 넣지 않는다 — xs 세그먼트 소비처가 `lc` 카드 헤더 안이라 가로 폭 증가 금지.
 */
const toggleVariants = cva(
  "group/toggle inline-flex items-center justify-center gap-1 rounded-lg text-sm font-medium whitespace-nowrap transition-all outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-pressed:bg-muted data-[state=on]:bg-muted dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline:
          "border border-transparent bg-[var(--muted)] hover:bg-[var(--raised-2)] aria-pressed:bg-[var(--seg-on-bg)] aria-pressed:text-[var(--seg-on-fg)] aria-pressed:shadow-[var(--seg-on-shadow)] data-[state=on]:bg-[var(--seg-on-bg)] data-[state=on]:text-[var(--seg-on-fg)] data-[state=on]:shadow-[var(--seg-on-shadow)]",
      },
      size: {
        default:
          "h-8 min-w-8 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        sm: "h-7 min-w-7 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 min-w-9 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
