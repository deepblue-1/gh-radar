---
schema_version: 1
open_count: 1
waived_count: 0
fixed_count: 0
total_count: 1
last_updated: 2026-09-12T03:38:03.798Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | quick-260912-gyz | unrun-verify | webapp/e2e/specs/trading-limit-chaser.spec.ts |  | 테스트 2 의 상한가 단언을 헤더 8칸 기준으로 다시 썼으나 Playwright 미실행 — 타입만 통과 | open |  | 2026-09-12T03:38:03.798Z |  |

````json
[
  {
    "id": 1,
    "kind": "unrun-verify",
    "phase": "quick-260912-gyz",
    "file": "webapp/e2e/specs/trading-limit-chaser.spec.ts",
    "line": null,
    "description": "테스트 2 의 상한가 단언을 헤더 8칸 기준으로 다시 썼으나 Playwright 미실행 — 타입만 통과",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-12T03:38:03.798Z",
    "resolved_at": null
  }
]
````
