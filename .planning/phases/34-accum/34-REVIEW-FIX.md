---
phase: 34-accum
fixed_at: 2026-10-20T16:39:37Z
review_path: .planning/phases/34-accum/34-REVIEW.md
iteration: 1
findings_in_scope: 11
fixed: 11
skipped: 0
status: all_fixed
---

# Phase 34: Code Review Fix Report

**Fixed at:** 2026-10-20T16:39:37Z
**Source review:** .planning/phases/34-accum/34-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 11 (WR 5 · IN 6)
- Fixed: 11
- Skipped: 0

작업 위치: 메인 checkout `master` 에서 바로 고치고 커밋했다(오케스트레이터 지시 · worktree 없음). 커밋마다 경로를 지정해 add 했고 push · 배포는 하지 않았다. 적용된 마이그레이션은 건드리지 않았다(DB 변경 0).

## Fixed Issues

### WR-01: 확대한 보기 창 경계에서 가격 선이 가격 판 밖으로 뻗는다

**Files modified:** `webapp/src/lib/accum-chart.ts`, `webapp/src/components/analytics/accum-chart.tsx`, `webapp/src/lib/__tests__/accum-chart.test.ts`, `webapp/src/components/analytics/__tests__/accum-detail.test.tsx`
**Commit:** df59036f
**Applied fix:** 순수 함수 `priceClipOf(L, W)` 를 추가했다. x 는 [L, W − R], y 는 가격 판 [TOP, TOP + H1] 에 위아래로 원 최대 반지름 7 만큼 여유를 둔다(y 9 · 높이 214 · 누적 판 위끝 240 보다 위). 가격 선과 주문 원은 `data-slot="accum-price-layer"` g 로 묶고 `${clipId}-px` 클립을 한 겹 더 씌웠다. 테스트는 클립 값, 리뷰 재현 시나리오(창 끝 바로 밖 가격이 크게 다르면 경로 y 가 판 밖으로 나감), DOM 구조(가격 선 · 원이 모두 이 클립 안)를 잠근다.

### WR-02: 「선택」 파일 accum_flow 가 깨지면 새 날짜의 상한가 6표 · team_flow 까지 그날 적재되지 않는다

**Files modified:** `workers/limitup-sync/src/load.ts`, `workers/limitup-sync/src/index.ts`, `workers/limitup-sync/tests/dispatch.test.ts`, `workers/limitup-sync/tests/load.test.ts`
**Commit:** 15baad95
**Status:** fixed: requires human verification(적재 로직 변경)
**Applied fix:** 워커만 고쳤고 마이그레이션은 건드리지 않았다.
- `accumRowProblems(date, rows)` 가 commit RPC 를 깨뜨릴 결함을 찾는다. 대상은 날짜 불일치, isin 결측 · 중복(PK), bigint 24열 정수 아님, integer 5열 int4 아님, 실수 2열 숫자 아님이다. 열 목록은 20261020200000 표 정의와 같다.
- 첫 적재(`new` · `files_sig`)에서 accum_flow 에 결함이 있거나 행 수가 manifest 와 다르면, 그 표만 0행으로 stage 하고 `p_expected` 에서 `accum_flow` 키를 뺀다. 그러면 상한가 6표 · 파생 · team_flow 는 그대로 적재된다. `result.degraded` 에 기록하고 warn 을 낸 뒤 main 은 종료 1(알림)이다.
- 다음 run 은 rows 이력에 키가 없으니 backfill 경로를 탄다. backfill 대상이 결함 표 하나뿐이면 다시 실어도 바뀌는 게 없으므로 commit 없이 그 날짜를 failed 로 둔다(record_skip load · unpublish 없음). team_flow 와 함께 backfill 되는 경우에는 team_flow 만 싣는다.
- team_flow 의 행 수 불일치 동작(그 날짜 failed)은 바꾸지 않았다.
- 기존 테스트 하나를 바꿨다. 「accum_flow manifest rows ≠ 파일 → 그 날짜 failed」 → 「그 표만 내리고 적재」. 함께 고친 점이 하나 있다. 테스트 픽스처가 10/14 행을 다른 날짜(20261003 · 20261020)에 그대로 복사하고 있었는데, 실 DB 라면 payload 날짜 대조로 commit 이 실패했을 것이다. 그래서 20261020 탐지 0 픽스처는 행 date 를 그 날짜로 다시 쓰고 sha 를 다시 계산하게 했다.

### WR-03: 상세 캐시가 만료 없이 `row: null` 까지 고정한다

**Files modified:** `webapp/src/lib/accum-api.ts`, `webapp/src/lib/query-cache.ts`, `webapp/src/components/analytics/accum-detail.tsx`, `webapp/src/components/analytics/__tests__/accum-report.test.tsx`
**Commit:** 2e8d7540
**Status:** fixed: requires human verification(캐시 수명 · 세대 로직)
**Applied fix:** 새 마이그레이션은 만들지 않았다.
- 상세 캐시 수명을 `ACCUM_DETAIL_MAX_AGE_MS` 30분으로 정했다. `readAccumDetailCache` 하나로 상세 첫 렌더와 `fetchAccumDetail` 이 같은 규칙으로 읽는다.
- `row: null` 응답은 캐시하지 않는다.
- query-cache 에 세대 카운터를 두었다(`clearQueryCache` 때마다 +1 · `queryCacheGeneration()`). 요청을 시작한 세대가 바뀌었으면 응답을 캐시에 쓰지 않는다. inflight 합침도 같은 세대끼리만 한다. 그래서 사용자 전환 뒤 옛 사용자의 진행 중 요청이 새 세션 캐시에 섞이지 않는다.
- 테스트를 추가했다: (c3) 29분 = 요청 0 · 31분 = 재요청 + 스켈레톤, (c4) 비우기 전 요청과 합치지 않음 · 그 응답은 캐시에 쓰지 않음, (f) row:null 재펼침 = 재요청.

### WR-04: 소급 CLI 의 상대 `--out` 경로가 `relay/` 기준으로 풀린다

**Files modified:** `scripts/export-accum-backfill.sh`, `scripts/export-accum-backfill.ts`
**Commit:** 63c26319
**Applied fix:**
- 래퍼는 `cd` 전에 호출 cwd 를 `ACCUM_BACKFILL_CWD` 로 export 한다. 상대 `ACCUM_BACKFILL_ENV_FILE` 도 호출 cwd 기준 절대 경로로 바꾼다(기본값은 그대로 저장소 루트 기준).
- TS 는 `--out` 을 `resolve(ACCUM_BACKFILL_CWD || INIT_CWD || cwd, v)` 로 푼다. USAGE 에도 적었다.
- 검증은 수동으로 했다. 스크래치 디렉터리에서 `ACCUM_BACKFILL_ENV_FILE=fake.env bash scripts/export-accum-backfill.sh --date 20261019 --out ./bf` 를 돌리면 env 파일을 호출 cwd 에서 찾았고, 「…/scratchpad/wr04/bf/20261019.jsonl 이미 있음」 으로 호출 cwd 기준 경로가 확인됐다(네트워크 호출 전에 끝남).

### WR-05: 상세 payload 모양 검증이 아무 데도 없어 키 하나만 빠져도 페이지 전체가 깨진다

**Files modified:** `webapp/src/lib/accum-report.ts`, `webapp/src/components/analytics/accum-detail.tsx`, `webapp/src/components/analytics/accum-chart.tsx`, `webapp/src/lib/__tests__/accum-report.test.ts`, `webapp/src/components/analytics/__tests__/accum-detail.test.tsx`
**Commit:** 130bfe02
**Applied fix:**
- `payloadOf(row)` 를 추가했다. price(t0_ms 유한 수 · idx · px 배열), orders 7열 배열, buckets 객체 배열, day_cum_net(t_ms · net_krw 배열), cycles 객체 배열을 확인하고, 하나라도 어긋나면 null 을 돌려 「그날 체결 자료 없음」 경로로 보낸다.
- `ReadyChart` · `ChartBody` · `AccumChart` 는 확인을 거친 payload 만 쓴다. `AccumChart` 에 `payload` prop 을 추가해 row.payload 를 직접 읽지 않게 했다.
- `cycleRowsOf` 는 배열이 아닌 cycles 나 객체가 아닌 항목을 throw 없이 버린다.
- 상세 준비 본문을 작은 class error boundary(`DetailBoundary`)로 감쌌다. 렌더 예외가 나면 상세 자리만 「상세를 불러오지 못했어요」(role=alert)로 바뀌고 목록은 남는다.
- 테스트를 추가했다: payloadOf 정상 · 결함 9종, (h2b) price null · cycles 객체, (h2c) 렌더 예외 → boundary.
- server 쪽 검증은 리뷰 수정안대로 추가하지 않았다(웹에서 방어).

### IN-01: `ticksOf` 주석의 「창 양 끝 포함」 이 구현과 다르다

**Files modified:** `webapp/src/lib/accum-chart.ts`
**Commit:** 1e993f36
**Applied fix:** 주석을 구현에 맞췄다(「눈금은 KST 자정 기준 간격 배수에만 · 창 끝이 배수가 아니면 그 끝에는 눈금 없음」). 동작은 바꾸지 않았다.

### IN-02: 종료 행 sr 설명에 종료 시각이 두 번 들어간다

**Files modified:** `webapp/src/lib/accum-report.ts`, `webapp/src/lib/__tests__/accum-report.test.ts`, `.planning/phases/34-accum/34-UI-SPEC.md`
**Commit:** c4756c0f
**Applied fix:** UI-SPEC A3 문장 정의 `{, {사유} HH:MM} … {, 종료 HH:MM}` 를 먼저 확인했다. 둘 다 선택 절이므로, 사유 절이 이미 시각을 말했을 때만 끝 「종료 HH:MM」 을 생략하게 했다. 사유를 모르는 종료(end_reason 0)라면 사유 절이 없으니 끝 절이 시각을 말한다. 테스트 기대값을 바꾸고 end_reason 0 케이스를 추가했으며, UI-SPEC 표 칸에도 이 규칙을 한 줄 덧붙였다. 화면 · e2e 에서 이 문장을 단언하는 곳은 없다.

### IN-03: 프로덕션에서 쓰지 않는 공개 API

**Files modified:** `webapp/src/hooks/use-chart-view.ts`, `webapp/src/hooks/__tests__/use-chart-view.test.tsx`, `webapp/src/lib/accum-report.ts`, `webapp/src/lib/__tests__/accum-report.test.ts`
**Commit:** 3b1a109c
**Applied fix:** `ChartViewControl.apply` 와 그 구현을 지웠다. (w5) 테스트는 `schedule` + `flushFrame` 으로 10분 창을 만든다. `thresholdLineOf` export 도 지우고, 테스트 안에 같은 동작의 로컬 헬퍼(조각 join)를 두었다.

### IN-04: CLI 전용 모듈이 relay 런타임 소스 트리에 있다

**Files modified:** `relay/src/tools/accum-backfill.ts`(git mv ← `relay/src/store/accum-backfill.ts`), `scripts/export-accum-backfill.ts`, `relay/tests/accum-backfill.test.ts`
**Commit:** 0040b79f
**Applied fix:** `relay/src/tools/` 로 옮기고 import 2곳을 고쳤다. 머리 주석에는 「런타임이 import 하지 않음 · relay 타입체크 · vitest · node_modules 때문에 relay 패키지 안에 둠 · 소급이 끝나면 테스트 · CLI 와 함께 삭제」 를 적었다. relay tsconfig 는 여전히 `src/**` 전체를 빌드하므로 dist 에는 실린다(리뷰 수정안과 같은 수준). 이미 끝난 phase 계획 문서(34-02-PLAN 등)의 옛 경로는 역사 기록이라 고치지 않았다.

### IN-05: 키보드 핸들러가 창이 바뀌지 않아도 화살표 · ± 키를 막는다

**Files modified:** `webapp/src/hooks/use-chart-view.ts`, `webapp/src/hooks/__tests__/use-chart-view.test.tsx`
**Commit:** 9fcd44f1
**Applied fix:** `schedule` 이 돌려주는 「바뀜」 값을 받아, 창이 바뀐 키만 preventDefault 한다. 「0」 은 늘 처리한다. (k2) 테스트를 추가했다: 왼쪽 끝 ← · 전체 창 − 와 → · 10분 창 + 는 넘기고, 0 은 처리한다.

### IN-06: 창 안 가격이 한 값일 때 가격 축 글자 5개가 겹친다

**Files modified:** `webapp/src/lib/accum-chart.ts`, `webapp/src/components/analytics/accum-chart.tsx`, `webapp/src/lib/__tests__/accum-chart.test.ts`
**Commit:** a14652be
**Applied fix:** `priceTicksOf(range)` 를 추가했다. 5등분 값을 원 단위로 반올림한 뒤 Set 으로 중복을 없앤다. 컴포넌트는 이 값을 key · 위치 · 글자로 쓴다. 테스트는 상한가 잠김 창 = 1개, 2원 범위 = 3개를 잠근다.

## Verification

모두 **메인 checkout**(`/Users/alex/repos/gh-radar`, master)에서 돌렸다. 마지막 커밋 a14652be 기준으로 재현할 수 있다. Playwright e2e 는 지시대로 돌리지 않았다.

- webapp vitest(`--maxWorkers=2`): accum-chart · accum-report(lib) · accum-detail · accum-report(컴포넌트) · use-chart-view · app-sidebar — 6 파일 233 테스트 통과. accum-report.test.tsx (r2) 의 act() 경고는 수정 전부터 있던 것이다(stash 로 확인).
- webapp `tsc --noEmit` 통과(수정마다 실행).
- workers/limitup-sync vitest 9 파일 130 테스트 통과, `tsc --noEmit` 통과.
- relay `tests/accum-backfill.test.ts` 17 테스트 통과, `tsc --noEmit` 통과. CLI `--help` 로 import 경로가 풀리는 것을 확인했다.
- 래퍼 스크립트 `bash -n` 통과, WR-04 수동 경로 확인(위).

## 배포 영향

- **webapp**: WR-01 · WR-03 · WR-05 · IN-01 · IN-02 · IN-03 · IN-05 · IN-06(push 하면 Vercel 배포)
- **workers/limitup-sync**: WR-02(Cloud Run Job 재배포 필요)
- **server**: 변경 없음
- **relay**: IN-04 파일 이동만 있다(런타임 동작 변화 없음 · CLI 전용 모듈). 재배포는 필수가 아니다.
- scripts(로컬 CLI): WR-04 · IN-04
- DB 마이그레이션: 없음

---

_Fixed: 2026-10-20T16:39:37Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
