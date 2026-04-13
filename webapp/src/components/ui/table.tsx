"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Table — UI-SPEC §3.3 + §8.5.3 Border Hairline System
 * - row-h: var(--row-h, 36px)
 * - cell pad: var(--cell-pad-y) var(--cell-pad-x)
 * - row divider: `tbody tr + tr > td { border-top: 1px solid var(--border-subtle); }` (hairline)
 * - thead bg: var(--muted)
 * - wrapper: `.tbl-wrap` 에서 위 규칙 일괄 적용 (globals.css)
 * - `.num` 유틸 (globals.css) — 숫자 셀 우측 정렬 + tabular-nums
 */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="tbl-wrap relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn(
          "w-full caption-bottom text-[length:var(--t-sm)] border-collapse",
          className
        )}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn(className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn(className)} {...props} />
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t border-[var(--border)] bg-[var(--muted)] font-medium",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "transition-colors data-[state=selected]:bg-[var(--muted)]",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn("whitespace-nowrap", className)}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("whitespace-nowrap", className)}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn(
        "mt-[var(--s-4)] text-[length:var(--t-sm)] text-[var(--muted-fg)]",
        className
      )}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
