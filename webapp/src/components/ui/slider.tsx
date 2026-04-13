"use client"

import * as React from "react"
import { Slider as SliderPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Slider — UI-SPEC §3.7
 *
 * Phase 5 SCAN-02: min=10, max=29, step=1, defaultValue=[25]
 *   — 상한가 근접도 필터. 단위 %. 값 표시는 `.slider-val` (Geist Mono, tabular).
 *
 * - track: 4px, rounded-full, bg var(--muted)
 * - range (채움): bg var(--primary)
 * - thumb: 16px circle, bg var(--primary), border 2px var(--bg), soft shadow
 * - thumb `:focus-visible`: globals.css §8.5.5 Double-Ring 전역 규칙이 자동 적용됨
 *   (여기서 로컬 outline 을 추가하지 말 것 — UI-SPEC §3.7 원 규격은 §8.5.5 로 override)
 */
function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max]
  )

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative grow overflow-hidden rounded-full bg-[var(--muted)] data-horizontal:h-1 data-horizontal:w-full data-vertical:h-full data-vertical:w-1"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute bg-[var(--primary)] select-none data-horizontal:h-full data-vertical:w-full"
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          className={cn(
            "relative block size-4 shrink-0 rounded-full bg-[var(--primary)]",
            "border-2 border-[var(--bg)]",
            "shadow-[0_1px_3px_oklch(0_0_0/0.2)] cursor-pointer",
            "transition-[background,transform] duration-[120ms]",
            "disabled:pointer-events-none disabled:opacity-50"
          )}
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }
