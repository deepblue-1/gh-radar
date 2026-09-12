---
schema_version: 1
open_count: 2
waived_count: 0
fixed_count: 7
total_count: 9
last_updated: 2026-09-12T09:27:05.670Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | quick-260912-gyz | unrun-verify | webapp/e2e/specs/trading-limit-chaser.spec.ts |  | 테스트 2 의 상한가 단언을 헤더 8칸 기준으로 다시 썼으나 Playwright 미실행 — 타입만 통과 | fixed |  | 2026-09-12T03:38:03.798Z | 2026-09-12T09:27:04.998Z |
| 2 | quick-260912-k2x | unrun-verify | webapp/src/styles/globals.css |  | 밴드 경계 700/830/992 의 폭 판정이 유닛 테스트로 증명되지 않았다 — jsdom 에는 레이아웃이 없다. 근거는 목업 실측(9개 실폭 프레임 374/700/736/752/792/845/892/992/1152, 전 구간 잘림 0)뿐이고 실기기 확인은 아직이다 | open |  | 2026-09-12T06:13:08.087Z |  |
| 3 | quick-260912-k2x | unrun-verify | webapp/e2e/specs/trading-limit-chaser.spec.ts |  | 390px 케이스의 pane 숨김 단언을 DOM 속성에서 가시성으로 다시 썼으나 Playwright 미실행 — 타입 통과로만 확인했다 | fixed |  | 2026-09-12T06:13:08.181Z | 2026-09-12T09:27:05.107Z |
| 4 | quick-260912-mvo | unrun-verify | webapp/e2e/specs/chat.spec.ts |  | Playwright 미실행 — e2e 3파일(chat·trading-limit-chaser·trading-vi)의 새 FAB 부재/라우트 계약은 tsconfig.e2e.json 타입 통과로만 확인했다 | fixed |  | 2026-09-12T08:06:43.760Z | 2026-09-12T09:27:05.206Z |
| 5 | quick-260912-mvo | unrun-verify | webapp/src/components/trading/limit-chaser-form.tsx |  | Q-03 감시대상 세그먼트 버튼 폭(폰 67px · 와이드 78px, 접힘·잘림 0)은 목업 실측일 뿐 실기기 미확인 — jsdom 에 레이아웃이 없어 유닛으로 증명 불가 | fixed |  | 2026-09-12T08:06:55.283Z | 2026-09-12T09:27:05.302Z |
| 6 | quick-260912-mvo | unrun-verify | webapp/src/components/trading/limit-chaser-form.tsx |  | Q-06 카드 가로 패딩 8px×2 가 본문 700px 경계의 잘림 여유를 16px 갉아먹는다 — 미측정(T-mvo-07 accept) | fixed |  | 2026-09-12T08:06:55.378Z | 2026-09-12T09:27:05.395Z |
| 7 | quick-260912-mvo | unrun-verify | webapp/src/components/orderbook/orderbook-ladder.tsx |  | Q-07 240px 박스 안 초기 스크롤이 매도1/매수1 경계를 정중앙에 놓는지 브라우저 미확인 — jsdom 의 offsetTop·clientHeight 는 0 이라 정렬 effect 가 아예 돌지 않는다 | fixed |  | 2026-09-12T08:06:55.480Z | 2026-09-12T09:27:05.487Z |
| 8 | quick-260912-mvo | unrun-verify | webapp/src/components/trading/limit-chaser-client.tsx |  | Q-05 검색 입력(h-9)과 종목명 트리거 블록의 높이 차로 인한 잔여 레이아웃 점프량 미측정 — 폭·높이는 jsdom 으로 증명할 수 없다 | fixed |  | 2026-09-12T08:06:55.583Z | 2026-09-12T09:27:05.578Z |
| 9 | quick-260912-ok2 | unrun-verify | webapp/e2e/specs/trading-limit-chaser.spec.ts |  | ④ 헤더 3컨트롤(거래소 콤보·종목명 트리거·검색 입력) 동일 높이 단언은 케이스 11 이 **본문 700 밴드에서만** 잰다. 컨테이너 ≥992 밴드(뷰포트 1400 실측: 콤보 28→36 / 트리거 36 / 입력 36)는 사람이 브라우저로 잰 값일 뿐 자동 단언이 없다 — 그 밴드의 높이 회귀를 잡아 줄 기계 장치가 아직 없다 | open |  | 2026-09-12T09:27:05.670Z |  |

````json
[
  {
    "id": 1,
    "kind": "unrun-verify",
    "phase": "quick-260912-gyz",
    "file": "webapp/e2e/specs/trading-limit-chaser.spec.ts",
    "line": null,
    "description": "테스트 2 의 상한가 단언을 헤더 8칸 기준으로 다시 썼으나 Playwright 미실행 — 타입만 통과",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-12T03:38:03.798Z",
    "resolved_at": "2026-09-12T09:27:04.998Z"
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
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-12T06:13:08.181Z",
    "resolved_at": "2026-09-12T09:27:05.107Z"
  },
  {
    "id": 4,
    "kind": "unrun-verify",
    "phase": "quick-260912-mvo",
    "file": "webapp/e2e/specs/chat.spec.ts",
    "line": null,
    "description": "Playwright 미실행 — e2e 3파일(chat·trading-limit-chaser·trading-vi)의 새 FAB 부재/라우트 계약은 tsconfig.e2e.json 타입 통과로만 확인했다",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-12T08:06:43.760Z",
    "resolved_at": "2026-09-12T09:27:05.206Z"
  },
  {
    "id": 5,
    "kind": "unrun-verify",
    "phase": "quick-260912-mvo",
    "file": "webapp/src/components/trading/limit-chaser-form.tsx",
    "line": null,
    "description": "Q-03 감시대상 세그먼트 버튼 폭(폰 67px · 와이드 78px, 접힘·잘림 0)은 목업 실측일 뿐 실기기 미확인 — jsdom 에 레이아웃이 없어 유닛으로 증명 불가",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-12T08:06:55.283Z",
    "resolved_at": "2026-09-12T09:27:05.302Z"
  },
  {
    "id": 6,
    "kind": "unrun-verify",
    "phase": "quick-260912-mvo",
    "file": "webapp/src/components/trading/limit-chaser-form.tsx",
    "line": null,
    "description": "Q-06 카드 가로 패딩 8px×2 가 본문 700px 경계의 잘림 여유를 16px 갉아먹는다 — 미측정(T-mvo-07 accept)",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-12T08:06:55.378Z",
    "resolved_at": "2026-09-12T09:27:05.395Z"
  },
  {
    "id": 7,
    "kind": "unrun-verify",
    "phase": "quick-260912-mvo",
    "file": "webapp/src/components/orderbook/orderbook-ladder.tsx",
    "line": null,
    "description": "Q-07 240px 박스 안 초기 스크롤이 매도1/매수1 경계를 정중앙에 놓는지 브라우저 미확인 — jsdom 의 offsetTop·clientHeight 는 0 이라 정렬 effect 가 아예 돌지 않는다",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-12T08:06:55.480Z",
    "resolved_at": "2026-09-12T09:27:05.487Z"
  },
  {
    "id": 8,
    "kind": "unrun-verify",
    "phase": "quick-260912-mvo",
    "file": "webapp/src/components/trading/limit-chaser-client.tsx",
    "line": null,
    "description": "Q-05 검색 입력(h-9)과 종목명 트리거 블록의 높이 차로 인한 잔여 레이아웃 점프량 미측정 — 폭·높이는 jsdom 으로 증명할 수 없다",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-12T08:06:55.583Z",
    "resolved_at": "2026-09-12T09:27:05.578Z"
  },
  {
    "id": 9,
    "kind": "unrun-verify",
    "phase": "quick-260912-ok2",
    "file": "webapp/e2e/specs/trading-limit-chaser.spec.ts",
    "line": null,
    "description": "④ 헤더 3컨트롤(거래소 콤보·종목명 트리거·검색 입력) 동일 높이 단언은 케이스 11 이 **본문 700 밴드에서만** 잰다. 컨테이너 ≥992 밴드(뷰포트 1400 실측: 콤보 28→36 / 트리거 36 / 입력 36)는 사람이 브라우저로 잰 값일 뿐 자동 단언이 없다 — 그 밴드의 높이 회귀를 잡아 줄 기계 장치가 아직 없다",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-12T09:27:05.670Z",
    "resolved_at": null
  }
]
````
