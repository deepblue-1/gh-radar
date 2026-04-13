import { cn } from "@/lib/utils"

/**
 * Skeleton — UI-SPEC §3.6
 * - shimmer: `skeleton-shimmer` keyframes (globals.css) 1.6s linear infinite
 * - gradient: var(--muted) → color-mix(var(--muted) 60%, var(--bg)) → var(--muted)
 * - prefers-reduced-motion: animation none + opacity 0.7 (globals.css @media 처리)
 * - stagger: 부모에 `.skeleton-list` 부여 시 `:nth-child(1..10)` animation-delay (globals.css)
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "rounded-[var(--r-sm)] motion-reduce:animate-none motion-reduce:opacity-70",
        "bg-[linear-gradient(90deg,var(--muted),color-mix(in_oklch,var(--muted)_60%,var(--bg)),var(--muted))]",
        "bg-[size:200%_100%] [animation:skeleton-shimmer_1.6s_linear_infinite]",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
