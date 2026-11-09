---
phase: quick-261109-kzk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Task 1 (tracer) — RPC 조인 + 타입 + 값 고르기 한 벌
  - supabase/migrations/20261109400000_teamflow_report_tick_team_net.sql
  - supabase/tests/teamflow_report.test.sql
  - packages/shared/src/teamflow-report.ts
  - webapp/src/lib/teamflow-report.ts
  - webapp/src/lib/__tests__/teamflow-report.test.ts
  # Task 2 — 목록 화면(열 · 표식 · 설명 줄)
  - webapp/src/components/analytics/teamflow-day-grid.tsx
  - webapp/src/components/analytics/teamflow-report.tsx
  - webapp/src/components/analytics/__tests__/teamflow-report.test.tsx
  # Task 3 — 상세 라벨 · 판정 기준 문구
  - webapp/src/components/analytics/teamflow-band-table.tsx
  - webapp/src/components/analytics/teamflow-member-matrix.tsx
  - webapp/src/components/analytics/teamflow-detail.tsx
  - webapp/src/components/analytics/__tests__/teamflow-detail.test.tsx
autonomous: true
requirements: ["261109-kzk"]

estimate:
  tokens: 85000
  raw_tokens: 85000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "목록 「팀 순매수」 칸 · 정렬 · KPI(팀 순매수 합 · 팀 순매수 종목) · 행 sr 설명이 모두 같은 값 teamNetOf(row).val 을 쓴다 — tick_grids(date, 'KRX', isin).team_fills > 0 이면 그 행 team_day_net_krw(틱뷰어 「당일순매수」 와 같은 값 · KRX 정규장+시간외 · 상한가 가격 포함)"
    - "틱뷰어 목록과 같은 규칙으로 team_fills = 0(팀 체결 없음) 행은 「—」 로 보이고 정렬 맨 뒤 · KPI 합과 「팀 순매수 종목」 에서 빠진다(export 값으로 폴백하지 않음)"
    - "격자가 없거나 team_fills 가 null(미계산)인 행 · 옛 RPC(키 없음)는 export team_net_val 을 쓰고, 값 옆 작은 「*」 표식 + KPI 아래 설명 줄 「* n종목은 틱 기록 값이 없어 상한가 가격을 뺀 보고서 값」 으로 구별된다(n = 0 이면 그 꼬리 없음)"
    - "20% 아래 · 20%~상한 · 상한가 가격 구간 칸 · 미니막대 · 구간 차트 · 거래원 행렬 · 10분 차트는 export 값 그대로이고, 구간표 · 거래원 행렬의 「하루 합계」 행 이름은 「하루 합계(상한가 가격 제외)」 로 보인다"
    - "판정 기준에서 상한가 가격 체결을 빼는 범위를 말하는 문장은 구간표 · 거래원 표 범위로 좁혀지고, 목록 · KPI 팀 순매수 새 정의 항목(KRX 정규장+시간외 · 상한가 가격 포함 · 틱뷰어 「당일순매수」 와 같은 값)이 생긴다"
    - "teamflow_report_for_user 는 같은 시그니처 · 왕복 1회 · STABLE · SECURITY INVOKER · service_role 전용 EXECUTE 를 유지하고, rows[] 마다 tick_team_fills · tick_team_day_net_krw 키(없으면 null)를 싣고 같은 유효값 내림차순으로 정렬한다"
  artifacts:
    - path: "supabase/migrations/20261109400000_teamflow_report_tick_team_net.sql"
      provides: "teamflow_report_for_user 재정의 — tick_grids KRX 행 LEFT JOIN · 유효값 정렬 · REVOKE PUBLIC/anon/authenticated + GRANT service_role"
      contains: "tick_team_day_net_krw"
    - path: "webapp/src/lib/teamflow-report.ts"
      provides: "teamNetOf(row) → { val, src: 'tick' | 'none' | 'export' } · sortRows · kpisOf(fallback 수 포함) · rowDescriptionOf 가 이것을 쓴다"
      contains: "export function teamNetOf"
    - path: "webapp/src/components/analytics/teamflow-day-grid.tsx"
      provides: "팀 순매수 칸 = teamNetOf · 폴백 「*」 표식(data-slot teamflow-net-fallback)"
      contains: "teamNetOf"
  key_links:
    - from: "supabase/migrations/20261109400000_teamflow_report_tick_team_net.sql"
      to: "packages/shared/src/teamflow-report.ts"
      via: "rows[] 키 tick_team_fills · tick_team_day_net_krw = TeamflowRow 선택 필드"
      pattern: "tick_team_fills"
    - from: "webapp/src/lib/teamflow-report.ts"
      to: "webapp/src/components/analytics/teamflow-day-grid.tsx"
      via: "teamNetOf 한 함수가 칸 · 정렬 · KPI · sr 설명 값을 정한다"
      pattern: "teamNetOf\\("
---

<objective>
팀 매집 보고서(`/analytics/teamflow`)의 「팀 순매수」 를 틱뷰어 하루 팀 순매수(tick_grids KRX 행 team_day_net_krw)와 같은 값으로 바꾼다(2026-11-09 사용자 결정 · gh-trade 세션과 합의 — gh-trade export 정의는 그대로).

Purpose: 지금 목록 값(export team_net_val = KRX G1 만 · 상한가 가격 체결 제외)이 틱뷰어 「당일순매수」(KRX G1+G4 · 상한가 가격 포함)와 달라 같은 종목이 두 화면에서 다른 숫자로 보인다(11/3 실측 래블업 12.01억 ↔ 12.88억 · 한싹 +0.42억 ↔ −3.90억 · 한진 +1.40억 ↔ −0.01억 · 한울앤제주 −0.04억 ↔ −1.65억). 트레이더가 보는 「팀 순매수」 를 한 정의로 맞춘다.

Output: 새 마이그레이션 1개(RPC 재정의 · 원격 적용은 메인 세션) · pgTAP 갱신 · shared 타입 2필드 · 웹 lib `teamNetOf` · 목록/상세 표시 갱신 · 단위/컴포넌트 테스트 갱신.

범위 밖(건드리지 않는다): 매집감지 보고서(/analytics/accum) · 실시간 매집감지 목록 · 틱뷰어 · 상한가 보고서(/analytics/limitup) · gh-trade export · server 코드(RPC 응답을 그대로 넘기는 패스스루라 바꿀 것 없음 — server/src/services/teamflow-report.ts 확인 완료).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

# RPC 최신 정의(이것을 그대로 옮기고 조인만 더한다)
@supabase/migrations/20261102200200_teamflow_report_t20.sql
# tick_grids 팀 칸 규칙(머리 주석 — team_fills null 미계산 · 0 팀 체결 없음(값 null) · > 0 일 때만 값 · CHECK tick_grids_team_chk)
@supabase/migrations/20261103230000_tick_grid_team_day.sql
@supabase/tests/teamflow_report.test.sql
@packages/shared/src/teamflow-report.ts
@webapp/src/lib/teamflow-report.ts
@webapp/src/components/analytics/teamflow-day-grid.tsx
@webapp/src/components/analytics/teamflow-report.tsx
@webapp/src/components/analytics/teamflow-detail.tsx

<interfaces>
지금 모양(계획 시점 실측):

- RPC rows[] 원소 = to_jsonb(limitup_team_flow 행) || {t20_ms} · ORDER BY t.team_net_val DESC NULLS LAST, t.isin · limitup_entries LEFT JOIN (date, isin).
- tick_grids PK (date, exchange, isin) · date text 'YYYYMMDD'(limitup_team_flow.date 와 같은 형식) · exchange 'KRX' | 'NXT'.
- tick_grids 팀 칸: team_fills integer · team_day_net_krw bigint · team_day_pnl_krw bigint. CHECK = (셋 다 null) | (fills 0 · 둘 null) | (fills > 0 · 둘 not null).
- tick_grid_upsert(p_mode text, p_rows jsonb) 최신 정의 = 20261104300200_tick_grid_upsert_dedupe.sql — 팀 3키(team_fills · team_day_net_krw · team_day_pnl_krw)를 받는다. 테스트 픽스처는 supabase/tests/tick_grid_team_day.test.sql 의 pg_temp.grow / pg_temp.team 모양을 복제하면 된다.
- 틱뷰어 목록(webapp/src/components/ticks/tick-entry.tsx) 과거 행: dayNet = team_day_net_krw ?? null → team_fills 0 · 미계산 모두 「—」 · 정렬 null 뒤.
- webapp/src/lib/teamflow-report.ts: sortRows(team_net_val 내림차순 · null 뒤 · 동률 isin) · kpisOf → { detected, netPositive, limit, netSum } · rowDescriptionOf 「팀 순매수 {fmtEok signed}」 · fmtEok(null) = 「—」.
- teamflow-day-grid.tsx: 팀 순매수 칸 = data-slot teamflow-net(mono · truncate · title) 바깥 inline-flex 래퍼 안 · 색 = amountTone(값) · xl 열 폭 80px.
- teamflow-report.tsx: KPI 띠 아래 캡션 「탐지 = 20%↑ 또는 상한가 체결 종목 · 팀 수치는 들어와서 친 체결만 센 최소치예요」 — e2e(P33-TF1)가 이 문장을 exact 로 잡는다 → 이 문장은 바꾸지 않는다(틱뷰어 값도 같은 팀 판정 classifyKrxOrders 라 여전히 최소치 — packages/shared/src/ticks/team-day.ts 머리).
- teamflow-detail.tsx RULES 7항목 · 상세에는 팀 순매수 KPI 칸이 따로 없다(상세의 팀 순매수 숫자는 전부 export 구간 · 10분 · 거래원 값 + export summary_lines 문장 — summary_lines 는 이미 「하루 합계(상한가 가격 제외)」 라고 쓰여 있어 손대지 않는다).
</interfaces>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1 (tracer): RPC 가 tick_grids KRX 팀 값을 싣고 → 타입 → teamNetOf 가 정렬 · KPI · sr 값을 고른다</name>
  <files>supabase/migrations/20261109400000_teamflow_report_tick_team_net.sql, supabase/tests/teamflow_report.test.sql, packages/shared/src/teamflow-report.ts, webapp/src/lib/teamflow-report.ts, webapp/src/lib/__tests__/teamflow-report.test.ts</files>
  <behavior>
    - teamNetOf({team_net_val: 1e8, tick_team_fills: 5, tick_team_day_net_krw: 3e8}) → { val: 3e8, src: 'tick' }
    - teamNetOf({team_net_val: 2e8, tick_team_fills: 0, tick_team_day_net_krw: null}) → { val: null, src: 'none' } (틱뷰어 규칙 — 폴백하지 않음)
    - teamNetOf({team_net_val: 2.5e8, tick_team_fills: null}) · 키 없음(옛 RPC) → { val: 2.5e8, src: 'export' }
    - teamNetOf({team_net_val: null}) → { val: null, src: 'export' }
    - sortRows: 위 네 모양 섞인 행 → tick +3억 → export +2.5억 → export −1억 → (none · null) 순 · 동률 isin 오름차순 유지
    - kpisOf: netSum · netPositive 가 teamNetOf.val 기준 · 새 필드 fallback = src 'export' 이고 val 이 숫자인 행 수
    - rowDescriptionOf: tick → 「팀 순매수 +3.0억」 · export 폴백(값 있음) → 「팀 순매수 +2.5억(상한가 가격 제외 값)」 · none → 「팀 순매수 —(팀 체결 없음)」 · export null → 「팀 순매수 —」
    - pgTAP: rows[] 마다 tick_team_fills · tick_team_day_net_krw 키 있음 · KRX 행만 조인(NXT 값 아님) · 유효값 내림차순 정렬 · team_net_val 열은 export 그대로
  </behavior>
  <action>
① 마이그레이션 새 파일 supabase/migrations/20261109400000_teamflow_report_tick_team_net.sql. 먼저 `ls supabase/migrations | tail -3` 으로 최신 타임스탬프를 확인하고, 20261109400000 이하 이름이 이미 있으면 그보다 큰 값으로 올린다(동시 세션). 본문은 20261102200200 의 teamflow_report_for_user(p_user_id uuid, p_date text DEFAULT NULL) 를 같은 시그니처 · 같은 속성(LANGUAGE plpgsql · STABLE · SECURITY INVOKER · SET search_path = public, pg_temp) · 같은 게이트 · 날짜 규칙 · 빈 모양으로 CREATE OR REPLACE 하고, rows 서브쿼리만 바꾼다:
  - `LEFT JOIN public.tick_grids g ON g.date = t.date AND g.exchange = 'KRX' AND g.isin = t.isin` 를 더한다(PK 조인 · 왕복 1회 유지 — Cloud Run 왕복 비용 메모).
  - 원소 = to_jsonb(t) || jsonb_build_object('t20_ms', e.t20_ms, 'tick_team_fills', g.team_fills, 'tick_team_day_net_krw', g.team_day_net_krw). 키 이름에 tick_ 접두사를 붙여 export 열(team_net_val 등)과 출처가 섞이지 않게 한다(Claude 재량).
  - ORDER BY = (CASE WHEN g.team_fills IS NULL THEN t.team_net_val WHEN g.team_fills > 0 THEN g.team_day_net_krw END) DESC NULLS LAST, t.isin — team_fills 0 은 CASE 가 null 이라 맨 뒤(틱뷰어 「—」 규칙). 웹 sortRows 와 같은 순서.
  - COMMENT ON FUNCTION 갱신(quick 261109-kzk — 행 tick_team_fills · tick_team_day_net_krw 추가).
  - 권한: REVOKE EXECUTE … FROM PUBLIC; REVOKE EXECUTE … FROM anon, authenticated; GRANT EXECUTE … TO service_role(auto-grant 함정 — 메모 feedback_supabase_rpc_revoke). BEGIN/COMMIT 로 감싸고 끝에 NOTIFY pgrst, 'reload schema'.
  - 머리 주석(20261102200200 머리 형식 그대로): 무엇 · 왜(11/3 실측 4종목 · 사용자 결정 · gh-trade export 정의 불변) · 칸 규칙(team_fills null 미계산 → 웹 export 폴백 · 0 팀 체결 없음 → 「—」 · > 0 값) · 권한 · 「원격 적용: 커밋만 — 원격은 메인 세션 supabase db push --linked --yes」 · 되돌리기(20261102200200 본문 재적용 — 웹은 키 없음을 export 폴백으로 다뤄 깨지지 않는다).
② supabase/tests/teamflow_report.test.sql: 머리 「대상」 줄에 새 마이그레이션 · 잠그는 것에 J 절 한 줄 추가. 기존 A~I · H 절과 t_r 스냅숏은 그대로 둔다(20261014 · 20261013 에는 격자를 넣지 않으므로 기존 정렬 기대값 불변). 새 J 절(스냅숏 뒤 · H 앞): 날짜 20261009 에 team_flow 4행 — KR7000000231 export +1억 · KR7000000232 +2억 · KR7000000233 +2.5억 · KR7000000234 −1억 — 을 pg_temp.st + limitup_commit_day('20261009', 'mf-1009', 'sig-1009', 1, '{"team_flow":4}') 로 적재하고, tick_grid_upsert('nightly', …) 로 격자를 넣는다(픽스처 모양은 tick_grid_team_day.test.sql 의 pg_temp.grow · pg_temp.team 복제): 231 KRX fills 5 · net 300000000 · pnl 1 + 231 NXT fills 2 · net −700000000 · pnl 1 / 232 KRX fills 0(net · pnl null) / 233 KRX 팀 키 없음(옛 워커 모양 · null) / 234 격자 없음. 단언: (J1) 순서 = 231 · 233 · 234 · 232 (지금 RPC 라면 233 · 232 · 231 · 234 라 RED 가 난다) · (J2) 231 tick_team_fills 5 · tick_team_day_net_krw 300000000(NXT −7억 아님) · (J3) 231 team_net_val = 100000000(export 열 불변) · (J4) 232 tick_team_fills 0 · tick_team_day_net_krw 키 있음 · null · (J5) 233 tick_team_fills 키 있음 · null · (J6) 234 두 키 있음 · null · (J7) 231 t20_ms 키 여전히 있음 · (J8) 기존 'latest'(20261014) rows[0] 에도 tick_team_fills 키 있음 · null. SELECT plan(N) 을 실제 단언 수로 고친다(지금 30 + 새 단언 수).
③ packages/shared/src/teamflow-report.ts TeamflowRow 에 선택 필드 두 개 — tick_team_fills?: number | null · tick_team_day_net_krw?: number | null — 를 t20_ms 와 같은 문서 주석 형식으로 추가(quick 261109-kzk · RPC 가 tick_grids (date, 'KRX', isin) LEFT JOIN · null 미계산 · 0 팀 체결 없음 · 격자 없음 null · 옛 RPC 응답엔 키 없음).
④ webapp/src/lib/teamflow-report.ts:
  - 새 export 타입 TeamNetSource = 'tick' | 'none' | 'export' 와 함수 teamNetOf(row: Pick&lt;TeamflowRow, 'team_net_val' | 'tick_team_fills' | 'tick_team_day_net_krw'&gt;) → { val: number | null; src: TeamNetSource }. 규칙은 behavior 그대로(isNum 판정 재사용 · fills > 0 인데 net 이 숫자가 아니면 val null · src 'tick').
  - sortRows 제네릭 제약에 두 키를 더하고 비교 값을 teamNetOf(row).val 로 바꾼다(null 뒤 · 동률 isin 규칙 불변). 문서 주석의 「team_net_val 내림차순」 을 「팀 순매수(teamNetOf) 내림차순」 으로.
  - TeamflowKpis 에 fallback: number(설명 줄용 — export 폴백으로 값을 쓴 행 수) 추가. kpisOf 의 netSum · netPositive 를 teamNetOf.val 기준으로. 문서 주석 갱신.
  - rowDescriptionOf Pick 에 두 키 추가 · 팀 순매수 조각을 teamNetOf 기준으로: 금액 + (src 'export' 이고 값 있음 → 「(상한가 가격 제외 값)」 · src 'none' → 「(팀 체결 없음)」). 나머지 조각 순서 · 문구 불변.
  - 파일 머리 주석에 quick 261109-kzk 한 줄(팀 순매수 = 틱뷰어 당일순매수 · 폴백 규칙).
⑤ webapp/src/lib/__tests__/teamflow-report.test.ts: teamNetOf describe(behavior 4 모양) 추가 · sortRows 혼합 케이스 추가 · kpisOf 기존 toEqual 기대값에 fallback 을 더한다(10/14 픽스처는 키가 없어 전부 export 폴백 — fallback = team_net_val 이 숫자인 행 수, 픽스처에서 계산해 리터럴로 고정) · 혼합 KPI 케이스 추가 · rowDescriptionOf 기존 기대 문자열(DONGYANG · CHEONIL 등 픽스처 행)은 이제 export 폴백이라 팀 순매수 조각 뒤에 「(상한가 가격 제외 값)」 이 붙도록 고치고, tick · none 케이스를 새로 추가.
TDD 순서: ⑤ 테스트 + ② pgTAP 단언을 먼저 쓰고 실패를 확인(RED) → ①③④ 구현(GREEN). 커밋은 이 태스크 파일만 경로 지정 git add(동시 세션 — git add -A 금지).
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build &amp;&amp; pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/teamflow-report.test.ts --maxWorkers=2 &amp;&amp; bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/teamflow_report.test.sql</automated>
  </verify>
  <done>
    - vitest teamflow-report lib 테스트 전부 통과(새 teamNetOf · 혼합 sortRows · kpisOf fallback · rowDescriptionOf 접미 케이스 포함).
    - pgTAP teamflow_report.test.sql 전부 ok(plan 수 = 단언 수 · J 절 8건 포함) — docker 러너라 샌드박스 해제로 실행(메모 feedback_sandbox_blocks_tcp_probes). 못 돌리면 「pgTAP 미실행」 을 SUMMARY 에 명시.
    - 마이그레이션 게이트(주석 제외): `grep -v '^--' supabase/migrations/*_teamflow_report_tick_team_net.sql | grep -c "g.exchange = 'KRX'"` ≥ 1 · `… | grep -cE "REVOKE EXECUTE ON FUNCTION public.teamflow_report_for_user\(uuid, text\) FROM (PUBLIC|anon, authenticated)"` = 2 · `… | grep -c "TO service_role"` = 1 · `… | grep -c "SECURITY INVOKER"` = 1.
    - 원격 DB 는 건드리지 않는다(db push 는 메인 세션).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 목록 — 팀 순매수 칸 · 폴백 「*」 표식 · KPI 아래 정의/폴백 설명 줄</name>
  <files>webapp/src/components/analytics/teamflow-day-grid.tsx, webapp/src/components/analytics/teamflow-report.tsx, webapp/src/components/analytics/__tests__/teamflow-report.test.tsx</files>
  <behavior>
    - 혼합 4행(픽스처 SMBEXCEL tick fills 2 · net 1_288_000_000 / DONGYANG 키 없음 → export / HANSUN tick fills 3 · net −390_000_000 / CHEONIL tick fills 0) → 목록 순서 SMBEXCEL 「+12.9억」 → DONGYANG(export 값 + 「*」) → HANSUN 「−3.9억」 → CHEONIL 「—」
    - 「*」 표식(data-slot teamflow-net-fallback)은 DONGYANG 행에만 · CHEONIL(none) 행엔 없음 · teamflow-net 칸 글자 자체엔 「*」 가 들어가지 않는다
    - KPI 팀 순매수 합 = 1_288_000_000 + DONGYANG team_net_val − 390_000_000 의 fmtEok · 팀 순매수 종목 = 2
    - 설명 줄(data-slot teamflow-net-note) = 정의 문장 + 「 · * 1종목은 …」 · 전부 tick 인 날은 「*」 꼬리 없음
    - DONGYANG 행 sr 설명에 「(상한가 가격 제외 값)」
  </behavior>
  <action>
teamflow-day-grid.tsx: 행마다 const tn = teamNetOf(r) 를 한 번 구해 팀 순매수 칸의 글자(fmtEok(tn.val, { signed: true }))와 색(amountTone(tn.val))을 정한다. 칸 래퍼(inline-flex) 안, data-slot teamflow-net 스팬 바로 뒤에 형제 스팬 하나 — tn.src === 'export' 이고 tn.val 이 숫자일 때만 — data-slot teamflow-net-fallback · aria-hidden(sr 은 rowDescriptionOf 가 이미 말한다) · title 「틱 기록 값이 없어 상한가 가격을 뺀 보고서 값」 · 글자 「*」 · shrink-0 · caption 크기 · --muted-fg. 형제로 두는 이유: teamflow-net 은 truncate 라 안에 넣으면 잘릴 수 있고, e2e · RTL 이 teamflow-net 글자를 exact 로 잡는다. tn.src === 'none' 이면 teamflow-net 스팬 title 을 「틱 기록상 팀 체결 없음」 으로(글자는 fmtEok 의 「—」 · 틱뷰어 목록과 같은 규칙). xl 열 템플릿 80px 는 그대로 두되, 최악값(−1,234.5억 + 「*」)이 겹치거나 줄바꿈되면 그 열만 최소한으로 넓혀 고친다(손보는 표면 시각 결함은 바로 고치기 메모 — 고쳤으면 SUMMARY 에 한 줄). 파일 머리 주석에 quick 261109-kzk 한 줄(팀 순매수 = teamNetOf · 폴백 표식).
teamflow-report.tsx: 기존 KPI 캡션 p(최소치 문장)는 글자 그대로 둔다. 그 바로 아래 새 p — data-slot teamflow-net-note · 같은 캡션 스타일(-mt-2 · caption · --muted-fg · break-keep) — 글자 = 「팀 순매수 = 틱뷰어 당일순매수와 같은 값(KRX 정규장+시간외 · 상한가 가격 포함)」 + kpis.fallback > 0 일 때만 「 · * {n}종목은 틱 기록 값이 없어 상한가 가격을 뺀 보고서 값」(n = ko-KR 정수). 머리 문서 주석 ⑤의 「행 = team_net_val 큰 순」 을 「행 = 팀 순매수(teamNetOf) 큰 순」 으로, 설명 줄을 순서 설명에 추가. KPI 띠 컴포넌트(teamflow-kpi-strip.tsx)는 바꾸지 않는다(값은 kpisOf 가 이미 새 기준).
teamflow-report.test.tsx: behavior 케이스를 새 it 로 추가(픽스처 teamflowRows() 에서 4행을 골라 tick 키를 덧붙인 응답을 fetch 목으로 · 기존 테스트 구성 그대로). 기존 (k) KPI 테스트 · (n) 테스트는 픽스처 행이 전부 export 폴백이라 KPI 값이 그대로여야 한다 — (k) 에 설명 줄이 「* n종목은 …」 꼬리를 갖는다는 단언 하나만 추가(n = 픽스처에서 team_net_val 이 숫자인 행 수 · Task 1 kpisOf 테스트의 fallback 값과 같은 리터럴). 기존 sr 설명 단언(DONGYANG 문자열)은 「팀 순매수 +2.2억(상한가 가격 제외 값)」 으로 고친다. 커밋은 이 태스크 파일만 경로 지정.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/webapp exec vitest run src/components/analytics/__tests__/teamflow-report.test.tsx src/lib/__tests__/teamflow-report.test.ts --maxWorkers=2 &amp;&amp; pnpm --filter @gh-radar/webapp typecheck</automated>
  </verify>
  <done>
    - teamflow-report 컴포넌트 테스트 · lib 테스트 통과 · webapp typecheck(e2e tsconfig 포함) 통과.
    - 없어져야 할 것(계획 시점 1건 있음): `grep -c "fmtEok(r.team_net_val" webapp/src/components/analytics/teamflow-day-grid.tsx` 결과가 0.
    - 생겨야 할 것(계획 시점 미존재): `grep -c "teamNetOf" webapp/src/components/analytics/teamflow-day-grid.tsx` 결과가 1 이상 · `grep -c 'data-slot="teamflow-net-note"' webapp/src/components/analytics/teamflow-report.tsx` 결과가 1.
    - KPI 캡션 최소치 문장은 글자 그대로(e2e P33-TF1 exact 단언 보존): `grep -c "팀 수치는 들어와서 친 체결만 센 최소치예요" webapp/src/components/analytics/teamflow-report.tsx` = 1.
  </done>
</task>

<task type="auto">
  <name>Task 3: 상세 — 「하루 합계(상한가 가격 제외)」 이름 구별 · 판정 기준 팀 순매수 정의 갱신</name>
  <files>webapp/src/components/analytics/teamflow-band-table.tsx, webapp/src/components/analytics/teamflow-member-matrix.tsx, webapp/src/components/analytics/teamflow-detail.tsx, webapp/src/components/analytics/__tests__/teamflow-detail.test.tsx</files>
  <action>
구간 · 거래원 값은 export 그대로 두고 「하루 합계」 이름만 구별한다. 데이터 라벨(b.label · 행 id · data-row · lib memberBandMatrixOf 의 label)과 「하루 합계」 문자열 매칭은 바꾸지 않는다 — 표시만 바꾼다.
- teamflow-band-table.tsx: total 행의 첫 칸을 「하루 합계」 + 뒤에 block 스팬 「(상한가 가격 제외)」(caption 크기 · font-normal · --muted-fg)로. 칸 textContent 가 「하루 합계(상한가 가격 제외)」 가 되도록 공백 없이 붙인다. 문서 주석에 한 줄.
- teamflow-member-matrix.tsx: 행 머리 th 에서 row.total 일 때 같은 block 스팬을 덧붙인다(th 는 sticky · whitespace-nowrap — block 둘째 줄이라 첫 열 폭이 「28%~상한 미만」 보다 크게 늘지 않는다. 겹침 · 잘림이 보이면 바로 고친다). 10분 행렬은 total 행이 없어 영향 없음.
- teamflow-detail.tsx RULES(UI-SPEC 하드코딩 — 사용자 결정 quick 261109-kzk 로 팀 순매수 정의 항목만 갱신한다고 RULES 위 주석 갱신):
  · 4번째 항목(「구간 = 체결가의 기준가 대비 등락률…」)의 둘째 문장 — 상한가 가격 체결을 따로 보이고 빼는 범위를 말하는 문장 — 을 이 문장으로 통째 교체: 「구간표 · 거래원 표의 상한가 가격 체결은 팀 매수 · 매도를 따로 보이고 구간 순매수와 「하루 합계(상한가 가격 제외)」 에서 뺀다.」
  · 4번째 항목 바로 뒤에 새 항목: 「목록 · KPI 의 팀 순매수 = 틱뷰어 「당일순매수」 와 같은 값 — KRX 정규장+시간외 · 상한가 가격 포함. 틱 기록 값이 아직 없는 종목만 상한가 가격을 뺀 보고서 값을 쓰고 「*」 로 표시한다.」
  · 마지막 항목 「KRX 정규장만 본다(넥스트레이드 제외).」 → 「구간 · 10분 · 거래원 표는 KRX 정규장만 본다(넥스트레이드 제외).」
  · 결과 8항목. 첫 항목 글자는 그대로(테스트가 items[0] 을 exact 로 잡는다). 「단위 억 · 하루 합계 = 상한가 가격 제외」 캡션은 그대로 둔다(테스트 단언 · 의미 불변).
- teamflow-detail.test.tsx: 구간표 마지막 행 첫 칸 기대값 → 「하루 합계(상한가 가격 제외)」 · 판정 기준 li 7 → 8 · 거래원 행렬 cellTexts 의 하루 합계 행 첫 원소 → 「하루 합계(상한가 가격 제외)」(data-row 속성 단언은 「하루 합계」 그대로) · 새 RULES 항목 하나를 exact 로 단언 추가. 그 밖에 「하루 합계」 표시 글자를 exact 로 잡는 단언이 더 있으면 같은 규칙으로 고친다(lib 테스트의 memberBandMatrixOf total.label 「하루 합계」 는 데이터 라벨이라 그대로).
- e2e 확인만: `grep -n "하루 합계\|toHaveLength(7)\|li" webapp/e2e/specs/teamflow-report.spec.ts` 로 바뀐 표시 글자 · 판정 기준 항목 수를 exact 로 잡는 단언이 있는지 본다 — 있으면 같은 규칙으로 고치고 files_modified 밖 수정으로 SUMMARY 에 적는다(계획 시점 grep 으로는 주석 1줄뿐). e2e 실행은 이 계획의 필수 게이트가 아니다(동시 세션 메모리 메모 — 돌린다면 해당 spec 만 --workers=1).
커밋은 이 태스크 파일만 경로 지정.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/webapp exec vitest run src/components/analytics/__tests__/teamflow-detail.test.tsx src/components/analytics/__tests__/teamflow-report.test.tsx src/lib/__tests__/teamflow-report.test.ts src/lib/__tests__/teamflow-chart.test.ts --maxWorkers=2 &amp;&amp; pnpm --filter @gh-radar/webapp typecheck</automated>
  </verify>
  <done>
    - 상세 · 목록 · lib(teamflow-report · teamflow-chart) 테스트 통과 · typecheck 통과.
    - 없어져야 할 것(계획 시점 1건 있음): `grep -c "순매수와 하루 합계에서 뺀다" webapp/src/components/analytics/teamflow-detail.tsx` 결과가 0.
    - 생겨야 할 것(계획 시점 미존재): `grep -c "상한가 가격 제외)" webapp/src/components/analytics/teamflow-band-table.tsx` 결과가 1 이상 · 같은 grep 을 webapp/src/components/analytics/teamflow-member-matrix.tsx 에 돌려 1 이상 · `grep -c "틱뷰어 「당일순매수」 와 같은 값" webapp/src/components/analytics/teamflow-detail.tsx` 결과가 1 이상.
  </done>
</task>

</tasks>

<verification>
- 마지막에 한 번: `pnpm --filter @gh-radar/webapp exec vitest run src/components/analytics src/lib/__tests__/teamflow-report.test.ts src/lib/__tests__/teamflow-chart.test.ts --maxWorkers=2` (teamflow · accum 등 analytics 컴포넌트 회귀 — 다른 화면 파일은 건드리지 않았으므로 통과해야 한다) + `pnpm --filter @gh-radar/webapp typecheck` + pgTAP `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/teamflow_report.test.sql`.
- server 는 코드 변경 없음 — `pnpm --filter @gh-radar/server exec vitest run tests/routes/teamflow-report.test.ts --maxWorkers=2` 로 패스스루 회귀만 확인(shared 타입 선택 필드 추가뿐).
- `git status -sb` 로 이 계획 파일만 커밋됐는지 · 남의 미커밋을 쓸어가지 않았는지 확인(git stash 금지).
</verification>

<success_criteria>
- 11/3 래블업처럼 KRX 격자에 팀 값이 있는 종목은 목록 팀 순매수가 틱뷰어 「당일순매수」 와 같은 숫자로 보이고, 그 값으로 정렬 · KPI 합 · 팀 순매수 종목 수 · sr 설명이 계산된다.
- 팀 체결 없음(team_fills 0)은 「—」 · 맨 뒤 · KPI 제외. 격자 없음/미계산은 export 값 + 「*」 + 설명 줄 n종목.
- 구간 · 거래원 · 차트는 export 값 그대로 · 「하루 합계(상한가 가격 제외)」 로 이름 구별 · 판정 기준 문구가 새 정의를 말한다.
- RPC 는 왕복 1회 · 권한 service_role 전용 · pgTAP 통과. 원격 DB 미적용(메인 세션 몫).
</success_criteria>

<output>
Create `.planning/quick/261109-kzk-teamflow-team-net-uses-tick-viewer-day-n/261109-kzk-SUMMARY.md` when done.

SUMMARY 에 메인 세션 배포 순서를 적는다(executor 는 커밋까지만 — 서브에이전트 배포는 분류기 차단 메모):
1. `supabase db push --linked --yes` 로 새 마이그레이션 원격 적용(먼저 — 웹은 옛 RPC 키 없음을 export 폴백 「*」 로 보여 깨지지는 않지만, DB 가 먼저 가야 처음부터 새 값이 보인다).
2. 그다음 `git push`(= webapp 프로덕션 배포). server · 워커 배포 없음(server 패스스루 무변경).
3. 확인: 운영 화면 /analytics/teamflow?d=20261103 에서 래블업 12.9억 · 한싹 −3.9억 · 한진 −0.0억 · 한울앤제주 −1.7억(틱뷰어 같은 날 당일순매수와 대조).
</output>
