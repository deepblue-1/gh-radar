---
phase: 34-accum
reviewed: 2026-10-20T15:19:54Z
depth: standard
files_reviewed: 49
files_reviewed_list:
  - packages/shared/src/accum-report.ts
  - packages/shared/src/index.ts
  - packages/shared/src/limitup-report.ts
  - relay/src/store/accum-backfill.ts
  - relay/tests/accum-backfill.test.ts
  - scripts/export-accum-backfill.sh
  - scripts/export-accum-backfill.ts
  - scripts/smoke-limitup-sync.sh
  - server/src/app.ts
  - server/src/routes/accum-report.ts
  - server/src/schemas/accum-report.ts
  - server/src/services/accum-report.ts
  - server/tests/routes/accum-report.test.ts
  - supabase/migrations/20261020200000_limitup_accum_flow.sql
  - supabase/migrations/20261020200100_accum_report_rpc.sql
  - supabase/tests/accum_report.test.sql
  - supabase/tests/limitup_load.test.sql
  - webapp/e2e/fixtures/accum-report.ts
  - webapp/e2e/specs/accum-report.spec.ts
  - webapp/e2e/specs/sidebar-tree.spec.ts
  - webapp/src/app/analytics/accum/page.tsx
  - webapp/src/components/analytics/__tests__/accum-detail.test.tsx
  - webapp/src/components/analytics/__tests__/accum-report.test.tsx
  - webapp/src/components/analytics/accum-chart.tsx
  - webapp/src/components/analytics/accum-cycle-table.tsx
  - webapp/src/components/analytics/accum-day-grid.tsx
  - webapp/src/components/analytics/accum-detail.tsx
  - webapp/src/components/analytics/accum-kpi-strip.tsx
  - webapp/src/components/analytics/accum-report.tsx
  - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
  - webapp/src/components/layout/app-sidebar.tsx
  - webapp/src/components/trading/dma-gate.tsx
  - webapp/src/hooks/__tests__/use-chart-view.test.tsx
  - webapp/src/hooks/use-chart-view.ts
  - webapp/src/lib/__tests__/accum-chart.test.ts
  - webapp/src/lib/__tests__/accum-report.test.ts
  - webapp/src/lib/accum-api.ts
  - webapp/src/lib/accum-chart.ts
  - webapp/src/lib/accum-report.ts
  - webapp/src/lib/teamflow-report.ts
  - webapp/src/styles/__tests__/tds-tokens.test.ts
  - webapp/src/styles/globals.css
  - webapp/src/test-fixtures/accum-export.ts
  - workers/limitup-sync/src/index.ts
  - workers/limitup-sync/src/load.ts
  - workers/limitup-sync/tests/dispatch-dryrun-totals.test.ts
  - workers/limitup-sync/tests/dispatch.test.ts
  - workers/limitup-sync/tests/fixtures/make-accum-fixture.mjs
  - workers/limitup-sync/tests/load.test.ts
findings:
  critical: 0
  warning: 5
  info: 6
  total: 11
status: issues_found
---

# Phase 34: Code Review Report

**Reviewed:** 2026-10-20T15:19:54Z
**Depth:** standard
**Files Reviewed:** 49
**Status:** issues_found

## Summary

Phase 34(매집감지 보고서) 전 계층을 standard 깊이로 검토했다 — 마이그레이션 2개(표 · stage CHECK · commit/purge 본문 교체 · 조회 RPC 2개), limitup-sync 워커의 선택 파일 일반화(`OPTIONAL_FILES`), server 조회 라우트 · 서비스, relay 소급 내보내기 모듈 · CLI, webapp 페이지 · 목록 · 상세 · 순수 SVG 차트 · 보기 창 훅. 이미 있던 파일(`workers/limitup-sync/src/index.ts` · `load.ts` · `server/src/app.ts` · `app-sidebar.tsx` · `teamflow-report.ts` · `globals.css` · `dma-gate.tsx` · `smoke-limitup-sync.sh`)은 `git diff ae33bfa9..HEAD` 범위만 봤다.

전체적으로 탄탄하다. commit RPC 의 옛 워커 호환(키 유무 · `coalesce(...,0)`), `statement_timeout` 재진술, 권한 3줄 재진술, 목록 RPC 의 payload 비적재(37열 명시), 워커의 backfill 감지 일반화와 테스트가 모두 의도대로 맞물린다. 출시를 막는 결함(BLOCKER)은 찾지 못했다.

주요 우려는 다섯 가지다. (1) 확대한 보기 창 경계에서 가격 선이 가격 판 밖(누적 · 10분 판 또는 위 라벨 띠)으로 뻗는다 — 스크립트로 재현했다. (2) 「선택」 파일인 accum_flow 가 깨지면(행 수 불일치 · 정수 열에 소수 · PK 중복) 새 날짜의 상한가 6표 · team_flow 까지 그날 통째로 적재되지 않는다. (3) 상세 캐시가 만료 없이 `row: null` 까지 붙잡아, 같은 날짜가 재적재되면 목록과 상세가 서로 다른 값을 보인다. (4) 소급 CLI 의 상대 `--out` 이 `relay/` 기준으로 풀린다. (5) 상세 payload 모양을 아무 데서도 검증하지 않아 키 하나만 빠져도 페이지 전체가 error.tsx 로 바뀐다.

마이그레이션은 이미 원격에 적용되었으므로 제자리 수정 금지다. 아래 수정안은 WR-02 의 DB 측 대안을 빼면 모두 워커 · 웹 · 스크립트 변경만으로 끝난다. DB 측 대안이 필요하면 새 마이그레이션으로 하라고 해당 항목에 적어 두었다.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: 확대한 보기 창 경계에서 가격 선이 가격 판 밖으로 뻗는다(누적 · 10분 판 침범)

**File:** `webapp/src/components/analytics/accum-chart.tsx:136-141, 211-219` · `webapp/src/lib/accum-chart.ts:135-155, 170-187`
**Issue:** 가격 y 범위(`priceRangeOf`)는 **창 안** 점만으로 잡는데, 가격 경로(`pricePathOf`)는 창 ±30분(`VIEW_PAD_MS`)의 점까지 이어 그린다. 그런데 클립(`clipPath`)은 x 만 그림 영역 `[L, W−R]` 로 자르고 y 는 0~H(472) 전체다. 창 경계 바로 밖 점의 가격이 창 안 범위와 크게 다르면(상한가 진입 · 급락 — 이 앱 대상 종목에서 흔하다) 경계를 넘는 선분이 클립 안쪽에서 거의 수직으로 가격 판 위(라벨 띠 y 0~16)나 아래(누적 판 · 10분 판, y 240~448)를 관통한다.
재현(스크래치 스크립트): 09:00~09:59:50 가격 12,000~12,020 · 10:00 부터 13,000 · 창 09:50~09:59:55 · W 640 → 범위 lo 11,998.4 / hi 12,021.6, 마지막 창 안 점 (579.5, 29.8) 다음 점 (588.5, **−8418.5**). 오른쪽 클립 경계 x=584 에서 y ≈ −4,194 이므로 선이 y=29.8 에서 SVG 맨 위까지 그어진다. 가격이 반대로 떨어지면 같은 선이 누적 · 10분 판을 세로로 가른다. 창 왼쪽 경계도 같다.
**Fix:** 가격 레이어(가격 선 · 주문 원)에 가격 판 높이만의 클립을 따로 준다. 다른 레이어는 지금 클립을 그대로 쓴다.
```tsx
<clipPath id={`${clipId}-px`}>
  <rect x={L} y={TOP} width={Math.max(0, right - L)} height={H1} />
</clipPath>
…
<g clipPath={`url(#${clipId}-px)`}>
  <path data-slot="accum-price-path" d={priceD} … />
  {circles.map(…)}
</g>
```
(주문 원이 판 위끝 · 아래끝에서 반쯤 잘리는 것을 피하려면 클립 높이에 원 최대 반지름 7 만큼 여유를 둔다.)

### WR-02: 「선택」 파일 accum_flow 가 깨지면 새 날짜의 상한가 6표 · team_flow 까지 그날 적재되지 않는다

**File:** `workers/limitup-sync/src/index.ts:274-286, 316-329` · `workers/limitup-sync/src/load.ts:19-23` · `supabase/migrations/20261020200000_limitup_accum_flow.sql:245-252`
**Issue:** `load.ts` 주석은 선택 파일을 「없다고 그 날짜가 실패하면 안 된다」 고 정의하지만, 이 보장은 **파일이 없을 때**만 성립한다. 파일이 있는데 다음 중 하나라도 해당하면 그 날짜 전체가 `failed` 가 된다. 상한가 보고서 · 팀 매집 보고서도 그날 비고, 매 run 마다 `record_skip("load")` 가 쌓여 알림까지 간다.
- 행 수가 manifest 와 다르다 → `throw`(index.ts:281-283). 테스트 「manifest rows ≠ 파일 행 수면 그 날짜만 failed」 가 6표까지 적재되지 않는 동작을 그대로 잠근다.
- 평평한 정수 열(bigint 30개 · integer 5개)에 소수 · 문자열이 들어온다 → `jsonb_populate_record` 예외로 commit 전체가 롤백된다. 마이그레이션 주석이 `*_rate` 에 대해 같은 위험을 적어 두었지만, 예컨대 평단 `pos_avg_px` 처럼 평균값 의미의 열이 gh-trade 쪽에서 소수로 바뀌어도 같은 일이 생긴다.
- 같은 `(date, isin)` 이 두 줄 → PK 위반으로 commit 롤백.
backfill(같은 sig) 경로는 이미 게시된 날짜를 내리지 않아 격리되지만, `reason = "new" | "files_sig"` 인 첫 적재에서는 accum_flow 하나의 결함이 핵심 보고서를 막는다. D-01(같은 트랜잭션) 결정 자체는 타당하다. 문제는 그 결정이 「accum_flow 결함 = 그날 전체 실패」 까지 함께 끌고 온다는 점인데, 이것이 문서화 · 완화되어 있지 않다.
**Fix (워커만 · 마이그레이션 불필요):** stage 하기 전에 accum_flow 행을 워커에서 검증한다 — 행 수, 정수 열은 `Number.isInteger`, isin 중복 없음. 실패하면 그 표만 0행 stage 하고 `expected` 에서 `accum_flow` **키를 뺀다**. 그러면 commit 대조는 `coalesce(..., 0) = 0` 으로 통과하고, `limitup_loads.rows` 에 키가 남지 않는다. 다음 run 은 `p.rows.accum_flow !== entry.rows` 로 backfill 경로(격리 · unpublish 없음)를 타며 재시도한다. 경고 로그 · 알림은 따로 낸다.
```ts
const bad = o.tbl === "accum_flow" ? validateAccumRows(rows) : null;
if (bad) { log.warn({ date, tbl: o.tbl, bad }, "optional file invalid — 0행으로 적재 · 다음 run backfill"); rows = []; omitKeys.add(o.tbl); }
…
expected: Object.fromEntries(Object.entries(counts).filter(([k]) => !omitKeys.has(k as StageTbl))),
```
DB 측에서 열 형을 `numeric` 으로 넓히는 대안은 **새 마이그레이션**으로만 한다(적용된 20261020200000 을 고치지 말 것).

### WR-03: 상세 캐시가 만료 없이 `row: null` 까지 고정한다 — 같은 날짜가 재적재되면 목록과 상세가 갈라진다

**File:** `webapp/src/lib/accum-api.ts:30-55` · `webapp/src/components/analytics/accum-detail.tsx:62-65`
**Issue:** `fetchAccumDetail` 은 `readQueryCache(key, Number.POSITIVE_INFINITY)` 로 읽고, `access: true` 응답이면 `row: null` 까지 영구 캐시한다. 근거로 든 「그날 행은 재적재 전까지 불변」 은 Phase 34 에서 이미 깨졌다. 10/19 · 10/20 소급 적재가 있었고, 워커는 files_sig 가 바뀌거나 accum_flow 개수가 다르면 같은 날짜를 다시 싣는다. 반면 목록(`fetchAccumReport`)은 캐시하지 않는다. 그래서 하루 종일 열어 두는 탭(트레이딩 앱)에서는 재적재 뒤 목록 행은 새 값인데 펼친 상세(KPI 줄 · 차트 · 사이클 표)는 옛 값을 보인다. 「이 종목 상세를 찾지 못했어요」(`row: null`)도 SPA 안에서는 하드 새로고침 전까지 풀리지 않는다.
또 모듈 전역 `inflight` 맵은 로그인 사용자가 바뀌어도 비지 않는다. AuthProvider 가 `clearQueryCache()` 를 부른 **뒤에** 옛 사용자의 진행 중 요청이 끝나면, 그 응답이 새 사용자 세션의 캐시에 써진다. 데이터가 사용자별이 아니라 피해는 작지만, 게이트 응답이 섞일 수 있다.
**Fix:** `row: null` 은 캐시하지 않는다. 행 응답은 유한 TTL(예: `QUERY_CACHE_MAX_AGE_MS` 또는 30분)로 읽는다. 더 정확하게 하려면 목록 RPC 가 그날 `limitup_loads.loaded_at` 을 함께 주고 캐시 키에 넣는다(이 방법은 RPC 를 고치므로 **새 마이그레이션**이 필요하다).
```ts
const hit = readQueryCache<AccumDetailResponse>(key, 30 * 60_000);
…
.then((resp) => { if (resp.access === true && resp.row !== null) writeQueryCache(key, resp); return resp; })
```

### WR-04: 소급 CLI 의 상대 `--out` 경로가 사용자 cwd 가 아니라 `relay/` 기준으로 풀린다

**File:** `scripts/export-accum-backfill.sh:27, 62` · `scripts/export-accum-backfill.ts:56`
**Issue:** 래퍼는 먼저 저장소 루트로 `cd` 한 뒤 `pnpm --filter @gh-radar/relay exec tsx ../scripts/…` 로 실행한다. `pnpm --filter … exec` 는 패키지 디렉터리(`relay/`)에서 돌기 때문에 `--out ./backfill` 은 `<repo>/relay/backfill` 에 써진다. 사용자가 기대한 위치(호출한 cwd 또는 저장소 루트)와 다르다. 기본값(`~/ticks/accum-backfill` 절대 경로)은 문제없지만, 「어느 cwd 에서 실행해도 동작」 이라는 머리 주석과 어긋나고, 운영자가 gh-trade 로 옮길 파일을 엉뚱한 곳에서 찾게 된다. `ACCUM_BACKFILL_ENV_FILE` 상대 경로도 사용자 cwd 가 아니라 저장소 루트 기준이다.
**Fix:** 래퍼에서 `cd` 하기 전에 `--out` 값을 절대 경로로 바꾸거나(`ORIG_PWD=$PWD` 를 저장해 두고 인자를 다시 쓴다), TS 쪽에서 `process.env.INIT_CWD ?? process.cwd()` 기준으로 `resolve` 한다. 최소한 상대 경로를 거부한다.
```ts
else if (a === "--out") out.out = isAbsolute(v) ? v : fail(`--out 은 절대 경로여야 합니다: ${v}`);
```

### WR-05: 상세 payload 모양 검증이 아무 데도 없어 키 하나만 빠져도 페이지 전체가 깨진다

**File:** `webapp/src/components/analytics/accum-detail.tsx:279, 290-295` · `webapp/src/components/analytics/accum-chart.tsx:69-112` · `webapp/src/lib/accum-chart.ts:396, 431` · `server/src/services/accum-report.ts:86-88`
**Issue:** server 는 `row` 가 객체인지만 확인하고 payload 는 그대로 넘긴다. 웹은 `row.payload.price.idx.length`, `payload.day_cum_net.t_ms.length`, `payload.buckets.length`, `payload.orders.t_ms.length`, `payload.cycles[0]` / `payload.cycles.length`(`shadeOf` · `cycleMarksOf`)를 가드 없이 읽는다. 같은 파일의 `cycleRowsOf`(`row.payload?.cycles ?? []`)와 `pnlOf` 는 결측을 방어하는데 차트 경로만 빠져 있어 일관성도 없다. payload 는 저장소 경계 밖(gh-trade export) 원문이고 `CHECK` · 검증이 없다(D-05). 그래서 한 종목 행의 키 하나(예: 체결 0 종목의 `price: null`)가 렌더 예외를 던지면 그 상세만이 아니라 `app/error.tsx` 가 **페이지 전체**를 대체한다(상세 아래에 error boundary 가 없다).
**Fix:** `lib/accum-report.ts` 에 `payloadOf(row)` 를 두어 6키를 확인한다(`price.idx` · `price.px` 배열, `orders.t_ms` 배열, `buckets` · `cycles` 배열, `day_cum_net.t_ms` 배열). 하나라도 어긋나면 null 을 돌려 기존 「그날 체결 자료 없음」 경로로 보낸다. `ReadyChart` · `AccumChart` 는 그 결과만 쓴다. 덧붙여 상세 섹션을 작은 error boundary 로 감싸 「상세를 불러오지 못했어요」 로 떨어지게 한다.

## Info

### IN-01: `ticksOf` 주석의 「창 양 끝 포함」 이 구현과 다르다

**File:** `webapp/src/lib/accum-chart.ts:476-492`
**Issue:** 주석은 눈금이 창 양 끝을 포함한다고 하지만, 루프는 KST 정렬 배수(`ceil(...)*step`)에서 시작해 `t <= view.t1` 까지만 돈다. 창 끝이 눈금 간격과 맞지 않으면 끝값이 없다.
**Fix:** 주석에서 「창 양 끝 포함」 을 지우거나, 의도라면 양 끝 눈금을 추가한다.

### IN-02: 종료 행 sr 설명에 종료 시각이 두 번 들어간다

**File:** `webapp/src/lib/accum-report.ts:265-278`
**Issue:** state 3 이고 `end_time_ms` 가 있으면 `"{사유} HH:MM"` 을 넣은 뒤 끝에서 `"종료 HH:MM"` 을 또 붙인다. 결과는 「종료, 청산 14:10, …, 종료 14:10」 이다. 스크린리더 사용자는 같은 시각을 두 번 듣는다.
**Fix:** state 3 이면 마지막 `종료 HH:MM` 을 생략한다(UI-SPEC A3 문장 정의를 함께 확인할 것).

### IN-03: 프로덕션에서 쓰지 않는 공개 API

**File:** `webapp/src/hooks/use-chart-view.ts:41, 128-134` · `webapp/src/lib/accum-report.ts:392-397`
**Issue:** `ChartViewControl.apply` 와 `thresholdLineOf` 는 테스트에서만 부른다(컴포넌트에서 참조 0). 계약 표면이 넓어져 유지비가 든다.
**Fix:** 테스트 전용이면 지우거나 테스트 헬퍼로 옮긴다.

### IN-04: CLI 전용 모듈이 relay 런타임 소스 트리에 있다

**File:** `relay/src/store/accum-backfill.ts`
**Issue:** 이 모듈은 `scripts/export-accum-backfill.ts` 만 import 하는데 `relay/src/store/` 아래 있어서 relay 빌드 · 이미지에 함께 실린다. 「relay 는 kind 16 을 select 만 하는 일회용 코드를 갖는다」 는 경계가 흐려진다(`dma-users-migrate.ts` 선례가 있어 관례상 허용 범위이긴 하다).
**Fix:** 소급이 끝나면 지우거나 `relay/src/tools/` 처럼 런타임과 구분되는 위치로 옮긴다.

### IN-05: 키보드 핸들러가 창이 바뀌지 않아도 화살표 · ± 키를 막는다

**File:** `webapp/src/hooks/use-chart-view.ts:160-189`
**Issue:** `schedule` 의 반환값(창이 바뀌었는지)을 무시하고 늘 `preventDefault` 한다. 주석의 「처리한 키만 preventDefault」, 그리고 휠의 넘김 규칙(Discretion 7)과 다르다. 창 끝에서 ←/→ 를 눌러도 페이지가 스크롤되지 않는다.
**Fix:** `const changed = schedule(...)` 로 받아, 바뀌지 않았으면 `return` 하고 넘긴다(`'0'` 은 그대로 처리).

### IN-06: 창 안 가격이 한 값(상한가 잠김)일 때 가격 축 글자 5개가 한 자리에 겹쳐 그려진다

**File:** `webapp/src/components/analytics/accum-chart.tsx:83, 268-274`
**Issue:** `pRange.min === pRange.max` 이면 `pxTicks` 5개가 모두 같은 값 · 같은 y 라 `<text>` 5개가 겹친다. 이 보고서의 핵심 장면(상한가 잠김 구간 확대)에서 자주 생긴다. 보이는 모양은 같지만 DOM · 스크린리더 · 안티앨리어싱 두께가 달라진다.
**Fix:** `pxTicks` 를 값 기준으로 중복 제거한다(`[...new Set(pxTicks.map(Math.round))]`).

---

_Reviewed: 2026-10-20T15:19:54Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
