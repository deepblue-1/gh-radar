---
schema_version: 1
open_count: 3
waived_count: 0
fixed_count: 8
total_count: 11
last_updated: 2026-09-12T13:36:06.535Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | quick-260912-gyz | unrun-verify | webapp/e2e/specs/trading-limit-chaser.spec.ts |  | 테스트 2 의 상한가 단언을 헤더 8칸 기준으로 다시 썼으나 Playwright 미실행 — 타입만 통과 | fixed |  | 2026-09-12T03:38:03.798Z | 2026-09-12T09:27:04.998Z |
| 2 | quick-260912-k2x | unrun-verify | webapp/src/styles/globals.css |  | 밴드 경계 700/830/992 의 폭 판정이 유닛 테스트로 증명되지 않았다 — jsdom 에는 레이아웃이 없다. 근거는 목업 실측(9개 실폭 프레임 374/700/736/752/792/845/892/992/1152, 전 구간 잘림 0)뿐이고 실기기 확인은 아직이다 | fixed |  | 2026-09-12T06:13:08.087Z | 2026-09-12T13:36:06.348Z |
| 3 | quick-260912-k2x | unrun-verify | webapp/e2e/specs/trading-limit-chaser.spec.ts |  | 390px 케이스의 pane 숨김 단언을 DOM 속성에서 가시성으로 다시 썼으나 Playwright 미실행 — 타입 통과로만 확인했다 | fixed |  | 2026-09-12T06:13:08.181Z | 2026-09-12T09:27:05.107Z |
| 4 | quick-260912-mvo | unrun-verify | webapp/e2e/specs/chat.spec.ts |  | Playwright 미실행 — e2e 3파일(chat·trading-limit-chaser·trading-vi)의 새 FAB 부재/라우트 계약은 tsconfig.e2e.json 타입 통과로만 확인했다 | fixed |  | 2026-09-12T08:06:43.760Z | 2026-09-12T09:27:05.206Z |
| 5 | quick-260912-mvo | unrun-verify | webapp/src/components/trading/limit-chaser-form.tsx |  | Q-03 감시대상 세그먼트 버튼 폭(폰 67px · 와이드 78px, 접힘·잘림 0)은 목업 실측일 뿐 실기기 미확인 — jsdom 에 레이아웃이 없어 유닛으로 증명 불가 | fixed |  | 2026-09-12T08:06:55.283Z | 2026-09-12T09:27:05.302Z |
| 6 | quick-260912-mvo | unrun-verify | webapp/src/components/trading/limit-chaser-form.tsx |  | Q-06 카드 가로 패딩 8px×2 가 본문 700px 경계의 잘림 여유를 16px 갉아먹는다 — 미측정(T-mvo-07 accept) | fixed |  | 2026-09-12T08:06:55.378Z | 2026-09-12T09:27:05.395Z |
| 7 | quick-260912-mvo | unrun-verify | webapp/src/components/orderbook/orderbook-ladder.tsx |  | Q-07 240px 박스 안 초기 스크롤이 매도1/매수1 경계를 정중앙에 놓는지 브라우저 미확인 — jsdom 의 offsetTop·clientHeight 는 0 이라 정렬 effect 가 아예 돌지 않는다 | fixed |  | 2026-09-12T08:06:55.480Z | 2026-09-12T09:27:05.487Z |
| 8 | quick-260912-mvo | unrun-verify | webapp/src/components/trading/limit-chaser-client.tsx |  | Q-05 검색 입력(h-9)과 종목명 트리거 블록의 높이 차로 인한 잔여 레이아웃 점프량 미측정 — 폭·높이는 jsdom 으로 증명할 수 없다 | fixed |  | 2026-09-12T08:06:55.583Z | 2026-09-12T09:27:05.578Z |
| 9 | quick-260912-ok2 | unrun-verify | webapp/e2e/specs/trading-limit-chaser.spec.ts |  | ④ 헤더 3컨트롤(거래소 콤보·종목명 트리거·검색 입력) 동일 높이 단언은 케이스 11 이 **본문 700 밴드에서만** 잰다. 컨테이너 ≥992 밴드(뷰포트 1400 실측: 콤보 28→36 / 트리거 36 / 입력 36)는 사람이 브라우저로 잰 값일 뿐 자동 단언이 없다 — 그 밴드의 높이 회귀를 잡아 줄 기계 장치가 아직 없다 | open |  | 2026-09-12T09:27:05.670Z |  |
| 10 | quick-260912-u58 | unrun-verify | webapp/src/components/orderbook/orderbook-ladder.tsx |  | 3단 호가표 체결 셀의 체결가 예산은 7자(127,400)까지다 — 백만원대 7자리(1,234,000)는 56px 이 필요한데 와이드 48(넘침 8) · 데스크톱 49(넘침 7)로 잘린다. 이번 변경이 만든 것이 아니라 데스크톱에도 있던 선재 한계이고, 글꼴을 10px 밑으로 줄이는 것은 §2.2b 의 10px 예외 규칙을 깨므로 하지 않았다. 고가주에서 체결가가 잘린 채 표시될 수 있다 | open |  | 2026-09-12T13:36:06.444Z |  |
| 11 | quick-260912-u58 | unrun-verify | webapp/e2e/specs/trading-limit-chaser.spec.ts |  | 밴드 **전이점** 자동 단언은 아직 없다 — 테스트 12·13 이 컨테이너 344/374/736/991/832/880/960/1100 을 실브라우저로 재지만, 829↔830 과 991↔992 에서 실제로 밴드가 바뀌는지는(1px 차이로 3단 호가표 ↔ 2단 호가 / 10칸 ↔ 5단 2행) 단언하지 않는다. 경계값 자체가 틀어져도 그 사이 지점들이 초록이면 지난다 | open |  | 2026-09-12T13:36:06.535Z |  |

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
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-12T06:13:08.087Z",
    "resolved_at": "2026-09-12T13:36:06.348Z"
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
  },
  {
    "id": 10,
    "kind": "unrun-verify",
    "phase": "quick-260912-u58",
    "file": "webapp/src/components/orderbook/orderbook-ladder.tsx",
    "line": null,
    "description": "3단 호가표 체결 셀의 체결가 예산은 7자(127,400)까지다 — 백만원대 7자리(1,234,000)는 56px 이 필요한데 와이드 48(넘침 8) · 데스크톱 49(넘침 7)로 잘린다. 이번 변경이 만든 것이 아니라 데스크톱에도 있던 선재 한계이고, 글꼴을 10px 밑으로 줄이는 것은 §2.2b 의 10px 예외 규칙을 깨므로 하지 않았다. 고가주에서 체결가가 잘린 채 표시될 수 있다",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-12T13:36:06.444Z",
    "resolved_at": null
  },
  {
    "id": 11,
    "kind": "unrun-verify",
    "phase": "quick-260912-u58",
    "file": "webapp/e2e/specs/trading-limit-chaser.spec.ts",
    "line": null,
    "description": "밴드 **전이점** 자동 단언은 아직 없다 — 테스트 12·13 이 컨테이너 344/374/736/991/832/880/960/1100 을 실브라우저로 재지만, 829↔830 과 991↔992 에서 실제로 밴드가 바뀌는지는(1px 차이로 3단 호가표 ↔ 2단 호가 / 10칸 ↔ 5단 2행) 단언하지 않는다. 경계값 자체가 틀어져도 그 사이 지점들이 초록이면 지난다",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-12T13:36:06.535Z",
    "resolved_at": null
  }
]
````
