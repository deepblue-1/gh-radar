"use client"

import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * shadcn `Checkbox` (radix-ui 통합 패키지 기반, Phase 16 Plan 01).
 *
 * - `switch.tsx` 와 같은 규약: primitive 는 `radix-ui` 배럴에서, `cn` 은 `@/lib/utils` 에서 받는다.
 *   shadcn CLI 원본은 `import { cn } from "cn"` 이라 무관한 npm 패키지 `cn` 을 새 의존성으로 끌어온다 — 제거함.
 * - 상태 셀렉터는 `data-[state=checked]` 다. 레지스트리 원본의 `data-checked:` 는 최신 Radix 전용이라
 *   이 저장소의 `@radix-ui/react-checkbox@1.3.3`(= `radix-ui@1.4.3`) 에서는 하나도 매칭되지 않아
 *   체크 상태 스타일이 통째로 죽는다.
 * - `group-has-...` field 계열 셀렉터도 제거했다 — 이 저장소에는 shadcn `Field` 컴포넌트가 없어 죽은 CSS 다.
 * - 사용 예: `<Checkbox checked={v} onCheckedChange={setV} aria-label="..." />`
 */
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input shadow-sm outline-none transition-colors",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        "data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
