# Quick Task 260817-f1a — 휴장일 가짜 일봉 근본 감지 방식 리서치

**Researched:** 2026-08-17
**Domain:** 키움 REST API 데이터 기준일자 / KRX 거래일 판정
**Confidence:** MEDIUM-HIGH (필드 존재 HIGH, 장중 semantics 는 실측 probe 필요)

## Summary

키움 ka10027(등락률 순위)·ka10001(주식기본정보) 응답에는 **데이터 기준일자 필드가 없다**. 두 TR 은 "현재가 스냅샷" 계열이라 날짜를 싣지 않으며, 휴장일에는 직전 거래일 값(+시간외 보정)을 그대로 재방출한다. 오늘(8/17) 삼성전자 273,000→274,500 / 거래량 36.2M→39.1M 같은 미세 변동이 바로 이 시간외단일가 보정이며, 이 때문에 값-비교 휴리스틱(`staleGuard`, close 정확 일치 ≥80%)이 구조적으로 뚫린다. **값 비교 방식은 원리적으로 신뢰할 수 없다** — 키움이 값을 1원이라도 바꾸면 무력화되기 때문.

반면 키움 **차트 계열 TR 은 봉마다 `dt`(일자, YYYYMMDD) 필드를 싣는다**. `ka10081`(주식일봉차트조회요청) 응답은 `{ stk_cd, stk_dt_pole_chart_qry: [{ dt, cur_prc, open_pric, high_pric, low_pric, trde_qty, trde_prica, ... }] }` 구조이고, `dt` 는 키움 자신의 일봉 DB 상 거래일이다. 즉 **"키움이 인정하는 최신 거래일"을 직접 물어볼 수 있다.** 이것이 캘린더 없이 얻을 수 있는 유일한 결정적(deterministic) 신호다.

키움 186개 REST 엔드포인트에는 **휴장일/장운영구분 조회 TR 이 없다**. 장운영 상태는 실시간 WebSocket 타입 `0s`(장시작시간)로만 나오는데, 매분 실행 후 종료되는 Cloud Run Job 구조와 맞지 않아 배제.

**Primary recommendation:** cycle 시작 시 대표 종목 1~3개에 대해 `ka10081` 을 1회 호출해 최신 `dt` 를 얻고, `latestDt !== todayKst` 이면 cycle skip. 여기에 **KRX 휴장일 상수 백스톱**(잔여 6일 하드코딩, 연 1회 갱신)을 얇게 얹고, 기존 `staleGuard` 는 3차 방어로 유지한다. 단, ka10081 의 "휴장일에 오늘 봉을 만들지 않는다 / 장중에는 오늘 봉을 만든다" 두 semantics 는 **배포 전 실측 probe 로 반드시 확인**(오늘이 그 실측을 할 수 있는 마지막 날, 다음 기회는 9/24).

---

## Q1. 키움 응답의 데이터 기준일자 필드

| TR | 용도 | 일자 필드 | 근거 |
|----|------|-----------|------|
| `ka10027` 전일대비등락률상위 | 현재 사용 (STEP1) | **없음** | [VERIFIED: `packages/shared/src/kiwoom.ts` + `tests/fixtures/ka10027-page1.json` — 11 필드 전부 확인, 날짜 없음] |
| `ka10001` 주식기본정보 | 현재 사용 (STEP2) | **없음** | [VERIFIED: fixture 13 필드 + 공개 wrapper 45 필드 목록에 date 계열 없음] |
| `ka10081` 주식일봉차트조회 | **후보 (권장)** | **`dt` (YYYYMMDD)** | [VERIFIED: KiwoomRestApi.Net `KiwoomChartGetChartItem` — `[JsonProperty("dt")] 일자`] |
| `ka10015` 일별거래상세 | 대안 (경량) | **`dt` (YYYYMMDD)** | [VERIFIED: KiwoomRestApi.Net `KiwoomStockInfoGetDailyTransactionDetailItem`] |
| `ka10086` 일별주가요청 | 대안 | 일자 필드 보유 추정 | [ASSUMED — 모델 미확인] |
| 휴장일/장운영구분 조회 TR | — | **존재하지 않음** | [VERIFIED: kiwoom-rest-api 186 엔드포인트 목록 전수 — 휴장일/영업일/장운영 카테고리 없음] |
| WebSocket `0s` 장시작시간 | 장운영구분 실시간 | (실시간 전용) | [VERIFIED: 19종 실시간 타입 목록] — Job 아키텍처와 불일치, 배제 |

### ka10081 호출 스펙 (권장안)

```
POST {kiwoomBaseUrl}/api/dostk/chart
headers: authorization: Bearer <token>
         api-id: ka10081
         content-type: application/json;charset=utf-8
         cont-yn: N
body: { stk_cd: "005930", base_dt: "20260817", upd_stkpc_tp: "1" }

응답: { return_code: 0, stk_cd: "005930",
        stk_dt_pole_chart_qry: [ { dt: "20260814", cur_prc: "...", open_pric, high_pric, low_pric, trde_qty, trde_prica }, ... ] }
```

- `dt` 는 `KiwoomDateTimeConverter` 대상 → 문자열 `"YYYYMMDD"` [VERIFIED: .NET 모델]
- 배열 정렬 방향(최신 우선 여부)은 미확인 → **`max(dt)` 로 취하면 정렬 가정 불필요** (권장)
- `base_dt`/`upd_stkpc_tp` 필수 여부 및 페이지 크기(≈600봉 추정)는 probe 로 확인 [ASSUMED]

---

## Q2. KRX 2026 잔여 휴장일 + 2027 초

**오늘 2026-08-17(월) = 광복절(8/15 토) 대체공휴일 → 코스피·코스닥·코넥스·넥스트레이드 전면 휴장, 8/18(화) 정상 재개.** [CITED: gukjenews.com/3666255, cbci.co.kr/598027]

### 잔여 휴장일 (8/18 이후)

| 날짜 | 요일 | 사유 | 확신 |
|------|------|------|------|
| 2026-09-24 | 목 | 추석 연휴 | [CITED: ggilbo.com/1175543] |
| 2026-09-25 | 금 | 추석 | [CITED: ggilbo.com/1175543] |
| 2026-10-05 | 월 | 개천절(10/3 토) 대체공휴일 | [CITED: ggilbo.com/1175543] |
| 2026-10-09 | 금 | 한글날 | [CITED: ggilbo.com/1175543] |
| 2026-12-25 | 금 | 성탄절 | [CITED: ggilbo.com/1175543] |
| 2026-12-31 | 목 | 연말 휴장 (마지막 거래일 12/30 수) | [CITED: ggilbo.com/1175543] |

**총 6일.** 요일은 전부 `date(1)` 로 교차검증 [VERIFIED: 로컬 계산].

> **주의 — 9/28(월)은 휴장일이 아니다.** 추석 연휴(9/24·25·26) 중 겹치는 휴일이 **토요일(9/26)** 뿐인데, 공휴일법 시행령상 설·추석 연휴는 **일요일 겹침만** 대체공휴일 대상이다(광복절·개천절·한글날·성탄절·어린이날·삼일절은 토·일 모두 대상). 따라서 추석 대체공휴일 없음 — 기사 목록과 일치. [CITED: ggilbo.com/1175543 + 대체공휴일 규정]

> **검색 오염 주의:** 일반 웹검색 요약에서 "2026 설 연휴 1/17~20", "추석·한글날 10/16~24 장기휴장", "광복절이 토요일이라 휴장일 없음" 같은 **명백한 오답**이 다수 나왔다. 휴장일 리스트는 반드시 국내 기사/브로커 공지 원문으로 교차검증할 것.

### 2026 상반기 (참고 · 이미 지남)

1/1(목), 2/16~2/18(월~수, 설), 3/2(월, 삼일절 대체), 5/1(금, 근로자의날), 5/5(화, 어린이날), 5/25(월, 부처님오신날 5/24 일 대체), 6/3(수, 제9회 지방선거) — **[ASSUMED] 미검증. 백필 seed 로 쓸 경우 별도 확인 필요.**

### 2027 초 — [ASSUMED] 전부 미검증

1/1(금) 신정 휴장 → 1/4(월) 개장(연초 개장일은 통상 10시 개장). 설날 2027-02-07(일) → 연휴 2/5(금)·2/8(월 대체) 추정. **KRX 공식 "연말 시장운영 일정" 공지가 2026년 12월에 나오면 그때 확정할 것.**

---

## Q3. 두 방식 트레이드오프 + 권장안

| 항목 | A. ka10081 `dt` 기준일자 | B. 휴장일 캘린더 테이블 |
|------|--------------------------|-------------------------|
| 결정성 | 키움 자신의 거래일 DB — 값 드리프트 무관 | 완전 결정적 |
| 유지보수 | **0** (자동) | 연 1회 seed + 임시공휴일 수시 갱신 |
| 임시휴장·시스템장애 휴장 | **자동 커버** | 미커버 (수동 추가 필요, = 같은 버그 재발) |
| 프리마켓(08시대) stale | **자동 커버** (오늘 봉 미생성) | 미커버 (별도 시간 가드 필요) |
| 런타임 비용 | cycle 당 REST 1~3회 (24 req/s 버킷 여유 충분) | 0 |
| 오탐 위험 | 09:00~첫 체결 사이 1~2 cycle skip 가능 | seed 오타 시 **정상 거래일 skip** (치명) |
| 검증 상태 | 필드 존재 HIGH / 장중 semantics **미검증** | 리스트 자체는 기사 교차검증 |
| 다른 워커 재사용 | 워커별 호출 필요 | 테이블이면 SQL/웹앱에서도 재사용 |

### 권장: A 주(主) + B 백스톱 + 기존 staleGuard 3차

```
cycle 시작
 ├─ 0차: KRX_HOLIDAYS 상수에 오늘이 있으면 즉시 skip     (비용 0, 알려진 휴장 확실 차단)
 ├─ 1차: ka10081 probe → max(dt) !== todayKst 면 skip    (결정적 주 가드)
 ├─ 2차: ka10027 0행 가드                                 (기존)
 └─ 3차: staleGuard 값 비교                               (기존, 방어 심층화용 잔존)
```

**근거:**
- B 단독은 "다음 임시공휴일/임시휴장" 을 못 막는다 — 이번과 똑같은 사고가 반복된다. 근본 감지가 아님.
- A 단독은 미검증 동작(키움이 휴장일에 오늘 봉을 만들지 않는다)에 전량 의존한다. 가정이 틀리면 **조용히** 실패한다.
- B 를 **테이블이 아닌 TS 상수 배열**로 두면 마이그레이션·RLS 없이 6줄이면 끝난다. 다른 워커/웹앱에서 거래일 계산이 필요해지면 그때 테이블로 승격.
- 0차를 1차 앞에 두면, 알려진 휴장일에는 키움 호출 자체를 아끼고 probe 미검증 리스크도 우회한다.

**대안 A′ (검토했으나 비권장):** 응답 행을 `todayKst` 대신 `max(dt)` 로 스탬핑하기. 휴장일에는 8/14 행을 시간외 보정값으로 **덮어써서** KRX 공식 EOD 종가를 오염시킨다(273,000 → 274,500). skip 이 옳다.

**선택 최적화(선택):** probe 결과를 하루 1회만 수행하고 캐시(예: `kiwoom_tokens` 유사 소형 테이블 또는 `stock_daily_ohlcv` 존재 여부)하면 호출을 480회/일 → 1회/일로 줄일 수 있다. 다만 복잡도 증가 대비 이득이 작아 **v1 은 매 cycle probe 권장**.

---

## Q4. 코드베이스의 기존 거래일/휴장일 로직 (재사용 가능 패턴)

| 위치 | 내용 | 재사용성 |
|------|------|----------|
| `workers/candle-sync/src/modes/businessDay.ts` | `todayBasDdKst()`, `isoToBasDd()`, `basDdToIso()`, `iterateBusinessDays()` — **평일만 판정, 캘린더 없음.** 주석 명시: "실제 휴장은 KRX 빈응답으로 자연 skip" | `isoToBasDd` 는 ka10081 `base_dt` 생성에 그대로 사용 가능. 휴장 판정 로직은 없음 |
| `workers/candle-sync/src/pipeline/missingDates.ts` | 결측일 감지 = **DB 에 이미 행이 있는 날짜만** 후보. `rowCount === 0` 이면 휴장 가능으로 skip | ✅ 8/17 행 삭제 후 재오염 위험 **없음** (날짜가 후보 목록에서 사라짐) |
| `workers/intraday-sync/src/pipeline/staleGuard.ts` | 값 비교 휴리스틱 (오늘 뚫림) | 3차 방어로 유지 권장 |
| `workers/intraday-sync/src/index.ts:118` | ka10027 0행 가드 | 유지 |
| `packages/shared/src/marketHours.ts` | `isKoreanMarketOpen()` (시간대만) | 휴장일 미인지 |

**결론: 프로젝트 어디에도 휴장일 캘린더가 없다.** candle-sync 는 "KRX 가 빈 응답을 준다"는 소스 특성에 의존해 무캘린더로 성립했지만, 키움은 빈 응답 대신 **재방출**을 하므로 같은 전략이 성립하지 않는다 — 이것이 이번 사고의 구조적 원인.

---

## Runtime State Inventory (오염 정리 대상)

| 카테고리 | 발견 항목 | 필요 조치 |
|----------|-----------|-----------|
| Stored data (직접) | `stock_daily_ohlcv` date='2026-08-17' 약 3,660행 | **DELETE (데이터 마이그레이션)** |
| Stored data (파생) | `limit_up_events` / `limit_up_stats` — LEAD(date) 기반 "다음날 수익률"이 8/17 가짜 행을 다음 거래일로 오인 (260720-kbf 에서 실증된 2차 피해) | DELETE 후 `gh-radar-limit-up-sync` Job 재실행 |
| Stored data (파생) | `theme_comovement` — 8/17 change_rate 로 급등 이벤트 오인 가능 | `gh-radar-comovement-sync` Job 재실행 |
| Stored data (파생) | `home_theme_snapshots` — home-sync 스케줄 `*/5 8-15 * * 1-5` 라 **오늘도 실행됨**. 가짜 급등 기반 8/17 스냅샷 존재 가능 | 8/17 스냅샷 행 확인 후 DELETE |
| Stored data (자가치유) | `stock_quotes`, `top_movers` — 매 cycle 전량 갱신 | 조치 불필요 (8/18 자동 정상화) |
| Live service config | Cloud Scheduler `gh-radar-intraday-sync-cron` = `* 8-15 * * 1-5` — cron 으로 휴장일 표현 불가 | 스케줄 변경 없음. 가드는 코드 레벨 |
| Secrets/env | 키움 자격은 GCP Secret Manager(`gh-radar-kiwoom-appkey`/`secretkey`). **로컬 `.env` 없음** | 신규 secret 불필요 |
| Build artifacts | Cloud Run Job 이미지 `intraday-sync:<sha>` | `scripts/deploy-intraday-sync.sh` 재배포 필수 |

---

## Common Pitfalls

### P1. 키움 REST 는 IP 화이트리스트 — 노트북에서 probe 불가
intraday-sync 는 Direct VPC Egress + Cloud NAT + Static IP `34.64.195.151` 로 나가고, 이 IP 가 키움에 등록돼 있다 (`setup-intraday-sync-iam.sh` D-31). **로컬에서 ka10081 을 때리면 화이트리스트에서 거부된다.** probe 는 반드시 (a) Cloud Run Job 임시 PROBE 모드 실행, 또는 (b) 동일 Static IP 를 공유하는 `gh-radar-server` Cloud Run service 경유로 수행할 것.

### P2. probe 검증 기회가 오늘 하루뿐 (다음은 9/24)
"휴장일에 ka10081 이 오늘 봉을 만들지 않는다" 는 **휴장일 당일에만** 직접 검증 가능하다. 오늘을 놓치면 다음 실증 기회는 **2026-09-24**. 차선책: 임의의 거래일에 `base_dt=20260817` 로 조회해 `dt=20260817` 봉이 **존재하지 않음**을 확인하면 강한 정황 증거는 얻을 수 있다(단, "휴장일 당일에만 임시로 생겼다가 사라지는 봉" 가능성은 배제 못 함).

### P3. 반대 방향 오탐 — 거래일 09:00 직후 skip
장 시작 직후 첫 체결 전에는 오늘 봉이 아직 없을 수 있다 → 1~2 cycle skip. 매분 실행이라 실질 피해 없음. 다만 **09:00~09:05 로그에 skip 이 반복되는지 첫 거래일(8/18)에 반드시 관측**할 것. 지속 skip 이면 가드가 잘못된 것.

### P4. 대표 종목 단일 의존
005930 단독 probe 는 거래정지/시스템 이슈에 취약. **005930 + 069500(KODEX 200 ETF) 2종의 `max(dt)`** 권장. ETF 는 상시 거래되어 봉 생성이 안정적.

### P5. 휴장일 리스트를 LLM/검색 요약으로 채우지 말 것
이번 리서치에서 검색 요약이 설 연휴·추석 날짜를 크게 틀렸다. 상수 seed 는 **국내 기사 원문 또는 KRX/증권사 공지**로 교차검증한 값만 사용. 오답 seed = 정상 거래일 skip = 더 큰 사고.

---

## Verification Plan (배포 전 [BLOCKING])

| # | 검증 | 방법 | 통과 기준 |
|---|------|------|-----------|
| V1 | ka10081 응답 구조 | Static IP 경유 1회 호출, 원문 로깅 | `stk_dt_pole_chart_qry[].dt` 존재, `"YYYYMMDD"` 형식 |
| V2 | **휴장일 semantics** | 오늘(8/17) probe | `max(dt) === "20260814"` (오늘 봉 없음) |
| V3 | **거래일 semantics** | 8/18(화) 09:05 이후 probe | `max(dt) === "20260818"` |
| V4 | 프리마켓 | 8/18 08:xx probe | `max(dt) === "20260817"`… 이 아니라 `"20260814"` → skip 유도 확인 |
| V5 | 회귀 | `vitest` 전체 + `staleGuard`/`runCycle` 기존 케이스 | green (현행 105/105 기준) |

> V2 가 실패하면(= 휴장일에도 오늘 `dt` 가 생김) A 안은 폐기하고 B(캘린더) 단독으로 전환해야 한다. **계획은 이 분기를 반드시 포함할 것.**

---

## Assumptions Log

| # | 가정 | 위치 | 틀렸을 때 영향 |
|---|------|------|----------------|
| A1 | ka10081 은 휴장일에 오늘 `dt` 봉을 만들지 않는다 | Q3 권장안 | **가드 전체 무효** → 캘린더 단독으로 전환 |
| A2 | ka10081 은 거래일 장중에 오늘 `dt` 봉을 실시간 포함한다 | Q3 권장안 | 정상 거래일 전체 skip (치명적 역방향 오탐) |
| A3 | `base_dt`/`upd_stkpc_tp` 파라미터 필수·형식 | Q1 스펙 | 호출 실패 (즉시 드러남, 저위험) |
| A4 | ka10081 페이지 크기 ≈600봉, 페이로드 수십 KB | Q3 비용 | 비용/지연 증가 (관측으로 조정) |
| A5 | 2026 상반기 휴장일 리스트 | Q2 | seed 백필 시에만 영향 (v1 미사용) |
| A6 | 2027 초 휴장일 (1/1, 설 2/5·2/8) | Q2 | 2026-12 KRX 공지로 확정 필요 |
| A7 | ka10086 에 일자 필드 존재 | Q1 | 대안 후보일 뿐, 영향 없음 |

---

## Sources

**Primary (HIGH)**
- 코드베이스 실측: `packages/shared/src/kiwoom.ts`, `workers/intraday-sync/tests/fixtures/ka10027-page1.json`, `ka10001-*.json`, `workers/candle-sync/src/modes/businessDay.ts`, `workers/candle-sync/src/pipeline/missingDates.ts`, `scripts/setup-intraday-sync-iam.sh`
- KiwoomRestApi.Net 응답 모델 (JSON 필드명 확정): https://github.com/dongbin300/KiwoomRestApi.Net — `Objects/Models/DomesticStock/KiwoomChart.cs`, `KiwoomStockInfo.cs`
- kiwoom-rest-api (186 엔드포인트 + 19 실시간 타입 전수 목록): https://github.com/younghwan91/kiwoom-rest-api
- 이전 대응 기록: `.planning/quick/260720-kbf-intraday-sync-stale/260720-kbf-SUMMARY.md`

**Secondary (MEDIUM)**
- 8/17 휴장 + 잔여 6일 리스트: https://www.ggilbo.com/news/articleView.html?idxno=1175543
- 8/17 국내 증시·넥스트레이드 전면 휴장: https://www.gukjenews.com/news/articleView.html?idxno=3666255 , https://www.cbci.co.kr/news/articleView.html?idxno=598027
- 키움 공식 API 가이드(응답 스펙 원문 미공개, 로그인 필요): https://openapi.kiwoom.com/guide/apiguide

**Tertiary (LOW — 사용하지 않음)**
- 일반 웹검색 요약의 2026 휴장일 나열 — 설·추석 날짜 오답 다수 확인, 폐기
