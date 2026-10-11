---
phase: 25-order-log-progress
plan: 09
subsystem: webapp
tags: [react, account-panel, queue-progress, progressbar, playwright, tdd]

requires:
  - phase: 25-06
    provides: "useRelayContext().queueProgress · findQueueProgress · progressView · reportUnmatchedProgressOnce · e2e LocalRelay.pushQueueProgress"
  - phase: 25-04
    provides: "shared ORDER_GROUP_LABELS(선매수 · 추가매수 · 후매수) — progressGroupLabel 이 읽는다"
provides:
  - "UnfilledProgress({ view, variant: 'row' | 'compact', muted, selected }) — 데스크톱 보조행 한 줄 · 모바일 r3 · progressbar 접근성"
  - "account-panel 진행률 B안 — 기본 표 colSpan 7 · 임베드 stockScope ? 5 : 7 · 모바일 카드 r3 · 머리 주석 ⑫"
  - "UnfilledProgressRow — 기본 표 · 임베드가 공유하는 보조 <tr data-slot=\"unfilled-progress-row\">"
  - "e2e unfilled-progress.spec.ts P25-P1 ~ P25-P6 (가짜 게이트웨이 83 → 3표면 + 모바일)"
affects: [25-12]

actuals:
  tokens: 14700
  tasks: 3
  commits: 11
plan_head_before: 5e5fbdfe180e58ffdbb33ca6e2e8d28e5a878e41

tech-stack:
  added: []
  patterns:
    - "표 보조행이 표 폭을 정하지 않게: 한 줄에 `w-0 min-w-full`(자동 폭 계산 기여 0) + 막대 신축(140→40px)"
    - "층 없는 `.tbl-wrap tbody td` · `tr:hover td` 는 `!h-auto !pt-0 !pb-2 !bg-transparent` 로 이긴다(globals.css 무변경 · 25-08 펼침 행과 같은 문법)"
    - "진행률 문구 조각은 unfilled-progress.tsx 상수 + progressView 값 텍스트 두 곳뿐"

key-files:
  created:
    - webapp/src/components/orderbook/unfilled-progress.tsx
    - webapp/src/components/orderbook/__tests__/unfilled-progress.test.tsx
    - webapp/e2e/specs/unfilled-progress.spec.ts
  modified:
    - webapp/src/components/orderbook/account-panel.tsx
    - webapp/src/components/orderbook/__tests__/account-panel.test.tsx

key-decisions:
  - "진행률 보조행은 표 폭을 넓히지 않는다(w-0 min-w-full + 막대 140→40px 신축) — 넓히면 카드 탭 폰 폭(뷰포트 344)에서 미체결 표 전체가 324→380 가로 스크롤돼 「취소」 가 화면 밖으로 밀렸다(실측). 1280 · 1440 은 140px 그대로"
  - "보조행은 기본 표 · 임베드가 한 컴포넌트(UnfilledProgressRow)를 공유 — data-slot 리터럴이 파일에 1회(acceptance grep ≥2 대신 · 두 벌 금지 원칙)"
  - "UnfilledProgress 에 selected prop — 선택 배경(accent) 위에서 --fg 조각을 --accent-fg 로(SideTag · 카드 fg 와 같은 규칙) · 취소 보관이면 종류명도 muted(반만 회색 행 방지)"
  - "B 표에는 행 구분선이 없어(globals.css 260924-vj1) 「구분선을 보조행으로 넘기기」는 넘길 선이 없다 — 새 선을 만들지 않았다"

requirements-completed: []

coverage:
  - id: D1
    description: "UnfilledProgress — row 한 줄(140px · 신축) · compact(막대 유일 신축) · progressbar 4종 + 이름 + 값 텍스트 · near/full --up · 미만 --primary · muted --faint"
    verification:
      - kind: unit
        ref: "webapp/src/components/orderbook/__tests__/unfilled-progress.test.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "account-panel 3표면 + 모바일 r3 — D-11 없음 · D-13 사라짐 · 문자열 동등(앞 0 · 거래소) · 취소 결과 행 위 · 선택 배경 · 취소 보관 muted · 표 폭 불변"
    verification:
      - kind: unit
        ref: "webapp/src/components/orderbook/__tests__/account-panel.test.tsx#AccountPanel — 진행률 B안 (Phase 25 · D-11~D-13)"
        status: pass
    human_judgment: false
  - id: D3
    description: "실브라우저 — 가짜 게이트웨이 83 → relay → /me 1280 · 390 · /trading 공용 패널 · 카드 탭 stockScope"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/unfilled-progress.spec.ts#P25-P1 ~ P25-P5"
        status: pass
    human_judgment: false
  - id: D4
    description: "백스톱 E8 overflow — 카드 탭 최악 폭(뷰포트 344)에서 보조행이 가로 스크롤 영역 안 · 종류명 · % 잘림 0 · 「취소」 가림 0"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/unfilled-progress.spec.ts#P25-P6"
        status: pass
    human_judgment: false
  - id: D5
    description: "실서버 83 관측(조인 문자열 동일성 · 실제 대기 행에서 값이 뜨는지)"
    verification: []
    human_judgment: true
    rationale: "gh-trade 가 83 을 실제로 내기 시작한 뒤의 실사용 관측 — 25-12 첫 거래일 UAT"

duration: 17min
completed: 2026-09-29
status: complete
---

# Phase 25 Plan 09: 미체결 잔량진행률 B안 화면 Summary

**대기 중인 매수 미체결 행 바로 아래에 「후매수 · 체결예상까지 12,000주 남음 [막대] 88%」 한 줄(모바일은 r3 「후매수 12,000주 남음 [막대] 88%」)이 서버 `unf.progress` 값 그대로 마이페이지 표 · 작업대 공용 패널 · 카드 탭에 그려지고, 항목이 없거나 빠지면 조용히 사라진다.**

## Performance

- **Duration:** 약 17분
- **Started:** 2026-09-29T12:17Z (21:17 KST)
- **Completed:** 2026-09-29T12:34Z (21:34 KST)
- **Tasks:** 3/3 (Task 1 · 2 TDD RED → GREEN)
- **Files:** 5 (신규 3 · 변경 2)

## Accomplishments

- `UnfilledProgress` — `row`(11px/1.5 · nowrap · 종류명 600 · 「·」 · 「체결예상까지 **N**주 남음」 · 막대 140px · **P%**) · `compact`(mt 6px · 「체결예상까지」·「·」 생략 · 막대만 `flex-1 min-w-0`). 막대 = 트랙 6px `--muted` radius 999 + 채움(폭 300ms ease-out · reduced-motion 없음). `role="progressbar"` · `aria-valuenow/min/max` · 이름 「체결예상까지 진행률」 · `aria-valuetext` 는 `progressView.valueText` 그대로. 산술 0.
- `account-panel.tsx` — `useRelayContext()` 의 `queueProgress` → 행마다 `findQueueProgress(queueProgress, account.a, row)` → `progressView`(`UnfilledView.progress`). 기본 표는 `<Fragment>` + 보조행(colSpan 7), 임베드는 미체결 행과 취소 결과 행 **사이**(colSpan `stockScope ? 5 : 7`), 모바일 카드는 r2 와 `StatusNotes` 사이 r3. `reportUnmatchedProgressOnce` effect(개발 모드 1회). 열 구성 · 취소 · 선택 · StatusNotes 문구 무변경. 머리 주석 ⑫.
- 보조행 셀은 `!h-auto !pt-0 !pb-2 !bg-transparent` 로 층 없는 규칙을 이기고(실측 위 0 · 아래 8px · 높이 < 36), 좌우는 그 표 규칙 그대로. 선택 행이면 `<tr data-selected>` + 같은 accent 배경. 취소 보관이면 숫자 · 종류명 `--muted-fg` + 채움 `--faint`.
- **문구 한 곳:** 「체결예상까지」 · 「주 남음」 · 막대 이름은 `unfilled-progress.tsx` 상수, 값 텍스트는 `progressView`(queue-progress.ts). gh-trade 공용 문구(예: 「체결 예상 지점 도달」)가 오면 이 두 곳만 고친다.

## Task Commits

1. **Task 1: UnfilledProgress**
   - RED — `b6d662bb` (test): 모듈 부재
   - GREEN — `bf068519` (feat)
2. **Task 2: account-panel 3표면 + r3**
   - RED — `e7d7c3a8` (test): 9건 실패 · 부정 케이스 4건 이미 통과
   - GREEN — `3b849463` (feat)
3. **Task 3: 브라우저 증거** — `f58d9f8e` (test)
4. **실측 결함 수정(Task 3 중 발견)** — `a3d3bcf7` (fix): 보조행이 표 폭을 넓히지 않게

`commits: 11` 은 `rev-list 5e5fbdfe..HEAD` 실측이다 — 이 중 5건(`9cfc746f` · `76764b87` · `5cfacb83` · `a5f6ff4d` · `f3eab932`)은 동시 세션 quick-260929-sas/sar 커밋이고 25-09 커밋은 6건이다.

## e2e P25-P1 ~ P25-P6

| 케이스 | 결과 |
|---|---|
| P25-P1 /me 1280 — 보조행 「후매수 · 체결예상까지 12,000주 남음」 · 88% · progressbar 4종 · 막대 140px · 채움 계산 색 == `--primary` · 셀 pt 0 / pb 8px / nowrap | pass |
| P25-P2 bp 9000 → `data-near` · 채움 == `--up` / remaining −5 · bp 10050 → 「0주 남음」 · 100% · `aria-valuenow` 100 | pass |
| P25-P3 items [] → 보조행만 삭제 · 미체결 행 유지 / 12453 미체결 제거 → 행 · 보조행 모두 없음 | pass |
| P25-P4 /me 390 — r3 compact 가 `account-unfilled-note` 앞 · r2 바로 뒤 · 조각 잘림 0 · 막대 > 40px · 카드 밖 잎 0 | pass |
| P25-P5 /trading 1440 공용 패널 미체결 — colSpan 7 · 12453 행 바로 뒤 | pass |
| P25-P6 카드 탭 stockScope · 뷰포트 344 — colSpan 5 · 백스톱 E8 overflow(아래) | pass |

**백스톱 E8 overflow 실측(뷰포트 344 · 카드 탭 미체결):**
- 수정 전: 진행률 없을 때 표 스크롤러 `clientWidth 324 = scrollWidth 324` → 보조행이 붙자 `scrollWidth 380`(한 줄 nowrap 이 표 자동 폭을 넓힘) · % 오른쪽 369 · **「취소」 열이 화면 밖으로 밀림**. 종류명 · % 자체는 가로 스크롤 안에서 잘리지 않았다(스펙 문구상 통과였으나 취소 가림은 결함).
- 수정 후(`a3d3bcf7`): `clientWidth 324 · scrollWidth 324`(표 폭 불변) · 종류명 [15, 43] · % [289, 313] (콘텐츠 좌표) · 끝까지 스크롤해도 % 보임 · 보조행 한 줄(줄바꿈 0) · 「취소」 가 표 보이는 폭 안 · `scrollOverflowing(card-tabs-body)` = [].
- 스크린샷으로 1280 · 390 · 1440 · 344 네 표면을 눈으로 확인했다(목업 B안 · 7-A 와 일치).

## 검증 결과

| 명령 | 결과 |
|---|---|
| `vitest --run src/components/orderbook/__tests__/unfilled-progress.test.tsx` | 6 passed |
| `vitest --run src/components/orderbook` | 7 files · 190 passed |
| `pnpm --filter @gh-radar/webapp run typecheck` (tsc + tsconfig.e2e) | pass |
| `vitest --run shared-panels.test.tsx card-tabs.test.tsx` | 2 files · 47 passed |
| webapp 전체 `pnpm --filter @gh-radar/webapp run test` | 135 files · 3005 passed · 1 skipped(기존) |
| `playwright test e2e/specs/unfilled-progress.spec.ts` | 7 passed (setup 1 + P25-P1~P6) |
| `playwright test me.spec.ts trading-workbench.spec.ts` | 기존 실패 `5. 격자…`(삼성전자 26px · deferred-items 기록 그대로)에서 serial 중단 → 기존 실패 3건 `--grep-invert` 로 제외하고 **81 passed**(setup 포함) |
| acceptance grep | Task 1 전부 pass · Task 2 `data-slot="unfilled-progress-row"` 1(아래 편차) · `colSpan={stockScope ? 5 : 7}` 2 · `findQueueProgress` 3 · `variant="compact"` 2 · globals.css diff 0 · Task 3 `P25-P` 9 · `pushQueueProgress` 7 · 실서버 리터럴 0 |

## Decisions Made

frontmatter `key-decisions` 참조.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 진행률 보조행이 카드 탭 폰 폭에서 「취소」 를 화면 밖으로 밀어냄**
- **Found during:** Task 3 (P25-P6 백스톱 실측)
- **Issue:** 보조행 한 줄(nowrap · 막대 140px 고정)이 표 자동 폭을 380px 로 넓혀 뷰포트 344 카드 탭에서 미체결 표 전체가 가로 스크롤 → 「취소」 열이 보이지 않음. 진행률이 없을 때는 324 에 딱 맞던 표다.
- **Fix:** 보조행 한 줄에 `w-0 min-w-full`(표 폭 계산 기여 0 · 칸을 채움) + row 막대 `w-[140px] min-w-10 shrink`(칸이 모자라면 막대만 40px 까지). 1280 · 1440 은 140px 그대로(P25-P1 이 140 을 잰다). UI-SPEC 「표 가로 스크롤이 넘침을 받는다」는 여전히 최후 방어로 남는다.
- **Files modified:** unfilled-progress.tsx · account-panel.tsx · 두 단위 테스트(단언 추가) · spec(표 폭 불변 · 취소 보임 단언)
- **Commit:** a3d3bcf7

**2. [Rule 2 - 보강] `selected` prop · 취소 보관 종류명 muted**
- **Found during:** Task 1
- **Issue:** 선택 행(accent 배경) 위에 `--fg` 숫자가 남으면 그 행만 다른 색으로 읽히고, 취소 보관 행에서 종류명만 `--fg` 면 「반만 회색인 행」(account-panel ⑨ 경고)이 된다.
- **Fix:** `selected` → `--accent-fg`, `muted` → 종류명 · 숫자 모두 `--muted-fg`(muted 우선).
- **Commit:** bf068519

### 해석

**3. [해석] acceptance `grep -c 'data-slot="unfilled-progress-row"'` ≥ 2 → 1**
- 기본 표와 임베드가 `UnfilledProgressRow` 한 컴포넌트를 공유한다(파일 원칙 「두 벌이 아니다」). 두 표면 모두 보조행을 그린다는 사실은 단위 테스트(기본 표 colSpan 7 · 임베드 7 · stock 5)와 e2e(P1 · P5 · P6)가 증명한다.

**4. [해석] 「구분선을 보조행으로 넘긴다」 — 넘길 선이 없음**
- 현재 B 표(globals.css 260924-vj1)는 행 사이 구분선이 없다. `border-b` 를 새로 주면 이 표에만 선이 생긴다 — 넣지 않았다. 짝은 위 패딩 0 으로 붙어 읽힌다(머리 주석 ⑫).

**5. [해석] RED 기록 형식**
- 25-05 · 25-08 과 같이 `type: execute` 플랜의 tdd 태스크라 `check tdd-red-evidence` 레코드는 만들지 않았다. Task 1 RED 는 모듈 부재, Task 2 RED 는 9건 단언 실패(부정 케이스 4건은 구현 전에도 참이라 통과).

**6. [해석] Playwright 요약 「6 passed」 → 「7 passed」**
- setup 프로젝트(auth.setup) 1건이 함께 센다. P25-P1~P6 은 6건 모두 pass.

---

**Total deviations:** 자동 수정 2(Rule 1 · Rule 2) · 해석 4. **Impact:** 스코프 변화 없음 — 폰 폭 표 가로 스크롤 회귀를 막았다.

## TDD Gate Compliance

- Task 1: `b6d662bb` test → `bf068519` feat
- Task 2: `e7d7c3a8` test → `3b849463` feat
- REFACTOR 커밋 없음(정리할 것 없음). `a3d3bcf7` 은 Task 3 실측 결함 fix.

## Known Stubs

없음 — 25-06 이 남긴 스텁(`findQueueProgress` · `progressView` · `reportUnmatchedProgressOnce` 미결선)은 이 플랜으로 해소됐다.

## Threat Flags

없음 — 새 표면은 threat_model T-25-37~39 범위(조인 없으면 그리지 않음 · 대기 추정 없음 · 취소 보관 --faint)이고 모두 테스트로 잠겼다.

## Issues Encountered

- `me.spec.ts` + `trading-workbench.spec.ts` 를 한 번에 돌리면 serial 모드라 기존 실패 `5. 격자…` 에서 나머지 57건이 실행되지 않는다 — 기존 실패 3건(deferred-items.md)을 제외해 전량 확인했다.

## User Setup Required

없음. 배포 · push 없음.

## Next Phase Readiness

- 진행률 화면은 relay 83(25-06)이 배포되고 gh-trade 가 83 을 내기 시작하면 바로 뜬다. 첫 거래일 조인 문자열 동일성 확인은 25-12 UAT.
- gh-trade 가 대기 행 공용 문구를 넘기면 `unfilled-progress.tsx` 상수 + `progressView.valueText` 두 곳만 바꾼다.

## Self-Check: PASSED

- 파일 5개 FOUND: unfilled-progress.tsx · unfilled-progress.test.tsx · unfilled-progress.spec.ts · account-panel.tsx · account-panel.test.tsx
- 커밋 6개 FOUND: b6d662bb · bf068519 · e7d7c3a8 · 3b849463 · a3d3bcf7 · f58d9f8e
