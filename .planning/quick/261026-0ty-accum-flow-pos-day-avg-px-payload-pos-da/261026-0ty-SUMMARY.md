---
phase: quick-261026-0ty
plan: 01
subsystem: accum-report
status: complete
tags: [accum, supabase, limitup-sync, webapp, pos_day, gh-trade-261026-0q3]
requires:
  - quick-261026-01h (당일 축 UI · 목록 RPC 20261026010000)
  - quick-261025-uf2 (당일 축 4열 · ADD COLUMN 위치 대응 선례)
provides:
  - limitup_accum_flow.pos_day_avg_px bigint
  - accum_report_for_user 46키(pos_day_avg_px · prev_pos_day_avg_px)
  - shared AccumReportRow.pos_day_avg_px? · prev_pos_day_avg_px? · AccumReportPayload.pos_day?
  - 보고서 당일 평단(상세 KPI · 목록 아랫줄 · 전날 줄) · 누적 판 pos_day 보라 주선 · 팀 평단(당일)
affects:
  - webapp /analytics/accum 상세 · 목록
  - workers/limitup-sync accumRowProblems
tech-stack:
  added: []
  patterns:
    - "ADD COLUMN 만 — limitup_commit_day 무재정의(jsonb_populate_record 위치 대응)"
    - "날짜 단위 판정(hasDayAvgOf) — 그날 전체 null 이면 01h 폴백"
    - "dayAxis 일 때만 pos_day 원천(teamAvgOf · dayStepsOf)"
key-files:
  created:
    - supabase/migrations/20261026120000_limitup_accum_flow_pos_day_avg.sql
  modified:
    - supabase/tests/accum_report.test.sql
    - supabase/tests/limitup_load.test.sql
    - workers/limitup-sync/src/load.ts
    - workers/limitup-sync/tests/load.test.ts
    - packages/shared/src/accum-report.ts
    - webapp/src/lib/accum-report.ts
    - webapp/src/lib/accum-chart.ts
    - webapp/src/components/analytics/accum-day-grid.tsx
    - webapp/src/components/analytics/accum-detail.tsx
    - webapp/src/components/analytics/accum-chart.tsx
    - webapp/src/test-fixtures/accum-export.ts
    - webapp/src/lib/__tests__/accum-report.test.ts
    - webapp/src/lib/__tests__/accum-chart.test.ts
    - webapp/src/components/analytics/__tests__/accum-detail.test.tsx
    - webapp/src/components/analytics/__tests__/accum-report.test.tsx
decisions:
  - "당일 평단은 서버 값만 — 0 · null 이면 「—」, 누적 평단으로 채우지 않는다(WinForms 동형)"
  - "당일 평단 표시는 날짜 단위(hasDayAvgOf) — 그날 전체 null(재생성 전)이면 01h 모양 그대로"
  - "pos_day 원천은 당일 축 날짜에서만 — 당일 축 아닌 날짜는 pos_day 가 있어도 fac 모양"
  - "툴팁 pos 갈래에서 pos_day 첫 점 전 당일 값은 0 이 아니라 「—」(서버 값을 모름)"
metrics:
  duration: "~10분(측정)"
  completed: 2026-10-26
  tasks: 3
  files: 16
actuals:
  tokens: 14700
  tasks: 3
  commits: 6
plan_head_before: 97348729f16be4e9ca6cd92c47feef0e9271b815
plan_head_after: d9a6c3aaf9d156ac6fa65fbc4a07a432b78ad1d8
---

# Phase quick-261026-0ty Plan 01: pos_day_avg_px 열 · payload.pos_day 보고서 연결 Summary

gh-trade 261026-0q3 의 서버 당일 값을 끝까지 이었다. `limitup_accum_flow.pos_day_avg_px` bigint 열이 워커 정수 검사와 목록 RPC(전날 값 포함 46키)를 거쳐 shared 타입에 실리고, 보고서의 「당일 평단」(상세 KPI · 목록 아랫줄 · 전날 줄)으로 표시된다. 상세 누적 판의 보라 주선과 팀 평단 점선은 이제 payload.pos_day(서버 당일 순매수 · 당일 평단)를 원천으로 쓴다.

## 무엇을 했나

### Task 1 (트레이서) — 열 → 워커 → 목록 RPC → shared → 상세 KPI
- 마이그레이션 `20261026120000_limitup_accum_flow_pos_day_avg.sql`: `ADD COLUMN pos_day_avg_px bigint` + COMMENT. `accum_report_for_user` 는 20261026010000 본문을 그대로 옮겼다. 함수 본문에서 바뀐 곳은 열 목록 두 줄(`a.pos_day_avg_px` · `p.pos_day_avg_px AS prev_pos_day_avg_px`)과 주석 한 줄뿐이다(diff 로 확인). REVOKE PUBLIC · anon/authenticated · GRANT service_role 을 다시 적었고, 끝에 NOTIFY 를 둔다. `limitup_commit_day` · `accum_detail_for_user` 는 다시 정의하지 않았다.
- pgTAP: accum_report 68/68(④ 46키 · prev 3키 null · ⑥ 상세 43키 · ⑨ 415 전날 평단 14280 · 417 pos_day_avg_px JSON 0 · 418 null), limitup_load 288/288(M 절 — 14280 · 0(NULL 아님) · 키 없음 NULL · JSON null NULL · bigint).
- 워커 `ACCUM_BIGINT_COLS` 에 `pos_day_avg_px` 를 넣었다. 소수 · 문자열은 stage 전에 잡는다.
- shared: `pos_day_avg_px?` · `prev_pos_day_avg_px?` · `pos_day?` 를 더하고, 머리 주석의 키 수(37 + 당일 축 5 + pnl + 전날 3 · payload 8키)를 고쳤다.
- `hasDayAvgOf(rows)` 는 0 도 값으로 본다. `detailKpisOf(row, dayAxis, dayAvg)` 는 6항목(당일 평단 = `fmtPx(pos_day_avg_px)`)이다. DayGrid 가 `dayAvg = dayAxis && hasDayAvgOf(rows)` 를 계산해 AccumDetail 로 넘긴다.

### Task 2 — 목록 아랫줄 · 전날 평단 · 판정 기준 문구
- 열이 실린 당일 축 날짜의 목록 xl 아랫줄은 「누적 ±x.x억 · 평단(당일) N|—」 이고, 열 없는 날짜는 01h 「누적 · 누적 평단」 그대로다.
- `AccumPrevDay.avgPx`(prev_pos_day_avg_px > 0 일 때만 값)를 더했다. 상세 「전날」 줄 끝에 「평단 N」(`accum-prev-avg` · mono · --fg-2)이 붙는다.
- `ACCUM_RULE_LINES_DAY[0]` 끝 문장에서 「작업대의 」 를 뺐다.

### Task 3 — 누적 판 pos_day 주선 · 팀 평단(당일)
- lib: `PosDayPoint` · `posDayPointsOf`(선 단위 방어) · `posDayPathOf`(cycle/end 0 으로 posNetPathOf 재사용 — 한 조각 · T0 붙임 · 20:00 연장) · `teamAvgOf(payload, dayAxis)` · 내부 `dayStepsOf` · `avgAt(points, t)`(옛 avgPxAt 대체)를 만들었다. `cumRangeOf` 두 번째 인자 타입은 `Pick<PosNetPoint,'net'>[]` 로 넓혔다(동작 그대로). `cumTipAt` · `orderTipOf` 는 당일 축이고 pos_day 가 있으면 pos_day 계단과 평단을 쓴다. 라벨은 「팀 평단(당일)」 이고, pos 갈래에서 첫 점 전이면 「당일 순매수 —」 다.
- 컴포넌트: 당일 축이고 pos_day 가 있으면 `accum-pos-day-path` 를 그린다(pos_net 있으면 --team 2.2 · 없으면 1.5). day_cum_net 경로는 그리지 않고, 오른쪽 축 범위는 pos_day 값으로 잡는다. 회색 pos_net · 왼쪽 축은 그대로다. 팀 평단 점선은 `teamAvgOf().points` 로 그린다. 범례는 `.day` 면 「팀 평단(당일)」 이고, 판정 기준 본문은 `ACCUM_RULE_LINES_DAY_POS` 다.
- 픽스처 `accumSyntheticDetail('posDay')`(합성)을 더했다.

## 검증
- `pnpm --filter @gh-radar/shared build` OK.
- webapp `tsc --noEmit -p .`: 오류 0.
- webapp `vitest run src/lib src/components/analytics --maxWorkers=2`: 74 파일 · 1749 통과 · 1 skip. skip 은 이 플랜이 추가한 것이 아니다(diff 에 `.skip`/`.todo` 없음).
- `@gh-radar/limitup-sync` typecheck OK · vitest 9 파일 133 통과.
- pgTAP(docker 러너 · 샌드박스 해제): accum_report `1..68 # RESULT: PASS` · limitup_load `1..288 # RESULT: PASS`.
- 범위 밖 파일 diff(server · relay · trading · accum-list · use-accum-signals · accum-report.tsx · accum-kpi-strip.tsx): 비어 있음.
- eslint(바꾼 파일): 오류 0. 경고 11건은 모두 기존 `_x` 구조분해 제외 패턴이다.
- 기존 테스트 수정은 의도된 두 곳뿐이다: prevDayOf toEqual 에 `avgPx: null` 추가, ACCUM_RULE_LINES_DAY 글자 테스트의 「작업대의」 삭제.

## 커밋
| Task | 종류 | 해시 | 메시지 |
|------|------|------|--------|
| 1 | RED | eaff9b5d | test(quick-261026-0ty): accum_flow pos_day_avg_px 적재 · 목록 키 · 상세 당일 평단 실패 테스트 |
| 1 | GREEN | cbae18bc | feat(quick-261026-0ty): accum_flow pos_day_avg_px 열 · 목록 RPC 당일 평단 · 전날 평단 키 · 상세 당일 평단 |
| 2 | RED | d4e15a99 | test(quick-261026-0ty): 목록 평단(당일) · 전날 평단 · 판정 기준 문구 실패 테스트 |
| 2 | GREEN | d972cf8e | feat(quick-261026-0ty): 매집감지 목록 평단(당일) · 전날 줄 평단 · 판정 기준 당일 평단 문구 |
| 3 | RED | 623eb2a9 | test(quick-261026-0ty): 상세 누적 판 pos_day 주선 · 팀 평단(당일) 실패 테스트 |
| 3 | GREEN | d9a6c3aa | feat(quick-261026-0ty): 상세 누적 판 보라 = pos_day 당일 순매수 · 팀 평단(당일) 점선 · 툴팁 · 판정 기준 |

## TDD Gate Compliance
각 task 의 RED 실패를 확인한 뒤 test 커밋을 했고, 그다음 feat 커밋을 했다.
- Task 1 RED: vitest 4건 실패(hasDayAvgOf · detailKpisOf · a1 · a2). pgTAP accum_report 는 ④⑥⑨ not ok, limitup_load 는 `column "pos_day_avg_px" does not exist` 로 중단. 워커 1건 실패.
- Task 2 RED: 5건 실패.
- Task 3 RED: 15건 실패. (p6) 와 「빈 pos_day」 는 RED 에서도 통과했는데, fac · 01h 가 바뀌지 않음을 잠그는 회귀 단언이라 정상이다.

## Deviations from Plan

### 자동 처리
**1. [Rule 3 - 차단] Task 3 픽스처 편집 기준 줄 오인**
- 발견: Task 3 RED 편집. `posNetCarry` 의 cycle 배열을 `[1,1,1,2,2]` 로 기대한 앵커가 맞지 않아 스크립트가 쓰기 전에 멈췄다(파일 변경 없음). 실제 값 `[1,1,1,1,2,2]` 로 고쳐 다시 적용했다. 코드 동작 변화 없음.

**2. [판단] 마이그레이션 머리 주석에 권한 재진술 근거 한 줄 추가** — 플랜 내용(auto-grant 방지)을 주석으로 남긴 것뿐이다.

그 밖에는 플랜대로 실행했다.

## 원격 적용(메인 세션 · 이 quick 밖)
1. `supabase db push --linked --yes`(20261026120000)를 gh-trade 가 새 열이 실린 export 를 내기 **전에** 한다. 늦어서 그 날짜가 먼저 적재되면 jsonb_populate_record 가 모르는 키를 버리고 files_sig 가 같아 다시 적재되지 않는다. 그때는 그 날짜 `limitup_loads.files_sig` 를 비워 재적재한다. payload.pos_day 는 jsonb 안이라 마이그레이션과 상관없이 실린다.
2. limitup-sync 워커 재배포(검사 목록).
3. webapp push. 웹이 먼저 나가도 새 키가 없을 뿐이고 01h 모양이라 안전하다.

이 실행에서는 db push · git push · 배포를 하지 않았다.

## Known Stubs
없음.

## Self-Check: PASSED
- FOUND: supabase/migrations/20261026120000_limitup_accum_flow_pos_day_avg.sql
- FOUND commits: eaff9b5d · cbae18bc · d4e15a99 · d972cf8e · 623eb2a9 · d9a6c3aa(모두 HEAD 조상)
