---
schema_version: 1
open_count: 3
waived_count: 0
fixed_count: 0
total_count: 3
last_updated: 2026-09-12T06:13:08.181Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | quick-260912-gyz | unrun-verify | webapp/e2e/specs/trading-limit-chaser.spec.ts |  | 테스트 2 의 상한가 단언을 헤더 8칸 기준으로 다시 썼으나 Playwright 미실행 — 타입만 통과 | open |  | 2026-09-12T03:38:03.798Z |  |
| 2 | quick-260912-k2x | unrun-verify | webapp/src/styles/globals.css |  | 밴드 경계 700/830/992 의 폭 판정이 유닛 테스트로 증명되지 않았다 — jsdom 에는 레이아웃이 없다. 근거는 목업 실측(9개 실폭 프레임 374/700/736/752/792/845/892/992/1152, 전 구간 잘림 0)뿐이고 실기기 확인은 아직이다 | open |  | 2026-09-12T06:13:08.087Z |  |
| 3 | quick-260912-k2x | unrun-verify | webapp/e2e/specs/trading-limit-chaser.spec.ts |  | 390px 케이스의 pane 숨김 단언을 DOM 속성에서 가시성으로 다시 썼으나 Playwright 미실행 — 타입 통과로만 확인했다 | open |  | 2026-09-12T06:13:08.181Z |  |

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
  },
  {
    "id": 2,
    "kind": "unrun-verify",
    "phase": "quick-260912-k2x",
    "file": "webapp/src/styles/globals.css",
    "line": null,
    "description": "밴드 경계 700/830/992 의 폭 판정이 유닛 테스트로 증명되지 않았다 — jsdom 에는 레이아웃이 없다. 근거는 목업 실측(9개 실폭 프레임 374/700/736/752/792/845/892/992/1152, 전 구간 잘림 0)뿐이고 실기기 확인은 아직이다",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-12T06:13:08.087Z",
    "resolved_at": null
  },
  {
    "id": 3,
    "kind": "unrun-verify",
    "phase": "quick-260912-k2x",
    "file": "webapp/e2e/specs/trading-limit-chaser.spec.ts",
    "line": null,
    "description": "390px 케이스의 pane 숨김 단언을 DOM 속성에서 가시성으로 다시 썼으나 Playwright 미실행 — 타입 통과로만 확인했다",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-12T06:13:08.181Z",
    "resolved_at": null
  }
]
````
