---
phase: 38-own-orders-on-ticks
plan: 09
subsystem: ticks
tags: [e2e, playwright, tick-viewer, own-orders, strict-mode]

requires:
  - phase: 38-08
    provides: "제목 줄 tick-own-nav 알약 · 키 [ ] · 당일 최신 받기 = live 1 + own 1"
  - phase: 38-06
    provides: "tick-own-section · tick-own-table(캡션) · tick-own-jump(data-to) · tick-own-back 알약"
  - phase: 38-04
    provides: "tick-own-order · tick-own-nofill · tick-own-rail(data-node) · tick-own-chip"
provides:
  - "e2e fixtures: ECO_OWN(컷 13시 KRX 유도값) · tickOwnFixture(q) · mock case '/api/ticks/own' · rec.own · opts.own(실패 상태)"
  - "spec 절 「틱뷰어 우리 주문 · 체결 (Phase 38)」 — 과거 흐름 · 실패 내성 500/404 · 당일 최신 받기 · 폰 390"
  - "use-tick-own: 같은 요청 키 진행 중 요청 공유(StrictMode 이중 effect = 요청 1)"
affects: [38-10]

estimate:
  tokens: 55000
  tasks: 2
actuals:
  tokens: 6960
  tasks: 2
  commits: 2
plan_head_before: 8a1dad8c2057781df77923fdea3a229824977bf0
plan_head_after: 10b1483ea39ae7cce035377b29f2102f56273475

tech-stack:
  added: []
  patterns:
    - "e2e 합성 우리 체결은 실제 격자에서 유도한 값만 쓴다(shared dist 의 matchOwnFills · locateEvidence 로 확인) — 유도 근거를 픽스처 주석에"
    - "mockTickApi 기본이 own 픽스처 — 37 절도 우리 층이 켜진 화면에서 회귀한다 · 실패 경로는 opts.own 으로"
    - "훅의 진행 중 요청 공유는 ref 로(모듈 캐시 아님) — StrictMode 정리 → 재실행만 묶고 재마운트 · refreshKey 는 새 요청"

key-files:
  created: []
  modified:
    - webapp/e2e/fixtures/ticks.ts
    - webapp/e2e/specs/ticks-viewer.spec.ts
    - webapp/src/lib/ticks/use-tick-own.ts
    - webapp/src/lib/ticks/__tests__/use-tick-own.test.tsx

key-decisions:
  - "mockTickApi 의 /api/ticks/own 기본 응답 = tickOwnFixture — 37 절 전체가 우리 층(둘째 레일 · 주문 줄 · 칩)이 켜진 상태로 돌아 회귀 범위가 넓어진다. 404 경로는 실패 내성 테스트가 명시적으로 덮는다"
  - "useTickOwn 진행 중 요청 공유를 모듈 캐시가 아니라 컴포넌트 ref 로 — StrictMode 재실행만 묶이고, 다시 열기(재마운트)와 refreshKey 변경은 그대로 새 요청(호출량 = 열기 · 클릭 비례 유지)"
  - "짝 없음 체결 (c) 시각 = 13:45:00.000(계획 「13:50 근처」) — 컷이 13:48:32.565 에서 끝나 13:50 이면 줄이 목록 맨 끝에 붙는다"

patterns-established:
  - "own e2e 단언은 ECO_OWN 상수(seq · 가격 · 수량 · 주문번호)로 — 숫자를 spec 에 다시 적지 않는다"

requirements-completed: []

coverage:
  - id: D1
    description: "과거 — own 1회 · 13:30 → ] → (a) 칩 166/500 · 레일 ● ◆ ○ ◌ ◇ · 알약 0/3 → 1/3 → 2/3 → 3/3 · 주문 3 · 카드 「◆ 우리 주문 #100231」 · 표 캡션 「이 날 3건 · 체결 3건 · 켜진 서버 KB120 · KYOBO119」 · 보기 › → 근거 B6 seq 79597 · 「‹ 주문 #100231 로」 → 주문 줄 · 사라짐 · ] 로 (b) 칩 733 · 짝 없음 줄 「짝 전문 없음」 · › 비활성 · 넘침 0"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/ticks-viewer.spec.ts#틱뷰어 우리 주문 · 체결 (Phase 38) › 과거 — 칩 · 주문 줄 · 짝 없음 · 레일 · 알약 · ] · 카드 · 표 · 보기 › · 되돌아가기"
        status: pass
    human_judgment: false
  - id: D2
    description: "실패 내성 — own 500 · 404 → 호가 · 전문 목록 · 차트 보임 · 알약 · 칩 · 주문 줄 · 레일 마디 · 표 · 상태 카드 0 · 재시도 0 · 37 행 클릭 동작 그대로"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/ticks-viewer.spec.ts#실패 내성 — own 500 · 실패 내성 — own 404"
        status: pass
    human_judgment: false
  - id: D3
    description: "당일 — 마운트 own 1 · 「↻ 최신 받기」 1회 = live 증분 1 + own 1 · 6초 뒤 own 2 그대로 · live 추가 0"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/ticks-viewer.spec.ts#당일 — 「↻ 최신 받기」 1회 = live 증분 1 + own 1"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/ticks/__tests__/use-tick-own.test.tsx#(38-09) StrictMode 이중 effect = 요청 1"
        status: pass
    human_judgment: false
  - id: D4
    description: "폰 390 — 「전문」 둘째 레일 칸 14px · 주문 줄 · 근거 ○ · 넘침 0 · 「버스트 · 팀」 우리 주문 표 캡션 · 1280 으로 돌려 넘침 0"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/ticks-viewer.spec.ts#폰 390 — 「전문」 둘째 레일 14px 칸"
        status: pass
    human_judgment: true
    rationale: "넘침 · 칸 폭은 자동으로 쟀지만 민트 대비 · 마디 모양 · 알약 줄바꿈의 읽힘은 눈 확인(38-10 UAT)"
  - id: D5
    description: "37 회귀 — ticks-viewer 전체(37 절이 우리 층 켜진 기본 목으로) · sidebar-tree green · 가상화 행 < 80 · 행 높이 단언 그대로"
    verification:
      - kind: e2e
        ref: "pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/ticks-viewer.spec.ts e2e/specs/sidebar-tree.spec.ts --workers=1 (35 passed)"
        status: pass
    human_judgment: false

duration: 13min
completed: 2026-11-03
status: complete
---

# Phase 38 Plan 09: e2e 우리 주문 · 체결 — 과거 · 실패 내성 · 당일 · 폰 390 Summary

**컷 13시 KRX 격자에서 유도한 합성 우리 체결 3 · 주문 3(`ECO_OWN`)을 `/api/ticks/own` 목으로 주고 실제 브라우저에서 칩 「166/500」 → 레일 ● ◆ ○ ◌ ◇ → 알약 k/3 → `]` → 카드 「◆ 우리 주문 #…」 → 표 캡션 → 「보기 ›」 근거 B6 → 「‹ 주문 # 로」 → 짝 없음 줄까지 한 흐름으로 잠갔다. own 500/404 내성, 당일 「최신 받기」 1회 = own 1회, 폰 390 레일 · 표, 37 전체 회귀도 함께 돈다. 이 과정에서 개발 StrictMode 가 own 을 두 번 부르던 문제를 `useTickOwn` 진행 중 요청 공유로 고쳤다.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-11-03T07:27:35Z
- **Completed:** 2026-11-03T07:40:27Z
- **Tasks:** 2 (Task 1 tracer · Task 2 auto)
- **Files modified:** 4 (새 파일 없음)

## Accomplishments

- **유도값**(스크래치 스크립트 · 커밋 안 함 — shared dist `buildTickIndex` · `a3ColumnsOf` · `recvOrderOf` · `bookAt` · `a3TimeMs` · `matchOwnFills` · `locateEvidence` · `anchorOf`):
  - (a) A3 seq 79601 · 13:33:29.448 · 10,340 × 500 → 우리 166 · gw +30 · 후보 1
  - (b) A3 seq 81941 · 13:36:01.985 · 10,660 × 733 → 전량 · gw +10 · 후보 1
  - (c) 13:45:00.000 · 10,600 × 100 → ± 2초 안 A3 0건(짝 없음)
  - 주문 1 이벤트: 선매수 · 매물소진 · 근거 B6 seq 79597(매도1 10,340 잔량 1,308→1,234) · 앵커 A3 seq 79596(누적 1,347,810)
  - 주문 2: 수동(KYOBO119) · 주문 3: 보조 주문 행 limit_chaser
- **fixtures**: `ECO_OWN` · `tickOwnFixture`(그 밖 종목은 빈 배열 + 서버 둘) · `case '/api/ticks/own'` · `rec.own` · `opts.own`(`{status}` 면 그 코드로 실패). 계좌는 합성 `1234560001` · `1234560002`.
- **spec 절** 「틱뷰어 우리 주문 · 체결 (Phase 38)」 테스트 5개: 과거 흐름 · 실패 내성 500 · 404 · 당일 · 폰 390.
- **use-tick-own**: 같은 요청 키(종목 + refreshKey)가 받는 중이면 그 요청을 나눠 쓴다(ref · 끝나면 비움) + 단위 테스트(RED 확인: 옛 구현 「2 times」).

## Task Commits

1. **Task 1 (tracer): 과거 흐름 + own 픽스처 · 목 + StrictMode 이중 요청 수정** — `223c9c3e` (test)
2. **Task 2: 실패 내성 · 당일 · 폰 390 · 37 회귀** — `10b1483e` (test)

**Plan metadata:** 이 SUMMARY 커밋(docs)

## Files Created/Modified

- `webapp/e2e/fixtures/ticks.ts` — `ECO_OWN` · `tickOwnFixture` · own 목 · 기록 · 실패 옵션
- `webapp/e2e/specs/ticks-viewer.spec.ts` — 새 절(테스트 5)
- `webapp/src/lib/ticks/use-tick-own.ts` — 진행 중 요청 공유(⑥)
- `webapp/src/lib/ticks/__tests__/use-tick-own.test.tsx` — StrictMode 1회 단언 1건

## Verification (실행 결과 그대로)

- 시작 전: vitest 0 · playwright 0 · 포트 3100 비어 있음(매 playwright 실행 직전 확인 — 늘 비어 있어 이 worktree 에서 webServer 를 띄웠고 끝나면 내려감 · 마지막 확인도 비어 있음).
- Task 1 첫 실행: **1 failed** — `rec.own` 이 `[KRX, KRX]`(2회). 원인 = `reactStrictMode: true` 개발 서버가 뷰어 마운트 effect 를 정리 → 재실행해 `useTickOwn` 이 두 번 부름(첫 응답은 버려짐). 수정 뒤 단위 RED(옛 구현 「expected 1 times, but got 2」) → GREEN 10 passed.
- Task 1 `<verify>`: shared build · `typecheck`(앱 + e2e) · `typecheck:e2e` 통과 · `playwright test ticks-viewer.spec.ts -g "우리 주문" --workers=1` → **2 passed**(setup + 과거 흐름).
- 트레이서 게이트: auto_advance false · human_verify_mode 기본(end-of-phase) · `<verify>` 자동만 → 재실행 통과로 체크포인트 없이 확장.
- Task 2 `-g "우리 주문"` → **6 passed**(setup + 5).
- Task 2 `<verify>`(마지막 실행 = spec 전체): shared build · `typecheck:e2e` 통과 · `playwright test ticks-viewer.spec.ts sidebar-tree.spec.ts --workers=1` → **35 passed (1.6m) · failed 0 · flaky 0**(픽스처 정리 전 · 후 두 번 모두 35 passed).
- 추가 회귀(계획 밖 — 훅 수정 때문): `vitest run src/lib/ticks src/components/ticks --maxWorkers=2` → 26 files · 346 passed · `[tick-own]` 경고 0.
- 수용 기준 grep: `case '/api/ticks/own'` · `export function tickOwnFixture` · `cut1300-krx` · `우리 주문 · 체결 (Phase 38)` · `켜진 서버 KB120 · KYOBO119` · `tick-own-rail` · `waitForTimeout(6_000)` PASS · `grep -cE "status: (500|404)"` = 2.
- eslint(변경 4파일) 경고 0. prettier `--check` 는 이 파일들이 이 플랜 전부터 통과하지 않아(원본도 rc 1) 저장소가 강제하지 않는 것으로 보고 손대지 않았다.
- 미실행: 실데이터 own(배포 RPC) · 다크 테마 · 실제 기기 폰 · 배포 — 38-10 메인 세션.

## Decisions Made

frontmatter key-decisions 3건 그대로.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 개발 StrictMode 에서 뷰어를 열면 `/api/ticks/own` 이 2회 불림**
- **Found during:** Task 1(첫 e2e 실행 — `rec.own` 2건)
- **Issue:** `useTickOwn` effect 가 마운트마다 새 요청을 보낸다. `reactStrictMode: true` 개발 서버는 effect 를 정리 → 재실행하므로 열기 1번에 요청 2번(첫 응답은 세대 끊기로 버려짐). 운영 빌드는 1회지만, 개발 · e2e 에서 계약 「열 때 1회」 가 깨지고 같은 페이지의 격자 받기(`use-tick-grid` — 진행 중 요청 공유로 1회)와도 규율이 달랐다.
- **Fix:** 같은 요청 키가 아직 받는 중이면 그 Promise 를 나눠 쓴다. 모듈 캐시가 아니라 컴포넌트 `useRef` 라 StrictMode 정리 → 재실행만 묶이고, 다시 열기(재마운트) · refreshKey 변경은 그대로 새 요청이다. 늦은 응답 버리기(세대 `current`)는 그대로.
- **Files modified:** webapp/src/lib/ticks/use-tick-own.ts, webapp/src/lib/ticks/__tests__/use-tick-own.test.tsx(계획 files 밖)
- **Verification:** 새 단위 테스트(`renderHook(..., { reactStrictMode: true })` → 요청 1 · refreshKey +1 → 2) — 옛 구현에서 실패 · 새 구현 통과 · 기존 9건 그대로 · e2e 과거 · 당일 테스트가 `rec.own` 정확히 1 · 2 를 단언
- **Committed in:** 223c9c3e

### 계획 대비 작은 차이(기록)

- **짝 없음 (c) 시각 13:45:00.000** — 계획은 「13:50:00.000 근처」. 컷 KRX 마지막 레코드가 13:48:32.565 라 13:50 이면 짝 없음 줄 · 주문 3 줄이 목록 맨 끝에 붙는다. 13:45 는 ± 2초 안 A3 0건(그 가격 포함)이라 「짝 없음」 조건은 같다.
- **주문 줄 → `]` 세 번** — 계획 「주문 줄로 선택 → `]` 두 번 → 짝 없음 줄」. 되돌아가기 알약이 고르는 주문 1 줄은 (a) 보다 앞이라 `]` → (a) → (b) → 짝 없음 줄로 세 번이다. 중간 (b) 에서 칩 「733」(분모 없음) · 알약 2/3 를 같이 단언했다. 주문 2 줄(수동)은 화면 밖 가상화 행이라 클릭 대신 문구만 단언.
- **mockTickApi 기본 own = 픽스처** — 계획은 기본값을 정하지 않았다. 37 절 전부가 우리 층이 켜진 화면으로 돌아 「둘째 레일 열 추가로 37 화면이 깨지지 않았는가」 를 직접 본다. 37 단언은 하나도 고치지 않았고 그대로 통과했다(원인 플랜 구현 수정 0).
- **실패 내성 테스트 둘로** — 한 테스트에서 상태만 바꾸면 라우트가 쌓여 헷갈려 500 · 404 를 같은 도우미를 쓰는 테스트 둘로 나눴다. 37 행 클릭 · 이 주문 카드 동작도 그 안에서 확인.
- **폰 테스트 딥링크 `t=13:33:29.000`** — 우리 줄 · 근거 ○ 가 폰 목록에 실제로 그려진 상태에서 넘침을 재려고(열기 직후 13:00 근처엔 우리 마디가 없다).
- **픽스처 정리** — Task 2 커밋에 체결 행 세 줄을 짧은 도우미로 정리(값 무변경 · 이후 전체 회귀 재실행 35 passed).

---

**Total deviations:** 1 auto-fixed(Rule 1) + 기록 6건
**Impact on plan:** 금지 사항 준수 — 합성 계좌만(`1234560001` 꼴 · dma_user_id 없음) · playwright `--workers=1` · vitest `--maxWorkers=2` · 다른 세션 테스트 0 확인 뒤 실행. 37 단언 무수정.

## Issues Encountered

- 이 세션의 격리 검사가 `$PWD` 같은 실행 시점 인자를 쓰는 node 명령을 막아 절대 경로로 다시 돌렸다(결과물 영향 없음).
- 첫 실행 직전 `ps` 에 playwright 프로세스 1개가 잠깐 보였으나 포트 3100 은 비어 있었고 직후 사라졌다(다른 세션의 짧은 실행으로 보임 · 이 worktree webServer 로 실행됨 — 새 own 단언이 이 worktree 의 수정 전/후로 결과가 달라진 것으로 확인).

## Known Stubs

없음.

## User Setup Required

None — 배포는 38-10 메인 세션.

## Next Phase Readiness

- 38-10(배포 · UAT): 이번 e2e 가 덮지 못한 것 — 실 RPC own 데이터 · 다크 테마 민트 대비 · 실제 폰 · 서버 로그로 own 호출 수(열기 · 「최신 받기」 비례) 확인.
- 개발 서버 · e2e 에서 own 호출은 이제 열기 1회다. 운영 동작은 원래 1회였으므로 배포 영향은 없다(StrictMode 는 개발 전용).

## Self-Check: PASSED

- 수정 파일 4개 존재 · 커밋 `223c9c3e` · `10b1483e` 이 HEAD 이력에 있음 · `git rev-list --count 8a1dad8c..HEAD` = 2 · 삭제 파일 0.
