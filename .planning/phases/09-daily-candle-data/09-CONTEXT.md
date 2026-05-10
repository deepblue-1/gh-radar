# Phase 9: Daily Candle Data - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

KRX 상장 전 종목(~2,800)의 **2020-01-01 ~ 현재** 일봉 OHLCV 데이터를 Supabase 신규 테이블에 수집·저장하고, 매 영업일 EOD 후 신규 영업일 데이터를 증분 갱신하는 데이터 레이어를 구축한다. 향후 가격 패턴/변동성/추세 등 분석 기능의 기반 데이터를 마련한다.

**포함:**
- 일봉 OHLCV 테이블 신설 (PK = code, date)
- 백필 워커 (`workers/candle-sync` 또는 동등 신설) — KRX `bydd_trd` 호출 → 일자×시장 단위 일괄 수집
- 초기 백필 (2020-01-01 ~ 현재, ~1,600 영업일 × 2 시장 = ~3,200 calls, ~4M 행 추정)
- 매 영업일 EOD 증분 자동화 — Cloud Run Job + Cloud Scheduler 이중 트리거 (17:30 KST 1차 + 08:10 KST 보완)
- 보완 잡의 결측 일자 적응적 감지 + 재호출
- 데이터 정합성 모니터링 — DATA-01 SC #5 (미수집 종목/결측 일자 임계)
- IAM/Secret/Scheduler/SA 구성 (Phase 05.1·06.1 패턴 승계)

**제외:**
- 수정주가(adj_close) 처리 — raw close 만 저장, 수정 처리는 후속 phase
- KIS chart API 연동, pykrx Python 컨테이너 — 본 phase 범위 아님
- market_cap·PER/PBR·관리종목 flag 등 부가 메타 — `stocks` 마스터 join 으로 대체 가능
- 차트 UI / 시계열 분석 화면 — 후속 phase
- 분/주/월봉 — 일봉만

</domain>

<decisions>
## Implementation Decisions

### 데이터 소스
- **D-01:** **KRX OpenAPI `bydd_trd` 단일 소스** — `/sto/stk_bydd_trd` (KOSPI) + `/sto/ksq_bydd_trd` (KOSDAQ). 날짜 × 시장 단위 1 call 로 전 종목 OHLCV 수신 (~2,800 행). 폐지/현재 활성 모두 자연 포함. RESEARCH 단계에서 데이터 충분성(필드 OHLCV/volume/trade_amount 모두 존재, 폐지종목 history 포함, 영업일 갱신 시각) 검증 필수. 검증 실패 시 fallback 은 KIS hybrid 또는 pykrx — planner 재결정.
- **D-02:** KRX 인증키 = `KRX_AUTH_KEY` 재사용 — `workers/master-sync/.env.KRX_AUTH_KEY` 와 동일 계정 공유. GCP Secret Manager 의 master-sync 시크릿 (`gh-radar-krx-auth-key`) 을 candle-sync runtime SA 에 `roles/secretmanager.secretAccessor` 부여하여 재사용. 새 시크릿 신설 X.

### 스키마
- **D-03:** 신규 테이블 (이름 planner 재량, 기본 후보 `stock_daily_ohlcv`):
  - PK = `(code, date)` — code FK → `stocks(code)` ON DELETE CASCADE (Phase 06.1 패턴)
  - 컬럼: `code text`, `date date`, `open numeric(20,2)`, `high numeric(20,2)`, `low numeric(20,2)`, `close numeric(20,2)`, `volume bigint`, `trade_amount bigint`, `change_amount numeric(20,2)`, `change_rate numeric(8,4)`, `inserted_at timestamptz default now()`
  - RLS: `anon SELECT` 허용 + `service_role` 쓰기 (Phase 06.1 stocks/stock_quotes 패턴 승계)
  - 인덱스: PK(code,date) 외 `(date DESC)` 추가 (date-range 쿼리용) — 정확한 인덱스 전략은 planner 재량
- **D-04:** **raw close 만 저장** — 수정주가(분할/증자 보정) 처리는 본 phase 범위 아님. KRX `bydd_trd` 응답 그대로 저장. v1 분석은 raw close 로 시작, 수정주가는 후속 phase 에서 별도 컬럼 또는 별도 테이블로 구축.
- **D-05:** market_cap 컬럼 신설 X — 필요 시 `stocks.listing_shares × close` 로 계산. KRX `MKTCAP` 응답을 저장하지 않음 (스키마 단순화).

### 백필 실행 모델
- **D-06:** 백필 범위 = **2020-01-01 ~ 실행 시점 직전 영업일**. ~1,600 영업일 × 2 시장 = **~3,200 calls**, 종목당 평균 ~1,500일치 = **~4M 행** 추정 (ROADMAP SC #1 의 "~2M 행" 은 plan 단계에서 "~4M 행" 으로 갱신).
- **D-07:** **단일 Cloud Run Job 한방 실행** + **idempotent UPSERT** (`ON CONFLICT (code, date) DO UPDATE`). 환경변수 `BACKFILL_FROM=2020-01-01`, `BACKFILL_TO=YYYY-MM-DD` 로 범위 지정. 수동 1회 실행 (자동 Scheduler 트리거 X). 중간 실패 시 재실행 자연 안전 (멱등). task-timeout 정확값(1h~) 은 RESEARCH 단계에서 KRX rate 실측 후 결정.
- **D-08:** Backfill 잡과 Daily 증분 잡은 **단일 코드/이미지 + MODE 환경변수** 로 통합. 예: `MODE=backfill` (BACKFILL_FROM/TO 사용) vs `MODE=daily` (basDd 자동 계산) vs `MODE=recover` (DB 결측 일자 감지 후 재호출). 책임 분리는 MODE 분기로, 이미지·Dockerfile·Job 정의는 1개. 정확한 분기 명세는 planner 재량.

### 증분 + EOD 타이밍
- **D-09:** **Scheduler 이중 트리거** — 신선도 우선 + 누락 보완:
  - **1차 잡:** `gh-radar-candle-sync-eod` — cron `30 17 * * 1-5` KST. MODE=daily, basDd=오늘. KRX 당일 데이터 조기 반영 시도.
  - **2차 잡 (보완):** `gh-radar-candle-sync-recover` — cron `10 8 * * 1-5` KST. MODE=recover. DB 적응적 결측 감지로 재호출.
  - idempotent UPSERT 로 양쪽 호출 안전. 1차에서 부분 응답이면 2차가 자연 보완.
  - ROADMAP SC #3 의 "EOD 17:00 KST" 는 의도 충실 — `30 17` 으로 30분 마진.
- **D-10:** **보완 잡 lookback = DB 적응적 감지** — 최근 N 영업일 (기본 10영업일 가정, planner 결정) 중 row 수가 임계(예: 활성 stocks 마스터 수 × 0.9) 미만인 일자만 식별 후 KRX 재호출. 정확한 알고리즘 (영업일 calendar 계산, threshold, max calls/run) 은 planner 재량. 비정상적으로 calls 폭증 방지를 위해 max calls/run 상한(예: 20) 둠.
- **D-11:** 휴장일 가드 — `workers/ingestion/src/holidayGuard.ts` 패턴 재사용 또는 KRX 휴장일 응답이 빈 `OutBlock_1` 인 점을 활용 (row count 0 → 자연 skip + log "non-trading day"). master-sync 의 `MIN_EXPECTED_MASTERS` 가드와 유사한 sanity 가드 — 영업일에 응답이 비정상적으로 적으면 throw (mass-delist 회귀 사고 방지).

### 인프라 / 운영
- **D-12:** Cloud Run Job 자원 = master-sync 패턴 따름 — `--cpu=1 --memory=512Mi --max-retries=0 --parallelism=1 --region=asia-northeast3`. task-timeout 은 backfill (1h+) vs daily (~120s) 가 다르므로 잡 또는 MODE 별로 분기. 정확값 RESEARCH/planner.
- **D-13:** SA 분리 — Phase 05.1 패턴 승계:
  - **runtime SA** (Job 실행): `gh-radar-candle-sync-sa@${PROJECT}.iam.gserviceaccount.com` — KRX/Supabase 시크릿 accessor + Job 실행 권한
  - **scheduler SA** (Scheduler invoker): 기존 `gh-radar-scheduler-sa` 재사용 (Phase 05.1) — `roles/run.invoker` 만 부여. OAuth `--oauth-service-account-email` 로 인증 (Cloud Run Job `:run` API). OIDC 금지 (Phase 05.1 D-07 정정).
- **D-14:** 배포 스크립트 = `scripts/deploy-master-sync.sh` 미러링. `scripts/setup-candle-sync-iam.sh` + `scripts/deploy-candle-sync.sh` + `scripts/smoke-candle-sync.sh` 신설. APP_VERSION=git SHA 주입, idempotent deploy.
- **D-15:** 모니터링 (DATA-01 SC #5):
  - Cloud Monitoring alert policy — Cloud Run Job execution 실패 1건/5분 → 이메일 (Phase 05.1 패턴)
  - DB 정합성 — Supabase view/RPC 또는 smoke 스크립트로 "최근 30 영업일 row count vs 활성 stocks 수" 비교 (구체 임계 planner)
  - DATA-01 SC #5 의 "임계 이하" 정의는 planner 가 명문화 — 본 CONTEXT 에서는 "결측 종목 < 활성 마스터의 5%, 결측 일자 ≤ 1 영업일/주" 정도를 가이드라인으로 제시.

### Claude's Discretion
- 결측 감지 알고리즘 정확 명세 (lookback N, threshold, max calls/run)
- 휴장일 가드 — holidayGuard.ts 직접 import vs KRX 빈응답 자연 skip 패턴 채택
- 인덱스 — `(code, date)` PK 외 `(date)` 만 추가 vs `(date, change_rate DESC)` 등 분석 친화 인덱스
- task-timeout 정확값 — RESEARCH 의 KRX rate 실측에 따라
- 테이블 이름 (`stock_daily_ohlcv` 기본 후보, 다른 이름도 가능)
- DATA-01 SC #5 임계 (위 D-15 가이드라인 기준 구체화)
- Backfill / Daily / Recover MODE 분기 구조 (단일 entry + switch vs 별도 함수 dispatch)
- KRX 응답 0 row 시점에서 빈 응답 vs 휴장 vs 장애 분기 로직
- ROADMAP SC #1 표현 갱신 시점 (plan 단계 vs 실측 후)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 프로젝트 기반
- `.planning/PROJECT.md` — 비전, 무료 API 제약, 배포 환경
- `.planning/REQUIREMENTS.md` §"Data" — DATA-01 신규 요구사항
- `.planning/ROADMAP.md` §"Phase 9: Daily Candle Data Collection" — 페이즈 목표 + 5개 SC
- `.planning/STATE.md` §"Roadmap Evolution" — 2026-05-10 Phase 9 의미 교체 사유

### 선행 phase CONTEXT (재사용 결정 + 패턴)
- `.planning/phases/06.1-stock-master-universe/06.1-CONTEXT.md` — KRX OpenAPI 사용 결정, master-sync 패턴, stocks 마스터 universe (D-7, D-8 발췌)
- `.planning/phases/05.1-ingestion-cloud-run-job-cloud-scheduler-kis/05.1-CONTEXT.md` — Cloud Run Job + Scheduler 패턴, SA 분리 (D-06~D-15), DEPLOY-LOG 형식
- `.planning/phases/01-data-foundation/01-CONTEXT.md` — Supabase 마이그레이션·RLS 컨벤션, retry 패턴

### 기존 코드 (재사용 대상)
- `workers/master-sync/src/krx/client.ts` — KRX axios 클라이언트 + AUTH_KEY 헤더
- `workers/master-sync/src/krx/fetchBaseInfo.ts` — KRX REST 호출 + 401 가드 패턴 (응용)
- `workers/master-sync/src/index.ts` — runMasterSync entry, MIN_EXPECTED_MASTERS 가드, delist-sweep
- `workers/master-sync/src/retry.ts` — `withRetry` 헬퍼
- `workers/master-sync/src/services/supabase.ts` — Supabase 클라이언트 생성
- `workers/master-sync/src/pipeline/upsert.ts` — UPSERT 패턴
- `workers/master-sync/Dockerfile` + `workers/master-sync/package.json` — 워커 스캐폴드 mirror 대상
- `workers/ingestion/src/holidayGuard.ts` — 휴장일 가드 패턴 (재사용 검토)
- `scripts/deploy-master-sync.sh` — Cloud Run Job 배포 스크립트 mirror 대상
- `scripts/setup-master-sync-iam.sh` — IAM/Secret/SA 설정 mirror 대상
- `scripts/smoke-master-sync.sh` — Job execute + DB 검증 mirror 대상

### Supabase 마이그레이션
- `supabase/migrations/20260413120000_init_tables.sql` — 초기 테이블 컨벤션
- `supabase/migrations/20260415120000_split_stocks_master_quotes_movers.sql` — `stocks` 마스터 + RLS + FK 패턴 (Phase 06.1, 본 phase 가 FK 의존)
- `supabase/migrations/20260413120100_rls_policies.sql` — anon SELECT + service_role 쓰기 정책

### 외부 스펙 (RESEARCH 단계 검증)
- KRX OpenAPI 포털: https://openapi.krx.co.kr — `stk_bydd_trd` / `ksq_bydd_trd` 엔드포인트 응답 필드, rate limit, 영업일 갱신 시각
- CLAUDE.md §"Stock Data Sources" — KIS·KRX·pykrx 비교 (fallback 후보)
- Cloud Run Jobs deploy 레퍼런스: https://cloud.google.com/sdk/gcloud/reference/run/jobs/deploy
- Cloud Scheduler → Cloud Run Job 인증: https://cloud.google.com/scheduler/docs/schedule-run-cloud-run-jobs (OAuth 사용)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`workers/master-sync/`**: 워커 구조 전체를 mirror — config/logger/retry/services/pipeline 디렉터리 구조, 진입점 패턴, withRetry, MIN_EXPECTED 가드 패턴 모두 그대로 적용 가능. Phase 9 워커는 `workers/candle-sync/` 로 신설.
- **KRX `AUTH_KEY` 헤더 + axios baseURL=`https://openapi.krx.co.kr/svc/apis`**: master-sync 가 검증한 인증/호출 패턴 그대로.
- **`scripts/deploy-master-sync.sh` + `setup-master-sync-iam.sh` + `smoke-master-sync.sh`**: 3종 스크립트를 그대로 mirror — Job 이름·SA 이름·시크릿 이름·alert policy 만 candle-sync 로 치환.
- **Phase 05.1 Scheduler invoker SA (`gh-radar-scheduler-sa`)**: 기존 SA 재사용. 새 candle-sync Job 에 `roles/run.invoker` 부여만 추가.
- **`workers/ingestion/src/holidayGuard.ts`**: 휴장일 가드 패턴 — 재사용 또는 KRX 빈응답 자연 skip 으로 단순화 (Claude's discretion).

### Established Patterns
- Supabase 마이그레이션 = `YYYYMMDDhhmmss_*.sql` + `BEGIN;…COMMIT;` (timestamp prefix 컨벤션)
- RLS = `anon SELECT` 허용 + `service_role` 쓰기 (Phase 06.1 stocks/stock_quotes 정책 승계)
- 워커 entry = `if (process.argv[1] && process.argv[1].endsWith("index.js")) main();` (vitest import 안전)
- Cloud Run Job 배포 = `gcloud run jobs deploy ...` + Scheduler `describe || create`/`update` idempotent 패턴 (Phase 05.1 D-02)
- APP_VERSION=git SHA 환경변수 주입 (Phase 2 D-35)
- 시크릿 명명 = `gh-radar-{kind}-{name}` (예: `gh-radar-krx-auth-key` 재사용)

### Integration Points
- 신규 테이블의 `code` FK → 기존 `stocks(code)` (Phase 06.1 마스터). 폐지종목 history 가 KRX 응답에 포함되면, 해당 종목의 stocks 마스터가 없을 수 있음 — UPSERT 전 stocks bootstrap 또는 FK 정책 (NOT VALID FK / orphan 허용 / 사전 master-sync 강제) 결정 필요 (planner).
- Cloud Run / Cloud Scheduler 리소스는 기존 프로젝트 `gh-radar` (region asia-northeast3) 에 추가.
- Supabase service_role 키는 기존 `gh-radar-supabase-service-role` 시크릿 재사용.

</code_context>

<specifics>
## Specific Ideas

- **사용자 명시 (2026-05-10):** "KRX bydd_trd 로 데이터가 충분한지 검증부터 하고 문제없으면 이걸로 하자" — RESEARCH 단계의 데이터 충분성 검증이 D-01 의 전제. KIS/pykrx fallback 가능성 열어두기.
- **사용자 명시 (2026-05-10):** "최근 3년이 아니라, 2020년 1월 1일부터 데이터를 모으고 싶어" — ROADMAP 의 "3년치" 표현보다 확장. ROADMAP SC #1 갱신 필요 ("3년치" → "2020-01-01 ~ 현재"; "~2M 행" → "~4M 행").
- **사용자 명시 (2026-05-10):** "수정주가로 저장하고 싶은데… KRX bydd_trd raw" — 본인 선호는 수정주가지만 raw 로 출발 (소스 변경/Python 도입 회피). 수정주가는 후속 phase 에서 별도 백필.
- **사용자 명시 (2026-05-10):** "17:30 1차 + 08:10 보완" — 신선도 우선 + 보완 패턴 명시. lookback = "DB 적응 감지" 로 calls 최소화.

</specifics>

<deferred>
## Deferred Ideas

- **수정주가(adj_close) 처리** — KIS chart `FID_ORG_ADJ_PRC` 또는 KRX 조정이벤트 API 또는 pykrx Python container 도입. 본 phase 범위 아님, 별도 후속 phase.
- **분/주/월봉 OHLCV** — 일봉만. 주/월봉은 SQL view 로 파생 가능, 분봉은 별도 phase.
- **부가 메타** (market_cap 컬럼, PER/PBR, 관리종목 flag, 외국인/기관 매매동향) — `stocks` 마스터 + KRX `MKTCAP` 응답 필드 등으로 미래 확장 가능. v1 분석 우선순위 아님.
- **차트 UI / 시계열 분석 화면** — Phase 9 는 데이터 레이어만. 시각화는 별도 phase.
- **분석 RPC / 가격 패턴 식별 함수** — DATA-01 의 후속 사용처 (예: "20일 신고가 종목 스캐너", "이격도 차트" 등). 후속 phase.
- **외국 종목 (NYSE/NASDAQ)** — REQUIREMENTS Out of Scope. v2.

</deferred>

---

*Phase: 09-daily-candle-data*
*Context gathered: 2026-05-10*
