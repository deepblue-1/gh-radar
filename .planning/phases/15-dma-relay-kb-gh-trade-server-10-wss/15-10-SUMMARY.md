---
phase: 15-dma-relay-kb-gh-trade-server-10-wss
plan: 10
subsystem: api
tags: [isin, krx, master-sync, supabase, postgrest, upsert, dma, smoke]

# Dependency graph
requires:
  - phase: 15-09
    provides: "public.stocks.isin 컬럼 + stocks_isin_len CHECK(길이 12) + idx_stocks_isin 부분 유니크 인덱스 — 값을 담을 자리"
  - phase: 15-08
    provides: "scripts/smoke-relay.sh 의 check()/skip()/summary() 러너 + --check-isin 서브커맨드 자리"
provides:
  - "StockMaster.isin (packages/shared) — KRX `ISU_CD` 표준코드 12자. 도메인 타입에 게이트웨이 키가 생겼다"
  - "StockDetailResponse (packages/shared) — /api/stocks 응답 계약. Stock + upperLimitProximity + isin"
  - "krxToMasterRow 의 ISO 6166 정규식 가드 — 6자 단축코드가 isin 에 들어갈 수 없다 (T-15-31)"
  - "upsertMasters 의 isin-보존 dedupe + isin 유무 2배치 분리 upsert — ETP 행이 주식의 isin 을 지우지 못한다 (T-15-33)"
  - "GET /api/stocks/:code · /search 응답의 isin — 웹앱 호가창의 구독·주문 키 원천"
  - "smoke-relay.sh --check-isin (ISIN-1~3) — 커버리지·길이·형태 회귀를 잡는 상시 게이트"
  - "production stocks.isin 백필 2,764행 (활성 주권 2,749 중 2,707 = 98.5%)"
affects: [15-14, 15-16, 15-17, 15-19, 15-20]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "부분 컬럼 upsert 로 '기존 값 보존' 을 하려면 생략한 NOT NULL 컬럼에 **기본값이 있어야** 한다 — PostgREST upsert 는 INSERT ... ON CONFLICT 이고 NOT NULL 은 충돌 해소 전에 평가된다"
    - "PostgREST 는 배열 내 모든 객체의 키 집합이 같기를 요구한다 — 행마다 컬럼을 달리하려면 배치를 나눈다"
    - "LIKE '____________'(밑줄 12개) 는 PostgREST 에서 '정확히 12자' 필터가 된다. NOT LIKE 는 NULL 을 자동으로 제외한다"
    - "제약의 존재를 read-only 로 증명할 수 없을 때는 데이터 불변식으로 감시한다 — 위반 쓰기를 production 에 날리는 것이 곧 우리가 막으려던 오염이다"
    - "스모크가 production 자격증명을 워커 .env 에서 해석한다 — 실행자에게 이미 저장소에 있는 값을 다시 묻지 않는다"

key-files:
  created: []
  modified:
    - packages/shared/src/stock.ts
    - packages/shared/src/index.ts
    - workers/master-sync/src/pipeline/map.ts
    - workers/master-sync/src/pipeline/upsert.ts
    - workers/master-sync/tests/map.test.ts
    - workers/master-sync/tests/upsert.test.ts
    - server/src/routes/stocks.ts
    - server/src/mappers/stock.ts
    - server/tests/fixtures/stocks.ts
    - server/tests/routes/stock-detail.test.ts
    - scripts/smoke-relay.sh
    - .planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/deferred-items.md

key-decisions:
  - "isin 정규식을 `/^[A-Z]{2}[A-Z0-9]{10}$/` 로 두고 `^KR` 로 못박지 않았다 — 외국주권(SECUGRP_NM='외국주권') 12종이 다른 국가코드를 가질 수 있다는 가능성을 배제할 근거가 없다. 길이·형태만으로 6자 단축코드는 이미 걸러진다"
  - "upsertMasters 를 isin 유무 2배치로 나눴다 — 행마다 isin 키 유무를 다르게 해 한 배열에 섞으면 PostgREST 가 'All object keys must match' 로 거부한다. 요청 1회가 2회로 늘지만 '있으면 쓰고 없으면 건드리지 않는다' 는 의미가 payload 형태에 그대로 드러난다"
  - "dedupe 에서 isin 만 non-null 보존하고 다른 필드의 last-wins 는 그대로 뒀다 — 기존 동작 회귀를 만들지 않으면서 게이트웨이 키만 지킨다. ⑦ 테스트가 이 경계를 고정한다"
  - "백필을 runMasterSync 전체 실행이 아니라 isin 전용 경로로 좁혔다 — 전체 실행은 전 컬럼 upsert + delist-sweep 을 함께 하고, 마스터가 3개월 정체된 상태라 sweep 이 isin 백필과 뒤섞인다. 매핑은 배포될 `krxToMasterRow` 를 그대로 import 해 '같은 코드가 만든 값' 임을 보장했다"
  - "ISIN-1 에서 CHECK 제약 존재를 프로브하지 않았다 — 확인하려면 위반 쓰기를 production 에 날려야 하고, 제약이 없다면 그 쓰기가 곧 오염이다. 15-09 가 일회용 컨테이너에서 이미 실증했고 상시 감시는 ISIN-3 이 맡는다"
  - "webapp 의 로컬 `StockWithProximity` 는 건드리지 않았다 — 이 plan 의 변경 범위 밖이고, 응답에 필드가 하나 더 실리는 것은 런타임 무해하다. 대신 shared 에 `StockDetailResponse` 를 export 해 호가창 plan 이 import 만 하면 되게 했다"

patterns-established:
  - "쓰기 전 dry-run 이 기본이다: 매핑 결과 건수 · 중복 키 · 대상/제외 분리를 먼저 출력하고, 같은 스크립트에 DRY_RUN 스위치를 둔다. 이번에 dry-run 이 '2764 전건 매핑 성공, 중복 0' 을 먼저 보여줬기 때문에 실제 쓰기에서 판단할 것이 남지 않았다"
  - "production 데이터 변경은 표본 3행의 before/after 전 컬럼 스냅샷으로 증명한다 — '다른 컬럼 무변형' 은 주장이 아니라 diff 여야 한다"
  - "게이트가 빨간불이면 게이트를 고치기 전에 빨간불의 원인을 분해한다 — 이번 42종목은 필터가 틀린 게 아니라 마스터 동기화가 3개월 죽어 있었다는 사실의 관측이었다"

requirements-completed: [RELAY-02]

# Metrics
duration: 78min
completed: 2026-09-06
---

# Phase 15 Plan 10: 코드↔ISIN 매핑 Summary

**KRX `ISU_CD` 12자 표준코드를 `stocks.isin` 으로 흘려보내는 경로를 만들고 production 2,764행을 백필 — 활성 주권 커버리지 98.5% 에서 멈췄고, 남은 42종목은 master-sync 가 2026-06-10 이후 매일 0행을 받고 조용히 끝나고 있었다는 선재 결함의 관측이다**

## Performance

- **Duration:** 약 78분
- **Started:** 2026-09-05T19:05Z 경
- **Completed:** 2026-09-05T20:23Z 경
- **Tasks:** 3 (Task 1~2 실행 + Task 3 production 백필 — 재배포는 권한 계층이 차단)
- **Files modified:** 12

## Accomplishments

- **매핑 경로 완성 (D-28).** `krxToMasterRow` 가 `ISU_CD` 를 `/^[A-Z]{2}[A-Z0-9]{10}$/` 가드와 함께 `isin` 으로 옮긴다. 단축코드 산술 유도 코드는 저장소 어디에도 없고, 실측이 왜 없어야 하는지를 보여준다 — **005930 → `KR7005930003`, 005935(우선주) → `KR7005931001`**. 단축코드는 +5 인데 isin 본문은 +1 이고 체크digit 도 3→1 로 바뀐다.
- **ETP 오염 2중 차단 (T-15-31 / T-15-33).** `fetchEtpBaseInfo` 가 만드는 행은 `ISU_CD` 가 비어 있어 자연히 `isin=null` 이 되고, 6자 코드가 새어 들어와도 정규식이 막는다. `upsertMasters` 는 dedupe 에서 isin 만 non-null 보존하고, isin 이 없는 행은 payload 에서 키를 생략해 이미 백필된 값을 지우지 않는다.
- **API 노출.** `MASTER_COLS` 에 `isin` 이 들어가고 `mergeMasterAndQuote` 가 응답에 싣는다. production 에서 서버가 실제로 보내는 select 문자열을 그대로 호출해 `{"code":"005930","name":"삼성전자","isin":"KR7005930003",...}` 를 확인했다.
- **상시 게이트.** `smoke-relay.sh --check-isin` 이 ISIN-1(컬럼·노출) / ISIN-2(활성 주권 NULL 0) / ISIN-3a·3b(길이 12 · ISO 6166 형태) 를 검사하고 기존 PASS/FAIL 카운터·종료코드 계약에 합류한다. **백필 전 FAIL 1 / 후 FAIL 1(잔존 42)** 로 게이트가 살아 있음을 양쪽에서 확인했다.
- **production 백필 2,764행.** 활성 주권 2,749 중 **2,707 (98.5%)** 이 12자 ISIN 을 얻었다. REIT·투자회사·SICAV 등 `/sto/*` 계열도 함께 채워졌다(맥쿼리인프라 `KR7088980008`, 롯데리츠 `KR7330590001`). ETF/ETN 은 설계대로 NULL.
- **선재 결함 1건 발견.** master-sync 가 2026-06-10 이후 **매일 0행**을 받고 정상 종료해 왔다. 이것이 잔존 42종목의 단일 원인이다(아래 참조).

## Task Commits

1. **Task 1: shared isin + master-sync 매핑(ETP 방어) + 서버 노출** — `bddb22d` (feat)
2. **Task 2: smoke-relay.sh `--check-isin` 서브커맨드** — `01a5500` (feat)
3. **Task 3: ISIN 백필 + 커버리지 검증** — 저장소 코드 변경 없음(production 데이터 작업 + deferred 기록). deferred-items 갱신은 본 SUMMARY 커밋에 포함.

**Plan metadata:** 본 SUMMARY 커밋

## Files Created/Modified

- `packages/shared/src/stock.ts` — `StockMaster.isin` 추가(KRX `ISU_CD` 주석 + 산술 유도 금지 명시), `StockDetailResponse` 신설.
- `packages/shared/src/index.ts` — `StockDetailResponse` export.
- `workers/master-sync/src/pipeline/map.ts` — `parseIsin()` (ISO 6166 12자 가드, Pitfall 13 역참조) + `krxToMasterRow` 의 `isin` 필드.
- `workers/master-sync/src/pipeline/upsert.ts` — isin 보존 dedupe merge, `toDbRow()` 분리, isin 유무 2배치 upsert, 배치 건수 로깅.
- `workers/master-sync/tests/map.test.ts` — isin 케이스 6건(정상 12자 / ETP / 6자 / trim·소문자 / 길이 이탈 5종 / 우선주≠보통주).
- `workers/master-sync/tests/upsert.test.ts` — isin 케이스 5건(보존 merge / 키 생략 / 2배치 분리 / last-wins 무회귀 / 나중 non-null 우선).
- `server/src/routes/stocks.ts` — `MASTER_COLS` 에 `isin`.
- `server/src/mappers/stock.ts` — `StockMasterRow.isin`, `StockWithProximityResponse = StockDetailResponse`, `mergeMasterAndQuote` 전달.
- `server/tests/fixtures/stocks.ts` — 마스터 픽스처에 isin(삼성전자 실값 / 미백필 종목 null).
- `server/tests/routes/stock-detail.test.ts` — 응답 isin 노출 2건.
- `scripts/smoke-relay.sh` — Supabase 프로브 헬퍼 5종 + `--check-isin` 구현.
- `.planning/.../deferred-items.md` — master-sync basDd 결함 + server 테스트 flake 잔존 기록.

## Decisions Made

frontmatter `key-decisions` 참조. 실행 중 갈린 지점 중 기록이 필요한 둘:

**부분 upsert 는 `stocks` 에서 통하지 않는다.** 처음엔 `{code, isin}` 만 보내는 부분 upsert 로 백필하려 했고, PostgREST 가 `23502 null value in column "name"` 으로 거부했다. PostgREST 의 upsert 는 `INSERT ... ON CONFLICT DO UPDATE` 라 **INSERT 의 행 구성 단계에서 NOT NULL 이 먼저 평가된다.** `stock_quotes` 의 D-22 부분 upsert 가 통했던 건 생략한 컬럼(volume/trade_amount)에 기본값이 있어서였고, `stocks.name`/`market` 에는 없다. 실패한 문장은 통째로 롤백돼 아무것도 쓰이지 않았음을 4,414행 카운트와 표본 2행으로 확인한 뒤, 읽은 행을 그대로 되돌려 쓰고 isin 만 갈아끼우는 방식으로 바꿨다. **이 함정은 `upsertMasters` 에는 해당하지 않는다** — 그쪽은 isin 만 빼고 나머지 컬럼을 모두 보내기 때문이다.

**게이트를 느슨하게 하지 않았다.** ISIN-2 잔존 42종목 중 16건은 ETN 이 `security_group='주권'` 으로 잘못 등록된 행이다. 필터에 이름 패턴을 더하면 게이트는 초록불이 되지만, 그건 잘못된 라벨을 감추는 것이다. 게이트가 빨간불인 이유는 필터가 틀려서가 아니라 **데이터가 실제로 틀렸기 때문**이므로 그대로 뒀다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 테스트 파일 위치가 plan 과 다름**
- **발견 시점:** Task 1
- **문제:** plan 은 `workers/master-sync/src/pipeline/__tests__/{map,upsert}.test.ts` 를 지정하나 저장소의 실제 규약은 `workers/master-sync/tests/{map,upsert}.test.ts` 이고 `vitest.config.ts` 가 그쪽을 본다. plan 대로 만들면 신규 테스트가 실행되지 않는다.
- **수정:** 기존 파일 2개에 케이스를 추가했다.
- **커밋:** `bddb22d`

**2. [Rule 3 - Blocking] `StockDetailResponse` 가 shared barrel 에서 export 되지 않음**
- **발견 시점:** Task 1 typecheck
- **문제:** `packages/shared/src/index.ts` 는 타입을 명시 나열하는 barrel 이라 새 타입이 자동 노출되지 않는다. `server typecheck: TS2305`.
- **수정:** `index.ts` 의 stock export 목록에 추가.
- **커밋:** `bddb22d`

**3. [Rule 3 - Blocking] 서버 테스트 픽스처가 `StockMasterRow` 의 새 필수 필드를 만족하지 않음**
- **발견 시점:** Task 1
- **문제:** `isin` 을 필수로 추가하면서 `server/tests/fixtures/stocks.ts` 의 마스터 픽스처 2건이 계약과 어긋났다(테스트는 tsc 대상 밖이라 typecheck 로는 드러나지 않는다).
- **수정:** 삼성전자에는 실제 값 `KR7005930003`, 미백필 종목에는 `null` 을 넣어 두 상태를 픽스처가 모두 대표하게 했다.
- **커밋:** `bddb22d`

**4. [Rule 3 - Blocking] 백필 기준일이 "오늘" 로는 0행**
- **발견 시점:** Task 3
- **문제:** master-sync 의 `todayBasDdKst()` 가 오늘 날짜를 KRX 에 묻는데 응답이 0행이라 백필이 아무것도 하지 않는다.
- **수정:** 백필 1회에 한해 `BAS_DD=20260903` 을 명시했다. `index.ts` 의 날짜 선택 로직은 **고치지 않았다** — 스케줄 의미를 바꾸는 변경인데 재배포가 차단돼 검증할 수 없다. deferred-items 에 원인·실측·권고를 기록했다.

---

**Total deviations:** 4 (전부 Rule 3 - blocking)
**Impact on plan:** 1~3 은 저장소 실제 구조에 맞춘 기계적 조정이라 범위 변화 없음. 4 는 선재 결함 우회이고, 결함 자체는 고치지 않고 기록했다.

## Issues Encountered

### ISIN-2 잔존 42종목 — 게이트가 FAIL 로 남아 있다

백필 후 `--check-isin` 은 **PASS 3 / FAIL 1** 이다. 활성 주권 2,749 중 42종목이 여전히 `isin IS NULL` 이고, 원인이 둘로 깨끗하게 갈린다.

**(A) 16종목 — KRX 마스터에 없는 placeholder 행** (`listing_date` 가 NULL, `updated_at` 이 7~9월)

`intraday-sync` 의 `bootstrapStocks` 가 키움 응답에서 처음 본 코드를 `security_group='주권'` placeholder 로 넣은 행이다. 15건은 이름부터 ETN 이고(`메리츠 솔랙티브 금 선물 ETN(H)`, `한투 인버스2X코스피200선물 ETN` 등), 1건은 신규 상장 **386380 스카이랩스**(updated_at 09-04 — basDd 09-03 응답에 아직 없다). ETN 은 애초에 게이트웨이 대상이 아니고, master-sync 의 ETP 경로가 `security_group='ETN'` 으로 교정하면 ISIN-2 필터에서 자연히 빠진다.

**(B) 26종목 — KRX 상장 마스터에 더 이상 없는 주권** (`updated_at` 이 2026-05-15 / 06-10)

더존비즈온·동양생명·신세계푸드·현대홈쇼핑·에코마케팅·위지윅스튜디오 등과 SPAC 8종. 6월 이후 상장폐지·비상장 전환된 종목이 `is_delisted=false` 로 남아 있는 것이다. delist-sweep 이 한 번만 정상 동작하면 사라진다.

**두 갈래의 공통 원인은 하나다** — `gh-radar-master-sync` 가 **2026-06-10 이후 매일 0행을 받고 정상 종료해 왔다.**

| basDd | KRX `stk_isu_base_info` 응답 |
| --- | --- |
| 20260906 (일, "오늘") | 0 행 |
| 20260904 (금) | 0 행 |
| 20260903 (목) | 943 행 |

`todayBasDdKst()` 가 **오늘** 날짜를 묻는데 KRX 는 그 시점에 아직 발행하지 않는다. Cloud Run 실행 로그 09-01/09-02/09-03 모두 `KRX fetched krxRows=0` → `KRX returned 0 rows … (stocks 마스터 미변경)` 이고, 그래서 upsert 도 sweep 도 3개월간 실행되지 않았다. `stocks.updated_at` 이 대부분 2026-06-10 에 멈춰 있는 것이 그 흔적이다.

15-10 의 변경은 `basDd` 선택을 건드리지 않으므로 선재 결함이고, deferred-items 에 실측표·연쇄 영향·권고를 남겼다. **잔존 42종목은 이 결함이 고쳐지고 master-sync 가 한 번 정상 동작하면 (A)는 재분류로, (B)는 sweep 으로 함께 해소된다.**

### 부분 upsert 첫 시도 실패 (해결)

`{code, isin}` payload 가 `23502` 로 거부됐다. 원인·해결은 "Decisions Made" 참조. **production 에 아무 변화도 남기지 않았다** — 실패 직후 전체 행수(4,414)와 표본 2행(005930/095570)이 이전과 동일함을 확인했다.

### server 테스트 flake 1건 (무관)

`tests/routes/discussions.test.ts > V-05` 가 4회 중 1회 `read ECONNRESET` 으로 실패했다(나머지 3회 221/221 통과). 15-10 이 건드린 `stock-detail.test.ts` 는 4회 모두 통과. deferred-items 의 기존 항목에 부기했다.

## Verification

### A. 코드 (로컬)

| 검증 | 결과 |
| --- | --- |
| `pnpm typecheck` | 13 워크스페이스 전부 Done |
| `pnpm --filter @gh-radar/master-sync test` | 4 files / **36 tests** 통과 (isin 신규 11건 포함) |
| `pnpm --filter @gh-radar/server test` | 29 files / **221 tests** 통과 (isin 신규 2건 포함, 4회 중 3회 — 위 flake 참조) |
| `bash -n scripts/smoke-relay.sh` | exit 0 |

### B. production 실측 (Supabase REST, service_role)

| 항목 | 백필 전 | 백필 후 |
| --- | --- | --- |
| `stocks` 전체 행 | 4,414 | 4,414 (증감 0) |
| `isin IS NOT NULL` | 0 | **2,764** |
| 활성 주권(`security_group='주권' AND is_delisted=false`) | 2,749 | 2,749 |
| ↳ 그중 `isin IS NOT NULL` | 0 | **2,707 (98.5%)** |
| ↳ 그중 `isin IS NULL` | 2,749 | **42** |
| `isin` 길이 ≠ 12 | 0 | **0** |
| `isin` 형태 이탈(`^[A-Z]{2}[A-Z0-9]{10}$`) | 0 | **0** |
| `--check-isin` 요약 | PASS 3 / FAIL 1 (exit 1) | PASS 3 / FAIL 1 (exit 1) |

**KRX 응답 실측(basDd=20260903):** KOSPI 943 + KOSDAQ 1,821 = 2,764행, 매핑 결과 **isin 있음 2,764 / 없음 0**, 중복 ISIN 0건, 미등록 종목 0건.

### C. D-28 근거 실증 (수동 대조 3건)

| 종목 | code | isin | 판정 |
| --- | --- | --- | --- |
| 삼성전자 | 005930 | `KR7005930003` | 12자, `KR` 시작 |
| 삼성전자우 | 005935 | `KR7005931001` | **보통주와 다름** — 단축코드는 +5 인데 isin 본문은 +1, 체크digit 3→1 |
| KODEX 200 (ETF) | 069500 | `NULL` | 설계대로 (게이트웨이 대상 아님) |

산술 유도가 성립했다면 005935 의 isin 은 `KR70059350xx` 여야 한다. 실제는 `KR7005931001` 이다 — **매핑 컬럼을 두는 이유가 여기서 증명된다.**

### D. 다른 마스터 컬럼 무변형 (표본 3종 전 컬럼 diff)

백필 전후 `SELECT *` 를 CSV 로 비교했다. `isin` 을 제외한 13개 컬럼이 모두 동일하고 **`updated_at` 도 바뀌지 않았다**(005930/005935 = `2026-06-10 05:00:40.152+00`, 069500 = `…40.159+00`).

```
전: 005930,삼성전자,KOSPI,,,보통주,주권,SamsungElectronics,1975-06-11,100,5846278608,f,"2026-06-10 05:00:40.152+00",
후: 005930,삼성전자,KOSPI,,,보통주,주권,SamsungElectronics,1975-06-11,100,5846278608,f,"2026-06-10 05:00:40.152+00",KR7005930003
```

### E. 서버 select 계약 (production)

서버가 실제로 보내는 `MASTER_COLS` 문자열을 그대로 호출:

```
{"code":"005930","name":"삼성전자","isin":"KR7005930003","market":"KOSPI",
 "sector":null,"security_type":"보통주","listing_date":"1975-06-11",
 "is_delisted":false,"updated_at":"2026-06-10T05:00:40.152+00:00"}
```

### F. 미검증 (정직하게)

- **배포된 `/api/stocks/:code` 응답** — 컨테이너 재배포가 차단돼 production 서버는 아직 이전 이미지다. select 계약(E)과 라우트 테스트로 두 축을 각각 확인했을 뿐, 배포된 엔드포인트에서 `isin` 이 나오는 것은 확인하지 못했다.
- **master-sync 의 정상 경로가 isin 을 채우는 것** — 백필은 `krxToMasterRow` 를 그대로 import 해 수행했으므로 매핑은 동일하지만, `upsertMasters` 의 2배치 분리가 production 규모에서 도는 것은 단위 테스트로만 확인했다.

## Blocked / Needs Decision

### 1. master-sync 재배포 (차단됨 — 환경 권한)

`scripts/deploy-master-sync.sh` 실행이 이 환경의 권한 계층에 의해 거부됐다. 재시도하지 않았다.

**남은 작업(메인 체크아웃에서):**
```bash
GCP_PROJECT_ID=gh-radar SUPABASE_URL=<...> bash scripts/deploy-master-sync.sh
```
스크립트 말미의 `smoke-master-sync.sh` 는 **INV-2 에서 실패할 것**이다 — 잡을 오늘 날짜로 실행하면 0행이라 `master-sync cycle complete` 로그가 남지 않는다. 배포 자체는 그 전에 끝나 있다.

### 2. ISIN-2 잔존 42종목 — 결정 필요

지금 상태로는 `--check-isin` 이 exit 1 이다. 선택지:

- **(권장) master-sync `basDd` 결함을 먼저 고친다** — quick task 로 `todayBasDdKst()` 를 "비어 있지 않은 응답이 나올 때까지 거슬러 올라가기" 로 바꾸고 재배포한 뒤 1회 실행하면, ETN 16건은 `security_group` 재분류로, 상장폐지 26건은 delist-sweep 으로 함께 해소된다. **42종목을 개별로 손대지 않고 한 번에 끝나는 유일한 경로다.**
- (대안) 42행을 직접 교정한다 — ETN 16건 `security_group` 갱신 + 26건 `is_delisted=true`. 빠르지만 근본 원인이 남아 다음 상장폐지에서 같은 일이 반복된다.
- (비권장) ISIN-2 필터를 완화한다 — 게이트가 초록불이 되지만 잘못된 라벨을 감춘다.

**주문·구독 관점의 실제 영향:** 42종목 중 16건은 ETN 이라 애초에 대상이 아니고, 26건은 이미 상장폐지·비상장 전환이라 거래 대상이 아니다. **실거래 가능한 종목 중 게이트웨이 키가 없는 것은 스카이랩스(386380) 1건**이고, 이것도 KRX 가 09-04 자 마스터를 발행하면 정상 경로로 채워진다.

## User Setup Required

None — 새 외부 서비스 설정 없음. 백필은 기존 `workers/master-sync/.env` 의 자격증명으로 수행했다.

## Next Phase Readiness

- **15-14 / 15-16 / 15-17 (구독·주문 경로):** `stocks.isin` 이 실제 값으로 채워졌고 `/api/stocks/:code` 계약에 실린다. 거래 가능 종목의 게이트웨이 키는 확보됐다고 봐도 된다.
- **호가창 plan:** `import type { StockDetailResponse } from "@gh-radar/shared"` 로 `isin` 을 읽으면 된다. webapp 의 로컬 `StockWithProximity` 는 이 plan 에서 손대지 않았으므로, 호가창 작업 시 그 타입을 `StockDetailResponse` 로 바꾸거나 `isin` 을 더할 것.
- **주의:** `isin` 은 nullable 이고 앞으로도 그렇다. 구독·주문 코드는 **NULL 을 "그 종목은 DMA 불가" 로 다뤄야 한다** — 빈 문자열로 폴백해서 게이트웨이에 보내면 안 된다.
- **선행 권고:** 위 "Blocked / Needs Decision" 2번을 15-14 착수 전에 정리하면 `--check-isin` 이 초록불이 되어 이후 wave 의 스모크가 깨끗해진다.

---
*Phase: 15-dma-relay-kb-gh-trade-server-10-wss*
*Completed: 2026-09-06*

## Self-Check: PASSED

- 수정 파일 12건 + SUMMARY 1건 전부 디스크에 존재.
- 태스크 커밋 `bddb22d`, `01a5500` 이 git 이력에 존재.
- production 실측 수치는 모두 Supabase REST 응답에서 직접 읽은 값이다(주장 아님).
