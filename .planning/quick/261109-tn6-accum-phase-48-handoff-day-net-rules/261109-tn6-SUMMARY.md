---
phase: quick-261109-tn6
plan: 01
status: complete
subsystem: accum-signal · accum-report · relay-schema
tags: [accum, gh-trade-phase-48, rpc, pgtap, inbox]
requires: [gh-trade a4e54275 (Phase 48 fbs 주석) · 인박스 261109-accum-day-net]
provides:
  - "웹 매집 목록 회색 행 = gh-trade AccumClosedTodayFromJournal 동형(closedTodayOf · listedAccumOf)"
  - "복원 RPC dma_accum_signals_for_user_json 재정의(20261109500000)"
  - "limitup_accum_flow.rule_version 열 + 목록 RPC 47키(20261109510000)"
  - "AccumSignal.ruleVersion · accumEndReasonLabelOf · isRule2Row · ACCUM_RULE_LINES_RULE2"
affects: [작업대 「매집」 패널, 매집감지 보고서, limitup-sync 워커, relay 생성물]
tech-stack:
  added: []
  patterns: ["웹 순수 함수와 SQL RPC 가 같은 공용 픽스처 S 로 같은 규칙을 잠근다(축소 집합 동치)"]
key-files:
  created:
    - supabase/migrations/20261109500000_dma_accum_signals_closed_today.sql
    - supabase/migrations/20261109510000_limitup_accum_flow_rule_version.sql
  modified:
    - packages/shared/src/accum-signal.ts
    - packages/shared/src/accum-report.ts
    - webapp/src/lib/accum-list.ts
    - webapp/src/lib/use-accum-signals.ts
    - webapp/src/components/trading/workbench/accum-strip.tsx
    - webapp/src/lib/accum-report.ts
    - webapp/src/lib/accum-chart.ts
    - webapp/src/components/analytics/accum-detail.tsx
    - webapp/src/components/analytics/accum-kpi-strip.tsx
    - workers/limitup-sync/src/load.ts
    - supabase/tests/dma_strategy_accum_signal.test.sql
    - supabase/tests/accum_report.test.sql
    - relay/src/generated/StockDMA.fbs
    - docs/inbox/from-gh-trade/261109-accum-day-net.md
decisions:
  - "매집 목록 회색 행 집합 = gh-trade 서버 저널 시드(AccumClosedTodayFromJournal) 동형 — 최신 row 4/6 · 사유 1/4/5 후보, 같은 사이클 오늘 발표 뒤 첫 종료 행 시각, 회색 후보는 복원 묶음 자르기 면제(WinForms 동형 · 사용자에게 묻지 않음)"
  - "복원 RPC 는 최신 행 + 회색 후보 사이클의 마지막 발표 행 + 그 뒤 첫 종료 행만 낸다 — 옛 「최신 청산 동반」 규칙 대체(최신이 활성인 isin 에는 동반 행 없음)"
  - "보고서는 rule_version ≥ 2 행만 새 문구(즉시 종료 · 하루 판정 종료 · 사이클 누적 2억 임계 · 하루 장부 본문)로 가르고, 옛 상수는 그대로 둔다"
metrics:
  duration: "약 20분"
  completed: 2026-11-09
actuals:
  tokens: 39000
  tasks: 3
  commits: 4
plan_head_before: 64c9b2f41ba6cef746e48c17c22668d2a31f8d32
plan_head_after: 198d49f83ba5e472c131319449fc0cecf1d57c23
---

# Phase quick-261109-tn6 Plan 01: gh-trade Phase 48 매집감지 하루 순매수·사이클 규칙 인계 반영 Summary

KB120 기동 하루 판정 종료(사유 5)·새 즉시 종료(사유 4) 종목을 gh-trade 서버 저널 시드(`AccumClosedTodayFromJournal`)와 같은 규칙으로 작업대 매집 목록 회색 행에 싣고(웹 + 복원 RPC 동형), 매집감지 보고서는 `rule_version` 열로 새 규칙 행의 종료 사유·판정 기준·KPI 를 가르며, relay 생성물 마커를 a4e54275 로 맞추고 인박스를 닫았다.

## 커밋

| Task | 커밋 | 내용 |
|------|------|------|
| 1 (tracer) | b3fc811c | 매집 목록 하루 판정 종료·즉시 종료 회색 행 — 서버 저널 시드 동형 규칙 · 복원 RPC |
| 2 | 1f66b94b | 매집감지 보고서 rule_version — 열·적재·목록 RPC · 새 규칙 종료 사유·판정 기준·KPI |
| 3 | a65e4509 | relay 생성물 재동기화 — SYNC MARKER a4e54275(필드 무변경) |
| 3 | 198d49f8 | 인박스 261109-accum-day-net 처리 완료(done_commit = a65e4509) |

Co-Authored-By 없음 · 모두 경로 지정 add · push / db push / 배포 없음.

## 실제 마이그레이션 파일명

- `supabase/migrations/20261109500000_dma_accum_signals_closed_today.sql` (계획 이름 그대로 · 착수 때 마지막은 20261109400000)
- `supabase/migrations/20261109510000_limitup_accum_flow_rule_version.sql` (계획 이름 그대로 · 목록 RPC 최신 정의 20261026120000 기준)

## 목록 규칙 (WinForms 동형 — 서버 저널 시드)

정본 gh-trade `server/src/market/publish/AccumSignal.cpp` `AccumClosedTodayFromJournal`(560행~)을 웹 `closedTodayOf` 로 옮겼다:

- 후보 = isin 별 그날 최신 행이 row 4(종료) 또는 6(하루 값 갱신)이고 종료 사유 1 · 4 · 5 (`isClosedTodayCandidate`).
- 같은 사이클(expectedCum) 오늘 행을 (gwTimeMs, seq) 순으로 걷는다. row 1·2·3·5 = 「발표됨」 + 「내려감」 끔. row 4 사유 1/4/5 = 사유 1 이면 「발표됨」, 「내려감」 이 꺼져 있으면 그 행이 청산 행(closeRow)이고 「내려감」 켬. row 6 · 사유 2 · 3 은 건너뛴다.
- 「발표됨」 이고 청산 행이 있을 때만 싣는다. 값 = 최신 행(row 6 이면 끝난 사이클 값 + 하루 칸 최신), 「갱신」 시각 · 청산끼리 순서 = 청산 행 시각(row 6 이 매분 와도 고정).
- 복원 묶음 자르기는 **활성 행에만** — 회색 후보는 면제(서버 시드는 하루 저널 전체).
- 옛 규칙(rule 키 없음) 매집 종료(row 4 · 사유 4)는 지금처럼 청산 행(사유 1)의 값 · 시각 + 종료 사유 4.
- 효과: 숨김 이월 종목이 오늘 발표 없이 4/5 로 끝나면 싣지 않는다(late_info 의 120 62행 · 119 66행 · 112 36행 중 숨김 종목은 이 규칙으로 걸러진다 — 원격 대조는 못 함, 아래 「검증 안 한 것」).

복원 RPC(20261109500000)는 웹 걷기에 필요한 행만 낸다: (gateway, isin) 최신 행(자르기 뒤이거나 회색 후보) + 회색 후보 사이클의 마지막 발표 행 + 그 뒤 첫 종료 행. 발표 행이 없을 때는 첫 종료 행 하나로 웹 판정이 같다(사유 4 · 5 는 사이클을 끝내므로 그 뒤 같은 사이클 사유 1 이 없다 — 머리 주석에 근거 기록).

## 테스트

| 묶음 | 결과 |
|------|------|
| shared `accum-signal.test.ts` | 30 통과 (새 7) |
| shared 전체 | 1242 통과 · 2 skip |
| webapp `accum-list` · `use-accum-signals` · `accum-strip` | 47 · 16 · 46 통과 |
| webapp `accum-report.test.ts` · `accum-chart.test.ts` · `accum-detail.test.tsx` · `analytics/accum-report.test.tsx` | 263 통과 |
| webapp `vitest run accum`(7파일) | 372 통과 |
| limitup-sync `load.test.ts` | 13 통과 |
| relay 전체 | 2004 통과 (65파일) |
| pgTAP `dma_strategy_accum_signal.test.sql` | 37/37 PASS (일회용 로컬 컨테이너 · 125 마이그레이션 재생) |
| pgTAP `accum_report.test.sql` | 72/72 PASS |
| typecheck | shared · webapp(+e2e tsconfig) · limitup-sync · relay 모두 0 |

공용 픽스처 S(KB120 11/9 재현): 웹 `listedAccumOf(S)` = R 활성 + P(사유 5 · 시각 seq4 · 하루 칸 seq5) · Q(사유 1 · seq8/seq9) · X(사유 4 · seq12/seq14), H · D 없음. RPC 원소 seq = {2,3,4,5,6,7,8,9,11,12,14}, 웹 축소 집합 결과 = 전체 결과(동치 단언).

## relay diff 판정

- `git diff --stat -- relay/` = `relay/src/generated/StockDMA.fbs` 1파일(39+/21−) — 생성 .ts 84개는 flatc 출력과 이미 같아 변경 0(`--check` 「신규/변경 예정 0」).
- 변경 줄은 마커 블록(server-repo-commit a4e54275 · synced-date 2026-11-09)과 필드 줄 끝 주석뿐. 코드 부분(`//` 앞)을 −/+ 다중집합으로 대조해 차이 0 — 코드 줄 변경 없음.
- gh-trade 저장소는 고치지 않았다(스크립트는 RELAY 쪽만 씀). 생성물이 주석뿐이라 relay 재배포가 필요한지는 메인 세션 판단(코드 동일 → 불필요로 보임).

## 전환일 알려진 차이

- 옛 서버가 낸 옛 사유 4(매집 종료) 행 뒤에 새 서버가 같은 사이클 row 6(rule 2 · 사유 4)을 내면 패널 툴팁 문구가 「즉시 종료(누적 ≤ 0)」로 보인다(최신 행이 rule 2 라 새 문구 · 값 · 시각은 청산 행 기준). 11/9 KB120 · 각 서버(119 · 112) 배포 당일에만 생긴다.
- 그 경우 「옛 규칙 경로」(청산 행 값 덮기)가 아니라 rule 2 경로(최신 row 6 값 + 청산 시각)를 탄다 — 하루 칸이 움직이는 쪽이라 오히려 서버 88 회색 행과 같다.

## 인박스 질문 회신 초안 (메인 세션이 gh-trade 세션에 전달)

1. 옛 relay 는 kind 16 칸을 값 검사 없이 그대로 저장하므로 queue_case 6 · cancel_reason 5 · message `rule=` 키는 깨지지 않고 적재된다. 옛 웹은 사유 5 회색 행을 목록에서 뺐는데(사유 1 · 옛 4 만 실었음) 이 quick(261109-tn6)으로 서버 저널 시드 동형 규칙으로 고쳤다. export `rule_version` 은 새 열 마이그레이션 전이면 적재 때 키가 버려질 뿐 실패하지 않는다(재적재 주의는 아래).
2. row 6 으로 행이 약 30% 늘어도 복원 RPC 는 그날 kind 16 부분 인덱스만 읽고 회색 후보(그날 종료 종목)의 한 사이클 행만 더 고른다 — 부담 없음. 30일 purge 그대로.
3. 재적재 통보는 이 노트에 「재적재」 절을 덧붙이는 형식이면 충분하다.

## 메인 세션 배포 메모

- 순서: DB(`supabase db push --linked --yes` — 20261109500000 · 20261109510000) → relay(생성물 주석뿐이라 배포 불필요 여부 판단) → push(webapp 프로덕션).
- **20261109510000 은 KYOBO119 새 export(rule_version 열)가 처음 적재되기 전에 원격 적용해야 한다.** 119 분석기는 11/9 21:16 뒤 바뀌었으므로 11/9 21:00 적재는 옛 export 이고, 첫 새 export 는 11/10 20:50 운반 → 21:00 적재(그리고 gh-trade 의 9/29~ 지난날 재생성 재적재)다. 늦으면 그 날짜 `limitup_loads.files_sig` 를 비워 재적재를 유도한다(마이그레이션 머리 주석에 기록).
- 20261109500000(복원 RPC)과 웹 push 는 함께 나가야 한다 — 새 RPC 만 나가면 옛 웹이 발표 행을 활성으로 오해하진 않지만(최신 행만으로 판정) 사유 5 를 여전히 버리고, 새 웹만 나가면 재기동 앞 발표 행이 RPC 에 없어 사유 5 회색 행이 복원 때 빠진다(라이브 행이 오면 보임).
- server 코드 변경 없음(`server/` 무변경) — deploy-server 불필요.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `accum-strip.test.tsx` 갱신(계획 files 밖)**
- **Found during:** Task 1
- **Issue:** AccumSignal 에 ruleVersion 이 생겨 테스트의 sig 리터럴이 typecheck 실패 · 당일 칸 머리 title 단언이 옛 문구.
- **Fix:** sig 기본값 `ruleVersion: 0` · title 기대값 새 문구 · rule 2 사유 4/5 회색 행 툴팁 단언 2건 추가.
- **Files modified:** webapp/src/components/trading/__tests__/accum-strip.test.tsx
- **Commit:** b3fc811c

**2. [Rule 3 - Blocking] `analytics/__tests__/accum-report.test.tsx` 에 KPI 띠 rule2 케이스 추가(계획 files 밖)**
- **Found during:** Task 2 — 계획 지시(「KPI 띠 보조 줄을 단언하는 기존 테스트가 있으면 rule2 케이스 하나를 더한다」)대로 기존 테스트가 있는 그 파일에 (k2r) 1건 추가. 옛 기대값은 그대로.
- **Commit:** 1f66b94b

**3. [Rule 2] `packages/shared/src/accum-report.ts` end_reason 주석에 4 · 5 뜻 추가** — 문서 주석만.

**4. latestAccumByIsin 구현 방식** — 계획은 「isin 별 최신을 자르기 없이」 였으나 (gateway, isin) 별 최신 → 자르기(후보 면제) → isin 별 최신 순으로 구현했다. 한 게이트웨이 입력(훅)에서는 계획과 결과가 같고, 여러 게이트웨이 입력에서도 옛 동작(게이트웨이별 자르기)을 지키며 SQL `PARTITION BY gateway, isin` 과 같은 단위다.

## 검증 안 한 것

- late_info 의 원격 실측(120 62 · 119 66 · 112 36행 사유 5)과의 대조 — 원격 조회 경로가 `.env` 비밀 읽기 가드에 막혀 하지 않았다. 규칙상 오늘 발표(row 1·2·3·5 또는 사유 1 종료)가 없는 숨김 종목은 빠진다. 배포 뒤 메인 세션이 그 날짜 KB120 목록 회색 행 수가 WinForms 매집창 회색 행 수와 같은지 보면 된다.
- e2e 는 돌리지 않았다(제약).

## Known Stubs

없음.

## Self-Check: PASSED

- FOUND: supabase/migrations/20261109500000_dma_accum_signals_closed_today.sql
- FOUND: supabase/migrations/20261109510000_limitup_accum_flow_rule_version.sql
- FOUND commits: b3fc811c · 1f66b94b · a65e4509 · 198d49f8 (HEAD 조상)
