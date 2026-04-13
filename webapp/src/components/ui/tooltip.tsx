"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Tooltip — UI-SPEC §3.9
 * - bg: var(--popover), color: var(--popover-fg), border: var(--border)
 * - rounded: var(--r), padding: 6px 10px, font: var(--t-caption)
 * - shadow: `0 4px 12px oklch(0 0 0 / 0.08)` (UI-SPEC §8.5.4 톤에 맞춘 soft)
 * - delayDuration 700ms (Radix 기본을 override)
 */
function TooltipProvider({
  delayDuration = 700,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 4,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 inline-flex w-fit max-w-xs items-center",
          "rounded-[var(--r)] px-[10px] py-[6px]",
          "bg-[var(--popover)] text-[var(--popover-fg)]",
          "border border-[var(--border)]",
          "text-[length:var(--t-caption)] whitespace-nowrap",
          "shadow-[0_4px_12px_oklch(0_0_0/0.08)]",
          "data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95",
          "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow
          className="size-2 fill-[var(--popover)] stroke-[var(--border)]"
        />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
