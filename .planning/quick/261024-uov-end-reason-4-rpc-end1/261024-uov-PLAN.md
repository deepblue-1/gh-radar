---
phase: quick-261024-uov
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/lib/accum-list.ts
  - webapp/src/lib/use-accum-signals.ts
  - webapp/src/components/trading/workbench/accum-strip.tsx
  - webapp/src/lib/__tests__/accum-list.test.ts
  - webapp/src/lib/__tests__/use-accum-signals.test.tsx
  - webapp/src/components/trading/__tests__/accum-strip.test.tsx
  - packages/shared/src/accum-signal.ts
  - packages/shared/src/__tests__/accum-signal.test.ts
  - supabase/migrations/20261024230000_dma_accum_signals_closed_companion.sql
  - supabase/tests/dma_strategy_accum_signal.test.sql
autonomous: true
requirements: [UOV-LIST, UOV-LABEL, UOV-RPC, UOV-TEST]

estimate:
  tokens: 70000
  raw_tokens: 70000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "실시간 /trading 「매집」 패널에서, 최신 행이 end_reason 4(매집 종료)인 종목은 같은 서버(고른 게이트웨이)에 그날 청산 행(queue_case 4 · cancel_reason 1)이 복원 자르기 뒤에 있으면 펼친 표에 회색 「청산」 행으로 남는다 — 배지는 「청산」 그대로, 행 title 은 ACCUM_END_REASON_LABELS[4]"
    - "그날 청산 행이 없는 매집 종료 종목(숨김 이월 뒤 바로 끝난 종목)은 목록에 없다. 다른 서버에만 청산 행이 있어도 없다"
    - "활성(매집중 · 매도중) 행 전부와 종료 사유 1(청산) 행은 전과 같이 보이고, 종료 사유 2(기동 정합) · 3(이월 만료) 행은 전과 같이 보이지 않는다"
    - "페이지를 새로고침해도(REST 복원 RPC) 첫 번째 사실이 그대로다 — RPC 가 (gateway, isin) 별 최신 행에 더해 그날 최신 청산 행을 함께 주기 때문이다(최신 행이 곧 그 청산 행이면 1행 · 중복 없음 · 자르기 뒤 행에서만)"
    - "청산 행에서 ✕ 로 숨긴 종목은 매집 종료(4) 뒤에도 숨김이다 — 두 행의 숨김 키가 같은 `isin|cycle|end` 다"
    - "dma_accum_signals_for_user_json 의 EXECUTE 는 anon · authenticated 불가 · service_role 가능 그대로다"
  artifacts:
    - path: "webapp/src/lib/accum-list.ts"
      provides: "closedIsinsOf(rows) — 자르기 뒤 그날 청산 행 isin 집합 · isListedAccum(sig, closed) — 목록 규칙 하나 · 머리 주석 ②' ③"
      contains: "export function closedIsinsOf"
    - path: "webapp/src/lib/use-accum-signals.ts"
      provides: "목록 규칙을 훅에서 한 번 적용(고른 게이트웨이 행 mine 기준)"
      contains: "closedIsinsOf(mine)"
    - path: "webapp/src/components/trading/workbench/accum-strip.tsx"
      provides: "목록 거름 제거(받은 행을 그대로) · 주석 ③ ⑤ ⑧ · signals prop 문서"
    - path: "packages/shared/src/accum-signal.ts"
      provides: "ACCUM_END_REASON_LABELS[4] · endReason/AccumState/cycle/배지 주석"
      contains: "4: \"매집 종료 — "
    - path: "supabase/migrations/20261024230000_dma_accum_signals_closed_companion.sql"
      provides: "dma_accum_signals_for_user_json 재정의 — 최신 1행 + 그날 최신 청산 1행 · 같은 권한"
      contains: "cancel_reason"
    - path: "supabase/tests/dma_strategy_accum_signal.test.sql"
      provides: "−3일 매집 종료 픽스처 · 동반 행 · 중복 없음 · 자르기 · 가시 게이트웨이 단언"
  key_links:
    - from: "webapp/src/lib/use-accum-signals.ts useMemo"
      to: "webapp/src/lib/accum-list.ts closedIsinsOf · isListedAccum"
      via: "mine(고른 게이트웨이 행) → closedIsinsOf(mine) → latestAccumByIsin(mine) 결과를 isListedAccum(sig, closed) 로 거름"
      pattern: "isListedAccum\\(sig, closed\\)"
    - from: "supabase/migrations/20261024230000_dma_accum_signals_closed_companion.sql"
      to: "webapp/src/lib/accum-list.ts closedIsinsOf"
      via: "같은 판정(자르기 뒤 queue_case 4 · cancel_reason 1) — 복원 응답에 그날 청산 행이 있어야 새로고침 뒤 웹 규칙이 같은 답을 낸다"
      pattern: "한쪽만 바꾸면 복원과 라이브가 갈린다"
    - from: "webapp/src/components/trading/workbench/accum-strip.tsx 행 title"
      to: "packages/shared/src/accum-signal.ts ACCUM_END_REASON_LABELS"
      via: "ACCUM_END_REASON_LABELS[v.sig.endReason] — webapp 은 shared dist 를 읽는다(webapp 테스트 · 타입체크 전 `pnpm --filter @gh-radar/shared build`)"
      pattern: "ACCUM_END_REASON_LABELS\\[v\\.sig\\.endReason\\]"
---

<objective>
gh-trade 가 2026-10-24 21:10 KST 부터 kind 16 row 4 에 `cancel_reason`/`end_reason` **4 「매집 종료」** 를 낸다(인박스 `docs/inbox/from-gh-trade/261024-accum-hidden-carry10.md` 「추가 2026-10-24 — 매집 종료 end_reason 4」). 장중에만, 같은 사이클의 청산(row 4 · end 1) 뒤 두 번째 종료 행으로 오고(같은 주문이면 같은 gw_time_ms · end 4 의 seq 가 더 크다), 88 이 없어 gh-trade WinForms 클라는 회색 「청산」 행을 자정까지 그대로 둔다. 숨김 이월 뒤 끝난 종목은 그날 end 1 행 없이 end 4 한 줄뿐이다(그날 클라 목록에 없던 종목).

지금 웹은 `isListedAccum(sig)` = 「활성이거나 종료 사유 1」 이라 end 4 가 최신이 되는 순간 행이 사라진다. 이 플랜은 WinForms 동형으로 맞춘다(결정 고정 · 재검토 금지):
- 최신 행이 end 4 인 종목은 **같은 서버 · 그날 · 자르기 뒤 행에 청산(queue_case 4 · cancel_reason 1) 행이 있을 때만** 회색 「청산」 행으로 남는다(배지 그대로 · title = ACCUM_END_REASON_LABELS[4]). 없으면 싣지 않는다. ✕ 키는 이미 `isin|cycle|end` 다.
- 판정은 행 단위 정보(그날 청산 행이 있었는가)가 필요하므로 isin 별 최신 행만으로는 못 한다 → `accum-list.ts` 순수 함수 `closedIsinsOf(rows)` 로 구하고, 목록 규칙 `isListedAccum(sig, closed)` 를 **훅에서 한 번** 적용한다(패널은 받은 행을 그대로 보인다 — 규칙이 두 곳에 갈리지 않게). 재량 결정: 작업대가 `AccumStrip` 에 props 를 하나씩 넘기므로(trading-workbench.tsx — 범위 밖) 새 prop 대신 훅이 거른 `signals` 를 주는 쪽이 범위 안에서 가장 깔끔하다.
- 복원 RPC `dma_accum_signals_for_user_json` 는 (gateway, isin) 별 최신 1행만 줘서 새로고침 뒤 end 1 행이 사라진다 → 새 마이그레이션으로 (gateway, isin) 별 **그날 최신 청산 행**을 함께 싣는다(같은 자르기 · 중복 없음 · 같은 권한).
- 문구 `ACCUM_END_REASON_LABELS[4]` 추가 · `endReason` 주석 0~4.

**오케스트레이터 결정(2026-10-24 · WinForms 동형 기본 — 플랜의 「매집 종료 행 값은 end 4 기준」 재량 결정을 대체한다):** 매집 종료 행의 **값 · 「갱신」 시각 · 청산끼리 순서는 그날 최신 청산 행(row 4 · end 1) 기준**이고, 종료 사유만 4(툴팁 「매집 종료 — …」)다. WinForms 클라는 88 을 받지 않아 청산 순간의 값 · 시각을 그대로 들고 있으므로 같게 맞춘다. 구현: `closedIsinsOf` 대신 `closedRowsOf(rows): Map<string, StrategyEventRow>`(자르기 뒤 isin 별 **최신** queueCase 4 · cancelReason 1 행 — 최신 판정은 `isNewer`)를 export 하고, 훅에서 최신 행이 cancelReason 4 이고 map 에 그 isin 이 있으면 `accumSignalOf(청산 행)` 에 `endReason: 4` 를 덮어 쓴 신호를 싣는다(없으면 싣지 않음). `isListedAccum(sig, closed)` 의 두 번째 인자는 `ReadonlySet<string> | ReadonlyMap<string, unknown>` 처럼 `has(isin)` 만 쓰는 형태로 둔다. 플랜 본문의 `closedIsinsOf` 표기 · grep 수용 기준은 `closedRowsOf` 로 읽는다. 테스트: 같은 시각 end1 → end4(seq 큼)에서 표시 값이 end 1 행의 netKrw · gwTimeMs 이고 endReason 4 인지 단언 하나를 더한다.

태스크 크기 메모: Task 1 은 6파일(원천 3 + 그 옆 테스트 3)이다. `isListedAccum` 시그니처 변경과 패널 거름 제거가 세 원천 · 세 테스트를 한꺼번에 바꿔야 타입체크 · 테스트가 초록이라, 나누면 중간 커밋이 빨갛다 — 편집은 모두 작다.

Purpose: 트레이더가 웹 「매집」 패널에서 gh-trade 클라와 같은 종목 목록을 본다 — 장중 매집이 끝난 종목도 그날 청산했던 종목이면 회색으로 남고, 그 이유(매집 종료)를 툴팁으로 안다.
Output: accum-list 순수 함수 · 훅 배선 · 패널 주석, shared 문구, 복원 RPC 마이그레이션, 단위 테스트(shared · webapp) · pgTAP, 경로 지정 커밋.

범위 밖(건드리지 않는다): 보고서(analytics · 90a3289d 에서 끝남) · server(RPC 통과만 — 주석이 낡았어도 손대지 않음) · relay · trading-workbench.tsx · accum-signals-api.ts · strategy-event.ts · 인박스 노트(오케스트레이터가 닫는다) · STATE.md · 배포(`supabase db push` · `git push` 금지) · e2e/playwright.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@docs/inbox/from-gh-trade/261024-accum-hidden-carry10.md
@webapp/src/lib/accum-list.ts
@webapp/src/lib/use-accum-signals.ts
@supabase/migrations/20261019160000_dma_accum_signals_per_gateway.sql

<interfaces>
<!-- 실행자가 코드베이스를 다시 탐색하지 않도록 뽑아 둔 계약(줄 번호는 이 플랜 작성 시점 master 90a3289d). -->

webapp/src/lib/accum-list.ts (152줄)
- 머리 주석: ① :4-6 · ② :8-9 · ②' :11-13(「청산 행은 종료 사유 1(청산)만. 2 이월 탈락 · 3 이월 만료는 06:00 …」) · ③ :15-19(✕ 키) · ④ :21-23.
- `restoreCutByGateway(rows: readonly Pick<StrategyEventRow, 'gateway' | 'gwTimeMs' | 'queueCase'>[]): Map<string, number>` :79-96 — 게이트웨이별 최근 복원 묶음 시작 시각. ★ 주석 :77 「같은 규칙을 REST RPC 가 SQL 로 쓴다 — 한쪽만 바꾸면 복원과 라이브가 갈린다」.
- `latestAccumByIsin(rows)` :99-109 — `const cut = restoreCutByGateway(rows)`; 행마다 `const c = cut.get(r.gateway); if (c !== undefined && r.gwTimeMs < c) continue;` → isin 별 isNewer 최신.
- `isListedAccum(sig: Pick<AccumSignal, 'state' | 'endReason'>): boolean` :111-114 — 현재 `sig.state !== 3 || sig.endReason === 1`.
- `accumDismissKey(sig)` :34-37 — state 3 이면 `${isin}|${cycle}|end`(사유와 무관 → end 4 도 같은 키).
- `sortAccum` :117-126 — 청산(3)끼리 gwTimeMs 오름차순. 변경 없음.

webapp/src/lib/use-accum-signals.ts (108줄)
- 머리 ① :6-10(「fetchAccumSignals()(오늘 · 서버가 isin 별 최신 1행)」) · ④ :17-21.
- `AccumSignalsState.signals` 문서 :39-40(「isin 별 현재 상태(정렬 전 …)」).
- import :33-35(`latestAccumByIsin` from './accum-list').
- useMemo :93-105 — `mine` :98(고른 게이트웨이 행) · 루프 :100-103 `for (const row of latestAccumByIsin(mine)) { const sig = accumSignalOf(row); if (sig !== null) out.push(sig); }`.

webapp/src/components/trading/workbench/accum-strip.tsx (637줄)
- 머리 ③ :13-15(「사유(청산 · 이월 탈락 · 이월 만료)는 행 툴팁」) · ⑤ :22-23(✕) · ⑧ :29(「청산 행은 `isListedAccum` 이 거른 것만 …」).
- import 블록 :46-55 — `isListedAccum,` 가 :51.
- prop 문서 :72 `/** \`useAccumSignals().signals\` — isin 별 현재 상태(정렬 전). */`.
- `visible` memo :166-169 — 지금 `signals.filter((s) => isListedAccum(s) && !isAccumDismissed(dismissed, s))` 를 sortAccum.
- 행 title :504 `ACCUM_END_REASON_LABELS[v.sig.endReason] ?? '청산'` — 변경 없음(라벨 4 가 생기면 저절로 나온다). 배지는 ACCUM_STATE_LABELS[3] = 「청산」.
- 그 밖에 endReason 을 보는 곳 없음(grep 확인).

packages/shared/src/accum-signal.ts (189줄)
- 머리 주석 :1-21(quick 별 단락 문법 — 「quick-xxxxxx — 인박스 … : …」).
- `AccumState` 문서 :24 「1 매집중 · 2 매도중 · 3 종료(청산 · 이월 탈락 · 이월 만료).」
- `endReason` 문서 :39 「0 없음 · 1 청산(1억 미만 숨김 — 같은 cycle 로 재등장 가능) · 2 서버 재기동 때 복원 안 됨 · 3 이월 10일 만료.」
- `cycle` 문서 :41 「… 만료 · 기동 정합 뒤 새 등록만 +1」.
- `ACCUM_STATE_LABELS` 문서 :93 「종료 사유 1/2/3 은 배지 하나 「청산」 …」.
- `ACCUM_END_REASON_LABELS` :101-105 — 키 1 · 2 · 3. 문자열 안 대시는 U+2014(—).
- `accumSignalOf` 는 `endReason: row.cancelReason` 을 그대로 옮긴다(:158) — 4 를 버리지 않는다. 매퍼 변경 없음.

StrategyEventRow(공용 camelCase) — 이 플랜이 쓰는 칸: `isin` · `gateway` · `gwTimeMs` · `seq` · `queueCase`(행 종류 1~5) · `cancelReason`(종료 사유) · `qty`(state) · `kind`.

테스트 픽스처
- webapp/src/lib/__tests__/accum-list.test.ts: 머리 「잠그는 것」 :8-14 · `row(over)` :33-35(Partial 을 캐스트 — 필요한 칸만 준다) · `sig(over)` :37~ · `describe('isListedAccum')` :182-190 · `describe('✕ 숨김 …')` :192-220.
- webapp/src/lib/__tests__/use-accum-signals.test.tsx: 머리 「잠그는 것」 :8-15 · `ac(over)` :39-49(fixture exposed 위에 kind 16 · qty 1 · expectedCum 1 — cancelReason 은 fixture 값 0) · 매도 경보 테스트 :137-173(종료 행 :160-170 은 qty 3 · queueCase 4 · cancelReason 미지정 = 0) · 게이트웨이 테스트 :175-204(gateway 를 행마다 명시하는 문법). 시계 2026-09-29 10:00 KST 고정 · `kstMs('2026-09-29', 'HH:MM:SS.mmm')`.
- webapp/src/components/trading/__tests__/accum-strip.test.tsx: 머리 ② :10 · LABELS :97-102(KR7000020008 천일고속 · KR7000040006 서산 · KR7000060004 금호전기 · KR7000080002 대양금속) · `setup` · `rows()` · `openTable()` · 테스트 ② :171-189.
- packages/shared/src/__tests__/accum-signal.test.ts: 문구 테스트 :233-240(`ACCUM_END_REASON_LABELS` toEqual 1 · 2 · 3) · 「매도중(2) · 청산(3) · 종료 사유 · 이월 · 행 종류 4」 테스트 :111 근처(행 픽스처 `accumRow` 덮어쓰기 문법).

복원 RPC(현재 정본 supabase/migrations/20261019160000_dma_accum_signals_per_gateway.sql :19-59)
- ev 원소는 `dma_strategy_events_for_user` 의 `to_jsonb(e) - 'dma_user_id' - 'applied_at' || {stock_code}`(20261018120000 :43) — 키는 테이블 열 이름 그대로: `'cancel_reason'`(smallint NOT NULL DEFAULT 0) · `'queue_case'` · `'seq'` · `'gw_time_ms'` · `'gateway'` · `'isin'` · `'kind'`.
- CTE ev(:26-34) → cut(:36-45 · 게이트웨이별 최근 복원 묶음 시작) → DISTINCT ON (gateway, isin) … ORDER BY gateway, isin, ms DESC, seq DESC(:46-54) → `coalesce(jsonb_agg(l.ev ORDER BY l.gateway, l.isin), '[]'::jsonb)`.
- 권한 :57-59 — REVOKE … FROM PUBLIC · REVOKE … FROM anon, authenticated · GRANT … TO service_role.

pgTAP(supabase/tests/dma_strategy_accum_signal.test.sql · 316줄)
- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_accum_signal.test.sql` — 일회용 docker 컨테이너(로컬 이미지 public.ecr.aws/supabase/postgres:17.6.1.104 이미 있음 · pull 안 함)에 저장소 마이그레이션 전부를 재생한 뒤 실행 · 원격 접촉 0 · trap 으로 컨테이너 삭제. `not ok` 1줄이면 non-zero.
- 헬퍼: `pg_temp.kd(n)` :65-67(KST 오늘 − n일) · `pg_temp.sev(seq, kind, group, account, order_no, hms, over, date)` :70-87 · `pg_temp.ac(isin)` :90-95(qty 1 · queue_case 1 …) · `pg_temp.accum_rows(user, date)` :140-144 → (ord, gateway, seq, kind, isin).
- 사용 중인 seq: KB120 epoch 'ep-ac' 1-6 · 11-16 · 21-26 / KYOBO119 epoch 'ep-ack' 1-3 · 11-12. 사용 중인 날짜: kd 0 · 1 · 2 · 30 · 31.
- `SELECT plan(28);` :146 · 픽스처 수 단언 :153-156(17행) · 복원 묶음 픽스처 :123-137 · 3b 단언 :240-250 · purge 남은 행 단언 :257-262(`trade_date NOT IN (kd(0), kd(2))`).
- 사용자: U1 …2911(KB120 + KYOBO119) · U2 …2912(KB120 만). isin 오름차순 B KR7000660001 < A KR7005930003 < C KR7035720002.
</interfaces>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: 트레이서 — 그날 청산 행 동반 판정(closedIsinsOf) → 목록 규칙 isListedAccum(sig, closed) 를 훅에서 한 번 → 패널은 받은 행 그대로(매집 종료 행 회색)</name>
  <files>webapp/src/lib/accum-list.ts, webapp/src/lib/use-accum-signals.ts, webapp/src/components/trading/workbench/accum-strip.tsx, webapp/src/lib/__tests__/accum-list.test.ts, webapp/src/lib/__tests__/use-accum-signals.test.tsx, webapp/src/components/trading/__tests__/accum-strip.test.tsx</files>
  <behavior>
    - accum-list `closedIsinsOf`: queueCase 4 · cancelReason 1 행의 isin 만 담는다(queueCase 4 · cancelReason 4 · 2, queueCase 1 은 아님) · 같은 게이트웨이의 최근 복원 묶음(queueCase 3) 시작보다 이른 청산 행은 세지 않는다 · 빈 입력 → 빈 집합
    - accum-list `isListedAccum(sig, closed)`: state 1 · 2 → true(빈 집합이어도) · state 3 endReason 1 → true(빈 집합이어도) · endReason 2 · 3 → false(isin 이 집합에 있어도) · endReason 4 → isin 이 집합에 있으면 true, 없으면 false
    - accum-list: `accumDismissKey(sig({ state: 3, endReason: 4, cycle: 2 }))` === 'KR7000020008|2|end'(청산 행과 같은 키)
    - 훅(KB120 고름): 복원 행 X(row1 09:30 → 청산 10:00 seq 2 → 매집 종료 같은 10:00 seq 3) · Y(매집 종료 한 줄) · Z(종료 사유 2 한 줄) · W(KB120 매집 종료 + KYOBO119 청산) → signals 의 [isin, state, endReason] = [['KR7000020008', 3, 4]] 하나
    - 훅: 복원 [X row1, X 청산] → [X 3 1] · 라이브로 X 매집 종료(같은 ms · 더 큰 seq)가 오면 → 여전히 1행 [X 3 4]
    - 훅 기존 매도 경보 테스트: 종료 행에 cancelReason 1 을 주면 전과 같이 state 3 · row 4 · sellWarn false
    - 패널: signals 에 활성 1 · 청산(1) 금호전기 · 매집 종료(4) 서산 을 주면 칩 1개 · 펼친 표 3행 · 두 종료 행 모두 회색(text-[var(--muted-fg)]) · 배지 「청산」 · 금호전기 행 title = 라벨 1 문구
  </behavior>
  <action>
RED 먼저: 아래 4)의 테스트를 쓰고 `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/accum-list.test.ts src/lib/__tests__/use-accum-signals.test.tsx src/components/trading/__tests__/accum-strip.test.tsx --maxWorkers=2` 가 새 단언에서 실패함을 확인 → 커밋 `test(quick-261024-uov): 매집 패널 매집 종료(4) 목록 규칙 — 그날 청산 행 동반 판정 실패 테스트`. 그다음 1)~3) 구현 → GREEN.

1) webapp/src/lib/accum-list.ts
   a. 새 export `closedIsinsOf(rows: readonly Pick<StrategyEventRow, 'isin' | 'gateway' | 'gwTimeMs' | 'queueCase' | 'cancelReason'>[]): Set<string>` 를 `latestAccumByIsin` 바로 뒤에 둔다. 본문은 `latestAccumByIsin` 과 같은 자르기를 쓴다 — `restoreCutByGateway(rows)` 로 cut 을 구하고, 행마다 그 게이트웨이 cut 보다 이르면 건너뛴 뒤(같은 비교식), `queueCase === 4 && cancelReason === 1` 인 행의 isin 을 모은다. 문서: 「②' 그날 청산 행(row 4 · end 1)이 있는 isin — 복원 묶음(⑤) 뒤 행만. 입력은 한 게이트웨이 행이다(훅 ④) — 게이트웨이를 섞어 주면 다른 서버의 청산도 센다. ★ 같은 판정을 REST RPC(20261024230000)가 SQL 로 쓴다 — 한쪽만 바꾸면 복원과 라이브가 갈린다.」
   b. `isListedAccum` 시그니처를 `(sig: Pick<AccumSignal, 'isin' | 'state' | 'endReason'>, closed: ReadonlySet<string>): boolean` 으로 바꾸고 본문을 「state 가 3 이 아니거나 · endReason 1 이거나 · endReason 4 이면서 closed 에 sig.isin 이 있으면 true」 로 한다. 두 번째 인자는 기본값 없이 필수다(모든 호출처가 행 문맥을 주게 — 타입체크가 빠진 곳을 잡는다). 문서: 「목록에 싣는 행인가(②') — 활성(1 · 2) 전부 · 청산(3)은 종료 사유 1 과, `closed`(그날 청산 행이 있는 isin)에 든 종목의 종료 사유 4(매집 종료).」
   c. 머리 주석 ②' 를 다시 쓴다(②' 한 단락 안에서): 목록에 싣는 행 = 활성 전부 · 청산 행은 종료 사유 1(청산) · 종료 사유 4(매집 종료 — 인박스 261024-accum-hidden-carry10 「추가 — 매집 종료」)는 그날 같은 서버 그 종목에 청산 행(row 4 · end 1)이 있을 때만. 이유: 서버는 end 4 에 88 을 내지 않아 gh-trade 클라는 장중 청산으로 생긴 회색 「청산」 행을 자정까지 그대로 둔다(배지 그대로 — 사유만 툴팁). 숨김 이월 뒤 끝난 종목은 그날 청산 행이 없다 — 클라 목록에 처음부터 없었으므로 싣지 않는다. 2 기동 정합 · 3 이월 만료는 06:00 거래일 경계(또는 서버 기동 정합)에서만 나와 클라에 남지 않는다(기존 근거 문장 · 2026-10-21 제보 유지, 「2 이월 탈락」 표현은 「2 기동 정합」 으로). 판정은 isin 별 최신 행만으로는 못 한다(end 4 가 최신이면 end 1 이 가려진다) — 자르기 뒤 행 전체에서 `closedIsinsOf` 로 구해 `isListedAccum(sig, closed)` 로 거르고, 거름은 훅(use-accum-signals)이 한 번 한다(패널은 받은 것을 그대로 보인다). ★ 같은 생각을 복원 RPC(20261024230000 — (gateway, isin) 별 그날 최신 청산 행을 함께 싣는다)가 쓴다 — 한쪽만 바꾸면 복원과 라이브가 갈린다. 매집 종료 행의 값 · 「갱신」 · 청산끼리 순서(②)는 그 행(end 4) 기준이다(재량 결정 — 행 값은 최신 행이 정본이라는 ① 그대로).
   d. 머리 주석 ③ 끝에 한 문장: 매집 종료(4) 행도 state 3 이라 청산 행과 같은 키(`…|end`)다 — 청산 행에서 숨긴 것은 매집 종료 뒤에도 숨김이다.

2) webapp/src/lib/use-accum-signals.ts
   a. import 를 `import { closedIsinsOf, isListedAccum, latestAccumByIsin } from './accum-list';` 로.
   b. useMemo 안에서 `mine` 다음 줄에 `const closed = closedIsinsOf(mine);` 를 두고, 루프의 push 조건을 `sig !== null && isListedAccum(sig, closed)` 로 바꾼다(고른 게이트웨이 행에서만 판정 — 다른 서버의 청산은 세지 않는다).
   c. 머리 ① 의 「(오늘 · 서버가 isin 별 최신 1행)」 을 「(오늘 · 서버가 (gateway, isin) 별 최신 1행 + 그날 최신 청산 행 — 20261024230000)」 으로 고치고, ① 끝에 한 문장: 목록 규칙(accum-list ②')은 여기서 한 번 — 고른 게이트웨이 행(`mine`)에서 `closedIsinsOf` 로 그날 청산 행이 있는 isin 을 구해 `isListedAccum` 으로 거른다; 패널은 거르지 않는다.
   d. `AccumSignalsState.signals` 문서를 「목록에 싣는 isin 별 현재 상태(accum-list ②' 적용 · 정렬 전 — 표시 순서는 패널의 `sortAccum`).」 로.

3) webapp/src/components/trading/workbench/accum-strip.tsx
   a. `@/lib/accum-list` import 목록에서 `isListedAccum,` 줄을 지운다.
   b. `visible` memo 의 filter 를 `(s) => !isAccumDismissed(dismissed, s)` 만 남긴다(목록 규칙은 훅이 이미 적용 — 여기서 다시 거르면 규칙이 두 곳에 갈린다).
   c. 주석 — ③ 의 「사유(청산 · 이월 탈락 · 이월 만료)는 행 툴팁」 → 「사유(청산 · 매집 종료)는 행 툴팁」. ⑤ 끝에 「매집 종료 행도 청산 행과 같은 키라 청산 행에서 숨긴 것은 매집 종료 뒤에도 숨김이다」. ⑧ 을 다시 쓴다: 목록 거름(accum-list ②')은 훅(`useAccumSignals`)이 한 번 한다 — 패널은 받은 행을 그대로 보인다. 청산 행은 종료 사유 1 과, 그날 청산 행이 있는 종목의 매집 종료(4)뿐이고, 매집 종료 행도 배지 「청산」 · 회색 그대로 툴팁만 「매집 종료 — …」(gh-trade 클라는 end 4 에 88 이 없어 회색 청산 행을 자정까지 둔다). 06:00 · 기동 정합 종료 행과 숨김 이월 뒤 매집 종료 행은 싣지 않는다.
   d. prop 문서(:72)를 「`useAccumSignals().signals` — 목록에 싣는 isin 별 현재 상태(훅이 accum-list ②' 로 거름 · 정렬 전).」 로. 행 title(:504) · 배지 · 정렬 코드는 바꾸지 않는다.

4) 테스트
   a. webapp/src/lib/__tests__/accum-list.test.ts — import 에 `closedIsinsOf` 추가. 머리 「잠그는 것」 의 isListedAccum 줄을 「isListedAccum(sig, closed): 활성 전부 · 청산은 종료 사유 1 · 매집 종료(4)는 그날 청산 행이 있는 isin 만(06:00 기동 정합 · 만료 제외)」 로, 「closedIsinsOf: 자르기 뒤 queueCase 4 · cancelReason 1 행의 isin」 줄 추가. `describe('isListedAccum')` 를 behavior 의 단언 전부로 다시 쓴다(빈 집합과 `new Set(['KR7000020008'])` 두 경우 · 다른 isin 의 집합도 하나). 새 `describe('closedIsinsOf — 그날 청산 행(②')')` 에 behavior 의 세 경우(`row({ ... queueCase, cancelReason })` 로 — row() 가 Partial 을 캐스트한다; 자르기 경우는 같은 게이트웨이에 queueCase 3 행을 청산 행보다 늦게 두고 그 뒤 다른 isin 청산 행을 하나 더 두어 「앞 것 제외 · 뒤 것 포함」). 기존 ✕ 숨김 describe 의 accumDismissKey 테스트에 end 4 키 단언 한 줄.
   b. webapp/src/lib/__tests__/use-accum-signals.test.tsx — 머리 「잠그는 것」 에 「목록 규칙(accum-list ②')을 훅이 적용 — 매집 종료(4)는 고른 서버의 그날 청산 행이 있을 때만 · 종료 사유 2 · 3 은 없다」 줄 추가. 매도 경보 테스트의 종료 행(qty 3 · queueCase 4)에 `cancelReason: 1` 을 넣는다(훅이 목록 규칙을 적용하므로 사유 0 종료 행은 이제 빠진다 — 기존 단언은 그대로). 새 테스트 2개: (i) 「목록 규칙 — 매집 종료(4)는 그날 청산 행이 있을 때만 · 숨김 이월 뒤 종료 · 기동 정합 · 다른 서버 청산은 없다」 — fetch mock 이 behavior 4번째 줄의 행들을 준다(모든 행 gateway 명시 · 종료 행은 qty 3 · queueCase 4 · cancelReason 1/4/2 · 시각은 kstMs('2026-09-29', …) · X 의 청산과 매집 종료는 같은 gwTimeMs 에 seq 만 다르게 · W 는 KB120 매집 종료 + KYOBO119 청산) · `renderHook(() => useAccumSignals('KB120'))` · flush 뒤 `[isin, state, endReason]` 배열 단언. (ii) 「라이브 매집 종료가 와도 복원의 청산 행으로 남는다」 — behavior 5번째 줄(복원 2행 → rerender 전후 단언 · 라이브 행은 `mockRelay = { ...mockRelay, accumSignalEvents: [...] }` 문법).
   c. webapp/src/components/trading/__tests__/accum-strip.test.tsx — 머리 ② 줄을 「청산(state 3)은 칩에 없고 펼친 표에만 회색 · 행 title = 종료 사유 문구 · 패널은 받은 행을 거르지 않는다(목록 규칙은 훅 — accum-list ②')」 로. 테스트 ② 를 다시 쓴다(이름도 같은 뜻으로): 입력 = `sig()` · 금호전기 `sig({ isin: 'KR7000060004', state: 3, endReason: 1, netKrw: -20_000_000 })` · 서산 `sig({ isin: 'KR7000040006', state: 3, endReason: 4 })`. 단언 = 칩 1개(금호전기 · 서산 없음) · 표 3행 · 두 종료 행 className 에 text-[var(--muted-fg)] · 둘 다 배지 글자 「청산」 · 금호전기 행 title 은 기존 라벨 1 문자열. 서산 행 title 단언은 Task 2 가 더한다(라벨 4 가 shared 에 생긴 뒤). 기존의 「이월 탈락 · 만료 종료 행은 표에도 없다」 단언(서산 없음)은 지운다 — 그 규칙은 이제 훅 테스트 (i) 가 잠근다.

커밋(GREEN): 경로 지정 add(이 태스크 6파일만 · `git add -A` 금지 · 직전 `git status -sb` 로 남의 변경이 섞이지 않았는지 확인) → `fix(quick-261024-uov): 매집 패널 — 매집 종료(4)는 그날 청산 행이 있을 때만 회색 청산으로 남김 · 목록 규칙은 훅에서 한 번`. 메시지 한글 · Co-Authored-By 줄 없음 · push 없음.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/accum-list.test.ts src/lib/__tests__/use-accum-signals.test.tsx src/components/trading/__tests__/accum-strip.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp exec tsc --noEmit -p .</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export function closedIsinsOf" webapp/src/lib/accum-list.ts` = 1
    - `grep -c "closedIsinsOf(mine)" webapp/src/lib/use-accum-signals.ts` = 1 · `grep -c "isListedAccum(sig, closed)" webapp/src/lib/use-accum-signals.ts` ≥ 1
    - 세 webapp 테스트 파일 전부 통과 · webapp 타입체크 0 오류(isListedAccum 두 번째 인자가 필수라 패널에 옛 호출이 남으면 여기서 깨진다)
    - 훅 테스트 (i) 의 결과가 정확히 [['KR7000020008', 3, 4]]
  </acceptance_criteria>
  <done>고른 서버의 그날 청산 행이 있는 종목의 매집 종료 행은 패널에 회색 「청산」 으로 남고, 없는 종목 · 종료 사유 2 · 3 은 빠진다. 목록 규칙은 accum-list 한 함수 · 훅 한 곳에서만 적용되고, RED · GREEN 두 커밋이 있다.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 종료 사유 4 문구 — ACCUM_END_REASON_LABELS[4] · endReason 주석 0~4 · 패널 툴팁 단언</name>
  <files>packages/shared/src/accum-signal.ts, packages/shared/src/__tests__/accum-signal.test.ts, webapp/src/components/trading/__tests__/accum-strip.test.tsx</files>
  <behavior>
    - shared: ACCUM_END_REASON_LABELS 가 1 · 2 · 3 그대로에 4 = "매집 종료 — 청산 뒤 순매수가 사이클 최고의 −30% 이하(최고 10억 → −3억)" 를 더한 toEqual
    - shared: qty 3 · queueCase 4 · cancelReason 4 행 → accumSignalOf 가 null 이 아니고 state 3 · endReason 4 · row 4(모르는 값으로 버리지 않는다 — 인박스 「gh-radar 가 할 일」 1)
    - 패널: Task 1 테스트 ② 의 서산(endReason 4) 행 title === 위 라벨 4 문자열
  </behavior>
  <action>
RED: 2)·3)의 단언을 먼저 쓰고 shared 테스트가 라벨 4 단언에서 실패함을 확인 → 커밋 `test(quick-261024-uov): 종료 사유 4 매집 종료 문구 실패 테스트`. 그다음 1) → GREEN.

1) packages/shared/src/accum-signal.ts
   a. `ACCUM_END_REASON_LABELS` 에 키 `4` 를 추가한다. 값은 정확히 「매집 종료 — 청산 뒤 순매수가 사이클 최고의 −30% 이하(최고 10억 → −3억)」 — 「종료」 뒤 대시는 기존 라벨과 같은 U+2014(—), 「−30%」 · 「−3억」 의 빼기는 U+2212(−, fmtEok 출력과 같은 글자), 화살표는 U+2192(→). 1 · 2 · 3 문구는 바꾸지 않는다.
   b. 주석: `AccumState` 문서 → 「1 매집중 · 2 매도중 · 3 종료(청산 · 기동 정합 · 이월 만료 · 매집 종료).」 · `endReason` 문서 끝에 「 · 4 매집 종료(청산 뒤 순매수가 등록 뒤 최고의 −30% 이하 — 같은 사이클 두 번째 종료 행 · 장중 팀 주문에서만 · 88 없음 · 다음 등록은 cycle + 1)」 를 더한다(0 · 1 · 2 · 3 · 4) · `cycle` 문서 → 「… 만료 · 기동 정합 · 매집 종료 뒤 새 등록만 +1」 · `ACCUM_STATE_LABELS` 문서의 「종료 사유 1/2/3」 → 「종료 사유 1~4」.
   c. 머리 주석에 기존 quick 단락 문법으로 한 단락: quick-261024-uov — 인박스 `261024-accum-hidden-carry10` 「추가 — 매집 종료 end_reason 4」: cancel_reason 4 = 매집 종료(짧은 말 「종료」). 매퍼 변경 없음(칸을 그대로 옮긴다) — 문구와 주석만.
   d. 매퍼(`accumSignalOf`) · `isAccumState` 는 건드리지 않는다.

2) packages/shared/src/__tests__/accum-signal.test.ts — 문구 테스트의 `ACCUM_END_REASON_LABELS` toEqual 에 4 를 더한다(1)a 의 문자열 그대로). 「매도중(2) · 청산(3) …」 테스트 근처에 새 테스트 「종료 사유 4(매집 종료)도 칸 그대로 — 모르는 값으로 버리지 않는다」(같은 파일의 행 픽스처 덮어쓰기 문법으로 qty 3 · queueCase 4 · cancelReason 4).

3) webapp/src/components/trading/__tests__/accum-strip.test.tsx — Task 1 이 쓴 테스트 ② 에 서산 행 title 단언 한 줄(라벨 4 문자열 리터럴).

4) `pnpm --filter @gh-radar/shared build` — webapp 은 shared dist 를 읽는다(빌드 전엔 webapp 쪽 라벨 4 단언이 실패한다).

커밋(GREEN): 경로 지정 add(이 태스크 3파일 · 직전 `git status -sb`) → `fix(quick-261024-uov): 종료 사유 4 「매집 종료」 문구 · endReason 주석 0~4`. 한글 · Co-Authored-By 없음 · push 없음.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared exec vitest run src/__tests__/accum-signal.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/__tests__/accum-strip.test.tsx src/lib/__tests__/accum-list.test.ts src/lib/__tests__/use-accum-signals.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp exec tsc --noEmit -p .</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c '4: "매집 종료 — ' packages/shared/src/accum-signal.ts` = 1
    - shared accum-signal 테스트 · shared 빌드 · 세 webapp 테스트 · webapp 타입체크 전부 통과
  </acceptance_criteria>
  <done>패널의 매집 종료 행 툴팁이 「매집 종료 — 청산 뒤 순매수가 사이클 최고의 −30% 이하(최고 10억 → −3억)」 이고, shared 주석이 종료 사유 0~4 를 설명한다.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 복원 RPC — (gateway, isin) 별 최신 1행 + 그날 최신 청산 행 동반(새 마이그레이션) · pgTAP</name>
  <files>supabase/migrations/20261024230000_dma_accum_signals_closed_companion.sql, supabase/tests/dma_strategy_accum_signal.test.sql</files>
  <behavior>
    - U1(KB120 + KYOBO119) · KST 오늘 − 3일: accum_rows 의 (gateway, seq, isin) 가 ord 순으로 정확히 ('KB120', 36, B) · ('KB120', 34, A) · ('KB120', 35, A) · ('KB120', 32, C) · ('KB120', 33, C) · ('KYOBO119', 22, B) · ('KYOBO119', 23, A) — 최신 행 + 그날 최신 청산 행 · 같은 ms 는 seq 순 · 숨김 이월 뒤 매집 종료(B@KB120)는 한 줄 · 자르기 앞 청산(KYOBO119 seq 21)은 없음 · 최신이 곧 청산(A@KYOBO119)이면 1행
    - U1 · −3일: 행 수 = 서로 다른 (gateway, seq) 수(중복 없음)
    - U2(KB120 만) · −3일: ('KB120', 36) · 34 · 35 · 32 · 33 다섯 행
    - 기존 단언(오늘 (gateway, isin) 별 1행 · 바이트 동일 · 빈 날 [] · −1일 · −2일 복원 묶음 · purge · 인덱스 · 권한 (f,f,t)) 전부 그대로 통과
  </behavior>
  <action>
RED: 먼저 2)의 pgTAP 변경만 하고 마이그레이션 없이 러너를 돌려 새 단언(−3일 U1 · U2)이 not ok 임을 확인 → 커밋 `test(quick-261024-uov): 매집 복원 RPC 그날 청산 행 동반 pgTAP 실패 테스트`. 그다음 1) → GREEN.

1) 새 파일 supabase/migrations/20261024230000_dma_accum_signals_closed_companion.sql — 20261019160000 과 같은 머리 주석 블록 문법(`-- ====` 선 · 첫 줄 「quick-261024-uov — 매집감지(kind 16) 읽기 RPC: (gateway, isin) 별 최신 1행 + 그날 최신 청산 행」 · 「무엇:」 · 「왜:」 · 「정렬:」 · 같은-규칙 문장 · 「되돌리기(수동): 20261019160000 본문 재적용.」), 본문은 BEGIN; … COMMIT;.
   - 무엇: dma_accum_signals_for_user_json(uuid, date) 재정의 — (gateway, isin) 별 최신 1행에 더해, 같은 (gateway, isin) 의 그날 queue_case 4 · cancel_reason 1(청산) 행 중 최신 1행을 함께 싣는다(최신 행이 곧 그 청산 행이면 1행). 복원 묶음 자르기(20261018233000 ⑤)는 두 고르기 모두에 먼저 적용한다.
   - 왜: gh-trade 가 end_reason 4 「매집 종료」 를 장중 청산 뒤 같은 사이클 두 번째 종료 행으로 낸다(인박스 261024-accum-hidden-carry10 「추가 — 매집 종료」 · 88 없음 → gh-trade 클라는 회색 「청산」 행을 자정까지 둔다). 웹은 「그날 청산 행이 있는 종목만」 매집 종료 뒤에도 회색으로 남긴다(숨김 이월 뒤 바로 끝난 종목은 클라 목록에 없었다). 최신 1행만 주면 새로고침 뒤 end 4 가 end 1 을 가려 판정할 수 없다.
   - 정렬: gateway, isin, gw_time_ms, seq 오름차순 · 원소 = SETOF 행 jsonb 그대로 · 중복 없음 · 빈 날 '[]'.
   - 같은-규칙 문장(이 글자 그대로 포함): 「같은 판정을 웹 라이브(accum-list.ts closedIsinsOf · isListedAccum)가 쓴다 — 한쪽만 바꾸면 복원과 라이브가 갈린다.」 자르기 규칙도 웹 restoreCutByGateway 와 같다는 기존 문장을 유지.
   - 함수 머리(RETURNS jsonb · LANGUAGE sql · STABLE · SECURITY INVOKER · SET search_path = public, pg_temp)는 20261019160000 과 똑같이. 본문: CTE ev 는 기존 열에 `(t.ev->>'cancel_reason')::int AS cancel_reason` 과 `(t.ev->>'seq')::bigint AS seq` 를 더한다(kind = 16 조건 그대로). CTE cut 은 그대로. CTE kept = ev 를 cut 에 LEFT JOIN 해 `c.cut_ms IS NULL OR e.ms >= c.cut_ms` 인 행. CTE ranked = kept 에 창 함수 둘 — rn_latest(PARTITION BY gateway, isin ORDER BY ms DESC, seq DESC) · rn_closed(PARTITION BY gateway, isin, (queue_case = 4 AND cancel_reason = 1) ORDER BY ms DESC, seq DESC). 결과 = `coalesce(jsonb_agg(r.ev ORDER BY r.gateway, r.isin, r.ms, r.seq), '[]'::jsonb)` FROM ranked r WHERE rn_latest = 1 OR (queue_case = 4 AND cancel_reason = 1 AND rn_closed = 1) — 행마다 한 번만 평가되므로 UNION · 중복 제거가 필요 없다.
   - 권한 세 줄은 20261019160000 :57-59 와 글자까지 같게(REVOKE … FROM PUBLIC · REVOKE … FROM anon, authenticated · GRANT … TO service_role — 메모리 규칙: auto-grant 가 PUBLIC REVOKE 를 덮으므로 anon · authenticated 명시 REVOKE 필수).
   - 원격 적용(`supabase db push`)은 하지 않는다 — 배포는 범위 밖.

2) supabase/tests/dma_strategy_accum_signal.test.sql
   - 머리 「대상 마이그레이션」 에 새 파일을 더하고, 「잠그는 것」 의 accum RPC 줄을 「(20261024230000): (gateway, isin) 별 최신 1행 + 그날 최신 청산(queue_case 4 · cancel_reason 1) 1행 — 최신이 곧 청산이면 1행 · 중복 없음 · 자르기 뒤 행에서만 · gateway → isin → gw_time_ms → seq 오름차순」 로 고친다.
   - 픽스처 — KYOBO119 복원 묶음 블록(:134-137) 뒤에 「KST 오늘 − 3일: 매집 종료 시나리오」 주석과 두 apply 를 더한다. 종료 행은 `pg_temp.ac(isin) || '{"qty":3,"queue_case":4,"cancel_reason":N}'` 로 만든다(N = 1 청산 · 4 매집 종료), 날짜 인자 `pg_temp.kd(3)`.
     KB120('ep-ac'): 31 A 10:00:00.000 row1(ac 그대로) · 32 C 10:30:00.000 청산 · 33 C 10:40:00.000 row1(재등장) · 34 A 11:00:00.000 청산 · 35 A 11:00:00.000 매집 종료(같은 ms · 더 큰 seq) · 36 B 11:30:00.000 매집 종료(숨김 이월 뒤 — 그날 청산 없음).
     KYOBO119('ep-ack'): 21 B 09:00:00.000 청산 · 22 B 09:30:00.000 복원(ac || '{"queue_case":3}') · 23 A 10:00:00.000 청산(최신이 곧 청산).
   - `plan(28)` → `plan(31)`. 픽스처 수 단언 17 → 26 · 설명에 「−3일 매집 종료 KB 6 · KYOBO 3」 추가. 기존 「행 수 = 서로 다른 (gateway, isin) 수(정확히 1행씩)」 설명 끝에 「— 청산 행 없는 날」.
   - 3b 뒤에 「── 3c. 매집 종료 — 그날 최신 청산 행 동반 (20261024230000) ──」 절과 behavior 의 단언 3개(results_eq U1 −3일 7행 · is(count(*), count(DISTINCT (gateway, seq))) U1 −3일 · results_eq U2 −3일 5행). 설명은 기존 (사용자, 게이트웨이, kind, 기대) 튜플 문법.
   - purge 남은 행 단언의 `trade_date NOT IN (pg_temp.kd(0)::date, pg_temp.kd(2)::date)` 에 `pg_temp.kd(3)::date` 를 더한다(−3일 행이 섞이지 않게).

3) 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_accum_signal.test.sql`. 샌드박스가 docker 소켓을 막아 실패하면 같은 명령을 샌드박스 해제로 한 번 다시 돌린다. docker 데몬이 꺼져 있거나 이미지가 없으면 받거나 띄우지 말고 SUMMARY 에 「pgTAP 미실행 — 사유」 를 적는다(무거운 인프라 기동 금지).

커밋(GREEN): 경로 지정 add(이 태스크 2파일 · 직전 `git status -sb`) → `fix(quick-261024-uov): 매집 복원 RPC — (gateway, isin) 별 그날 최신 청산 행 동반(새로고침 뒤 매집 종료 판정)`. 한글 · Co-Authored-By 없음 · push · db push 없음.
  </action>
  <verify>
    <automated>bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_accum_signal.test.sql</automated>
  </verify>
  <acceptance_criteria>
    - 러너 종료 코드 0 · TAP `1..31` · `not ok` 0줄(또는 SUMMARY 에 「pgTAP 미실행 — 사유」 명시)
    - `grep -c "한쪽만 바꾸면 복원과 라이브가 갈린다" supabase/migrations/20261024230000_dma_accum_signals_closed_companion.sql` ≥ 1
    - `grep -c "FROM anon, authenticated" supabase/migrations/20261024230000_dma_accum_signals_closed_companion.sql` = 1 · `grep -c "TO service_role" supabase/migrations/20261024230000_dma_accum_signals_closed_companion.sql` = 1
    - `grep -c "cancel_reason" supabase/migrations/20261024230000_dma_accum_signals_closed_companion.sql` ≥ 2
  </acceptance_criteria>
  <done>복원 RPC 가 (gateway, isin) 별 최신 행과 그날 최신 청산 행을 중복 없이 시간 순으로 주고, 자르기 · 가시성 · 권한은 그대로다. pgTAP 31개가 통과한다(또는 미실행 사유가 기록된다).</done>
</task>

</tasks>

<verification>
- `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/accum-signal.test.ts --maxWorkers=2` 통과 · `pnpm --filter @gh-radar/shared build` 성공
- `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/accum-list.test.ts src/lib/__tests__/use-accum-signals.test.tsx src/components/trading/__tests__/accum-strip.test.tsx --maxWorkers=2` 통과
- `pnpm --filter @gh-radar/webapp exec tsc --noEmit -p .` 0 오류
- `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_accum_signal.test.sql` 31/31(또는 미실행 사유 기록)
- 전체 vitest · e2e · playwright 는 돌리지 않는다(동시 세션 메모리 — 지정 파일만 · --maxWorkers=2).
- `git log --oneline` 에 이 quick 의 test/fix 커밋만 있고, 각 커밋의 파일이 그 태스크 files 와 같다(`git show --stat`). Co-Authored-By 줄 없음. push 안 함.
</verification>

<success_criteria>
- 장중 청산 뒤 매집 종료된 종목이 라이브와 새로고침 뒤 모두 패널에 회색 「청산」 행(툴팁 「매집 종료 — …」)으로 남는다 — gh-trade WinForms 동형.
- 숨김 이월 뒤 바로 매집 종료된 종목 · 06:00/기동 정합 종료 행은 목록에 없다.
- 목록 규칙이 웹 한 곳(accum-list `isListedAccum` · 훅 적용)과 SQL 한 곳(RPC)에 있고, 서로를 가리키는 주석이 있다.
- 권한 · 자르기 · 기존 단언 회귀 없음.
</success_criteria>

<output>
Create `.planning/quick/261024-uov-end-reason-4-rpc-end1/261024-uov-SUMMARY.md` when done — pgTAP 실행 여부(통과 수 또는 미실행 사유) · 커밋 해시 · 배포 대기 항목(DB 마이그레이션 `supabase db push --linked --yes` → webapp push 순서 · 메인 세션 몫)을 적는다.
</output>
