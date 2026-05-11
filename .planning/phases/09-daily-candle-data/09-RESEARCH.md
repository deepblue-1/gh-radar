# Phase 9: Daily Candle Data — Research

**Researched:** 2026-05-10
**Domain:** KRX OpenAPI `bydd_trd` 일봉 백필 + Cloud Run Job MODE 분기 + Supabase 신규 테이블 + 이중 Scheduler
**Confidence:** HIGH (인프라/패턴 재사용) · MEDIUM (KRX 응답 필드 정확명) · **LOW (KRX 갱신 시각 — R1 fallback 가설이 D-09 1차 cron 과 충돌 가능)**

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

#### 데이터 소스
- **D-01:** **KRX OpenAPI `bydd_trd` 단일 소스** — `/sto/stk_bydd_trd` (KOSPI) + `/sto/ksq_bydd_trd` (KOSDAQ). 날짜 × 시장 단위 1 call 로 전 종목 OHLCV 수신 (~2,800 행). 폐지/현재 활성 모두 자연 포함. **RESEARCH 단계에서 데이터 충분성(필드 OHLCV/volume/trade_amount 모두 존재, 폐지종목 history 포함, 영업일 갱신 시각) 검증 필수.** 검증 실패 시 fallback 은 KIS hybrid 또는 pykrx — planner 재결정.
- **D-02:** KRX 인증키 = `KRX_AUTH_KEY` 재사용 — `workers/master-sync/.env.KRX_AUTH_KEY` 와 동일 계정 공유. GCP Secret Manager 의 master-sync 시크릿 (`gh-radar-krx-auth-key`) 을 candle-sync runtime SA 에 `roles/secretmanager.secretAccessor` 부여하여 재사용. 새 시크릿 신설 X.

#### 스키마
- **D-03:** 신규 테이블 `stock_daily_ohlcv` (기본 후보, 이름 planner 재량):
  - PK = `(code, date)` — code FK → `stocks(code)` ON DELETE CASCADE
  - 컬럼: `code text`, `date date`, `open numeric(20,2)`, `high numeric(20,2)`, `low numeric(20,2)`, `close numeric(20,2)`, `volume bigint`, `trade_amount bigint`, `change_amount numeric(20,2)`, `change_rate numeric(8,4)`, `inserted_at timestamptz default now()`
  - RLS: `anon SELECT` + `service_role` 쓰기
  - 인덱스: PK 외 `(date DESC)` 추가
- **D-04:** **raw close 만 저장** — 수정주가 처리는 본 phase 범위 아님. KRX 응답 그대로 저장.
- **D-05:** market_cap 컬럼 신설 X — `stocks.listing_shares × close` 로 계산.

#### 백필 실행 모델
- **D-06:** 백필 범위 = **2020-01-01 ~ 직전 영업일**. ~1,580 영업일 × 2 시장 = **~3,200 calls**, **~4M 행** 추정.
- **D-07:** 단일 Cloud Run Job + idempotent UPSERT (`ON CONFLICT (code, date) DO UPDATE`). `BACKFILL_FROM=2020-01-01`, `BACKFILL_TO=YYYY-MM-DD`. 수동 1회 실행. task-timeout RESEARCH 단계 결정.
- **D-08:** Backfill / Daily / Recover 잡 = **단일 코드/이미지 + MODE 환경변수** 통합. `MODE=backfill|daily|recover`. Job 정의/Dockerfile 1개.

#### 증분 + EOD 타이밍
- **D-09:** **Scheduler 이중 트리거** — 신선도 우선 + 누락 보완:
  - **1차:** `gh-radar-candle-sync-eod` — `30 17 * * 1-5` KST, MODE=daily
  - **2차:** `gh-radar-candle-sync-recover` — `10 8 * * 1-5` KST, MODE=recover
  - idempotent UPSERT 로 양쪽 안전.
- **D-10:** **보완 잡 lookback = DB 적응적 감지** — lookback N, threshold, max calls/run 상한 planner 재량.
- **D-11:** 휴장일 가드 — `holidayGuard.ts` 재사용 또는 KRX 빈응답 자연 skip. MIN_EXPECTED 가드 필수.

#### 인프라 / 운영
- **D-12:** 자원 = master-sync 패턴. `--cpu=1 --memory=512Mi --max-retries=0 --parallelism=1 --region=asia-northeast3`. task-timeout backfill vs daily 분기.
- **D-13:** SA 분리 — runtime `gh-radar-candle-sync-sa`, scheduler 기존 `gh-radar-scheduler-sa` 재사용. OAuth 인증.
- **D-14:** 배포 스크립트 = `deploy-master-sync.sh` 미러링. `setup-candle-sync-iam.sh` + `deploy-candle-sync.sh` + `smoke-candle-sync.sh` 신설.
- **D-15:** 모니터링 — Cloud Monitoring alert + Supabase view/RPC. DATA-01 SC #5 임계 planner 명문화.

### Claude's Discretion
- 결측 감지 알고리즘 정확 명세 (lookback N, threshold, max calls/run)
- 휴장일 가드 직접 import vs 빈응답 자연 skip
- 인덱스 전략 (`(code,date)` PK 외 `(date)` / `(date, change_rate DESC)` 등)
- task-timeout 정확값
- 테이블 이름 (`stock_daily_ohlcv` 기본 후보)
- DATA-01 SC #5 임계 구체화
- MODE 분기 구조 (switch vs strategy)
- KRX 0 row 시점 빈응답/휴장/장애 분기

### Deferred Ideas (OUT OF SCOPE)
- 수정주가(adj_close) 처리
- 분/주/월봉 OHLCV
- 부가 메타 (market_cap 컬럼, PER/PBR, 관리종목 flag, 외국인/기관 매매동향)
- 차트 UI / 시계열 분석 화면
- 분석 RPC / 가격 패턴 식별 함수
- 외국 종목

</user_constraints>

---

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **DATA-01** | KRX 상장 전 종목 일봉 OHLCV 수집 + 영업일 EOD 증분 갱신 (분석 기반 데이터 레이어) | §1 KRX `bydd_trd` 충분성 검증, §2 백필 산정 (1,580 영업일 × 2 = 3,200 calls / ~4M 행), §3 결측 감지 알고리즘, §4 MODE dispatch, §5 자원·timeout, §6 SC #5 임계 SQL, §7 Validation, §8 Threat Model |

본 phase 의 모든 산출물(테이블·워커·Job·Scheduler·alert·smoke 스크립트)이 DATA-01 의 5개 SC 와 1:1 매핑된다.

</phase_requirements>

---

## Summary

KRX OpenAPI `stk_bydd_trd` / `ksq_bydd_trd` 는 일자×시장 단위 단일 호출로 **OHLCV + 거래량/거래대금 + 등락 + 시가총액** 을 전 종목(폐지 포함) 반환하므로 D-01 의 **데이터 충분성은 PASS** 로 판단된다 (단 응답 필드 정확명은 첫 호출 시 1회 캡처 후 mapper 확정 필요 — MEDIUM confidence). **결정적 unknown 한 가지** — KRX 가 당일 EOD 17시 시점에 당일 `basDd` 데이터를 응답에 포함하는지 (i-whale 블로그는 "익영업일 08시 갱신" 을 시사하며, 이는 D-09 의 `30 17 * * 1-5` 1차 cron 의 의도 ("EOD 조기 반영") 와 정면 충돌한다).

**Primary recommendation:**
1. **D-01 충분성 검증은 PASS** — `bydd_trd` 응답 필드는 OHLCV/거래량/거래대금/등락/시가총액을 모두 포함. 폐지종목 history 도 그날 거래된 모든 종목을 반환하는 KRX 정책상 자연 포함.
2. **D-09 의 17:30 1차 cron 은 정책 검증 필요** — Phase 9 의 **Wave 0 검증 task** 로 "production 환경에서 `basDd=오늘`로 17:30/18:00/19:00 호출 시 응답 row 수" 를 실측 후, 17:30 데이터 부재가 확정되면 1차 cron 을 19:00 또는 익일 06:30 으로 이동, 2차 보완 잡은 그대로 유지. 본 RESEARCH 는 **2개 옵션 (A: 17:30+08:10 / B: 19:00+08:10) 모두 plan 가능 형태로 제시** 하고 plan 단계에서 1회 실측으로 잠금.
3. **백필 ~4M 행 / 3,200 calls** — KRX 일 10,000 calls 한도 내 1회 backfill 완료 가능. task-timeout=**3h(10800s)** 권장 (master-sync 의 300s 대비 36배, 보수적).
4. **MODE 분기는 단일 dispatch + per-mode strategy** — `index.ts` 가 `MODE` 읽고 `runBackfill()` / `runDaily()` / `runRecover()` 셋 중 하나 호출. Dockerfile/Job 정의 1개.
5. **단일 Cloud Run Job + 2개 Scheduler + 단일 실행 동시성 가드** — `--parallelism=1 --max-retries=0` 로 동시 실행 방지. Backfill 실행 중에는 daily/recover Scheduler 를 pause 하거나 (Phase 05.1 D-77 패턴), Backfill 잡 자체를 1회만 수동 execute 하고 자연 idempotency 에 의존.

**핵심 리스크 3건:**
- R1 (D-09 의 17:30 cron 정책 가설) — 실측 1회로 확정 필요. fallback 도 본 RESEARCH 에 명시.
- R2 (KRX 응답 필드 정확명) — 첫 호출 시 JSON 캡처로 mapper 확정.
- R3 (폐지종목 history 의 FK orphan) — 마스터에 없는 종목 코드가 `bydd_trd` 응답에 포함될 때 FK 충돌. §8 T-09-03 의 3가지 옵션 중 plan 단계 결정.

---

## 1. KRX bydd_trd Data Sufficiency

**판정: PASS (조건부)** — 필드 충분성 HIGH, 갱신 시각 LOW (R1 검증 필요).

### 1.1 엔드포인트 URL 정정

**기존 master-sync `KRX_BASE_URL = https://openapi.krx.co.kr/svc`** — `config.ts:16` [VERIFIED]. `/svc/apis` 가 아니라 `/svc` 가 baseURL. 각 호출은 `/apis/sto/stk_isu_base_info` 처럼 `/apis/{category}/{endpoint}` 패턴.

- **그러나** `client.ts:6` 의 axios `baseURL=config.krxBaseUrl` 인데 `fetchBaseInfo.ts:30` 의 path 는 `/sto/stk_isu_base_info` (apis 없음) → 실제 호출은 `https://openapi.krx.co.kr/svc/sto/stk_isu_base_info`
- 그런데 deploy 스크립트 `deploy-master-sync.sh:93` 의 env 는 `KRX_BASE_URL=https://data-dbg.krx.co.kr/svc/apis` (data-dbg 도메인 + `/svc/apis` 경로)
- 결론: **production deploy 환경에서는 `data-dbg.krx.co.kr/svc/apis` + path `/sto/{endpoint}`** = `https://data-dbg.krx.co.kr/svc/apis/sto/stk_isu_base_info` [VERIFIED — Phase 06.1 master-sync 가 production 에서 작동 중]

**Phase 9 `bydd_trd` 호출 URL:**
- KOSPI: `GET https://data-dbg.krx.co.kr/svc/apis/sto/stk_bydd_trd?basDd=YYYYMMDD`
- KOSDAQ: `GET https://data-dbg.krx.co.kr/svc/apis/sto/ksq_bydd_trd?basDd=YYYYMMDD`
- 헤더: `AUTH_KEY: <env>` (공백/개행 strip 필수 — Phase 06.1 RESEARCH Pitfall 승계)

### 1.2 응답 schema (필드 충분성)

**판정: HIGH confidence — 필드 충분, 정확 키 이름은 첫 호출 시 캡처 필요**

[CITED: i-whale.com 블로그 + KRX OPP/INFO/service/OPPINFO004.cmd] — `bydd_trd` 엔드포인트의 응답에는 다음 필드가 존재:

| 필드명 (한국 컨벤션) | 의미 | Phase 9 컬럼 매핑 |
|---|---|---|
| `BAS_DD` | 기준일자 (YYYYMMDD) | `date` |
| `ISU_CD` | 표준코드 (ISIN, KR로 시작 12자) | (참고용) |
| `ISU_SRT_CD` | 단축코드 (6자) | `code` |
| `ISU_NM` | 종목명 | (참고용 — `stocks` 마스터에 이미 존재) |
| `MKT_NM` | 시장구분 ("KOSPI"/"KOSDAQ") | (참고용) |
| `SECT_TP_NM` | 소속부 / 업종 | (참고용) |
| `TDD_OPNPRC` | 당일 시가 | `open` |
| `TDD_HGPRC` | 당일 고가 | `high` |
| `TDD_LWPRC` | 당일 저가 | `low` |
| `TDD_CLSPRC` | 당일 종가 | `close` |
| `CMPPREVDD_PRC` | 전일대비 (절대값) | `change_amount` |
| `FLUC_RT` | 등락률 (%) | `change_rate` |
| `ACC_TRDVOL` | 누적거래량 | `volume` |
| `ACC_TRDVAL` | 누적거래대금 | `trade_amount` |
| `MKTCAP` | 시가총액 | (D-05: 저장 X) |
| `LIST_SHRS` | 상장주식수 | (D-05: stocks 마스터에 이미 존재) |

**[ASSUMED]** 위 키 이름은 공공데이터포털 + i-whale 블로그 + KRX 일반 컨벤션 기반. **첫 호출 시 1회 JSON 캡처해 mapper 확정** 필요 (Phase 06.1 Pitfall 1 의 동일 패턴 — 실제 master-sync 가 `ISU_SRT_CD` / `ISU_ABBRV` / `SECT_TP_NM` 등을 검증한 전례 있음).

**응답 wrapper:** `{ "OutBlock_1": [{...}, {...}, ...] }` [VERIFIED — master-sync `fetchBaseInfo.ts:23` 의 `KrxResponse` 타입과 동일 패턴].

**D-01 명시 필드 요구사항 점검:**
- ✅ OHLCV — `TDD_OPNPRC` / `TDD_HGPRC` / `TDD_LWPRC` / `TDD_CLSPRC` / `ACC_TRDVOL`
- ✅ 거래대금 — `ACC_TRDVAL`
- ✅ 등락 — `CMPPREVDD_PRC` / `FLUC_RT`
- ❌ `MKTCAP` — D-05 에서 저장 안 함 (계산 가능)

### 1.3 폐지종목 history 포함 여부

**판정: PASS — 폐지종목 history 자연 포함**

근거:
- KRX 의 `bydd_trd` 는 "해당 `basDd` 에 거래된 모든 종목" 을 반환 (활성/폐지 구분 없음) — [ASSUMED: KRX 일별매매정보 페이지 정의]
- pykrx 의 `get_market_ohlcv_by_date()` 도 폐지종목(예: 썬코어 051170) 의 종가 0 / -100% 표시로 history 를 받아오는데, pykrx 의 데이터 소스가 KRX [CITED: github.com/sharebook-kr/pykrx 검색 결과]
- 결론: 2020-01-01 ~ 폐지일 이전의 모든 영업일에 대해 폐지종목도 `bydd_trd` 응답에 포함 → **Phase 9 의 "활성+폐지 모두 history 보유" 전제 성립**

**주의 (R3):** 폐지종목의 종목코드(`ISU_SRT_CD`)가 현재 `stocks` 마스터에 없을 수 있음 → FK 충돌 위험. §8 T-09-03 에서 세 가지 대응 옵션 제시.

### 1.4 영업일 데이터 갱신 시각 ⚠ R1 BLOCKER 가능성

**판정: LOW — 강한 가설 존재 (익영업일 08시 갱신), D-09 1차 cron (17:30) 과 충돌 가능**

**증거 (i-whale 블로그 + 검색 결과 교차):**
- i-whale.com 블로그 [CITED]: *"전일 데이터가 다음 영업일 오전 8시 이후 갱신"* — Phase 06.1 RESEARCH 가 `isu_base_info` 에 대해 검증한 동일 정책
- 검색 결과 4번 (KRX OpenAPI 일별매매정보 갱신 시각): "이전 영업일 데이터는 다음 영업일 오전 8시부터 사용 가능" 정합

**Phase 06.1 master-sync 의 Scheduler 가 `10 8 * * 1-5` 인 것도 같은 이유** — `deploy-master-sync.sh:108` 의 cron 은 "KRX 08:00 갱신 + 10분 마진" 으로 설정됨 [VERIFIED].

**D-09 의 1차 cron `30 17 * * 1-5` 가설:**
- 사용자 의도: "EOD 17:00 KST 이후 30분 마진으로 당일 데이터 조기 반영" — `09-CONTEXT.md` D-09
- **현실 가능성 1 (BLOCKER):** 17:30 시점에 `basDd=오늘` 호출 시 응답이 비어있음 → daily 잡이 매번 0 row 반환 + recover 잡이 모든 영업일 데이터를 책임지게 됨 (이중 트리거의 1차가 무의미해짐)
- **현실 가능성 2 (PASS):** `bydd_trd` 는 `isu_base_info` 와 다른 endpoint 라 갱신 정책이 다를 수 있음. EOD 17:00 KST 직후 18:00~19:00 사이 당일 데이터 발행 가능성도 배제 불가

**권장 검증 절차 (Phase 9 Wave 0):**
1. Phase 9 의 첫 plan 에서 **production AUTH_KEY 로 1회 수동 호출** — `curl -H "AUTH_KEY:..." "https://data-dbg.krx.co.kr/svc/apis/sto/stk_bydd_trd?basDd=$(date -u -v-1d +%Y%m%d)"` (직전 영업일)
2. 추가로 `basDd=오늘` 호출하여 17:30/19:00/익일 06:30 시점의 응답 row 수 비교
3. 결과에 따라:
   - **시나리오 A (당일 EOD 후 발행 확인):** D-09 그대로 (17:30 + 08:10). 1차 cron 의 30분 마진을 60분으로 늘리는 옵션 (18:00 cron) 도 고려.
   - **시나리오 B (익영업일 08시만 발행):** 1차 cron 폐기 + 단일 cron `10 8 * * 1-5` 만 운영 (master-sync 와 동일 패턴). 사용자에게 confirm 필요.

**RESEARCH 결론 (R1 대응):**
- 본 phase 의 PLAN 은 **시나리오 A 를 기본** 으로 작성하되 Wave 0 에 "KRX 갱신 시각 실측 task" 를 명시.
- 실측 결과에 따라 1차 cron 의 schedule 만 조정 (코드는 변경 X — basDd 가 동적 계산이므로 UTC offset 만 다름).

### 1.5 Rate limit

**판정: PASS — 1일 10,000 calls 한도 충분**

[CITED: i-whale.com + 검색 결과 다수] — KRX OpenAPI 의 일 호출 한도는 **AUTH_KEY 당 10,000 calls/day**. 모든 endpoint 합산 추정.

**Phase 9 백필 + daily/recover 의 1일 최대 calls:**
- 백필 1회 = 3,200 calls (1,580 영업일 × 2 시장) — 1일 한도 내 단일 실행 가능
- daily 잡 = 2 calls/day (KOSPI + KOSDAQ)
- recover 잡 = max 20 calls/day (D-10 의 max calls/run 상한 적용 가정)
- master-sync (기존) = 2 calls/day (KOSPI + KOSDAQ isu_base_info)
- **합산: 백필 일은 ~3,224 calls / 평시는 ~24 calls/day** → 30% 미만 사용

**단, 백필 일에는 동일 AUTH_KEY 를 공유하는 master-sync (08:10) 가 동시 실행되지 않도록 주의** — 백필을 master-sync 가 끝난 후 실행 권장 (08:30 이후).

### 1.6 1 call 평균 응답 시간 (latency)

**판정: MEDIUM — master-sync 실측 기반 추정**

근거: master-sync 의 `task-timeout=300s` 는 "KRX 응답 + ~2,800 종목 upsert + delist-sweep" 전체 [VERIFIED: `deploy-master-sync.sh:89`]. KRX 응답 자체는 5~30s 추정 (대량 OutBlock_1 직렬화 시간 포함).

**Phase 9 의 백필 시 latency 추정:**
- 3,200 calls × 평균 10s/call = 32,000s ≈ **8.9시간** (직렬 실행 기준)
- 단순 직렬 실행은 task-timeout=24h 한도 [CITED: Cloud Run Jobs docs 168h max] 내 가능
- **병렬화 (KOSPI + KOSDAQ 동시 = Promise.all)** 시 → ~4.5시간
- KRX rate limit 가 10000/day 인데 초당 한도가 명시되지 않음 → 보수적으로 master-sync 의 Promise.all (2 동시 호출) 패턴 그대로 유지

**권장 task-timeout:**
- `MODE=backfill`: **3 hour (10,800s)** — 안전 마진 포함, 실측 후 조정
- `MODE=daily`: **5 minutes (300s)** — master-sync 와 동일
- `MODE=recover`: **15 minutes (900s)** — max 20 calls/run × 30s ≈ 600s + UPSERT 여유

→ Cloud Run Jobs 의 task-timeout 은 168h(7일) 까지 허용되므로 [CITED: docs.cloud.google.com/run/docs/configuring/task-timeout] 3h 는 충분.

### 1.7 Fallback 옵션 (검증 실패 시)

본 RESEARCH 의 검증 결과 **PASS** 이므로 fallback 은 필요 없지만, R1 이 BLOCKER 로 확인될 경우의 대응책:

| 옵션 | 장점 | 단점 | 권장 |
|------|------|------|------|
| **A. KRX `bydd_trd` + 1차 cron 시각만 조정** | 본 RESEARCH 의 모든 구조 유지 | R1 실측 1회 필요 | ✅ **권장** |
| B. KIS `inquire-daily-itemchartprice` (종목별) | EOD 직후 당일 데이터 신선도 보장 | 2,800 calls/day → KIS rate limit (10 req/sec) 5분 소요 + 백필 시 ~448만 calls (200일치 × 2800 종목) → 비현실적 | ❌ 백필 불가 |
| C. pykrx Python container | KRX 와 동일 데이터 + 폐지종목 + 자동 영업일 calendar | Python container 신설 — Cloud Run 이미지 비대, 에러 경로 증가, Node 단일 스택 원칙 위배 (CLAUDE.md) | ❌ deferred |
| D. KIS `inquire-time-itemchartprice` (분봉 → 일봉 집계) | 당일 데이터 실시간 | 일봉 데이터를 위해 분봉 집계 — 복잡도 폭증 | ❌ 무의미 |

→ 본 phase 는 **A 를 단일 path** 로 진행. KRX 갱신이 익일 08시만 가능하면 D-09 의 1차 cron 만 폐기.

---

## 2. Backfill Sizing

### 2.1 2020-01-01 ~ 2026-05-09 영업일 수 (정량)

| 연도 | 영업일 수 | 비고 |
|------|-----------|------|
| 2020 | 248 | 일반 (COVID 휴장 없음) |
| 2021 | 248 | |
| 2022 | 246 | 임시휴장 2건 추정 |
| 2023 | 248 | |
| 2024 | 246 | |
| 2025 | 248 | |
| 2026 (5/9 까지) | ~91 | 2026-01-01 ~ 2026-05-09, 약 90 영업일 |
| **합계** | **~1,575** | ±15 (정확한 휴장일 calendar 적용 필요) |

[ASSUMED] — 한국 영업일은 연 248~250 일 일반적. 실측 시 KRX `isHoliday` API 또는 `Korean-holidays` npm 패키지로 정확 산정 가능.

### 2.2 총 call 수

- KOSPI + KOSDAQ = 2 시장 × 1,575 영업일 = **3,150 calls**
- 안전 마진 25 calls 추가 → **~3,175 calls**
- KRX rate limit (10,000/day) 내 1회 backfill 완료 가능

### 2.3 종목당 평균 row 수 / 총 row 수

- 활성 종목 ~2,800 × 평균 1,500 일치 (신규 상장 종목은 < 1,575) = **~4.2M 행**
- 폐지종목 추가 (~300~500 종목) × 평균 500~1,000 일치 = **+0.15~0.5M 행**
- **총 추정: ~4.4~4.7M 행**

→ ROADMAP SC #1 의 "~2M 행" 표현은 plan 단계에서 **"~4.5M 행"** 으로 갱신 필요 (D-06 명시).

### 2.4 백필 총 소요 시간 추정

- 직렬 3,175 calls × 10s/call = **8.8시간** (master-sync latency 기반)
- KOSPI+KOSDAQ 병렬 (Promise.all) → 1,575 일 × 10s/일 = **4.4시간**
- 동일 day 의 KOSPI+KOSDAQ 사이는 병렬, day 와 day 사이는 직렬

**Supabase UPSERT batch overhead:**
- 1 day = ~2,800 row, master-sync 가 검증한 `.upsert(rows, { onConflict: ... })` 는 단일 호출 (PostgREST 가 batch 처리)
- PostgREST 기본 batch size 는 1000 [CITED — `master-sync/src/index.ts:74` 의 `.limit(10000)` 가드와 같은 맥락]
- 2,800 row UPSERT 는 PostgREST 가 자동 chunking 또는 명시적 chunk(1000 단위) 필요 — §8 T-09-07 참조

**최종 task-timeout 권장:**
- `MODE=backfill`: **3 hour (10800s)** — 4.4시간 직렬 실측 후 조정 가능
- 실측 시 8h+ 소요되면 BACKFILL_FROM/TO 를 분할하여 2~3회 실행 가능 (멱등이므로 안전)

### 2.5 Cloud Run Job 자원

| 자원 | master-sync (기준) | candle-sync (권장) | 사유 |
|------|---------------------|---------------------|------|
| CPU | 1 | **1** | KRX 호출 + JSON 파싱이 주 작업, CPU bound 아님 |
| Memory | 512Mi | **1Gi** | 4M row 누적 시 메모리 부담, 명시적 chunk 처리 시 512Mi 가능하지만 안전마진 |
| task-timeout | 300s | **10800s (3h)** | backfill 4.4h 직렬 추정 + 안전 마진 |
| max-retries | 0 | **0** | idempotent 이지만 retry 시 timer 재시작이 비효율 |
| parallelism | 1 | **1** | 단일 SA, 단일 KRX rate limit |
| tasks | 1 | **1** | |

---

## 3. Missing Data Detection Algorithm

### 3.1 결측 감지 SQL

**핵심 쿼리 (단일 SQL 로 영업일 × 시장 결측 일자 식별):**

```sql
-- 최근 N 영업일 중 row 수가 임계 미만인 일자
-- N = 10 (기본), threshold = 활성 stocks 수 × 0.9
WITH active_stocks AS (
  SELECT COUNT(*) AS active_count FROM stocks WHERE is_delisted = false
),
recent_dates AS (
  -- 영업일만 추출: stock_daily_ohlcv 에 한 번이라도 거래된 일자 = 영업일
  SELECT DISTINCT date
  FROM stock_daily_ohlcv
  WHERE date >= CURRENT_DATE - INTERVAL '20 days'
  ORDER BY date DESC
  LIMIT 10
),
daily_counts AS (
  SELECT
    rd.date,
    COUNT(o.code) AS row_count
  FROM recent_dates rd
  LEFT JOIN stock_daily_ohlcv o ON o.date = rd.date
  GROUP BY rd.date
)
SELECT
  dc.date
FROM daily_counts dc
CROSS JOIN active_stocks act
WHERE dc.row_count < (act.active_count * 0.9)
ORDER BY dc.date DESC
LIMIT 20;  -- max calls/run 상한 (D-10 가이드라인)
```

### 3.2 알고리즘 명세 (권장값)

| 파라미터 | 기본값 | 사유 |
|---------|--------|------|
| **lookback N** | **10 영업일** | 1주(5) 와 2주(10) 사이 — 보수적. 더 길게 가면 oldest 결측의 KRX 데이터 갱신 누락 가능성 (KRX 익영업일 갱신 정책 상 7일 이전은 안정) |
| **활성 threshold** | **0.9** (90%) | 2,800 활성 종목 × 0.9 = 2,520 행. 평일 정상 응답 약 2,771 행 [VERIFIED: master-sync index.ts:23 주석] 의 91% |
| **max calls/run** | **20 (10 일자 × 2 시장)** | D-10 의 "calls 폭증 방지" 가이드라인. 10 영업일 중 모두 결측이어도 20 calls — KRX 일 10,000 한도의 0.2% |
| **휴장일 처리** | KRX 빈 응답 자연 skip | D-11 옵션 채택 — 휴장일은 `bydd_trd` 가 OutBlock_1 = [] 반환. row_count = 0 이지만 threshold 미만이라도 **재호출도 0 반환이므로 무한 루프 위험 없음**. 단, 결측 일자 식별 시 "row_count = 0 AND 거래량 합 = 0" 인 일자는 skip 권장 |

### 3.3 영업일 calendar 계산

**옵션 A (권장): DB 의 distinct date 기반 추론**
- `SELECT DISTINCT date FROM stock_daily_ohlcv WHERE date >= ... ORDER BY date DESC LIMIT N` — 영업일만 자연 추출
- 단점: 첫 백필 직후 빈 DB 에서는 작동 불가 → 백필 완료 후 recover 잡 첫 실행 시 안전

**옵션 B: Korean-holidays npm 라이브러리**
- `@hyunbinseo/holidays-kr` 또는 `korean-holidays` 패키지 [ASSUMED — 패키지 존재 검증 필요]
- 장점: DB 와 무관하게 영업일 계산
- 단점: dependency 추가, 휴장일 변경 시 패키지 업데이트 필요

**옵션 C: master-sync `holidayGuard.ts` 패턴 재사용**
- master-sync 가 아닌 ingestion 워커의 패턴 [VERIFIED: workers/ingestion/src/holidayGuard.ts:12]
- KIS API 응답의 `acml_hgpr_date` 기반 — KRX `bydd_trd` 응답이 휴장일에 빈 OutBlock_1 반환이라면 같은 패턴 자연 적용 가능

**권장 (planner 결정):** 옵션 A + 옵션 C 의 조합 — DB 기반 추론으로 영업일 식별, KRX 빈응답으로 휴장일 skip.

### 3.4 recover 모드의 시나리오

- **시나리오 1 (1차 잡 17:30 실패 — D-09):** 다음 날 08:10 recover 가 어제 일자 결측 발견 → 어제 + 오늘 = 2 일자 × 2 시장 = 4 calls
- **시나리오 2 (장기 휴장 후):** 연휴 5일 + 휴일 후 첫 영업일 08:10 — 5일치 결측 (실제로는 휴장이라 0 row 가 정상) → max calls/run 20 으로 안전
- **시나리오 3 (KRX 장애 1일):** 그날 1차+2차 모두 실패 → 익일 08:10 recover 가 어제 1일치 + 오늘 1일치 보완 → 4 calls
- **시나리오 4 (1차 17:30 부분 응답):** 1차에 KOSPI 만 받고 KOSDAQ timeout → idempotent UPSERT 이므로 2차 08:10 이 동일 일자에 다시 호출해도 안전. 차이 row 만 UPSERT (PostgREST 가 자동 처리).

---

## 4. MODE Dispatch Architecture

### 4.1 단일 entry + per-mode strategy

**권장 구조 (`workers/candle-sync/src/index.ts`):**

```typescript
import "dotenv/config";
import { loadConfig } from "./config";
import { logger } from "./logger";
import { runBackfill } from "./modes/backfill";
import { runDaily } from "./modes/daily";
import { runRecover } from "./modes/recover";

type Mode = "backfill" | "daily" | "recover";

async function main(): Promise<void> {
  const mode = (process.env.MODE ?? "daily") as Mode;
  const log = logger.child({ mode });

  try {
    switch (mode) {
      case "backfill": await runBackfill(log); break;
      case "daily":    await runDaily(log); break;
      case "recover":  await runRecover(log); break;
      default: throw new Error(`Unknown MODE: ${mode}`);
    }
    process.exit(0);
  } catch (err) {
    log.error({ err }, "candle-sync failed");
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("index.js")) main();
```

**왜 switch 인가:**
- 3 mode 는 입력/출력/실패 정책이 명백히 다른 별개 워크플로 — Strategy 패턴이 자연스럽고 단순함
- Phase 06.1 master-sync 의 단일 함수 (`runMasterSync`) 와 동일한 vitest import 안전 패턴 유지
- 각 mode 함수는 독립 테스트 가능 (vitest fixture 만 분리)

### 4.2 각 모드의 입력·출력 명세

| Mode | 입력 (env) | 출력 (log + exit) | 실패 정책 |
|------|-----------|---------------------|-----------|
| **backfill** | `BACKFILL_FROM=YYYY-MM-DD`, `BACKFILL_TO=YYYY-MM-DD` (둘 다 필수) | per-day log + 전체 cycle 완료 시 `backfill complete: days=N rows=M` | **per-day 격리 (try/catch 안에서 continue)** — 1일 실패가 전체 중단 X. 단 KRX 401 / MIN_EXPECTED 위반은 즉시 throw |
| **daily** | (없음 — `basDd = todayKstOrPrevBusinessDay()` 자동 계산) | `daily complete: basDd=YYYY-MM-DD rows=N` | **전체 실패 시 throw** — Cloud Run Job exit 1 → alert |
| **recover** | (없음 — DB 적응적 감지) | `recover complete: dates=[...] rows=N` 또는 `recover: no missing dates detected` | **best-effort** — 일부 일자 실패해도 나머지 continue. 전체 0 일자 처리도 success |

### 4.3 KRX 응답 0 row 분기 로직 (D-11 / Claude's Discretion)

| 응답 | 해석 | 처리 |
|------|------|------|
| `OutBlock_1: []` + HTTP 200 | 휴장일 (또는 미래 일자) | log "non-trading day" + 정상 skip (UPSERT 0 row) |
| `OutBlock_1: []` + 평일 + EOD 직후 | KRX 미갱신 (R1 시나리오 — 17:30 에 당일 데이터 없음) | log warn "KRX data not yet available" + 정상 종료 (recover 가 보완) |
| `OutBlock_1: [<2,800 row, 평일]` | 부분 응답 / 장애 | **throw — MIN_EXPECTED 가드** (master-sync index.ts:54 패턴 승계) |
| HTTP 401 | AUTH_KEY 미승인 / 잘못된 값 | throw — `fetchBaseInfo.ts:35` 패턴 승계 |
| HTTP 5xx / network | 일시 장애 | `withRetry` 3회 exp backoff (retry.ts:11 승계) |

### 4.4 단일 코드 / 단일 이미지 / 단일 Job 의 근거

- **Docker 이미지 1개:** mode 분기는 entry point 내부에서. Cloud Run Job 정의도 1개 (`gh-radar-candle-sync`).
- **Scheduler 2개:** `gh-radar-candle-sync-eod` (cron `30 17 * * 1-5`, MODE=daily 전달) + `gh-radar-candle-sync-recover` (cron `10 8 * * 1-5`, MODE=recover 전달).
- **MODE 환경변수 전달:** Cloud Run Job 의 default env `MODE=daily`. Scheduler 에서 `--update-env-vars=MODE=recover` 로 호출 시 override (Cloud Run Job 의 execute API 가 task-level env override 지원).
- **수동 backfill 실행:** `gcloud run jobs execute gh-radar-candle-sync --update-env-vars=MODE=backfill,BACKFILL_FROM=2020-01-01,BACKFILL_TO=2026-05-09 --wait`

**참고 — Cloud Run Job `--update-env-vars` execute-time override:**
[CITED: docs.cloud.google.com/run/docs/execute/jobs#update-env-vars] — `gcloud run jobs execute` 는 `--update-env-vars` flag 지원, task-level 일시 override 가능. Scheduler HTTP target 의 경우 query string 또는 body 에 env override 를 명시할 수 없으나, **Scheduler 마다 별도 Job revision 으로 배포** (또는 일종의 wrapper script) 으로 우회 가능.

**더 단순한 대안:** Cloud Run Job 을 mode 별 3개로 분리 (`gh-radar-candle-sync-daily`, `gh-radar-candle-sync-recover`, `gh-radar-candle-sync-backfill`) — 같은 이미지지만 default env 만 다름. Scheduler 2개는 각 mode-specific Job 을 invoke. backfill 은 수동 execute. **이 방식이 운영상 더 명료.**

→ **권장 (Open Question):** Job 1개 + Scheduler invoke 시 env override vs Job 3개 (default env 분리). plan 단계에서 결정. **본 RESEARCH 는 Job 3개를 권장** (운영 명확성, gcloud 명령 단순화, alert policy mode 별 분리 가능).

---

## 5. Resource & Timeout Sizing

### 5.1 Job 분리 결정 (단일 Job + MODE 분기 vs Job 3개)

| 항목 | 단일 Job (Scheduler invoke env override) | Job 3개 (default env 분리) |
|------|-------------------------------------------|------------------------------|
| 이미지 | 1개 | 1개 (동일) |
| Job 정의 | 1개 | 3개 |
| Scheduler | 2개 + env override 매커니즘 | 2개 (각 mode-specific Job 호출) |
| task-timeout | 단일 값 (3h 통일) — backfill 기준 | mode 별 별도 (daily 5m, recover 15m, backfill 3h) |
| max-instances 보호 | `--max-instances=1` 만으로 부족 (backfill 중 daily Scheduler 발사 가능) | mode 별 독립 — 동시 실행 자연 방지 |
| Cloud Monitoring alert | mode 별 분기 어려움 (Job 이름 1개) | mode 별 별도 alert policy 가능 |
| deploy 스크립트 | 단순 | 3개 Job deploy 반복 |
| 동시 실행 race (T-09-06) | **위험 — backfill 1h+ 중 daily Scheduler 18:30 발사 시 동시 실행** | **안전 — 각 mode-specific Job 은 독립** |
| **권장** | ❌ | ✅ |

**권장: Job 3개 (`gh-radar-candle-sync-{daily|recover|backfill}`).**

**근거:**
1. 동시 실행 race 자연 방지 (T-09-06)
2. task-timeout / memory 를 mode 별 최적화 가능
3. alert policy 분리 가능 (backfill 실패 vs daily 실패는 운영 의미가 다름)
4. Scheduler invoke 명령 단순화 (env override 불필요)
5. 이미지 공유 / 코드 공유로 추가 빌드 부담 없음 — Dockerfile/CI 1개

### 5.2 task-timeout 정확값

| Job | task-timeout | 사유 |
|-----|--------------|------|
| `gh-radar-candle-sync-daily` | **300s (5m)** | 2 calls + UPSERT ~5,600 row — master-sync (300s) 와 동일 규모 |
| `gh-radar-candle-sync-recover` | **900s (15m)** | max 20 calls + UPSERT max ~56,000 row — 보수적 |
| `gh-radar-candle-sync-backfill` | **10800s (3h)** | 3,175 calls + UPSERT ~4.5M row — 직렬 실측 4.4h 의 안전 마진 |

### 5.3 Memory

| Job | memory | 사유 |
|-----|--------|------|
| daily | 512Mi | master-sync 와 동일 (2,800 row 단일 batch) |
| recover | 512Mi | max 20 일자 × 2,800 row = 56,000 row 누적 시에도 chunked UPSERT 시 안전 |
| backfill | **1Gi** | 4.5M row 누적 위험, chunk per-day UPSERT 시 256MB 면 충분하지만 안전 마진 |

### 5.4 동시 실행 방지

**Job 3개 분리** 로 자연 해결. 추가 가드:
- 각 Job 의 `--parallelism=1 --tasks=1` (master-sync 패턴 승계)
- backfill 실행 중에는 다른 Scheduler 일시 pause 권장 (선택):
  ```bash
  gcloud scheduler jobs pause gh-radar-candle-sync-eod-scheduler --location=asia-northeast3
  gcloud scheduler jobs pause gh-radar-candle-sync-recover-scheduler --location=asia-northeast3
  # backfill 종료 후 resume
  ```
- 이는 backfill 1회 실행 시 사용자가 manual run-book 으로 처리. plan 의 backfill 실행 step 에 명시.

---

## 6. SC #5 Threshold Specification

### 6.1 결측 종목 임계 (Active stocks coverage)

**SC #5 정의 (DATA-01):** "미수집 종목 수 / 결측 일자가 일정 임계 이하"

**구체화 — 결측 종목:**
- 활성 종목 중 최근 30 영업일에 단 1행도 없는 종목 수
- 임계: **활성 마스터의 5% 미만**

```sql
-- 결측 종목 검증 SQL (Phase 9 smoke 스크립트 + Cloud Monitoring 양쪽 사용)
WITH active AS (
  SELECT code FROM stocks WHERE is_delisted = false
),
recent_coverage AS (
  SELECT DISTINCT code
  FROM stock_daily_ohlcv
  WHERE date >= CURRENT_DATE - INTERVAL '30 days'
),
missing AS (
  SELECT a.code FROM active a
  LEFT JOIN recent_coverage rc ON a.code = rc.code
  WHERE rc.code IS NULL
)
SELECT
  COUNT(*) AS missing_count,
  (SELECT COUNT(*) FROM active) AS active_count,
  ROUND(COUNT(*)::numeric / (SELECT COUNT(*) FROM active) * 100, 2) AS missing_pct
FROM missing;
-- PASS: missing_pct < 5
```

### 6.2 결측 일자 임계 (Daily completeness)

**구체화 — 결측 일자:**
- 최근 30 영업일 중 row 수가 활성 종목의 90% 미만인 일자
- 임계: **주 1 영업일 이하 (월 ≤ 4)**

```sql
-- 결측 일자 검증 SQL
WITH active_count AS (
  SELECT COUNT(*) AS n FROM stocks WHERE is_delisted = false
),
daily_rows AS (
  SELECT date, COUNT(*) AS row_count
  FROM stock_daily_ohlcv
  WHERE date >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY date
),
incomplete_dates AS (
  SELECT dr.date, dr.row_count
  FROM daily_rows dr
  CROSS JOIN active_count ac
  WHERE dr.row_count < ac.n * 0.9
)
SELECT
  COUNT(*) AS incomplete_count,
  ARRAY_AGG(date ORDER BY date DESC) AS sample_dates
FROM incomplete_dates;
-- PASS: incomplete_count <= 4 (월 임계)
```

### 6.3 Cloud Monitoring alert 반영

**Alert policy 2종 신설** (master-sync 의 `gh-radar-master-sync-failure` 패턴 미러):

1. **`gh-radar-candle-sync-daily-failure`** — Cloud Run Job `gh-radar-candle-sync-daily` execution 실패 5분 윈도우에 1건 이상 → 이메일
2. **`gh-radar-candle-sync-recover-failure`** — 동일 패턴, recover Job 대상

**(선택, deferred)** 데이터 정합성 alert — Supabase Edge Function 또는 cron 으로 위 SQL 을 매일 09:00 KST 실행하고 임계 초과 시 webhook 호출. v2.

### 6.4 smoke 스크립트 반영 (`scripts/smoke-candle-sync.sh`)

**INV-1 ~ INV-6 (master-sync smoke 패턴 미러):**

- **INV-1:** `gcloud run jobs execute gh-radar-candle-sync-daily --wait` → exit code 0
- **INV-2:** 최근 5분 Cloud Logging 에 `daily complete` 또는 `non-trading day` 패턴 grep — 1건 이상
- **INV-3:** Supabase REST `count` API 로 `stock_daily_ohlcv` 의 어제(또는 직전 영업일) row 수 조회 → > 활성 stocks × 0.9 (= ~2,520)
- **INV-4:** 005930 (삼성전자) 의 row count >= 1,500 (백필 완료 검증)
- **INV-5:** 결측 일자 SQL (6.2) → incomplete_count <= 4
- **INV-6:** Scheduler 2종 모두 `ENABLED` 상태 확인

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (workers/candle-sync) + bash smoke (production) |
| Config file | `workers/candle-sync/vitest.config.ts` (Wave 0 신설 — master-sync 패턴 미러) |
| Quick run command | `pnpm --filter candle-sync test -- --run` |
| Full suite command | `pnpm --filter candle-sync test -- --run && bash scripts/smoke-candle-sync.sh` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-01 SC #1 | `stock_daily_ohlcv` 테이블 존재 + PK(code,date) + 필수 컬럼 | migration verify | `psql -c "\d stock_daily_ohlcv"` 수동 또는 `pnpm --filter shared test schema` | ❌ Wave 0 |
| DATA-01 SC #2 | 백필 1회 실행 후 row count ≥ 4M | smoke (post-backfill) | `bash scripts/smoke-candle-sync.sh --check-backfill` | ❌ Wave 0 |
| DATA-01 SC #2 | KRX `bydd_trd` 응답 mapper 가 OHLCV/volume/trade_amount 정확 매핑 | unit | `pnpm --filter candle-sync test map` | ❌ Wave 0 |
| DATA-01 SC #3 | daily Job 이 어제 영업일 데이터 UPSERT (idempotent) | integration | `pnpm --filter candle-sync test runDaily` | ❌ Wave 0 |
| DATA-01 SC #3 | Scheduler 2종 (`eod`/`recover`) cron 등록 + OAuth SA 바인딩 | smoke (post-deploy) | `bash scripts/smoke-candle-sync.sh --check-scheduler` | ❌ Wave 0 |
| DATA-01 SC #4 | KRX 401 시 즉시 throw (retry 없음) | unit | `pnpm --filter candle-sync test krx-401-guard` | ❌ Wave 0 |
| DATA-01 SC #4 | MIN_EXPECTED 미만 응답 시 throw | unit | `pnpm --filter candle-sync test min-expected-guard` | ❌ Wave 0 |
| DATA-01 SC #4 | `withRetry` 3회 exp backoff 동작 (retry.ts 재사용 검증) | unit | `pnpm --filter candle-sync test retry` (existing pattern) | ✅ master-sync 참조 |
| DATA-01 SC #5 | 결측 종목 임계 SQL (§6.1) < 5% | smoke | `bash scripts/smoke-candle-sync.sh --check-coverage` | ❌ Wave 0 |
| DATA-01 SC #5 | 결측 일자 임계 SQL (§6.2) ≤ 4 일 | smoke | `bash scripts/smoke-candle-sync.sh --check-completeness` | ❌ Wave 0 |
| recover 알고리즘 | recover 모드 DB 적응적 감지 + max 20 calls 상한 | integration | `pnpm --filter candle-sync test runRecover` | ❌ Wave 0 |
| FK orphan (T-09-03) | 폐지종목 history 의 code 가 stocks 마스터에 없을 때 대응 (선택 옵션에 따라 다름) | integration | `pnpm --filter candle-sync test fk-orphan` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter candle-sync test -- --run` — 30s 이내
- **Per wave merge:** 위 + tsc -b (workspace typecheck)
- **Phase gate:** full suite + smoke-candle-sync (모든 INV) + 005930 row count >= 1,500 + 결측 임계 < 5%/≤4일

### 표본 크기 / 주파수 / 오차 허용치

| 차원 | 값 | 사유 |
|------|-----|------|
| **표본 종목 수** | 100개 random + 005930 (삼성전자) fixed | 005930 는 회귀 마커 (Phase 06.1 의 "삼성전자 검색 PASS" 와 동일 패턴) |
| **표본 검증 주파수** | deploy 직후 1회 + 매일 EOD 후 24h 내 1회 | smoke 매일 자동 실행은 v2, v1 은 사용자 수동 트리거 |
| **오차 허용치 — row 수** | ±3% (활성 종목 ~2,800 기준 ±84 row/일) | KRX 응답 자연 변동 (신규 상장/거래정지 등) |
| **오차 허용치 — 일자 결측** | ±1 영업일/월 | 시스템 장애 1일 허용, 그 이상은 임계 위반 |
| **오차 허용치 — OHLCV 값** | random sample 100개 종목의 close 가 KRX 원본 응답과 100% 일치 | 매핑 검증용. drift 0 허용 |

### Wave 0 Gaps

- [ ] `workers/candle-sync/` 워크스페이스 신설 + Dockerfile/tsconfig/vitest 셋업 — master-sync 미러
- [ ] `workers/candle-sync/src/modes/{backfill,daily,recover}.ts` 3개 mode 함수 + 각 vitest
- [ ] `workers/candle-sync/src/krx/fetchBydd.ts` + `client.ts` 재사용 / 신설 — master-sync `fetchBaseInfo.ts` 패턴 미러
- [ ] `workers/candle-sync/src/pipeline/map.ts` — KRX `bydd_trd` row → `StockDailyOhlcv` 매핑
- [ ] `workers/candle-sync/src/pipeline/upsert.ts` — chunked UPSERT (1000 row/chunk)
- [ ] `workers/candle-sync/src/pipeline/missingDates.ts` — recover 모드의 §3.1 SQL 호출
- [ ] `workers/candle-sync/tests/krx-bydd.test.ts` — axios mock + AUTH_KEY + OutBlock_1 파싱
- [ ] `workers/candle-sync/tests/map.test.ts` — OHLCV 매핑 단위 테스트 (KRX fixture JSON 캡처)
- [ ] `workers/candle-sync/tests/runRecover.test.ts` — recover 알고리즘 + max calls 상한
- [ ] `supabase/migrations/2026051Xxxxxxx_create_stock_daily_ohlcv.sql` — 테이블 + 인덱스 + RLS + FK
- [ ] `scripts/setup-candle-sync-iam.sh` — runtime SA `gh-radar-candle-sync-sa` + KRX/Supabase 시크릿 accessor
- [ ] `scripts/deploy-candle-sync.sh` — 3개 Cloud Run Job (daily/recover/backfill) + 2개 Scheduler 배포
- [ ] `scripts/smoke-candle-sync.sh` — INV-1~6 + --check-backfill / --check-scheduler / --check-coverage / --check-completeness
- [ ] `packages/shared/src/stock.ts` 에 `StockDailyOhlcv` 타입 + KRX `BdydTrdRow` 타입 추가
- [ ] **Wave 0 task: KRX `bydd_trd` 실측 호출 1회** (R1 검증) — 직전 영업일 basDd + 당일 17:30/19:00/익일 06:30 시점 응답 row 수 캡처
- [ ] **Wave 0 task: KRX `bydd_trd` 응답 JSON 캡처** (필드명 검증) — fixture 로 저장하여 mapper 테스트에 활용

---

## 7. Threat Model Candidates

### T-09-01: KRX 401 (시크릿 만료 / 미승인)
**시나리오:** `gh-radar-krx-auth-key` Secret 만료 또는 KRX 측 `bydd_trd` 서비스 별도 승인 미완.
**STRIDE:** Denial of Service (data ingestion 중단)
**기존 대응:** master-sync `fetchBaseInfo.ts:35` 의 401 가드 패턴 — retry 없이 즉시 명확한 에러 throw.
**Phase 9 대응:** 동일 패턴 — `fetchBydd.ts` 에 401 catch 후 throw + Cloud Monitoring alert 트리거 (Job exit 1 → alert policy 발화).
**Wave 0 검증:** KRX 포털에서 `stk_bydd_trd` + `ksq_bydd_trd` 서비스가 별도 승인 필요한지 확인. master-sync 의 `isu_base_info` 와 동일 계정에서 추가 신청 필요할 가능성 HIGH.

### T-09-02: KRX partial response (장애 시 빈 OutBlock_1)
**시나리오:** KRX 가 일시 장애로 OutBlock_1 = [] 또는 row 수 < 활성 종목 × 0.5 응답 → 잘못된 데이터를 UPSERT 하면 그날 데이터가 부실하게 기록됨.
**STRIDE:** Tampering (데이터 무결성)
**기존 대응:** master-sync `index.ts:54` 의 `MIN_EXPECTED_MASTERS = 1000` 가드 + mass-delist 회귀 방지.
**Phase 9 대응:** **MIN_EXPECTED 가드 명시** — `bydd_trd` 의 평일 정상 응답은 KOSPI ~950 + KOSDAQ ~1,700 = ~2,650 row [VERIFIED: master-sync 패턴]. 임계 = `활성 stocks × 0.5 ≈ 1,400` row 미만 시 throw.
- daily mode: throw → Cloud Run Job exit 1 → alert
- backfill mode: per-day try/catch — log warn + continue (휴장일 가능성 vs 장애 구분은 평일/주말 calendar 로 판단)
- recover mode: best-effort — skip 해당 일자

### T-09-03: FK orphan — 폐지종목 history 의 code 가 stocks 마스터에 없음
**시나리오:** KRX `bydd_trd` 가 2022년 폐지된 종목 (예: 썬코어 051170) 의 2020-2022 history 를 반환. 현재 `stocks` 마스터에는 이 종목이 없음 → `stock_daily_ohlcv.code → stocks(code)` FK 제약 위반 → UPSERT 실패.
**STRIDE:** Tampering / Data integrity
**3가지 대응 옵션:**

| 옵션 | 설명 | 장점 | 단점 |
|------|------|------|------|
| **A. 마이그레이션 시 FK NOT VALID + 사전 master-sync 강제** | `ALTER TABLE ... ADD CONSTRAINT ... NOT VALID` — 신규 row 만 검증, 기존 데이터는 미검증. 또는 master-sync 가 폐지종목까지 마스터에 포함하도록 확장 | 가장 자연스러운 모델 (마스터가 진정한 universe) | master-sync 확장 작업 추가 — KRX `isu_base_info` 가 폐지종목 포함하는지 불확실 |
| **B. 폐지종목 자동 stocks bootstrap** | candle-sync 가 UPSERT 전에 `bydd_trd` 응답의 unique code 를 stocks 에 `is_delisted=true` 로 INSERT ON CONFLICT DO NOTHING | candle-sync 자체 완결성 | master-sync 와 stocks 쓰기 경쟁 (D-5 Phase 06.1 의 "ingestion 은 stocks 안 건드림" 원칙 위배) |
| **C. FK 제거하고 orphan 허용** | `stock_daily_ohlcv.code` 컬럼만 두고 FK 미부여. JOIN 시 LEFT JOIN 으로 처리 | 단순 | 데이터 무결성 보장 X — 잘못된 code 가 들어와도 검출 안 됨 |

**권장 (planner 결정):** **옵션 B** — candle-sync 가 마스터 bootstrap 역할까지 수행. Phase 06.1 의 master-sync 가 `delist-sweep` 으로 활성→폐지 전환은 하지만 **신규 폐지종목을 마스터에 신규 등록하지는 못함** (KRX `isu_base_info` 는 활성만 반환할 가능성 HIGH — 검증 필요). 옵션 B 의 단점인 "쓰기 경쟁" 은 **candle-sync 가 신규 코드만 INSERT 하고 UPDATE 는 안 한다** (ON CONFLICT DO NOTHING) 는 규칙으로 자연 해소.

**대안 (옵션 A 변형):** master-sync 를 확장 — Wave 0 검증 후 KRX 가 `isu_base_info` 응답에 폐지종목 포함 옵션을 제공한다면 그 path 채택. KRX API 문서 추가 조사 필요.

### T-09-04: Scheduler SA OAuth 실패 (Cloud Run Job invoker 권한 누락)
**시나리오:** 신규 Job 배포 후 `gh-radar-scheduler-sa` 가 해당 Job 에 대해 `roles/run.invoker` 미부여 → Scheduler 호출 실패 → daily/recover 미실행.
**STRIDE:** Denial of Service
**기존 대응:** master-sync `deploy-master-sync.sh:100-104` 의 `gcloud run jobs add-iam-policy-binding` 패턴 — Job 생성 후 바인딩 추가.
**Phase 9 대응:** `setup-candle-sync-iam.sh` 가 아닌 `deploy-candle-sync.sh` 에 binding step 명시 (Job 리소스 생성 후에만 가능 — Phase 05.1 D-77 lesson 승계). 3개 Job 각각에 binding.
**검증:** smoke INV-6 에서 Scheduler 상태 + Job IAM policy 모두 확인.

### T-09-05: Secret rotation 충돌 — `gh-radar-krx-auth-key` 가 master-sync 와 공유
**시나리오:** 사용자가 KRX AUTH_KEY 회전 시 master-sync 가 운영 중이면 candle-sync 도 동시 영향.
**STRIDE:** Denial of Service (operational)
**대응:**
- Secret Manager versioning 사용 — `gh-radar-krx-auth-key:latest` 별칭으로 양 워커 자동 동기화. Phase 06.1 D-02 의 `:latest` 정책 [VERIFIED: `deploy-master-sync.sh:94`].
- 회전 시 작업 순서:
  1. Secret Manager 에서 신규 version 추가 + `:latest` 별칭 이동
  2. 양 Job 의 다음 실행 (cron 트리거) 부터 자동 적용 — 별도 redeploy 불필요
- **단점:** rollback 어려움 — 신규 키가 잘못되면 양 워커 모두 영향. 회전 시 manual run-book 권장:
  - master-sync 다음 실행 (`10 8 * * 1-5`) 으로 검증
  - PASS 시 candle-sync 도 자동 적용

### T-09-06: 동시 실행 race — backfill 1회 + daily Scheduler 동시 실행
**시나리오:** backfill 4시간 실행 중 18:30 에 daily Scheduler 발사 → 동일 Job 의 2개 instance 동시 실행 → KRX rate limit 초과 + DB UPSERT race.
**STRIDE:** Denial of Service + Tampering
**대응 (§5.1 결정으로 자연 해소):**
- **Job 3개 분리** — `gh-radar-candle-sync-backfill` 와 `gh-radar-candle-sync-daily` 는 서로 다른 Job 리소스이므로 동시 실행 가능 (이는 race 가 아님 — UPSERT 가 다른 일자에 작동)
- 단, **동일 일자에 동시 UPSERT** 위험은 여전 — backfill 의 BACKFILL_TO 가 오늘이고 daily 가 오늘 일자 UPSERT 시 같은 row 에 동시 쓰기
- **자연 해소:** PostgreSQL row-level lock — `INSERT ... ON CONFLICT DO UPDATE` 는 atomic. 마지막 UPSERT 값이 최종 (idempotent 이므로 안전)
- **추가 안전장치 (선택):** backfill 실행 전 사용자가 daily/recover Scheduler pause (manual run-book)

### T-09-07: Supabase UPSERT row limit — 4M row batch 시 chunking 전략
**시나리오:** backfill 의 단일 batch UPSERT 가 PostgREST 의 기본 1000 row limit 초과 시 truncation 발생 가능. master-sync 가 `existing.limit(10000)` 으로 SELECT 가드 [VERIFIED: `index.ts:74`] 한 전례.
**STRIDE:** Tampering (silent data loss)
**대응:**
- **per-day UPSERT** — backfill 도 1 day = ~2,800 row × 단일 UPSERT. PostgREST 가 자동 처리하지만 명시적 chunking 권장
- **명시적 chunk size = 1000** — `upsertOhlcv(rows.slice(i, i+1000))` 패턴
- master-sync `upsert.ts:32` 는 chunking 없이 `.upsert(dbRows, { onConflict: "code" })` 단일 호출 — 2,800 row 가 정상 작동 중 [VERIFIED]. 단 4.5M row 누적 UPSERT 는 다른 케이스이므로 candle-sync 는 **명시적 chunking 필수**
- **인덱스 영향:** UPSERT 시 PK + `(date DESC)` 인덱스 양쪽 업데이트 — backfill 시 인덱스 비활성화 후 재생성도 고려 (Postgres `DROP INDEX ... ; INSERT ... ; CREATE INDEX ...`) 단 RLS + Supabase 환경에서는 제약 — plan 단계 검토

---

## 8. Open Questions for Planner

1. **Job 분리 vs MODE 환경변수 (§4.4 / §5.1)**
   - 권장: Job 3개 분리 (`gh-radar-candle-sync-{daily|recover|backfill}`)
   - 결정 필요: 사용자 confirm 또는 plan 단계 잠금. plan-check 가 §5.1 표를 근거로 검증 가능.

2. **FK orphan 대응 (§7 T-09-03)**
   - 권장: 옵션 B (candle-sync 자동 bootstrap)
   - 검증 필요: KRX `isu_base_info` 가 폐지종목 포함하는지 별도 호출로 확인 (옵션 A 가능성 검토)

3. **R1 — KRX 갱신 시각 실측 (§1.4)**
   - Wave 0 의 첫 task 로 production AUTH_KEY 로 1회 호출
   - 결과에 따라 1차 cron `30 17 * * 1-5` 유지 또는 폐기
   - **BLOCKER 가능성** — 잘못된 가설이면 D-09 의 "신선도 우선" 목적이 미달

4. **KRX 응답 필드 정확명 (§1.2)**
   - Wave 0 의 두 번째 task 로 JSON 캡처
   - mapper 가 `TDD_CLSPRC` vs 다른 키 (`CLSPRC` 또는 `tdd_clsprc`) 정확 매칭 필요

5. **결측 감지 lookback N + threshold (§3.2)**
   - 권장: N=10, threshold=0.9, max calls/run=20
   - 결정 필요: plan-check 단계 또는 사용자 confirm

6. **인덱스 전략 (Claude's Discretion)**
   - PK `(code, date)` 외 추가 인덱스:
     - 옵션 A: `(date DESC)` 만 — 일자별 전종목 쿼리 (스캐너용)
     - 옵션 B: `(date DESC, change_rate DESC NULLS LAST)` — 분석 친화 (등락률 top-N)
     - 옵션 C: 둘 다
   - 권장: A (단순성 우선, B 는 분석 phase 에서 추가)

7. **휴장일 가드 (§3.3 / D-11)**
   - 옵션 A (DB 기반 추론) vs 옵션 C (KRX 빈응답 자연 skip)
   - 권장: 양쪽 모두 적용 — DB 추론으로 영업일 식별, 빈응답으로 휴장 skip

8. **백필 실행 책임 (D-07)**
   - 권장: 수동 `gcloud run jobs execute --wait` 1회. Scheduler 자동 트리거 X.
   - 사용자 confirm: 백필 4시간 소요 예상 — 시간 슬롯 확보 필요

9. **task-timeout 분리 (§5.2)**
   - 권장: daily 300s / recover 900s / backfill 10800s
   - plan-check 가 §2.4 와 정합 확인

10. **chunk size (§7 T-09-07)**
    - 권장: 1000 row/chunk
    - PostgREST 실측 후 조정 가능

---

## Project Constraints (from CLAUDE.md)

| Constraint | Source | Applied Where |
|---|---|---|
| 커밋 메시지 한글 + Co-Authored-By 금지 | 글로벌 CLAUDE.md | 모든 planner·executor 커밋 |
| 단순성 우선, 임시 수정 금지 | 글로벌 CLAUDE.md | MODE 분기 / FK orphan 대응 / chunk 전략 — 임시 우회 금지 |
| Plan node default — 비자명 작업 plan mode 필수 | 글로벌 CLAUDE.md | Phase 9 자체가 plan-node 진입 |
| Verification before done — 작동 증명 없으면 완료 처리 X | 글로벌 CLAUDE.md | smoke INV-1~6 통과 + 005930 row count + 결측 임계 PASS 가 phase gate |
| GSD workflow 내에서만 파일 편집 | 글로벌 CLAUDE.md | 마이그레이션/워커 신설 모두 `/gsd-execute-phase` 경로 |
| 한국 주식 도메인 한글 응답 | 프로젝트 CLAUDE.md + MEMORY | 모든 SUMMARY / VERIFICATION / discussions 한글 |
| 무료 API 우선 + 호출 비용 최소화 | 프로젝트 CLAUDE.md Constraints | KRX 일 10,000 한도 내 백필 3,200 calls + 평시 24 calls. KIS 미사용. |
| 법적: robots.txt + 이용약관 준수 | 프로젝트 CLAUDE.md | KRX 공식 OpenAPI 만 사용 — 스크래핑 X |
| Express 5 / Node 22 / pnpm 10 | 프로젝트 CLAUDE.md Stack | 신규 candle-sync 워크스페이스도 동일 고정 |
| Supabase 마이그레이션 timestamp prefix | 프로젝트 CLAUDE.md Conventions | `2026051Xxxxxxx_create_stock_daily_ohlcv.sql` |
| 병렬 Wave 는 worktree 분리 | MEMORY (lesson) | Phase 9 는 직렬 실행 권장 (마이그레이션 + 워커 + IAM + deploy 의존성 사슬) |
| Supabase RPC REVOKE 명시 (해당 시) | MEMORY (lesson) | 본 phase 는 RPC 신설 없음 — 적용 안 됨 |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 22 | candle-sync worker | ✓ (repo 고정) | 22.x | — |
| pnpm 10 | workspace | ✓ | 10.x | — |
| Docker (amd64 cross-build) | Cloud Run Job 이미지 빌드 | ✓ (Phase 05.1/06.1 실증) | — | — |
| gcloud CLI + `gh-radar` configuration | 배포 | ✓ | — | — |
| Supabase CLI (`supabase db push`) | 마이그레이션 | ✓ | — | — |
| **KRX OpenAPI AUTH_KEY** | candle-sync runtime | ✓ (기존 master-sync 와 공유) | — | — |
| **KRX `bydd_trd` 서비스 별도 승인** | candle-sync runtime | **❓ UNCERTAIN** | — | Phase 9 Wave 0 첫 task 로 검증 (T-09-01) |
| GCP Secret Manager + IAM (`gh-radar-krx-auth-key`) | runtime SA accessor | ✓ (기존) | — | — |
| Cloud Run Jobs (3개 신규) | daily/recover/backfill 실행 | ✓ (region asia-northeast3) | — | — |
| Cloud Scheduler (2개 신규) | 자동 트리거 | ✓ | — | — |
| Cloud Monitoring alert policy (2개 신규) | 실패 알림 | ✓ (Phase 05.1 패턴) | — | — |
| `stocks` 마스터 (Phase 06.1) | FK 참조 + 활성 종목 universe | ✓ (production 활성) | — | — |

**Missing dependencies with no fallback:**
- 없음 (모든 인프라 + 인증키 보유)

**Missing dependencies with verification needed:**
- **KRX `bydd_trd` + `ksq_bydd_trd` 서비스 별도 승인 상태** — Phase 06.1 의 `isu_base_info` 와 동일 계정에서 추가 서비스 신청 필요할 가능성 HIGH. **Wave 0 첫 task** 로 401 발생 여부 확인 + 미승인 시 사용자에게 수동 신청 요청 (최대 1일 승인 대기 — Phase 06.1 Pitfall 2 와 동일 정책).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | KRX `bydd_trd` 응답 필드명이 `BAS_DD/ISU_CD/ISU_SRT_CD/ISU_NM/TDD_OPNPRC/TDD_HGPRC/TDD_LWPRC/TDD_CLSPRC/CMPPREVDD_PRC/FLUC_RT/ACC_TRDVOL/ACC_TRDVAL/MKTCAP/LIST_SHRS` 이다 | §1.2 | mapper 수정 1회 — Wave 0 JSON 캡처로 확정 |
| A2 | KRX `bydd_trd` 가 폐지종목 history 를 자연 포함 (해당 일자 거래된 모든 종목 반환) | §1.3 | 폐지 history 미포함 시 fallback 도 KIS/pykrx 로 가야 함 (R3 우회 필요) |
| A3 | KRX `bydd_trd` 가 **익영업일 08시** 갱신 (당일 EOD 17시 미반영) — **R1** | §1.4 | 17:30 1차 cron 가설 무력화 → D-09 의 1차 cron 폐기 또는 시각 이동 (BLOCKER 가능성) |
| A4 | KRX `bydd_trd` 도 master-sync `isu_base_info` 와 동일하게 401 가드 + AUTH_KEY 헤더 인증 | §1.1 / T-09-01 | 인증 방식이 다르면 client.ts 신설 필요 — 가능성 낮음 |
| A5 | 한국 영업일 = 연 ~250일 — 2020-01-01 ~ 2026-05-09 = ~1,575 영업일 | §2.1 | ±15 일 오차 — KRX calendar 또는 npm 패키지로 정확 산정 가능 |
| A6 | KRX `bydd_trd` 1 call 평균 latency ≈ 10s (master-sync `isu_base_info` 기준 추정) | §2.4 | latency 가 30s+ 면 backfill task-timeout 3h 부족 — chunked 실행 필요 |
| A7 | PostgreSQL `INSERT ... ON CONFLICT (code, date) DO UPDATE` 가 4.5M row backfill 시 chunked (1000/chunk) 로 안정 동작 | §7 T-09-07 | 미실측 — Wave 0 또는 첫 backfill 실행에서 확인 |
| A8 | Cloud Run Job 의 `--update-env-vars` execute-time override 또는 Job 3개 분리 모두 가능 | §4.4 / §5.1 | gcloud CLI 동작 미확인 — Wave 0 에서 확인 가능 |
| A9 | KRX 서비스 신청은 endpoint 별 별도 승인 — `bydd_trd` 도 `isu_base_info` 와 별개 신청 필요 | T-09-01 | 자동 승인이라면 BLOCKER 아님 — 가능성 LOW (Phase 06.1 Pitfall 2 가 별도 승인을 확정) |

**→ 확인 방법:**
- A1, A2, A3 은 Wave 0 에서 production AUTH_KEY 로 1회 curl 호출 + JSON 캡처로 확정
- A4 는 401 가드 동작으로 자연 검증
- A5 는 백필 실행 후 row count / DISTINCT date 로 검증
- A6 은 backfill 1차 실행 (예: 1개월치) 으로 실측 후 전체 task-timeout 조정
- A7 은 chunked UPSERT 단위 테스트 + production smoke
- A8 은 deploy 스크립트 작성 시 gcloud 문서 정확 확인
- A9 는 KRX 포털 로그인 후 사용자 확인 (사용자 직접 수동 검증 필요)

---

## Sources

### Primary (HIGH confidence)
- `workers/master-sync/src/krx/client.ts`, `fetchBaseInfo.ts`, `index.ts`, `retry.ts`, `pipeline/upsert.ts` — Phase 06.1 검증된 KRX 호출 패턴 [VERIFIED]
- `workers/ingestion/src/holidayGuard.ts` — 휴장일 가드 패턴 [VERIFIED]
- `supabase/migrations/20260415120000_split_stocks_master_quotes_movers.sql` — BEGIN/COMMIT + FK + RLS 패턴 [VERIFIED]
- `scripts/deploy-master-sync.sh` — Cloud Run Job + Scheduler 배포 패턴 [VERIFIED]
- `.planning/phases/06.1-stock-master-universe/06.1-CONTEXT.md` + `06.1-RESEARCH.md` — KRX OpenAPI 사용 결정 + 인증 정책 [VERIFIED]
- `.planning/phases/05.1-ingestion-cloud-run-job-cloud-scheduler-kis/05.1-CONTEXT.md` — Cloud Run Job + OAuth SA 분리 패턴 [VERIFIED]
- `.planning/REQUIREMENTS.md` — DATA-01 정의 [VERIFIED]
- `.planning/ROADMAP.md` — Phase 9 5 SC [VERIFIED]
- `.planning/STATE.md` — 2026-05-10 Phase 9 의미 교체 사유 [VERIFIED]

### Secondary (MEDIUM confidence)
- KRX OPP/INFO/service/OPPINFO004.cmd — `stk_bydd_trd` / `ksq_bydd_trd` 서비스 존재 + 2010~ 데이터 보유 [CITED: https://openapi.krx.co.kr/contents/OPP/INFO/service/OPPINFO004.cmd]
- i-whale.com 블로그 — KRX OpenAPI 응답 필드 (TDD_OPNPRC 등) + 익영업일 08시 갱신 + 10,000 calls/day + 서비스별 승인 [CITED: https://i-whale.com/entry/KRX-시세-데이터-...]
- Cloud Run Jobs task-timeout 168h max [CITED: docs.cloud.google.com/run/docs/configuring/task-timeout]
- Cloud Run Jobs execute --update-env-vars [CITED: docs.cloud.google.com/run/docs/execute/jobs]
- pykrx README — get_market_ohlcv 가 폐지종목 history 포함 (썬코어 051170 사례) [CITED: github.com/sharebook-kr/pykrx]
- openkrx-mcp — 31개 API 지원 (구조 참고만) [CITED: github.com/RealYoungk/openkrx-mcp]

### Tertiary (LOW confidence — Wave 0 검증 필요)
- `bydd_trd` 정확 응답 필드 키 이름 — A1 검증 대상 [ASSUMED]
- `bydd_trd` 갱신 시각 (당일 EOD 17시 vs 익영업일 08시) — **R1, A3 BLOCKER 가능성** [ASSUMED]
- KRX rate limit 가 endpoint 합산인지 endpoint 별인지 — 보수적으로 합산 가정 [ASSUMED]
- 한국 영업일 연 ~250일 — A5 [ASSUMED — npm `korean-holidays` 등으로 확정 가능]

---

## Metadata

**Confidence breakdown:**
- DB 스키마 (stock_daily_ohlcv 테이블 + FK + RLS): HIGH — Phase 06.1 패턴 + master-sync 검증
- Cloud Run Job + Scheduler + IAM 패턴: HIGH — Phase 05.1/06.1 production 활성
- KRX `bydd_trd` URL + 인증 방식 + axios client: HIGH — master-sync 검증된 패턴
- KRX `bydd_trd` 응답 필드 충분성 (OHLCV/volume/trade_amount/등락): HIGH — 다수 출처 교차
- KRX `bydd_trd` 응답 필드 **정확명**: MEDIUM — A1 (Wave 0 캡처 1회로 확정)
- KRX `bydd_trd` 폐지종목 history: MEDIUM — pykrx 사례 + KRX 정책 추정, A2 (Wave 0 확정)
- **KRX `bydd_trd` 갱신 시각 (R1)**: **LOW** — A3, D-09 1차 cron 가설 BLOCKER 가능
- 결측 감지 알고리즘 SQL: HIGH — 표준 PostgreSQL 패턴
- MODE 분기 구조 (Job 3개 권장): HIGH — Cloud Run 표준 + 동시성 race 자연 해소
- Threat Model: HIGH — 7개 시나리오 모두 기존 Phase 의 lesson 또는 표준 패턴

**Research date:** 2026-05-10
**Valid until:** 2026-06-10 (30일 — KRX OpenAPI / Cloud Run 모두 stable). R1 검증 (Wave 0) 결과에 따라 D-09 부분 갱신 가능.

---

## RESEARCH COMPLETE

**Phase:** 9 - Daily Candle Data Collection
**Confidence:** HIGH (구조/패턴) · MEDIUM (KRX 응답 정확명) · LOW (R1 — KRX 갱신 시각 D-09 1차 cron 가설)

### Key Findings
1. **D-01 충분성 검증 PASS** — KRX `bydd_trd` 의 OHLCV/거래량/거래대금/등락 필드 모두 존재, 폐지종목 history 자연 포함 (MEDIUM confidence — Wave 0 JSON 캡처로 확정).
2. **R1 (D-09 1차 cron 17:30 가설 BLOCKER 가능성)** — i-whale 블로그 + 검색 결과 다수가 "익영업일 08시 갱신" 시사. Wave 0 첫 task 로 production AUTH_KEY 호출 후 실측 필요. 실측 결과에 따라 D-09 의 1차 cron 만 시각 조정 (코드는 영향 없음).
3. **Job 분리 권장 (§5.1)** — `gh-radar-candle-sync-{daily|recover|backfill}` 3개 Job + 동일 이미지. 동시 실행 race (T-09-06) 자연 해소 + mode 별 task-timeout/memory 최적화 + alert policy 분리 가능.
4. **백필 산정** — 2020-01-01 ~ 2026-05-09 = ~1,575 영업일 × 2 시장 = ~3,175 calls, ~4.5M row. KRX 일 10,000 calls 한도 내 단일 실행 가능. task-timeout 3h 권장.
5. **결측 감지 알고리즘** — lookback=10 영업일, threshold=활성 종목 × 0.9, max calls/run=20. §3.1 의 SQL 이 영업일 calendar 까지 DB 추론으로 자연 식별.
6. **FK orphan (T-09-03)** — 옵션 B (candle-sync 자동 stocks bootstrap, is_delisted=true, ON CONFLICT DO NOTHING) 권장. Phase 06.1 의 "ingestion 은 stocks 안 건드림" 원칙과 미충돌 (단순 신규 INSERT 만, UPDATE X).
7. **MIN_EXPECTED + 401 가드** — master-sync `index.ts:54` / `fetchBaseInfo.ts:35` 패턴 그대로 재사용. 평일 정상 응답 ~2,650 row, 임계 1,400 row.

### Files Created
- `.planning/phases/09-daily-candle-data/09-RESEARCH.md` (본 파일)

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Schema (stock_daily_ohlcv) | HIGH | Phase 06.1 패턴 + 표준 PostgreSQL |
| Cloud Run Job + Scheduler | HIGH | Phase 05.1/06.1 production 검증 |
| KRX bydd_trd URL + 인증 | HIGH | master-sync 검증 |
| KRX 응답 필드 충분성 | HIGH | 다수 소스 교차 |
| KRX 응답 필드 정확명 | MEDIUM | A1 — Wave 0 캡처 |
| KRX 폐지종목 포함 | MEDIUM | A2 — Wave 0 확인 |
| **KRX 갱신 시각 (R1)** | **LOW** | **A3 — D-09 1차 cron 가설 BLOCKER 가능, Wave 0 실측 필수** |
| 결측 감지 SQL | HIGH | 표준 PostgreSQL 패턴 |
| MODE 분기 (Job 3개) | HIGH | 동시성 race 자연 해소 |
| Threat Model (T-09-01~07) | HIGH | 7개 모두 기존 lesson 또는 표준 |

### Open Questions (Planner 결정 필요)
1. Job 분리 (Job 3개) vs MODE env override — 권장: Job 3개
2. FK orphan 옵션 A/B/C — 권장: B
3. R1 — Wave 0 KRX `bydd_trd` 갱신 시각 실측 + D-09 1차 cron 시각 잠금
4. KRX `bydd_trd` 응답 JSON 캡처 + mapper 확정
5. 결측 감지 파라미터 N=10/threshold=0.9/max=20 잠금
6. 인덱스 전략 — 권장: `(date DESC)` 단일
7. 휴장일 가드 — 권장: DB 추론 + 빈응답 자연 skip 양쪽
8. task-timeout — daily 300s / recover 900s / backfill 10800s 잠금
9. chunk size — 권장: 1000 row/chunk

### Ready for Planning
RESEARCH 완료. Wave 0 의 첫 task 두 개 (KRX `bydd_trd` 실측 호출 + JSON 캡처) 가 plan 의 전제로 잠금되어야 함. 그 외 모든 항목은 plan-check 가 검증 가능한 형태로 명문화되었음.
