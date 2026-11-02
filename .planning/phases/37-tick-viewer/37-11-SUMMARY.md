---
phase: 37-tick-viewer
plan: 11
subsystem: webapp · supabase
tags: [tick-viewer, deeplink, teamflow, accum, limitup, rpc, pgtap]
status: complete

requires:
  - phase: 37-tick-viewer (37-04)
    provides: "Phase 37 마이그레이션 버전 대역 20261102200000/200100 — 이 플랜이 200200"
  - phase: 37-tick-viewer (37-08)
    provides: "webapp lib/ticks/tick-url(tickUrlOf · kstNowOf) · /analytics/ticks 페이지"
provides:
  - "supabase/migrations/20261102200200_teamflow_report_t20.sql — teamflow_report_for_user 같은 시그니처 재정의 · rows[].t20_ms(limitup_entries LEFT JOIN)"
  - "shared TeamflowRow.t20_ms?"
  - "webapp/src/lib/ticks/tick-link.ts — tickHrefOf · accumJumpMs · teamflowJumpMs · limitupJumpMs · TICK_LINK_PILL"
  - "세 보고서 펼친 상세 머리 「틱 보기 ›」 알약 a[data-slot=tick-link]"
affects: [37-16]

actuals:
  tokens: 7120
  tasks: 2
  commits: 2
plan_head_before: f7c86598f348f21f123d8454f9be7ad0cf553abe
plan_head_after: 7cc977c328caca802abee5de3307957918b9e24e

tech-stack:
  added: []
  patterns:
    - "보고서 → 뷰어 링크는 tickHrefOf 한 곳 — URL 은 tickUrlOf 정본 · 시각은 shared fmtTickTime · 그 날짜(KST)가 아닌 시각은 버린다"

key-files:
  created:
    - supabase/migrations/20261102200200_teamflow_report_t20.sql
    - webapp/src/lib/ticks/tick-link.ts
    - webapp/src/lib/ticks/__tests__/tick-link.test.ts
  modified:
    - supabase/tests/teamflow_report.test.sql
    - packages/shared/src/teamflow-report.ts
    - webapp/src/components/analytics/teamflow-detail.tsx
    - webapp/src/components/analytics/accum-detail.tsx
    - webapp/src/components/analytics/accum-day-grid.tsx
    - webapp/src/components/analytics/limitup-event-card.tsx
    - webapp/src/components/analytics/__tests__/teamflow-detail.test.tsx
    - webapp/src/components/analytics/__tests__/accum-detail.test.tsx
    - webapp/src/components/analytics/__tests__/limitup-event-card.test.tsx

key-decisions:
  - "「틱 보기」 URL 은 tickUrlOf 정본을 그대로 써서 기본 거래소 KRX 의 ex 를 뺀다. ?isin&d&t 와 ?isin&d&ex=KRX&t 는 같은 화면이고, 37-08 이 짧은 쪽을 정본으로 정했다"
  - "시각의 KST 날짜가 보고서 날짜와 다르면 t 를 뺀다. 매집감지 이월 행의 reg_time_ms 는 며칠 전 등록 시각이라, 그 시각을 보고서 날짜에 붙이면 엉뚱한 틱으로 간다"
  - "매집감지 알약 시각은 목록 행 reg_time_ms 를 prop(regTimeMs)으로 받는다. 상세 fetch 를 기다리지 않아도 로딩 · 오류 · 자료 없음 상태에서 같은 href 가 나온다. 게이트 상태에서만 숨긴다(뷰어도 같은 DMA 게이트)"
  - "상한가 카드는 펼쳤을 때만 마운트된다. 그래서 「접힘에서 숨김」 조건은 따로 분기하지 않아도 지켜진다"

patterns-established:
  - "보고서 상세 머리 알약 = `<div data-slot=\"…-head\" class=\"flex justify-end\">` + `<Link data-slot=\"tick-link\" className={TICK_LINK_PILL}>` — 화살표 › 는 aria-hidden(접근 이름 「틱 보기」)"

requirements-completed: [D-17]

duration: 25min
completed: 2026-11-02
---

# Phase 37 Plan 11: 세 보고서 → 틱 뷰어 「틱 보기 ›」 Summary

**팀 매집 RPC 행에 `t20_ms` 를 실었다. 같은 시그니처로 재정의해 `limitup_entries` 를 LEFT JOIN 했고, 왕복은 1회 그대로다. 링크 유틸 `tickHrefOf` 는 KST `HH:MM:SS.mmm` 시각을 `t` 로 싣는다. 이 둘로 매집감지 · 팀 매집 · 상한가 펼친 상세 머리 오른쪽에 「틱 보기 ›」 알약을 붙였다. 알약은 그 종목 · 그 날짜 · 의미 있는 시각의 틱 뷰어로 바로 간다. pgTAP 은 30/30 통과했고, vitest 는 대상 4파일 149건과 analytics · lib · app 회귀 2009건이 모두 통과했다.**

## Performance

- **Duration:** 약 25분
- **Completed:** 2026-11-02
- **Tasks:** 2/2 (Task 1 tracer · Task 2 auto)
- **Files:** 3개 생성 · 9개 수정

## 마이그레이션

- 버전 **`20261102200200_teamflow_report_t20.sql`**. 바뀌는 것은 `rows` 집계 한 줄뿐이다. `to_jsonb(t) || jsonb_build_object('t20_ms', e.t20_ms)` 로 바꾸고 `LEFT JOIN public.limitup_entries e ON e.date = t.date AND e.isin = t.isin` 를 붙였다. 정렬 · 게이트 · 날짜 규칙 · 빈 모양은 그대로다.
- 속성 STABLE · SECURITY INVOKER · `search_path = public, pg_temp` 를 다시 적었다. COMMENT 와 `REVOKE … FROM PUBLIC`, `REVOKE … FROM anon, authenticated`, `GRANT … TO service_role` 도 다시 적었다.
- 되돌릴 때는 20261016200100 본문으로 다시 CREATE OR REPLACE 한다. 웹은 키가 없으면 다음 폴백으로 간다.
- 원격 적용은 하지 않았다(37-16 몫).
- server `/api/teamflow/report` 는 RPC 결과를 손대지 않고 넘긴다. 그래서 server 쪽은 바꿀 것이 없다.

## 알약 위치 · 시각 규칙

| 보고서 | 위치 | 시각(우선순 폴백) |
|---|---|---|
| 팀 매집 | `TeamflowDetail` 맨 위 `teamflow-detail-head`(요약 블록 위 · 오른쪽) | `payload.reach.t_ms` → `first_limit_ms` → `t20_ms` → 없음 |
| 매집감지 | `AccumDetail` 맨 위 `accum-detail-head`(KPI 줄 · 범례 위 · 오른쪽). 로딩 · 오류 · 자료 없음에서도 보이고, 게이트에서는 숨긴다 | `reg_time_ms`(목록 행 prop). 그날 등록이 아니면(이월) 없음 |
| 상한가 | `LimitupEventCard` 맨 위 `limitup-event-head`(한 줄 요약 위 · 오른쪽). 펼쳤을 때만 마운트된다 | `first_upper_ms` → `t20_ms` → 없음(entries 행 없음 포함) |

시각이 없으면 `t` 를 뺀다. 그러면 뷰어가 기본값(과거 = 08:00 첫 틱)으로 연다. 알약은 `<Link>` 라서 상세의 펼침 · 접힘 상태를 바꾸지 않는다. 모양은 보고서 프리셋 알약과 같은 토큰을 쓴다(`--muted` · `--fg-2` · hover `--raised-2` · `min-h-8` 32px 터치). 포커스 링은 전역 `*:focus-visible` 이 그린다.

## Task Commits

1. **Task 1 (tracer): 팀 매집 「틱 보기」 트레이서 — RPC 행 t20_ms · 링크 유틸 · 상세 알약** — `8aa2a9c3` (feat). 커밋 직전에 트레이서 게이트로 두 verify 를 끝에서 끝까지 돌렸다. pgTAP 30/30, shared build · typecheck · vitest 56/56 이 통과한 것을 확인한 뒤 확장으로 넘어갔다.
2. **Task 2: 매집감지 · 상한가 상세 「틱 보기」 알약** — `7cc977c3` (feat)

## 테스트 결과

- **pgTAP:** `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/teamflow_report.test.sql` 실행 결과는 **30/30 ok · RESULT: PASS · exit 0** 이었다. 시드에 20261014 entries 1행(KR7000000221 · t20_ms 1792130100000)을 넣었다. 새 단언 I 2건은 「entries 있음 → 값」 · 「없음 → 키 있음 · null」 이다. 기존 28건은 그대로 통과했다.
- **typecheck:** `pnpm --filter @gh-radar/webapp run typecheck`(tsc + e2e tsconfig)이 통과했다. shared build 를 먼저 돌렸다.
- **vitest(플랜 verify 4파일):** 149/149 통과. 내역은 tick-link 13, teamflow-detail 44(+5), accum-detail 68(+4), limitup-event-card 24(+3)이다. 기존 단언 회귀는 0건이다.
- **회귀:** `vitest run src/components/analytics src/lib src/app --maxWorkers=2` 결과 88파일 · 2009 통과 · 1 skip(기존) · 실패 0건.
- **e2e 미실행 — 오케스트레이터가 메인 트리에서 실행.** 이 플랜은 e2e 스펙을 고치지 않았다. 다만 세 상세 머리에 알약 줄이 하나씩 늘었다. 그래서 다음 스펙으로 레이아웃 회귀를 봐야 한다: `webapp/e2e/specs/teamflow-report.spec.ts` · `webapp/e2e/specs/accum-report.spec.ts` · `webapp/e2e/specs/limitup-report.spec.ts`.

## Decisions Made

frontmatter `key-decisions` 참조.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 버그] 이월 행 등록 시각이 다른 날짜의 틱으로 연결되던 문제를 막았다**
- **Found during:** Task 2
- **Issue:** 매집감지 이월 행(`carry_days > 0`)의 `reg_time_ms` 는 `since_date`(며칠 전) 등록 시각이다. 픽스처 AC_CARRY 가 그 예다(10/10 10:02:33 → 보고서 10/14). 이 값을 그대로 `t` 로 바꾸면 보고서 날짜의 같은 시각, 곧 엉뚱한 틱으로 간다.
- **Fix:** `tickHrefOf` 가 시각의 KST 날짜를 `date` 와 비교한다. 다르면 `t` 를 뺀다(`kstNowOf` 재사용). 세 보고서에 모두 걸리는 일반 가드다.
- **Files modified:** webapp/src/lib/ticks/tick-link.ts · tick-link.test.ts · teamflow-detail.test.tsx. 팀 매집 시험 시각은 픽스처 날짜 20261014 로 맞췄다.
- **Commit:** 7cc977c3

**2. [Rule 2 - 계약 보강] `AccumDetail` 에 `regTimeMs` prop 을 넣고 `accum-day-grid.tsx` 한 줄을 고쳤다**
- **Issue:** 플랜은 로딩 · 오류 상태에서도 알약이 보여야 한다고 했다. 그런데 `AccumDetail` 은 상세 fetch 전에는 행이 없어 `reg_time_ms` 를 모른다.
- **Fix:** 부모 `AccumDayGrid` 가 목록 행 `r.reg_time_ms` 를 넘긴다. 목록 행과 상세 행은 같은 표의 같은 행이다. prop 이 없을 때는 준비된 상세 행 값으로 폴백한다. `accum-day-grid.tsx` 는 플랜 files_modified 밖이다.
- **Commit:** 7cc977c3

**3. [Rule 2] `TICK_LINK_PILL` 클래스 상수**
- **Issue:** 세 컴포넌트가 같은 알약 모양을 쓴다. 수락 기준 grep(`data-slot="tick-link"` 가 각 컴포넌트 파일에 있을 것) 때문에 별도 컴포넌트로 빼지는 않았다.
- **Fix:** 클래스 문자열만 `tick-link.ts` 에 한 번 두었다.
- **Commit:** 8aa2a9c3

**4. URL 의 `ex=KRX`**
- 플랜 문구에는 `ex=KRX` 가 들어 있다. 실제 href 는 `tickUrlOf` 정본을 따라 기본 거래소를 뺀다. 37-08 결정이고, `parseTickUrl` 이 ex 가 없으면 KRX 로 읽는다. 같은 화면이므로 동작 차이는 없다.

## Issues Encountered

- worktree 격리 쉘이 복합 git 명령(`$(git rev-parse --git-dir)` 대입)을 거부했다. 그래서 커밋 장부 파일 `gsd-plan-head-before-37-11` 은 만들지 못했다. `plan_head_before` 에는 dispatch base `f7c86598` 를 썼고, `git rev-list --count f7c86598..HEAD` 로 2 를 실측했다.
- 실화면은 시각 확인하지 못했다. 이 worktree 에는 webapp env 가 없어 dev 서버를 띄울 수 없다. 알약은 `justify-end` 한 줄이고 `whitespace-nowrap` 와 `shrink-0` 를 걸었다. 그래서 좁은 폭에서도 줄바꿈 · 잘림이 생기지 않는다.

## Known Stubs

없음.

## User Setup Required

없음. 원격 `supabase db push` 와 webapp 배포는 37-16(메인 세션)에서 한다.

## Next Phase Readiness

- 37-16: 마이그레이션 `20261102200200` 을 db push 대상에 넣는다. UAT D 항목(세 보고서 「틱 보기 ›」)을 프로덕션에서 확인한다.

## Self-Check: PASSED

- FOUND: supabase/migrations/20261102200200_teamflow_report_t20.sql · webapp/src/lib/ticks/tick-link.ts · webapp/src/lib/ticks/__tests__/tick-link.test.ts
- FOUND: 8aa2a9c3 · 7cc977c3 (HEAD 조상)
- 수락 기준 grep: `LEFT JOIN public.limitup_entries` · `REVOKE EXECUTE ON FUNCTION public.teamflow_report_for_user(uuid, text) FROM anon, authenticated`(마이그레이션) · `t20_ms`(shared) · `data-slot="tick-link"`(teamflow-detail) · `accumJumpMs`(accum-detail) · `limitupJumpMs`(limitup-event-card) — 아래 self-check 로 확인
