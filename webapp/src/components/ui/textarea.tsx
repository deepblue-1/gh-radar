import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Textarea — 포커스는 **테두리색 변화 한 겹**이다 (quick-260912-mvo Q-02).
 *
 * `data-focus-ring="seamless"` 가 globals.css §8.5.5 의 전역 Double-Ring 변수를 해제하고,
 * 이 컴포넌트가 원래 갖고 있던 Tailwind 자체 포커스 링 유틸리티는 **걷었다**.
 * 그 유틸리티는 `.class:focus-visible`(특이도 0,2,0)이라 전역 `*:focus-visible`(0,1,0)을
 * 이긴다 — seamless 변수만으로는 걷히지 않아 두 겹이 그대로 남았다.
 *
 * ⚠️ `focus-visible:border-ring` 은 **이 컴포넌트의 유일한 포커스 표시**다. 지우지 말 것.
 * `aria-invalid:*` 의 링은 포커스가 아니라 오류 신호이므로 그대로 둔다.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      data-focus-ring="seamless"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
