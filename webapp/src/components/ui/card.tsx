import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Card — UI-SPEC §3.2 · 토스 B 스킨(260924-vj1)
 * - border-radius: var(--r-lg) (20px)
 * - 테두리는 색만 투명(1px 기하 유지) — 면 구분은 명도 단계(`--card` vs 본문면 `--surface`)가 한다.
 * - `default` 의 `.card-shadow` 는 B 에서 `none` — 클래스는 소비처 호환으로 남긴다.
 * - `plain` variant: 그림자 클래스 없음 (밀집 레이아웃)
 */
const cardVariants = cva(
  "flex flex-col gap-4 bg-[var(--card)] text-[var(--card-fg)] border border-transparent rounded-[var(--r-lg)] p-[var(--s-5)]",
  {
    variants: {
      variant: {
        default: "card-shadow",
        plain: "",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Card({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return (
    <div
      data-slot="card"
      data-variant={variant}
      className={cn(cardVariants({ variant }), className)}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-col gap-1", className)}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-semibold text-[length:var(--t-base)] leading-tight",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn(
        "text-[length:var(--t-sm)] text-[var(--muted-fg)]",
        className
      )}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("self-start justify-self-end", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn(className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center border-t border-[var(--border-subtle)] pt-[var(--s-4)]",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  cardVariants,
}
