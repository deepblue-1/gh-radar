# 결정 로그 아카이브

출처: `.planning/STATE.md` `### Decisions` 에서 2026-09-24 이관(quick-260924-blo). 항목은 원문 그대로이고, phase 별로 묶었으며 각 묶음 안은 원문 순서다.
STATE.md 에는 Phase 18 최근 10건만 남는다 — 이 파일은 그 10건을 포함한 전량(290건)이다. 새 결정은 계속 STATE.md `### Decisions` 에 쌓인다.

## Phase 01

- Phase 1: KIS 실계좌 사용 결정 (모의투자 대신) → readOnlyGuard 안전장치 적용
- Phase 1: TR ID FHPST01700000 확정, 마켓코드 J(KOSPI)/NX(KOSDAQ)
- Phase 1: 등락률 순위에 상한가/하한가 없음 → inquirePrice(FHKST01010100) 2단계 파이프라인
- Phase 1: 휴장일 감지 acml_hgpr_date 기반 (bsop_date 없음)
- Phase 1: pnpm 8→10 업그레이드 (Node 22 호환)
- Phase 1: .nvmrc=22, Docker도 node:22-alpine (2026-04-13 Node 22 통일; 초안은 Docker=20이었으나 로컬=Prod 일치 우선, 모든 deps pure JS라 alpine 22 리스크 없음)

## Phase 02

- Phase 2 준비: Node 22 LTS 기준으로 CONTEXT/RESEARCH 정렬, `package.json` engines `>=22`

## Phase 04

- [Phase 04]: AppShell hideSidebar prop — 기본 false 로 /design 카탈로그 회귀 없이 v1 전 페이지 헤더 전용 모드 적용
- [Phase 04]: apiFetch 클라이언트: Phase 2 envelope 파싱 + X-Request-Id 캡처 + 8s 타임아웃, ApiClientError 단일 클래스 통합
- [Phase 04]: /scanner ISR 30s (revalidate=30 + cache:'force-cache') 로 /api/health 폴링 과도호출 방지

## Phase 05.1

- [Phase 05.1]: Cloud Run Job invoker 바인딩은 setup-ingestion-iam.sh가 아닌 deploy-ingestion.sh §5.5에 배치 (Job 리소스 생성 후에만 가능)
- [Phase 05.1]: Scheduler → Cloud Run Job 인증은 --oauth-service-account-email 전용 (OIDC 금지, Pitfall 2)

## Phase 06

- [Phase 06]: useDebouncedSearch 는 AbortError 를 name 체크로 명시 스킵 — aborted flag 만으로는 race window 발생
- [Phase 06]: Plan 03: CommandDialog 가 shouldFilter prop 미 forward → 내부 <Command shouldFilter={false}> 래핑 + CommandLoading export 부재로 div 로 치환
- [Phase 06]: [Phase 06 Plan 04]: Number 컴포넌트는 NumberDisplay 별칭으로 import — JS 전역 Number.isFinite shadow 방지
- [Phase 06]: [Phase 06 Plan 04]: StockDetailClient 에러 패턴 — 404 만 notFound() 분기, 그 외는 state 유지하여 stale-but-visible + 인라인 에러 카드
- [Phase 06]: [Phase 06 Plan 05]: /stocks/[code] 라우트는 'use client' + React.use(params) 로 Next 15 Promise params 처리 — 서버 컴포넌트 초기 fetch 대신 전체 클라이언트 경로 채택 (스캐너와 일관, refresh 훅 단순화)

## Phase 09

- [Phase 09-daily-candle-data]: [Phase 09 Plan 01]: stock_daily_ohlcv 마이그레이션 SQL — FK NOT VALID + 런타임 stocks bootstrap (T-09-03 옵션 B), production push 는 Plan 06 [BLOCKING] task 에서
- [Phase 09-daily-candle-data]: Plan 02: vitest passWithNoTests:true — placeholder 워크스페이스에서 0 test exit 0 보장; krxBaseUrl default = data-dbg.krx.co.kr/svc/apis (RESEARCH §1.1 production 검증된 URL 직접 잠금, master-sync 와 의도적 차이)
- [Phase 09-daily-candle-data]: Plan 03: 결측 감지는 RPC 가 아닌 client-side N+1 패턴 (활성 stocks count + lookback distinct date + per-date head:true count) — Supabase JS v2 가 raw GROUP BY 제한적이라 head:true count 의 명료성 우선. lookback 영업일은 DB distinct date 기반 추론 (RESEARCH §3.3 옵션 A). Vitest mock 은 thenable 흉내 없이 final method 에서 mockResolvedValue — Supabase v2 builder 충분히 지원.
- [Phase 09-daily-candle-data]: Plan 04: config.basDd optional 추가 (BAS_DD env, daily mode 수동 재실행 override) + backfill MIN_EXPECTED 정책=throw (RESEARCH §7 warn+continue 와 의도적 차이 — 한 영업일 부분 응답이 ~4M row 오염 위험) + mock basDd 분기 패턴 (call counter race 회피, withRetry 호환)
- [Phase 09-daily-candle-data]: Plan 05: Cloud Run Job 3개 분리 (RESEARCH §5.1 채택) — daily/recover/backfill 동일 이미지 + Job 별 default MODE env, task-timeout/memory mode 별 최적화, race 자연 방지(T-09-06), alert policy 분리. Scheduler 2종 OAuth (OIDC 금지, Phase 05.1 D-07 lesson 승계). runtime SA gh-radar-candle-sync-sa 최소권한 (KIS 시크릿 미바인딩, T-09-04.1). backfill 은 alert 제외 (수동 실행). 본 plan 은 스크립트 작성만 — Plan 06 이 실제 실행.

## Phase 09.1

- [Phase 09.1]: Plan 01: RPC #1 의 ON CONFLICT 에서 open 의도적 omit (STEP2 가 정확값 덮어쓰기, EOD 17:30 overlay 가 최종 보완) — D-33 / T-09.1-03
- [Phase 09.1]: Plan 01: RPC #2 의 ON CONFLICT 에서 close/volume/trade_amount/change_amount/change_rate 의도적 omit — STEP1 매분 갱신 컬럼 보호 (D-34, T-2)
- [Phase 09.1]: Plan 01: kis_tokens DROP 은 Wave 0 파일 생성, Wave 4 cutover 마지막 step 에서만 push (KIS ingestion 가용성 보장 — T-09.1-04)
- [Phase 09.1]: Plan 01: 모든 신규 RPC + kiwoom_tokens 에 REVOKE 3줄 명시 (PUBLIC + anon,authenticated + GRANT service_role) — feedback_supabase_rpc_revoke 룰 준수
- [Phase 09.1]: Plan 02: kiwoom raw 타입에 인덱서 (`[key:string]: string`) 의도적 미사용 — kis.ts (인덱서 사용) 와 의도적 차이. 명시 필드 + 타입 안전성 우선. 추가 필드 필요 시 본 타입 확장 (R3).
- [Phase 09.1]: Plan 02: IntradayOhlcUpdate.marketCap 의 mac 단위 가설 = 억원 (R2). Plan 04 fixture 캡처가 단위 확정 — 가설 틀려도 mapper parseMac 1줄 변경으로 해결, 본 타입 변경 불필요.
- [Phase 09.1]: Plan 03: candle-sync 1:1 mirror 로 workers/intraday-sync 스캐폴드 — MODE dispatch 의도적 제거 (단일 cycle). redact 7 paths (kiwoomAppkey/kiwoomSecretkey/headers.authorization/access_token/accessToken/token/supabaseServiceRoleKey) — T-09.1-07 mitigate.
- [Phase 09.1]: Plan 03: tuning env defaults — MIN_EXPECTED_ROWS=1500 (휴장일 guard), HOT_SET_TOP_N=200 (D-11), KA10001_RATE_LIMIT=24 req/s (사용자 2026-05-13 실측). 모두 env override 가능.
- [Phase 09.1]: [Plan 04] parseSignedPrice 1 함수가 +/- 부호 분리 + 절댓값 + direction(up/down/flat) 한번에 처리 — D-09. flu_rt/pred_pre 는 parseOptionalSignedNumber 로 부호 유지 별도. trim/comma strip/Number.isFinite 가드 포함.
- [Phase 09.1]: [Plan 04] tokenStore 는 axios 직접 호출 (createKiwoomClient 미사용) — token endpoint 는 Bearer 미필요. upsert onConflict=token_type 으로 race idempotent (T-09.1-13 accept). parseKiwoomExpiresDt 가 'YYYYMMDDhhmmss' KST → UTC 변환.
- [Phase 09.1]: [Plan 04] fetchKa10027 의 hard cap 5000 + cont-yn=Y AND next-key 둘 다 있어야 loop 진행 (T-09.1-14). 401 → '키움 401' / 429 → '키움 429' / return_code != 0 → return_msg 분류 throw (T-09.1-11/12).
- [Phase 09.1]: [Plan 05] parseMac (×10^8) 가설 단위=억원을 1줄 격리 — Plan 06 production smoke 시 확정. 잘못된 단위 시 함수 1줄 + mapOhlc.test.ts expectation 1줄 변경만으로 정정 (T-09.1-15 mitigate).
- [Phase 09.1]: [Plan 05] fetchKa10001ForHotSet 가 Promise.allSettled (Promise.all 아님) + 각 호출 직전 acquireKiwoomRateToken — 종목별 실패가 cycle 중단 안 함 (T-09.1-16) + token bucket 자연 직렬화 (T-09.1-17).
- [Phase 09.1]: [Plan 05] computeHotSet = top N ∪ watchlist unique (Set 자료구조). watchlist 빈 → top N 만 정상 동작 (T-09.1-18 mitigate). user_id 미노출 (stock_code 만 SELECT).
- [Phase 09.1]: [Plan 06] rebuildTopMovers 가 marketMap 인자 추가 — top_movers 의 name/market NOT NULL 제약 충족 (PLAN 원안 미반영, Rule 1 Bug 자동 수정). DELETE 패턴도 .gte('rank', 0) → .neq('code', '') 변경 (rank=NULL 회피).
- [Phase 09.1]: [Plan 06] runIntradayCycle 통합 — STEP1 (ka10027 fetch → bootstrap → mapping+dedupe → market join → RPC #1 + stock_quotes + top_movers) → STEP2 (computeHotSet → ka10001 Promise.allSettled → mapping → RPC #2 + stock_quotes) 직렬 dispatch. 휴장일/partial 가드 (0 row exit 정상, < MIN_EXPECTED throw). dedupe Map by code 로 페이지 경계 중복 자연 제거.
- [Phase 09.1]: [Plan 06] STEP1/STEP2 stock_quotes UPSERT 의도적 컬럼 분리 — onConflict=code 가 페이로드 컬럼만 UPDATE 특성 활용. STEP1 (price/change/volume/trade_amount/name/market) 과 STEP2 (open/high/low/upper/lower/market_cap) 서로 다른 컬럼 → 자연 race-free (T-09.1-21 mitigate).
- [Phase 09.1]: [Plan 07] server/src/kis/* → server/src/kiwoom/* 4 모듈 신설 (worker Plan 04 mirror). createKiwoomRuntime 의 { client, getToken } 페어 stateless 패턴 — 매 요청 getKiwoomToken 재조회. cached SELECT 를 키움 호출 이전에 수행 (Rule 1 Bug — mock upsert overwrite + production race 회피).
- [Phase 09.1]: [Plan 07] StockQuoteRowUpsert = Omit<StockQuoteRow, 'volume'|'trade_amount'> — D-22 R3 RESOLVED. inquirePriceToQuoteRow 가 partial row 반환 → Supabase upsert 가 명시 컬럼만 SET → STEP1 ka10027 의 매분 trade_amount/volume 보존. server tests 121/121 + typecheck/build exit 0.
- [Phase 09.1]: [Plan 07] KIS env optional 화 (kisAppKey/Secret default '') + KIWOOM_APPKEY/SECRETKEY required get(). server/src/kis/* + services/kis-runtime.ts 는 무변경 (dead code 잔존) — Wave 4 Plan 11 cleanup 안전 deletion 대기. tests/setup.ts 가 KIWOOM env 주입 (test loadConfig throw 회피).
- [Phase 09.1]: [Plan 08] candle-sync setup/deploy/smoke/alert 4 파일 1:1 mirror + VPC stack 확장 — Static IP 1개를 Cloud Run Job (intraday-sync) + Cloud Run service (server) 공유 (D-29). compute.networkUser 3 바인딩 (Service Agent + intraday-sync SA + default compute SA, RESEARCH §4.7). Scheduler cron '* 9-15 * * 1-5' Asia/Seoul + task-timeout=60s. OAuth (OIDC 금지, T-09.1-34 mitigate).
- [Phase 09.1]: [Plan 08] KIWOOM Secrets 빈 secret 신설 + KIS env/secret 의도적 유지 (Wave 4 cleanup 까지 transition) — setup 스크립트가 gcloud secrets create 만 + accessor 바인딩, value 등록은 Plan 09 [BLOCKING] 사용자 액션. deploy-server.sh 가 KIS_APP_KEY/SECRET + KIWOOM_APPKEY/SECRETKEY 동시 보유, kis-runtime.ts dead code (Plan 07). VPC stack 존재 확인 게이트로 server 재배포 시 잘못된 outbound 사고 방지 (T-09.1-36).
- [Phase 09.1]: [Plan 09] 키움 ka10027 stex_tp='3' (통합) 필수 파라미터 추가 — 키움 spec 변경 (2026-05-15) 대응. MIN_EXPECTED_ROWS 1500→800 (실측 900~1175).
- [Phase 09.1]: [Plan 09] stock_quotes payload 의 name/market 키 미포함 + upper_limit/lower_limit 한국 시장 일일변동폭 ±30% 임시값 채움. PLAN 06 의 잘못된 컬럼 가정 정정.
- [Phase 09.1]: [Plan 09] upsertQuotesStep2 UPSERT → 종목별 UPDATE — Supabase upsert(onConflict) 가 INSERT 분기에서 모든 NOT NULL 평가하는 함정 회피. ~250 종목 직렬 호출 수십 ms (60s cycle 매우 여유).
- [Phase 09.1]: [Plan 09] STEP2 hot set 을 STEP1 처리 종목으로 intersect — watchlist 종목 중 ka10027 미응답 종목이 STEP2 신규 INSERT 시도하는 문제 해소. dropped 카운트 로그.
- [Phase 09.1]: [Plan 10] server Cloud Run service 재배포 (revision gh-radar-server-00015-zr5, image fe96bec) — Direct VPC Egress (gh-radar-vpc + gh-radar-subnet-an3 + vpc-egress=all-traffic) + KIWOOM secret (APPKEY+SECRETKEY:latest) 적용. 종목 상세 페이지가 키움 ka10001 동기 호출로 전환. smoke 9/9 + Cloud Logging Kiwoom runtime ready (tokenLen=86) + GET /api/stocks/005930+000660 200 검증. KIS env/secret 잔존 (Plan 11 cleanup).
- [Phase 09.1]: [Plan 10] Cloud Run service Direct VPC Egress 패턴 — annotation run.googleapis.com/network-interfaces + vpc-access-egress=all-traffic 으로 Serverless VPC Access connector 없이 native VPC 연결. Cloud Run Job (intraday-sync) + service (server) 가 동일 VPC + Cloud NAT 공유, Static IP 34.64.195.151 1개로 키움 IP whitelist 운영 통합 (D-29 충족).
- [Phase 09.1]: [Plan 10] cold-start 약 3초 (예측 1-2분 대비 우수) — min-instances=1 유지 + Cloud Run 의 빠른 instance startup. RESEARCH §4.6 T-12 의 예측보다 좋게 동작. server 이미지 빌드 (Plan 07 코드) 가 production schema 와 자연 호환 (Plan 09 의 worker 5건 deviation 패턴이 server 측 발생 안 함).
- [Phase 09.1]: [Plan 10] Cloud Logging 검색 시 pino 의 실제 필드명은 jsonPayload.message (msg 아님) — Plan 본문 검증 쿼리의 jsonPayload.msg 패턴은 미동작. 향후 GCP 로그 검색 시 jsonPayload.message 사용. 본 plan 에서 자연 정정.
- [Phase 09.1]: [Plan 11] KIS ingestion 완전 폐기 (RESEARCH §12 11-step). 데이터 정합 검증 (Scheduler PAUSE 후 10분 대기 + intraday-sync 단독 운영 870 row 5분 갱신 확인) → GCP 리소스 7개 삭제 (Job + Scheduler + SA + Secrets×3 + Alert) → kis_tokens DROP migration push (PGRST205) → 47 파일 git rm/edit + commit db391ac. PLAN 본문은 KIS secret 2개만 명시했으나 GCP 에 gh-radar-kis-account-number 추가 발견 — Rule 2 (Auto-add critical) 로 함께 삭제.
- [Phase 09.1]: [Plan 11] server 재배포 시 `gcloud run deploy --update-secrets` 가 기존 KIS secret binding 을 **누적**하여 첫 deploy 가 "Permission denied on secret: gh-radar-kis-app-key" 로 실패. Rule 3 (Auto-fix blocking) — `gcloud run services update --remove-secrets=KIS_APP_KEY,KIS_APP_SECRET --remove-env-vars=KIS_BASE_URL` 로 명시 제거하여 새 revision gh-radar-server-00017-mrm (image db391ac) 활성화. lesson — Cloud Run 의 secret binding 변경 시 `--remove-secrets` 명시 필수.

## Phase 09.2

- [Phase 09.2]: Plan 02: useEffect 3-effect 분리 (mount/theme/rows) — theme 변경 시 chart 인스턴스 재생성 회피 + Volume bar per-bar color 도 theme effect 에서 재주입 (Pitfall 6 fix)
- [Phase 09.2]: Plan 02: error.message 의도적 미노출 (T-09.2-07 mitigate) — generic 카피 + console.error 분리. PostgREST/RLS 내부 정보 누설 표면 0
- [Phase 09.2]: Plan 02: 단위 테스트는 lightweight-charts 전체 mock — jsdom 에서 Canvas 렌더링 불가, 시각 검증은 Manual Verification (Plan 03 checkpoint) 책임
- [Phase 09.2]: 캔들스틱 차트 채택 — REQUIREMENTS.md Out of Scope 정책 반전 (사용자 명시 2026-05-15, 상세 페이지 자체 완결성 우선). 라이브러리 = lightweight-charts 5.2.0 (RESEARCH 비교 후 lock-in: 번들 +4 kB / 캔들+Volume 네이티브 / 트레이더 친숙도). 데이터 = webapp → Supabase PostgREST 직접 호출 (Phase 06.2 watchlist 패턴 mirror). Pitfall 9 (oklch parser 거부) → chart-colors.ts utility 모듈로 회귀 방지. Pitfall 6 (다크모드 자동 분기 미작동) → next-themes useTheme + chart.applyOptions effect 로 production 해결.

## Phase 10

- [Phase 10]: Plan 01: theme-sync logger.ts 는 master-sync named export `logger` 형태 채택(discussion-sync factory 아님) — retry.ts `import { logger }` 호환 + redact paths 만 theme-sync 시크릿(brightdata/anthropic/supabase service-role/token)으로 교체 (T-10-01-01 mitigate)
- [Phase 10]: Plan 01: alpha-all-themes.json 실측 548KB(27카테고리)→정치(full 39테마,이재명 id=6)+반도체(2테마) 트리밍 — CLAUDE.md 크롤링 5원칙 #5(부분캐싱·전체덤프 금지) + POLITICS_CATEGORIES 필터 포함/제외 양방향 검증. 네이버 HTML 은 cheerio td.name>div.name_area>a 선택자 컨텍스트 보호 위해 실측 full page 미트리밍 보존
- [Phase 10]: Plan 01: 워커 스캐폴드 패턴 = master-sync(package/tsconfig/retry/supabase) + discussion-sync(vitest passWithNoTests) 1:1 복제 후 name/redact 치환. 외부 소스 둘 다 curl 200 OK(차단 없음) → 실측 fixture 고정(RESEARCH valid_until 2026-07-09)
- [Phase 10]: Plan 02: 시스템/유저 테마를 테이블 분리 없이 단일 themes(is_system 플래그 + owner_id NULL 분기 + norm_key partial-unique)로 모델링 (D-01) — "충돌 0"은 RLS + WITH CHECK 가 강제, theme_stocks 조인 1개 유지로 목록·종목칩 UNION 회피 + fork=INSERT-SELECT 단순화
- [Phase 10]: Plan 02: 공개 read 정책(read_system_themes / read_theme_stocks) TO anon, authenticated 둘 다 명시 (Pitfall 3, feedback_supabase_rls_authenticated) — anon-only 시 로그인(JWT authenticated) 사용자 default-deny 빈 응답 회귀 방지. owner_id REFERENCES auth.users(id) ON DELETE CASCADE + CHECK themes_owner_consistency 무결성. 종목수/테마수 50-limit 은 RLS subquery 금지(recursion+42501 구분불가) → BEFORE INSERT trigger P0001 (시스템=service_role 무제한)
- [Phase 10]: Plan 02: production db push 적용 완료 + 검증 — `supabase db push --yes` 가 20260609120000_theme_tables.sql 적용(exit 0), dry-run 재실행 "Remote database is up to date", service_role REST GET themes/theme_stocks 200(테이블 존재), anon REST GET themes?is_system=eq.true 200(read_system_themes 활성). 시드 부재로 빈 배열이나 default-deny 아님 = RLS 정상
- [Phase 10]: Plan 02: [Rule 3 - 포매팅] acceptance-criteria 리터럴 lowercase grep(`references stocks(code)` / `owner_id uuid REFERENCES auth.users`) ↔ repo uppercase-SQL 컨벤션 양립 — canonical DDL 은 uppercase REFERENCES 유지 + 동일 라인 trailing 주석에 lowercase 앵커 병기. 스키마/동작 무영향 (주석은 SQL 무시)
- [Phase 10]: Plan 03: backoff 상태를 api_usage 재사용(service=theme_*_backoff, count=backoff-until epoch ms)으로 저장 — 신규 마이그레이션 회피. 콘텐츠 SHA256 은 hex 앞 13자리(52bit) 정수 다이제스트로 api_usage.count 저장/비교(변경 감지용)
- [Phase 10]: Plan 03: 직접 fetch → 403/429/undefined-status 시 Bright Data 프록시 1회 폴백(자동 지수 재시도 금지, 5원칙 #4). EUC-KR 은 arraybuffer+iconv(Pitfall 2), 알파는 zod 검증 JSON. 둘 다 차단 시 markBackoff(24h) → 다음 cycle skip
- [Phase 10]: Plan 03: 보수적 norm_key 정규화(NFKC+소문자+공백/특수문자 제거, 괄호 보존, Levenshtein 금지) — 'AI챗봇'='ai 챗봇' 병합, 'HBM(고대역폭메모리)'≠'HBM' 분리. upsertThemes 는 stocks .in() 청크(200) FK skip + theme_stocks 청크(500) + effective_to soft-제외 이력
- [Phase 10-theme-classification]: 10-04: 테마 상위3평균을 server 실시간 계산(A2)으로 — stock_quotes.change_rate 매 요청 재계산(scanner.ts 동형), DB precompute 컬럼은 캐시 폴백용. '지금 뜨는 테마' 신선도(D-14).
- [Phase 10-theme-classification]: 10-04: /api/themes 두 라우트 모두 stock_quotes/.in() 청크(200)+error throw — 테마 종목 합집합 가변 대규모, 37afcde 강세장 빈응답 회귀 선제 차단.
- [Phase 10-theme-classification]: 10-04: GET /api/themes(:id) 가 is_system=true 만 조회 — 유저 테마 id 404. 유저 테마는 webapp→Supabase RLS 직접 경로(Plan 05)라 service_role 라우트 격리(T-10-04-04).
- [Phase 10]: 유저 테마 CRUD/fetch/fork 전 경로 Supabase 직접(Express 미경유) — RLS owner-only 격리 + is_system=false 명시로 위조 차단 (10-05)
- [Phase 10]: fork = 단일 테이블 INSERT-SELECT 스냅샷, active 멤버십(effective_to IS NULL)만 source='user' 복사 (D-05, 10-05)
- [Phase 10]: P0001 50-limit 을 isThemeStockLimitError 헬퍼로 식별 + useThemesQuery 가 두 소스 60s 합성(비로그인 myThemes=[]) (10-05)
- [Phase 10]: 10-06: 펜스-tolerant JSON 추출을 parseJson.extractJsonObject 공유 유틸로 — Haiku 가 'JSON only' 지시에도 ```json 펜스로 감싸 discover/correct 두 파서의 JSON.parse 가 throw → 발굴 0건(POC 실측 라이브 버그). 첫 '{'~마지막 '}' 슬라이스로 두 파서 공유 수정. mocked 테스트가 못 잡은 사각지대.
- [Phase 10]: 10-06: 보수적 cross-chunk dedup(collapseNearDuplicates) — POC 36 후보 중 ~55% 가 청크별 같은 테마 변형명 재발굴. 병합 조건 EITHER (a)종목코드 ≥2 공유 OR (b)norm_key substring 포함(짧은쪽 길이≥4 가드). edit-distance 금지, 불확실 시 KEEP BOTH(normalizeName 보수 원칙 승계). 병합 시 더 일반적(짧은) 이름 canonical+stockCodes 합집합+confidence max.
- [Phase 10]: 10-06 POC 실측: 5 Claude 호출 ~51k in+1.9k out 토큰 = $0.06/run → ~$1.83/월(target <$1/일 통과). 정확도 GOOD(HBM/온디바이스AI/양자/파운드리 등 실 KR 테마). source='ai' 표시 승인(ai_candidate 격리 불필요, 코드 변경 0 — /api/themes is_system=true 자동 surface). prod 활성은 10-08 의 THEME_SYNC_CLASSIFY_ENABLED=true.
- [Phase 10]: [10-07] 출처 도트를 globals.css 토큰만으로 매핑(naver=--flat / alphasquare=--down 블루 정확일치 / ai=--accent 뱃지+--primary 도트) — 목업 인라인 oklch(green/purple) literal 은 하드 룰(토큰만) 우선해 폐기, 세 출처 시각 구분 유지하며 색 리터럴 0
- [Phase 10]: [10-07] theme-api.fetchMyThemeDetail 추가 — /api/themes/:id 가 유저 테마 404(Plan04 격리)라 유저 상세는 Supabase nested embed(theme_stocks→stocks→stock_quotes, watchlist 톤). 상세 fetch 는 시스템 우선 → 404 시 유저 폴백, isSystem 이 read-only/편집 분기 구동
- [Phase 10]: [10-07] /themes/[id] 종목 리스트 = scanner-table/card-list 직접 재사용(ThemeStockMember→StockWithProximity 매핑 1함수, props 변경 0). ThemeEditDialog 단일 컴포넌트가 create/edit/fork 3모드 + 종목 add·remove + P0001 인라인 흡수, 목록 CTA + 상세 편집 양쪽 재사용
- [Phase 10]: [10-08] theme-sync production 배포 — Cloud Run Job gh-radar-theme-sync + Scheduler gh-radar-theme-sync-daily(0 16 KST, OAuth invoker OIDC 금지) + SA + 기존 Secret 3종(brightdata/anthropic/supabase-service-role) 재사용(신규 0). THEME_SYNC_CLASSIFY_ENABLED=true. 첫 scrape 356 시스템 테마(331 naver/alpha + 25 AI 발굴) + 7,561 theme_stocks + aiDiscovered=25/aiCorrected=2, backedOffSources=[] (네이버 직접 성공). themes count gate PASS(356)
- [Phase 10]: [10-08] 유저 테마 optimistic 갱신 — upsertMyTheme(replace-by-id else prepend)/removeMyTheme(id) + onSaved(스냅샷)/onDeleted(id) 시그니처. Supabase 풀러 read-after-write 레이스로 생성 직후 list 빈 화면 회귀를 즉시 반영 후 refresh reconcile 2단으로 해소(통계 null 폴백). create-and-add E2E 통과
- [Phase 10]: [10-08] @gh-radar/shared 확장자 없는 re-export lesson — 10-02 의 첫 런타임 값 re-export(THEME_STOCK_SOURCES from ./theme.js)가 Turbopack dev .js→.ts resolve 갭 재유발(DEV 전용 오버레이, production build 는 항상 green). moduleResolution:bundler 에서 확장자 생략이 관용(NodeNext 소비자는 dist, 무영향)
- [Phase 10]: [10-08] smoke INV-2 — Cloud Run Job pino 로그는 jsonPayload.msg 로 쿼리(service .message 매핑과 다름, 라이브 덤프 확인) + Cloud Logging ingestion 지연 5×15s 재시도. Phase 09.1 의 'service 는 jsonPayload.message' 와 대비되는 Job 측 관측. E2E 상세(edit/delete/fork)는 Express /api/themes/:id 부재로 404 mock(mockThemesApi {list:[]}) → 실 Supabase fetchMyThemeDetail RLS owner-only 폴백 구동

## Phase 12

- [Phase 12]: [12-01] limitUpPrice tick 판정은 target(prev_close×1.3) 가격대 기준 — prev_close 기준 시 500k 등 경계 오류(Pitfall 1). 응답 계약은 객체 {hero,events,themes}(배열 아님, comovement 드리프트 회피). TS 미러가 plpgsql limit_up_price() Wave 2 회귀 대조 기준. limit-up-sync 워커 = Phase 11 동조 워커 1:1 복제 + rebuild_limit_up 교체.
- [Phase 12]: [12-02] 마감상한가 판별 = close=limit_up_price(prev_close) 정수 정확 비교(비율 임계 아님, D-01). limit_up_price() IMMUTABLE 순수산술 REVOKE 불요, rebuild_limit_up() 만 REVOKE 3줄+search_path 격리. STEP C 테마풀링=active 시스템테마(is_system AND NOT hidden AND effective_to IS NULL) 멤버 이벤트풀 GROUP BY. 프로덕션 rebuild event_rows=3459/stock 1271/theme 322, 황금케이스(000390 4회 win 0.75·000440 4회 jeom1 win 0.50) 재현, anon RPC 401(REVOKE).
- [Phase 12]: [12-03] server 읽기 라우트 GET /api/stocks/:code/limit-up = limit_up_* SELECT → { hero, events, themes } 객체 계약(배열 아님). 정적 이력 — 시세 조인/재계산 0 (D-22 read-only). turnover/win_rate NULL 보존(toNumOrNull), 테마 sample_n DESC 정렬(D-17), 이벤트 0회 zeroStats 빈 상태. /:code 핸들러 앞 등록(shadowing 회피). prod 재배포 revision gh-radar-server-00030-wb6 + curl 검증(000440 events=4 객체·005930 빈·!!! 400·count 3459 불변). smoke INV-8 무관 FAIL.
- [Phase 12]: [12-04] limit-up-sync 워커 배포 — Phase 11 동조 워커 setup/deploy/smoke 1:1 복제(식별자만 교체). Cloud Run Job gh-radar-limit-up-sync(180s) + Scheduler nightly(cron 0 2 * * 2-6 KST, OAuth invoker OIDC 금지, 리소스 단위 run.invoker). 외부 API 키 0(supabase-service-role accessor 1개만, T-12-04-02). 배포된 Job rebuild_limit_up 실행 event_rows=3459/stock 1271/theme 322. smoke INV-1/3/4/5 PASS, INV-2 는 Cloud Logging 전파지연 flake(직접 재조회 통과).
- [Phase 12]: [12-05] webapp 상한가 다음날 이력 섹션 ②안 데이터 대시보드 — KPI 3그리드(시초가 익절 N≥3 게이팅/평균/최악) + 전폭 분포 밴드(변형 A) + OHLC 8컬럼 표(점상 태그·faded·더보기) + 테마 가로 풀링 바(N desc) + 면책. 표시 순수함수(shouldShowWinRate/sparkBucketTone/fmtRet/fmtTurnover/BUCKET_LABELS) limit-up-format.ts 분리 + 단위 테스트 박제(sparkBucketTone(2)='up' off-by-one BLOCKER 3 가드). comovement 미러 quiet fallback(return null, error.message 미노출, T-12-05-01). 국내 색상 oklch 토큰만(D-13, 하드코딩 0). prod 시각 검증 중 분포 spark 가독성 이슈 → 변형 A(라벨 세로 막대 밴드) 재디자인 후 재배포(gh-radar-webapp-faraucl94...). Phase 12 LIMIT-01 end-to-end prod live.

## Phase 13

- [Phase 13]: [13-01] home_theme_snapshots = JSONB-blob-per-row 스냅샷 (PK trade_date,captured_at + payload jsonb Claude 출력 1:1 + content_hash/is_carried hash-skip 복제 append). RPC 없는 plain table → REVOKE 불요, RLS SELECT TO anon,authenticated + service_role write. 프로덕션 push 완료(anon GET 200).
- [Phase 13]: [13-01] workers/home-sync = theme-sync reduced 클론 — config 은 anthropic+supabase+급등튜닝(surge/news)만, 스크랩/프록시 전면 제거. anthropic.ts/parseJson.ts verbatim. Dockerfile VPC 없음(§Pattern 5 Supabase+Anthropic만 호출). [Rule 1 버그] config JSDoc 의 */scrape* 시퀀스가 블록주석 조기종료 유발 → 리워딩.
- [Phase 13]: [13-02] home-sync 파이프라인 — loadSurges(급등+종목별 top-K 뉴스 truncation 회피) + clusterSurges(Claude 1x bottom-up, newsRefs 인덱스 verbatim 해석 D-04 + breadth 정렬 D-05 + <2 강등 D-06) + runHomeSyncCycle(hash-skip clone-append is_carried, Pattern 4). TDD 20/20 green + build 0. clusterSurges 반환 ClusterResult(threshold/marketStatus 는 index 확정). tsconfig exclude src 테스트(코로케이트 테스트가 build 로 vitest 끌어오는 문제 차단, Rule 3).
- [Phase 13]: 13-03: /api/home 읽기 라우트 = limitUp 객체계약 { snapshot, index }(배열 아님). payload verbatim 서빙(실시간 시세 재조인 없음, Pitfall 3/T-13-03). 파라미터 우선순위 capturedAt>date>무필터.
- [Phase 13]: 13-04: useHomeQuery 폴링 없음 — 홈은 시점별(:30) 이력 조망 화면이라 사용자 date/slot 전환이 fetch 트리거. AbortController 로 파라미터 빠른 전환 레이스 차단(useThemesQuery 변형)
- [Phase 13]: 13-04: 시점 슬롯 HH:MM 라벨/마감(15:30) 판별 = Intl.DateTimeFormat timeZone=Asia/Seoul (capturedAt UTC ISO → KST). home-client isEmpty = snapshot null OR (themes[] AND singles[] 둘 다 비어있음)
- [Phase 13]: 13-04: /home-preview 프리뷰 + middleware PUBLIC_EXACT 항목은 임시 검증 스캐폴드 — home-client 가 라이브 /api/home 호출이라 네트워크 무관 목데이터 프리뷰로 시각 체크포인트 승인. Plan 05 가 / 루트 마운트 시 둘 다 제거
- [Phase 13]: 13-05: 홈을 앱 루트(/)로 승격 — page.tsx redirect('/scanner') → AppShell+Suspense(HomeSkeleton)+HomeClient(force-dynamic), 사이드바 NAV 홈 1번째. 임시 /home-preview 라우트+middleware 화이트리스트 제거. home.spec E2E 5/5(렌더/날짜·시점 네비/빈 상태/scanner 회귀 T-13-12)
- [Phase 13]: [13-06] home-sync 프로덕션 배포: Cloud Run Job(512Mi/120s, VPC 없음) + Scheduler gh-radar-home-sync-cron(30 9-15 KST 7슬롯, OAuth) + Secret 재사용 신규 0. Claude POC PASS(themeCount=4 실제 대응, 환각 0, ~$3.1/월 이내). 후속(비차단): 테마 내 뉴스 URL dedup(news_total 44 vs unique 4 저장 중복, 표시 무영향).

## Phase 14

- [Phase 14]: 14-01: conversations.stock_code ON DELETE SET NULL (종목 상폐 시 대화 보존) + messages RLS 는 user_id 없이 conversations EXISTS 서브쿼리 4정책 + RPC 없어 REVOKE 불요(home_theme_snapshots 선례). 비공개라 TO authenticated 만(anon 미부여=default-deny). production push + pg_policies 8행 검증.
- [Phase 14]: Plan 02: 챗봇 웹서치 모델을 chatWebSearchModel 별도 config 키로 분리 — Haiku web_search 미지원 시(RESEARCH A2) CHAT_WEBSEARCH_MODEL=claude-sonnet-4-6 env 1줄 폴백, 코드 무변경. 팀장 Sonnet/전문가 Haiku default, anthropicApiKey 재사용. ChatSSEEventMap 이 SSE 프로토콜 단일 진실 소스.
- [Phase 14]: requireAuth 는 supabase.auth.getUser(jwt) 재사용 — jose/jsonwebtoken 신규 의존성 0. 서명·만료·revoke supabase-js 내장.
- [Phase 14]: chat-history 소유권 불일치도 404 CONVERSATION_NOT_FOUND 흡수(403 대신) — 존재 여부 누설 회피(T-14-01 IDOR). DB error 는 500 DB_ERROR 래핑으로 PostgREST 내부 미노출.
- [Phase 14]: [Plan 05] SPECIALIST_TOOLS name 은 SPECIALIST_TOOL_NAMES 상수 참조(리터럴 중복 금지) + code 는 required 제외(question 만) — 팀장이 종목 없는 질문에서 스키마 위반 없이 자연 미호출, 실제 방어는 runSpecialist code guard(D-08 quote/limitup 무데이터 조회 차단)
- [Phase 14]: P08: FAB 라벨 종목명은 provider stockContext.name 만 사용(usePathname 미도입) — 종목상세가 이미 fetch 한 데이터 재사용, 추가 조회 0(D-03)
- [Phase 14]: P08: 시트 닫힘(closeChat)은 abort 안 함 — abort 는 새 전송/명시 정지만(서버 완료 저장, D-06). FAB/시트/사이드바 라벨 'AI 애널리스트' 단일화
- [Phase 14]: [Plan 06] clientAbort(시트닫힘)/interrupt(새요청) 분리 — effectiveSignal=AbortSignal.any([interruptController.signal]) 로 Claude 스트림은 interrupt 만 취소, 시트 닫혀도 finalMessage 완료 후 히스토리 저장(D-06). ww-bot(둘다취소)과 의도적 차이(영속화 존재)
- [Phase 14]: [Plan 06] 세션 Map 은 interrupt/busy 가드 전용(키=conversationId??userId), 히스토리는 DB loadConversation 복원 — messages 는 텍스트 스냅샷만 저장(tool 원본 미저장, Pitfall 3) 후 sanitizeMessages 필수
- [Phase 14]: [Plan 09] MiniChart 는 StockDailyChart 통째 재사용 대신 동일 lightweight-charts+chart-colors 스택으로 120px mini 축약(볼륨/마커/hover 제거) — oklch 회피 sRGB 팔레트 주입, D-10 충족
- [Phase 14]: [Plan 09] 챗 blocks(stock_card/citation/chart)는 스트리밍 중 로컬 배열 수집 → response_complete 에 확정 메시지 부착. 진행 중엔 AgentProgress 스텝퍼+부분텍스트만(D-05 + shift 최소화)
- [Phase 14]: 챗 대화목록 GET 은 bare array 반환 — { data } envelope 가 webapp apiFetch(unwrap 없음) 계약과 불일치해 종목별 히스토리 유실. production smoke 로 발견, Rule 1 수정(05e96b4)
- [Phase 14]: 챗 면책 문구 전면 제거 — 사용자 checkpoint 결정. 서버 프롬프트+webapp UI+테스트 전부 삭제, 매매지시 금지·환각 금지 안전 가드는 유지(8fd25cc)
- [Phase 14]: 챗 모델 전면 claude-sonnet-5 — 사용자 결정(팀장+전문가+웹서치 3키). 전문가 temperature 제거+thinking disabled, 팀장 adaptive thinking 유지+max_tokens 8192. web_search_20250305 유지, [chat] usage 에 model=claude-sonnet-5 관측(2918a4b)

## Phase 16

- [Phase 16 Plan 42]: `isin-labels.ts` 의 이름 원천에 `limitChasers` 를 더한다 — 16-41 이 relay 에 실은 `name`·`code` 를 소비하므로 새 조회 경로가 생기지 않고(T-16-02), 못 푼 종목은 필드가 비어 「모르면 ISIN 그대로」 폴백이 그대로 산다(T-16-05). 새 원천은 **맨 뒤**에 두어 `put` 의 「빈 값이 이전 값을 지우지 않는다」 규칙에 태운다.
- [Phase 16 Plan 42]: 「수정」의 무장 가드에 `isDeleteIntent` 철거 면제를 붙인다 — relay `#strategyArmable` 첫 줄의 `#isTeardown` 면제와 **동형**이어야 한다. `sweepEnabled` 가 삭제 판정 4종에 없어 「게이트 4종 OFF + 한방 ON + 시세 끊김」이 막히던 것이 R2-WR-02 다. 첫 관문이 마지막 관문보다 엄격하면 사용자가 전략을 못 내린다(T-16-44).
- [Phase 16 Plan 42]: 안전 문구의 해제 트리거는 **원인 변경**(`setField`)과 **서버 응답**(`items`·`[server]`) 둘 뿐이다 — 자기 자신(전송 시도)은 아니다. 방금 띄운 문구가 같은 렌더에서 지워지면 읽을 시간이 없고, 상시 표시되는 경고는 다음번에 읽히지 않는다(T-16-86).
- [Phase 16 Plan 42]: 단일 렌더 테스트는 `useMemo` 의존성 누락을 잡지 못한다 — 「조용한 실패」를 잠그려면 다른 원천을 **같은 참조로 고정**한 채 `rerender()` 하는 케이스가 따로 있어야 한다.
- [Phase 16 Plan 26]: TRADE-03 은 갭이 전부 닫힌 뒤에도 **Pending 으로 남긴다**. 프로덕션 `/healthz` 의 `everReadyCount: 0` 이 「Ready 에 도달한 DMA 세션이 한 건도 없었다」를 뜻하므로 전략 중계·주문 상관 경로가 실서버에서 실행된 적이 없다. 코드가 옳다는 것과 그 코드가 운영에서 돈다는 것은 다른 주장이고, 요구사항은 후자다 (RELAY-02 와 같은 기준).
- [Phase 16 Plan 26]: 배포 순서 relay → server → webapp 은 취향이 아니라 계약 방향이다. 새 webapp + 옛 relay 는 `market` 없는 `cfg` 가 옛 zod 필수 필드에 걸려 `lc.set` 이 통째로 드롭되지만, 역방향(새 relay + 옛 webapp)은 스키마가 `.strict()` 가 아니라 안전하다 — 그래서 relay 가 먼저다.
- [Phase 16 Plan 26]: gap 4 의 증거는 「200」이 아니라 「**세션이 있는 상태의** 200」이다. 배포 전후로 `sessionCount` 가 2 로 같고 판정만 503→200 으로 뒤집힌 대조를 근거로 삼는다 — 세션 0 의 200 은 판정 로직을 통과하지 않으므로 아무것도 증명하지 않는다.
- [Phase 16 Plan 26]: 검증 명령이 「대상을 못 찾아도 exit 0」인 부류인지 확인한다. `pnpm --filter gh-radar-webapp test:e2e` 는 존재한 적 없는 이름이라 88개 문서에서 무동작으로 통과하고 있었다. `pnpm --filter`·`vitest -- <패턴>`·`grep` 이 전부 이 부류다.
- [Phase 16 Plan 18]: `dma_orders` 의 `order_no` 셀렉터는 `user_id` + KST 당일까지 **세 축**으로 좁힌다 — 브로커 주문번호는 일별 재사용 시퀀스라 한 축만으로는 전역 쓰기다 (T-16-14). `userId` 없는 `order_no` 갱신은 `selectorOf` 가 `null` 을 돌려 드롭 + error 로그.
- [Phase 16 Plan 18]: `maybeSingle()` 제거 — 2행일 때의 throw 가 호출자 catch 를 「셀렉터 없는 갱신」으로 열화시켜 그 자체가 전역 쓰기의 방아쇠였다. `order(created_at desc).limit(1)` 로 최근 1행 선택.
- [Phase 16 Plan 18]: 자동주문 통보의 「조회 → 없으면 insert」를 `` `${userId}|${orderNo}` `` 키 in-flight Promise 로 감싼다 (WR-01). `closeConn`/`close` 는 `inflight` 을 건드리지 않는다 — 진행 중 왕복 중단이 곧 기록 결손.
- [Phase 16 Plan 18]: `dma_orders` 유일성은 `(user_id, order_no, (created_at AT TIME ZONE 'Asia/Seoul')::date)` 부분 UNIQUE 인덱스로 DB 가 강제한다 (프로덕션 적용 2026-09-09). 전역 UNIQUE 는 일별 재사용 시퀀스라 불가능.
- [Phase 16 Plan 18]: 쿼리 경계 테스트는 sink 를 스텁으로 바꾸지 않는다 — 진짜 sink 팩토리에 가짜 `SupabaseClient` 를 주입해 **적용된 필터와 영향 받은 행**을 단언한다 (gap 1 이 통과했던 사각지대).
- [Phase 16 Plan 19]: relay 송신구 `send` 는 `boolean` 을 돌려주고 소켓 미연결 드롭을 `console.error` 로 남긴다 (PC-7 무로그 fail-safe 금지 / T-16-19) — 로그에는 `msg.t` 만 싣는다 — `lc.set.cfg`·`vi.set.accountNo` 의 계좌번호가 브라우저 콘솔로 새면 안 된다 (T-16-18)
- [Phase 16 Plan 19]: 킬 스위치는 세션이 `ready` 가 아니면 비활성이고, 전송 실패 시 `awaitingAck` 를 세우지 않는다 — 「보내지 못했어요」(0바이트 확실)와 「반영을 확인하지 못했어요」(65 유실 — 결과 모름)는 다른 문구다 (T-16-20 / T-16-21)
- [Phase 16 Plan 19]: send 호출부 감사 결과 세션 가드 예외는 킬 스위치 하나가 아니라 둘이었다 — `vi-settings-card` 의 `submit` 이 `DirtyActionBar` 「수정」 경로로 우회했다 — 가드는 UI 의 `disabled` prop 이 아니라 송신 콜백 첫 줄에 둔다. 공용 액션 바는 세션 상태를 모른다
- [Phase 16 Plan 20]: WR-04 는 「모듈 삭제」로 확정 — listOrders 결선은 곧 주문 이력 표를 만드는 것이고 그 표는 D-20 이 이 phase 밖(deferred)에 두었다. 라우트(GET /api/orders)는 D-03 사용자 결정이라 남긴다.
- [Phase 16 Plan 20]: dma_orders.origin 은 shared 계약(DmaOrderOrigin)에 사본으로 둔다 — server 는 relay 를 의존하지 않는다. server 에 기본값 보정을 넣지 않는다(DB DEFAULT manual + NOT NULL 이 정본). manual 은 「수동」과 「출처 불명」이 같은 값이라 자동주문 감사의 증거로 쓸 수 없다.
- [Phase 16 Plan 21]: relay `/healthz` degraded 판정에서 「한 번도 Ready 인 적 없는 세션」을 제외한다 (gap 4 해법 ③). 판정축이 `sessionCount` → `everReadyCount` 로 옮겨가 15-05 계약을 대체한다 — 게이트웨이가 애초에 없는 환경은 relay 장애가 아니다.
- [Phase 16 Plan 21]: `DmaSession#hasBeenReady` 는 래치이며 `false` 로 되돌리는 경로를 만들지 않는다 (T-16-26). 「게이트웨이 부재」와 「게이트웨이 장애」를 가르는 유일한 근거라, 되돌리면 진짜 장애 탐지가 함께 죽는다.
- [Phase 16 Plan 21]: smoke INV-9 는 사라진 server 주문 라우트 대신 relay wss 주문 왕복으로 도달성을 잰다. 기대값은 `order.result(status=rejected)` — 화이트리스트 밖 계좌 `0000000000` + 미해석 ISIN 조합이라 게이트웨이 송신·`dma_orders` insert 이전에 끝난다 (T-16-28).
- [Phase 16 Plan 22]: 주문 통보 상관을 다축 단계적 좁히기로 바꿨다 — orgOrderNo → noticeType("R" 제외) → quantity·price("E" 제외). 각 축은 남는 후보가 0이면 적용하지 않는다(구 서버가 비워 보내는 축이 정상 통보를 죽이지 않게)
- [Phase 16 Plan 22]: 하나로 좁히지 못하면 아무것도 정산하지 않고 recordUnmatched 로 보낸다 (T-16-29). 「가장 오래된 것」 폴백을 만들지 않는다 — 잘못 귀속된 기록은 없는 기록보다 나쁘다. 남은 대기는 5초 타임아웃이 「결과 모름」으로 끝낸다
- [Phase 16 Plan 22]: 통보 후보를 그 사용자의 전 연결에서 모아 좁힌다 (T-16-30). order.result 는 여전히 요청 연결로만 간다 — T-16-03 은 유지
- [Phase 16 Plan 22]: 중복 주문 판정만 userDupKeys(Map<userId, Set>) 로 사용자 스코프에 올리고 rid 재전송 가드는 연결 스코프로 남겼다 (WR-02). ConnState.dupKeys 역인덱스를 closeConn 이 회수하고, release 는 이 연결이 아직 쥔 키만 푼다 (T-16-31 / T-16-33)
- [Phase 16 Plan 23]: `account`(마지막 수신 계좌)를 relay 계약에서 **필드째 제거**했다 (CR-01 / T-16-35). 소비자 2곳을 `accountStates` 로 옮기는 것만으로는 다음 소비자가 같은 실수를 반복한다 — 계좌 축에 쓸 수 있는 값이 이제 `accountStates` 맵 하나뿐이고, 거기서 무언가를 꺼내려면 계좌번호를 명시해야 한다.
- [Phase 16 Plan 23]: 계좌 선택은 **소비자가** 한다 — `useRelaySubscription` 이 계좌 하나를 골라 주는 설계는 원리상 불가능하다. 훅은 사용자가 어느 계좌를 골랐는지 모르므로, 그럼에도 고르면 그 값은 필연적으로 「마지막으로 프레임이 온 계좌」가 되고 그것이 정확히 CR-01 이다.
- [Phase 16 Plan 23]: 호가주문 탭의 계좌 패널·매도가능수량 입력을 `accountStates.get(selectedAccountNo)` 하나로 통일했다 (T-16-34). 머리와 행의 출처가 같아져 「A 계좌 화면에서 B 주문번호를 취소」 경로가 사라진다 — relay 화이트리스트는 두 계좌 모두 그 사용자 것이라 막지 못한다.
- [Phase 16 Plan 23]: ISIN→종목명 역매핑 사본 3개를 `webapp/src/lib/isin-labels.ts` 로 합쳤다 (WR-08 / T-16-37). 사본 수가 아니라 **동작이 갈라지는 것**이 결함이었다 — 사이드바만 계좌 하나를 봐서 계좌 2개에서 표시가 프레임마다 흔들렸다. 공용 훅은 `useMemo` 로 감싼다.
- [Phase 16 Plan 23]: `me-client` 상태줄 반영 시각을 계좌 전체의 최신값(`latestAccountTime`)으로 재정의했다. 상태줄은 계좌 축이 없는 전역 요약이라 답해야 할 질문이 「어느 계좌인가」가 아니라 「가장 최근 언제 반영됐나」다. 비교는 `formatServerTime` 정규화 후에 한다(`YYYYMMDDHHMMSS` 와 `HH:MM:SS` 혼재).
- [Phase 16 Plan 24]: VI 주문금액 상한은 shared 상수 MAX_VI_ORDER_AMOUNT_KRW(원 단위 100억) 하나가 정본이고 zod·envelope·UI 세 층이 그것을 import 한다 (WR-07 / T-16-38). 세 층 어디에도 값을 복제하지 않는다 — 두 번 적으면 가장 느슨한 층이 실질 상한이 된다.
- [Phase 16 Plan 24]: 만원 상한은 vi-alert.ts 가 krwToManwon 으로 유도한다 — 단위 변환의 유일 지점이 그 파일이므로 유도식도 같은 자리에 둔다. 카드에서 10_000 으로 나누면 그 파일이 못박은 규칙을 깨고 리터럴이 되살아난다.
- [Phase 16 Plan 24]: 금액 입력 초과는 거부가 아니라 상한 클램프다 (T-16-41). 입력을 삼키면 왜 안 써지는지 알 수 없다 — 자르고 vi-amount-limit 한 줄이 이유를 댄다. 자른 결과가 곧 폼 값이라 「확인 다이얼로그 표시값 = 전송값」이 구조적으로 성립한다. 서버 에코발 초과는 submit 가드가 따로 막는다.
- [Phase 16 Plan 24]: OrderStore 의 #flushing(boolean) 을 #current(Promise|null) 로 완전히 대체했다 (WR-09 / T-16-39). boolean 은 「지금 도는가」만 답하고 「끝날 때까지 기다린다」를 답할 수 없다 — 종료 절차가 기다릴 수 있게 된 것이 이 한 줄의 전부다. 병행하지 않은 이유는 정본이 둘이면 다음 사람이 boolean 으로 즉시반환 분기를 다시 만들기 때문이다.
- [Phase 16 Plan 24]: tick 과 종료의 플러시 계약을 의도적으로 다르게 뒀다 — tick 은 진행 중이면 건너뛰고(기다리면 200ms 마다 대기자가 쌓여 장애 중인 Supabase 를 겹쳐 두드린다) 종료만 기다린다. 기다림은 「곧 죽는 프로세스」의 특권이다. 반복 상한 ORDER_FLUSH_MAX_ROUNDS(=ORDER_MAX_RETRIES+2) 에 걸리면 남은 큐 길이를 logger.error 로 남기고 반환한다 (S-5 / T-16-40).
- [Phase 16 Plan 25]: lc.set 의 시장 구분은 relay 가 소유한다 (WR-03 / D-28). RelayLcSetSchema.cfg 에서 market 필드를 **삭제**해 브라우저가 실어 보내도 z.object 가 떨어뜨리게 하고, fanout 의 ②-1 단계가 symbols.lookup(isin) 으로 푼다 — 못 풀면 거부다. 값을 검증하는 대신 애초에 받지 않는 것이 order.new 게이트 ③-1 과 같은 규율이다.
- [Phase 16 Plan 25]: buildSetLimitChaserReq 의 파라미터를 RelayLimitChaserInput & { market } 으로 좁혔다 — 조립기에 기본값 "K" 를 두는 순간 코스닥 전략이 코스피로 등록되고, 전략은 한 번의 주문이 아니라 반복 발주 설정이라 그 오차가 계속 재생산된다.
- [Phase 16 Plan 25]: 게이트 무장 판정은 gateBlocked(key, next) 하나이고 스위치 disabled 와 toggleGate 전송 가드가 그것을 함께 읽는다 (WR-06 / T-16-43, vi-order-list 의 isConfirmable 승계). next === false(끄기)는 무장 조건을 보지 않는다 — 무장 해제를 막으면 사용자의 자산을 인질로 잡는다 (T-16-44).
- [Phase 16 Plan 25]: 매도 무장 조건은 계획의 sellQty 대신 sellWatchQty 를 본다. estimatedSellQty 는 lib/limit-chaser.ts 가 「표시 전용」이라 못박은 값이고, 보유 0 을 차단 조건으로 삼으면 「사기 전에 팔 조건을 거는」 상따 주 동선이 통째로 막힌다 — 서버가 매도를 눕히는 조건도 sellWatchQty === 0 이다.
- [Phase 16 Plan 25]: 배포는 relay 를 먼저 올린다. 새 webapp + 옛 relay 조합은 market 없는 cfg 가 옛 스키마의 필수 필드 검증에 걸려 lc.set 이 전부 조용히 드롭된다 (16-26 배포 순서).
- [Phase 16]: update 의 23505 분기는 셀렉터가 아니라 patch.order_no 에 건다 — finish 경로는 셀렉터가 id 다 — selectorOf 가 orderRowId 를 우선하므로 GC-WR-08 이 지목한 경로의 셀렉터는 id 이고 order_no 는 채울 컬럼이다. 셀렉터로 좁히면 그 경로를 비켜 간다.
- [Phase 16]: ORDER_FLUSH_MAX_ROUNDS 는 +2 를 유지하고 세 라운드의 정체를 docstring 에 적는다 (a안) — 3라운드는 재시도가 아니라 flushNow 가 await 하는 동안 동기 enqueueUpdate 로 들어온 항목의 몫이다. +1 로 자르면 SIGTERM 과 마지막 통보가 겹칠 때 그 항목이 손도 못 대고 결손으로 보고된다.
- [Phase 16]: 상따 삭제(crud D · 전 게이트 OFF)는 시장 해석 실패로 거부하지 않는다 — 전략 키에 시장이 없어 폴백이 삭제 대상을 바꾸지 않는다 (GC-WR-04)
- [Phase 16]: relay 무장 가드를 UI canArmBuy·canArmSell·canArmSweep 3식과 동형으로 이식 — sellWatchQty 0 과 sweep 게이트를 서버가 막는다 (GC-WR-05)
- [Phase 16]: 세션 생성 시각(createdAt)은 DmaSession 이 아니라 SessionManager 의 Entry 에 둔다 — hasBeenReady 래치의 의미(T-16-26)를 흐리지 않기 위해서다. session.ts diff 0줄 (GC-WR-07)
- [Phase 16]: STALE_SESSION_MS(5분)는 env 로 열지 않는다 — 판정 임계가 배포 환경마다 갈리면 uptime 알림의 의미가 환경별로 갈라진다 (GC-WR-07)
- [Phase 16]: smoke 프로브 비밀은 argv 가 아니라 env(SMOKE_TOKEN)로 넘긴다(argv 는 ps 로 world-readable). 판정 문자열은 대입으로 덮어쓰고 출력 지점은 하나 (GC-WR-11)
- [Phase 16]: 16-31: 무장 판정을 setSubmitting(true) 앞에 둔다 — 잠근 뒤 막으면 60 에코가 오지 않아 「수정」이 영구히 잠긴다
- [Phase 16]: 16-31: handleSubmit 가드는 켜져 있는 게이트만 본다 — 게이트를 내리는 「수정」은 무장 조건과 무관하게 나간다 (T-16-44 확장)
- [Phase 16]: 16-31: 무장 불가 문구를 상수 3종 → 원인 6종 + armBlockedTextOf 산출 함수 — 렌더와 전송 차단이 같은 함수를 읽는다
- [Phase 16]: 16-31: pnpm 필터명은 @gh-radar/webapp — 계획 문언의 gh-radar-webapp 은 존재하지 않는 필터로 exit 1
- [Phase 16]: 16-32: vi-order-list 의 send 실패 분기는 setOptimistic·setSending 앞에서 return 한다 — 잠금을 푸는 신호가 서버 73 델타뿐이라 나가지 않은 요청에 건 잠금은 영구다
- [Phase 16]: 16-32: vi-settings-card 의 submit 을 ViSubmitResult 3갈래(sent/blocked/failed)로 만들었다 — failed 만 확인 다이얼로그를 열어 둔다. 「닫힘」이 성공 신호로 읽히지 않게
- [Phase 16]: 16-32: latestAccountTime 은 st 원문에서 만든 비교 키(dated 축 우선)로 고르고 승자의 원문에서 표시값을 뽑는다 — epoch 승격은 모르는 날짜를 「오늘」로 가정해야 해서 자정 뒤집힘의 원인이 된다
- [Phase 16 Plan 33]: 붙을 행이 없는 수동 통보는 **0행 update 를 보내지 않는다** — 조회로 확인된 경우에만 `orderRowId` 로 갱신하고, 없으면 통보 원문을 `logger.error` 로 남긴다. PostgREST 가 0행 update 를 성공으로 답하는 것이 이 파일이 없애겠다고 선언한 Pitfall 18 의 정체다.
- [Phase 16 Plan 33]: 통보 기록 경로의 예외는 **두 겹**으로 막는다 — 호출부 `.catch`(증상) + `insertOnly` 의 try 안으로 옮긴 `autoInsertRow`(원인). 한 겹만 두면 원인은 남고 증상만 가려진다. `index.ts` 의 `unhandledRejection` 은 프로세스 종료이므로 통보 1건의 파손이 전 사용자 세션 절단이다.
- [Phase 16 Plan 33]: 빈 주문번호(`""`)는 in-flight 상관 키가 아니다 — `findIdByOrderNo` 가 이 값에서 항상 `null` 이라 dedup 의 의미가 애초에 없고, 합치면 서로 다른 자동주문 거부가 한 행에 겹쳐 쓰인다. 각자 insert 한다.
- [Phase 16 Plan 34]: narrowPending ②-1 매매구분 축은 sideTrusted 만으로 부족하다 — 거부(R)는 파서가 신뢰로 표시하지만 취소 대기에도 오므로 noticeType∈{A,E} 한 겹을 더 건다
- [Phase 16 Plan 34]: 취소 dup 키는 (accountNo,isin,C,orgOrderNo) — 취소의 정체성은 원주문번호다. 신규 키 문자열은 불변(두 탭 동시 발주 차단 유지)
- [Phase 16]: 16-35: TRADE-03 은 Pending 유지 — 코드 19건이 닫히고 relay 가 c8aa7ae 로 재배포됐으나 프로덕션 /healthz 가 everReadyCount:0 · stalledCount:2 · 503 이라 DMA 경로가 실서버에서 한 프레임도 나른 적이 없다 (RELAY-02 와 같은 기준)
- [Phase 16]: 16-35: 배포 후 /healthz 503 은 회귀가 아니라 GC-WR-07 의 의도된 판정 — version·sessionCount 고정 상태에서 stalledCount 0→2 만으로 뒤집혔다. 알림을 끄는 것은 판정을 되돌리는 사용자 결정 사항이라 deferred-items 로 넘겼다
- [Phase 16]: 16-35: server 재배포 생략 — git diff --stat 2cb5620..HEAD 가 server/ 와 packages/shared/ 둘 다 빈 출력. 계약 무변경이라 배포 순서 위험도 이번 라운드에는 없다
- [Phase 16]: 16-37 (R2-CR-02): stalledCount 가 사유를 본다 — NO_RETRY_STATES(session_rejected·unauthorized) 세션은 집계에서 제외. 사용자 한 명의 자격증명 거부가 relay 전체를 영구 503 으로 만들던 경로를 닫았다. sessionsOk 판정식 무변경(입력값 정의만 좁힘), acquire·release diff 0줄로 T-15-10 유지, 기존 ⑩ 통과로 GC-WR-07 생존
- [Phase 16]: 16-38 (R2-CR-03): 마스킹 규율을 경로가 아니라 **타입**에 건다 — `safePgError` 의 좁은 반환 타입(`{code?, message?}`)이 계약의 집행 수단이다. PostgREST 오류에서 값이 들어가는 통로는 `details`/`hint` 두 곳뿐이라 그 둘을 읽지 않는 것이 마스킹의 전부다
- [Phase 16]: 16-38: 로그 키를 `pgError` 로 둔다 — GCP pino 설정의 `messageKey` 가 **`message`** 라 안전 필드를 최상위로 펼치면 로그 메시지 자체와 충돌한다
- [Phase 16]: 16-38: 리뷰·계획이 지목한 7곳이 아니라 **전수 조사 23곳 중 13곳**을 교체했다 — `order-handler` 통보 경로 3곳·`credentials`+`fanout`(같은 오류를 두 번 로그)·`symbols` 가 계획 목록 밖이었다. 계획의 grep 은 한 줄짜리만 잡아 `#drain` 두 줄과 `{ userId, error }` 순서를 놓친다
- [Phase 16]: 16-38: `order-handler.ts:411`(최후 그물)·`:862`(조립 거부)는 **유지** — 안쪽 Supabase 왕복 3곳이 각각 catch 로 종결되고 조립 try 는 `OrderBuildError` 만 던진다. PostgREST 가 닿지 않는 자리라 스택이 유일한 단서다
- [Phase 16]: 16-39: 23505 의 포기 단위를 패치 전체에서 order_no 컬럼 하나로 좁혔다 — 카운터를 고치지 않고 flushed 가 참이 되게 동작을 고쳤다 (#flushed 대입문 diff 0줄)
- [Phase 16]: 16-39: 「보낼 것이 없다」 판정을 키 개수(<=1)가 아니라 updated_at 이름 필터로 센다 — 계획 식은 sink 직접 호출자의 실필드 1개를 조용히 버린다
- [Phase 16]: 16-40: 카운터가 아니라 sink 가 참말을 하게 한다 — insert 는 created, update 는 applied 한 비트씩 — inserted 가 23505 수렴까지 세던 오염과 16-39 가 남긴 flushed 잔여 오차를 같은 형태로 닫았다. 카운터 대입문이 아니라 sink 반환 타입을 넓혀 고쳤고, 반환 생략은 기존 의미와 같게 두어 기존 sink 구현 변경 0줄.
- [Phase 16]: 16-40: flushNow 의 진행 중 배치 대기를 라운드 루프 안으로 흡수 — close() 순서는 유지 — 실제로 열려 있던 창은 라운드 N 종료와 N+1 대입 사이였다(계획·리뷰가 지목한 진입부는 종전 while 이 이미 막고 있었다). close() 를 앞으로 옮기는 대안은 ORDER_FLUSH_MAX_ROUNDS 의 3라운드 근거(16-24)를 흔들어 채택하지 않았다.
- [Phase 16]: 16-41: 상따 에코 보강은 캐시 삽입 이전에 한다 — 캐시가 lc.snap 재접속 복원의 원천이라 팬아웃만 보강하면 새 탭의 이름이 갈린다
- [Phase 16]: 16-41: RelayLimitChaserInput 이 name·code 를 Omit — 표시 문자열의 소유자는 relay 다(market 과 같은 규율, T-16-84)
- [Phase 16]: 16-41: detach()·releaseAll() 삭제 — 호출자 0건이고 detach 는 attach 가 건 리스너를 떼지 않아 호출 자체가 누수였다 (R2-IN-02)
- [Phase 16]: 16-41 함정: 공유 계약 변경 후 pnpm -r typecheck 단독 통과는 검증이 아니다 — 소비처가 packages/shared/dist 를 보므로 shared build 를 먼저 돌려야 한다
- [Phase 16 Plan 43]: 주문번호 비교 정규화(공백·선행 0 제거)의 정본은 게이트웨이의 NormalizeOrderNo(AccountManager.cpp:607-621) — relay 가 규칙을 지어내지 않고 그대로 옮겼다
- [Phase 16 Plan 43]: 통보 종류 축을 블랙리스트에서 화이트리스트(A/E)로 전환. A 는 명시 값이자 IBroker 기본값이라 교보 경로가 살아나면 재판정 필요 — 조건을 코드 주석에 박았다
- [Phase 16 Plan 43]: sideOf 미해석 기본값을 B 에서 S 로 뒤집었다 — S 는 이 파일에서 이미 방향의 정본이 아님 표기이고, dma_orders.side 를 읽어 주문을 내는 경로는 없다
- [Phase 16 Plan 45]: deploy-relay.sh 의 DMA_HOST 를 3단 우선순위(명시 주입 > 실행 중 컨테이너 보존 > 로컬 mock)로 교체 — 보존은 런타임 docker inspect 조회로만 하고 저장소 실주소 리터럴은 늘리지 않는다(2 → 2)
- [Phase 16 Plan 45]: smoke INV-9 프로브는 stdout 쓰기 완료 콜백에서 종료하고 호출부는 빈 verdict 를 SKIP 이 아니라 FAIL 로 센다 — 판정 유실이 조용한 초록불이 되는 경로를 이중 차단
- [Phase 16 Plan 44]: 세션 state 리스너의 실제 누수 지점은 #onClose 였다 — #register 갈래는 refCount 대칭 때문에 도달 불가라 방어로만 남기고 잠기지 않았음을 명시
- [Phase 16 Plan 44]: 떼는 것(off)과 침묵시키는 것(정본 대조 가드)은 서로 다른 시점의 방어다 — EventEmitter.emit 이 리스너 배열 사본을 순회하므로 둘 다 필요하다

## Phase 17

- [Phase 17]: 주문통보 신규 3필드(bd/rk/rq)는 빈 값이면 브라우저 프레임에서 키째 생략한다 — 빈 문자열을 실어 보내면 「서버가 "" 라고 말했다」와 「서버가 말하지 않았다」가 구분되지 않는다. 계약이 셋을 optional 로 둔 이유다 (D-08).
- [Phase 17]: 17-02 의 파서 층은 17-01 이 이미 채웠고(kc·bs·미체결 5필드), 이 plan 은 테스트 프레임·브라우저 프레임·불변식 게이트를 넣었다 — 중복 커밋을 지어내지 않고 각 태스크 acceptance 재실행으로 「이미 있다」를 증명했다.
- [Phase 17]: 매도·취소 LED 툴팁은 목업 문구가 아니라 C# LimitChaserForm 원문을 이식한다 — 목업의 sell/cancel 문구는 계획 단계의 근사치였고 정본(:4283/4284/4380/4381)과 달랐다. 같은 문장이 WinForms 창과 웹에 동시에 뜬다.
- [Phase 17]: 클릭 불가 LED 는 disabled 버튼이 아니라 비상호작용 span 으로 그린다 — disabled 요소는 포인터 이벤트를 받지 않아 「매도잔량 기준」 설명 툴팁이 영영 뜨지 않는다. span 은 탭 순서 밖이면서 hover 를 받는다.
- [Phase 17]: 판정 함수가 읽지 말아야 할 필드는 테스트가 소스를 읽어 봉인한다 (주석에조차 남기지 않는다) — cancelQtyTrackEnabled 를 취소 무장에 넣으면 거짓 초록이 뜬다(Pitfall 5). 게이트가 본문 grep 0 이라 설명은 파일 상단 블록이 소유한다.
- [Phase 17]: 17-03: 화이트리스트 한 줄과 hub 명시 case 는 언제나 같은 커밋에서 자란다 — 76 은 Task 1, 77/78 은 Task 2 커밋에서 각각 자기 case 와 함께 등록(최종 22종) — 계획서 Task 1 은 22종을 한 번에 넣으라고 했지만 77/78 의 hub case 는 Task 2 소관이라, 지시대로 하면 두 커밋 사이 빌드에서 77/78 이 default: 로 조용히 떨어져 계획서 자신이 인용한 PC-12 가 깨진다
- [Phase 17]: 17-03: 의도적으로 무시하는 프레임(50 LoginResp · 55 UpdateAccountNoResp)에도 명시 case 를 준다 — hub default: 계수기가 「아무도 안 받은 프레임」만 세게 하려면 필수 — default: 에 맡기면 신설 unhandledFrameCount() 가 정상 로그인마다 2를 세고, 게이트를 「2 이하」로 느슨하게 잡으면 진짜 누락 1건이 경계 안에 숨는다
- [Phase 17]: 17-03: 인증 직후 rate.cross.snap 은 비어도 1프레임(lc.snap 규율), queued.window 는 77 미수신이면 0프레임(vi 3상태 규율) — 빈 above 집합은 「돌파 없음」의 확정 정보라 안 보내면 브라우저가 스켈레톤에 멈추고, 모르는 창 상태를 지어내 보내면 브라우저가 거짓 라벨을 그려 서버가 거부할 주문을 유도한다
- [Phase 17]: 체결 테이프 색은 서버 체결구분(bs) 우선 — 값이 없는 원소만 추정으로 폴백하고, 하단 고지는 실제로 쓴 근거만 말한다 — 추정을 확정 사실처럼 그리는 것과 서버가 준 값을 「추정」이라 부르는 것은 똑같이 화면이 거짓말하는 것이다 (T-17-27). 판정 입력은 usedFallback 한 값뿐이다.
- [Phase 17]: 호가 종목정보의 KRX 종가 표기는 quote.kc 하나로만 판정 — 벽시계·스냅샷 폴백 금지 — kc=0 은 「모른다」가 아니라 「오늘 종가가 아니다」라는 서버의 답이다. 시각 기반 판정 grep 카운트 0 을 게이트로 잠그고, 장 마감 뒤 시각을 박아도 표기가 안 바뀌는 행동 증명을 함께 뒀다 (T-17-28).
- [Phase 17]: lc.arm 의 무장 전제는 relay 가 재판정하지 않는다 — 서버가 한글 사유(54)로 거부하고 relay 는 그 문구를 그대로 나른다 — relay 의 에코 캐시로 서버 전제를 다시 판정하면 판정이 두 벌이 되고, 캐시가 한 틱 낡은 순간 「서버는 켤 수 있는데 relay 가 막는」 상태가 된다
- [Phase 17]: 전략 키 조각 판정(ISIN·계좌·거래소)은 protocol.ts zod 스키마를 재사용하는 술어 3종이 정본이다 — fanout 에 정규식을 다시 적지 않는다 — 가드가 두 벌이 되면 한쪽만 고쳐져 lc.set 경로와 lc.arm 경로 사이에 조용한 비대칭이 생긴다
- [Phase 17]: 빈 61 은 요청 거래소 FIFO 로만 귀속한다 — 귀속할 근거가 없으면 캐시를 고치지 않고 팬아웃도 하지 않는다 (T-17-16)
- [Phase 17]: 본문 있는 61 은 본문이 정본이고 FIFO head 와 일치할 때만 큐를 소비한다 — 팬아웃 에코가 큐를 밀지 않는다 (C# 규칙 (b)/(c))
- [Phase 17]: 21 은 더 이상 본문 없는 요청이 아니다 — get_strategy_req.key 슬롯에 거래소를 싣는다 (서버 ProcessGetVITrigger 정본)
- [Phase 17]: VI 상관 키는 접수 전 행에만 거래소를 더한다 — 주문번호가 있는 행에 더하면 72 스냅샷과 73 델타의 키가 갈린다 (T-17-18)
- [Phase 17]: VI 전략 상태를 거래소별 3상태(viTriggers)로 바꾸고 단수 viTrigger 를 별칭 없이 제거 — 소비처 6곳을 typecheck 가 강제 노출하게 했다 (17-06)
- [Phase 17]: VI 가동 배지는 viAnyRunning 한 함수로만 판정(사이드바·My page·전략 현황 인라인 0건)하고, 요약 문구도 가동 중인 거래소별 값을 말한다 (17-06 / D-18)
- [Phase 17]: vi.notice 는 렌더 소비처가 0곳이었다(grep 실측) — VI 상태줄에 최신 1건(종목·거래소·발동가) 줄을 새로 만들었다. isViServerMessage 는 VITrigger 를 받되 LimitChaser 는 받지 않는다(Pitfall 9 유지)
- [Phase 17]: 17-09: 미체결 표식은 sideDisplayText 한 함수에서만 나오고, 취소보관 행은 pendingCancelSent bool 하나로 회색·취소 제외(개별·전체 두 경로 동일) — 접미는 배타가 아니라 누적(C# NotificationHub 정본). 보조 줄 컴포넌트는 문자열 배열만 받아 어느 필드인지 모르므로 문구 분기가 구조적으로 불가능하다
- [Phase 17]: 3초 창 묶기 기준을 정본 C# 의 슬라이딩(마지막 갱신)이 아니라 묶음의 첫 통보 시각 고정으로 했다 — 매 렌더마다 목록을 다시 접는 순수함수에서 슬라이딩은 한 행을 무한히 키운다 (T-17-36)
- [Phase 17]: 묶인 행의 가격은 합계가 아니라 min~max 범위다 — 이 표의 칸은 단가라 더하면 3천원짜리 3건이 9천원으로 보인다
- [Phase 17]: 판정 함수가 읽으면 안 되는 값(OrderResp.message)은 주석이 아니라 시그니처에서 제거해 막는다 — 받을 수 없으면 읽을 수 없다 (T-17-33)
- [Phase 17]: 17-11: 상따 상태줄 무장 표기를 래치 LED 3종으로 단일화 — 옛 매수/매도 도트 세그먼트와 그것만 먹이던 StrategyStatus 상태줄 값 4종·Dot 톤 3종까지 같은 커밋에서 제거 — 같은 무장을 두 표기가 서로 다르게 말하는 순간이 반드시 생기고, 파생 필드를 남기면 다음 화면이 두 번째 표기를 되살린다 (D-22)
- [Phase 17]: 17-11: isLimitChaserServerMessage 가 src === "LimitChaser" 를 상따 몫으로 받는다 (VI 는 여전히 받지 않는다) — 17-01 이 더한 어휘를 받아 주는 판정이 없어 상따 런타임 사유 줄이 한 글자도 그려지지 않았다 — 그것이 lc.arm 거부 사유가 사용자에게 도달하는 유일한 경로다 (Rule 2 auto-fix)
- [Phase 17]: 17-11: 전략 로그 첫 스냅샷 규율을 매수·매도·취소 세 축에서 동일하게 정렬 (취소 축이 무장 문장을 아예 만들지 않던 선재 비대칭 해소) — 계획 behavior 의 추정이 아니라 실측한 매도 규율을 따랐다 — 축마다 다르게 보고되면 사용자는 취소 게이트가 꺼진 줄 안다 (Rule 1 auto-fix)

## Phase 18

- [Phase 18]: 18-01: 정정 대기는 원주문 참조 대기(isCancel:true)로 등록 — 정정확인(M) 통보가 원주문번호 하드 필터를 통과해야 timeout 으로 오기록되지 않는다
- [Phase 18]: 18-01: dma_orders price CHECK 는 price>0 OR (price=0 AND krx_session IN (G2,G3)) — 음수는 세션과 무관하게 거부
- [Phase 18]: 18-01: pieceCount 1..64 정책 정본은 relay zod 한 곳, 조립기는 정수·표현 범위만 / 1 이하·빈 세션은 슬롯 미송신(바이트 동일)
- [Phase 18]: 18-01: 감사 컬럼 piece_count/krx_session 은 값 있을 때만 insert 키에 싣는다 — 마이그레이션 미적용 창에서도 기존 주문 기록 유지
- [Phase 18]: 18-01: 돌파 name/code 보강은 76·78 팬아웃과 인증 직후 스냅샷(getRateCrossItems) 사본에만, 캐시는 서버 원본
- [Phase 18]: 18-02: parseStrategyKey 는 원문 그대로 lib/limit-chaser 로 이동, 컴포넌트 테스트 블록은 lib 테스트로 흡수(재-export 없음)
- [Phase 18]: 18-02: --new-bg/--new-bd 는 §9 라이트·다크 양쪽 정의, §2.2b 는 lc/wb 두 컨테이너만 명시하고 경계 숫자 재기재 금지
- [Phase 18]: affordanceOf 는 maxPieces 를 조각 입력이 보일 때만 서버 값, 숨길 때는 1 로 준다 — 클라 기본 상한을 만들지 않는다
- [Phase 18]: useBreakoutQuotes 는 held-ref diff 로 바뀐 키만 구독/해제한다(남는 키 참조계수가 0 을 지나지 않음)
- [Phase 18]: 76/78 유래 구분은 relay 컨텍스트에 없어 trackBreakoutMeta 의 silent 를 호출자가 넘긴다(첫 채움·전량 교체 새 종목 = silent)
- [Phase 18]: 18-05: VI 설정은 거래소별 2줄(ViSettingsRows) — 줄의 exchange prop 이 vi.set 으로 나가고 VI_EDIT_EXCHANGE 는 전면 제거
- [Phase 18]: 18-05: 옛 카드 마감알림은 18-11 상태줄 이관 전까지 옛 /trading/vi 에 유지(운영 보호)
- [Phase 18]: 18-06: 카드 상태는 useStrategyCardState 한 훅 — 옛 상따 화면도 같은 훅 + LC_CONTAINER_CLASS 를 빌려 18-12 까지 동작
- [Phase 18]: 18-06: StrategyCard 는 memo + 콜백이 isin 을 실어 올린다; 이탈 경고는 카드가 아니라 작업대 1곳(onDirtyCountChange 합산)
- [Phase 18]: 18-07: 정정 확정 버튼은 원주문 방향색 — --primary 는 --down 과 같은 값이라 LOCKED 색 규칙 우선
- [Phase 18]: 18-07: 정정 잠금은 canModify 한 함수(G2/G3·Q-ID·취소보관·주문번호 없음), 선택 차단은 unfilledSelectBlockReason — 18-09 미체결 표가 재사용
- [Phase 18]: 18-07: ManualOrderEntry 3탭의 매수/매도는 onOptionsTab 콜백만 올림 — LimitChaserForm 탭 제어형 전환은 18-10 몫
- [Phase 18]: 18-08: 76/78 구분 신호로 리듀서에 rateCrossSnapSeq(78 적용 횟수) 추가 — 배열만으로는 78 행 무음·무강조 보장 불가
- [Phase 18]: 18-08: 돌파 이탈 삭제는 서버의 새 프레임(항목 객체 교체)까지 유지 — 임계 근처 깜빡임 방지, 판정은 shouldRemoveBreakout 하나
- [Phase 18]: 18-08: 종목 추가란 ⌘K 키캡 생략 — 전역 ⌘K 는 종목상세로 라우팅하는 GlobalSearch
- [Phase 18]: 18-08: 결정 대기 — 돌파 표 「최신 위」 문구 vs 리듀서 exchangeTime 오름차순(오래된 것 위) 불일치, 18-09 전 결정
- [Phase 18]: 18-10: CardBody 가 카드·호가 탭 공용 본문 — 그룹 보조문은 서버 에코+latchLedStateOf 로만(cardGroupStatusOf), 시세 없음은 빈 호가로 10단 「—」
- [Phase 18]: 18-10: chaser 사다리 가격 클릭은 opt-in onPriceSelect(빈 단 무반응) — 옛 A11 계약(onPriceClick 무시) 유지
- [Phase 18]: 18-10: 호가 탭 더티 바는 FAB 실측 폭(--chat-fab-w)만큼 바 오른쪽 끝을 당긴다 — 고정 pr·z-index 해법 폐기
- [Phase 18]: 18-10: 호가 탭 미체결/잔고는 계좌 상태를 이 종목으로 걸러 AccountPanel 계좌 전용 머리로 — 계좌 셀렉터는 상태줄 하나
- [Phase 18]: 18-11: 카드 ✕ 는 서버 전략 삭제가 아니다 — 등록 전략 카드는 확인 다이얼로그만 거치고 작업대는 lc.set 송신 경로를 만들지 않는다(사용자 결정 대기)
- [Phase 18]: 18-11: 등록 전략은 처음 보는 키일 때만 접힌 카드로 들어오고, ?focus= 는 마운트 1회 소비 — 등록된 키만 펼친다
- [Phase 18]: 18-11: 미체결 선택은 같은 ISIN·거래소 ∧ 카드 계좌=상태줄 계좌인 카드에만 전달(다른 계좌 정정·취소 차단)
- [Phase 18]: 18-12: 이미 /trading 위에서 사이드바 전략 클릭 시 카드 펼침은 URL(?focus=) 이 아니라 window CustomEvent(gh-radar:trading-focus)로 작업대에 요청 — ?focus= 마운트 1회 소비·뒤로가기 재펼침 금지 계약 유지
- [Phase 18]: 18-12: 사이드바 /trading 활성은 「트레이딩」 제목 하나 — 3단 VI 2항목·전략 항목은 aria-current 없음, VI 가동 배지는 줄마다 viTriggers.{거래소}.run (중지면 배지 없음)
- [Phase 18]: 폰 밴드 공용 패널은 sticky 대신 document.body 포털 fixed + 흐름 안 자리 — 앱 셸 main(overflow-auto)이 sticky 컨테이너라 한 번도 붙지 않았다(18-13)
- [Phase 18]: 서버 거부는 카드 인라인 card-server-error · VI 두 줄 아래 vi-server-error(role=alert)로 되살렸다 — 옛 두 화면 상태줄 경보 계약(T-16-07) 승계(18-13)
- [Phase 18]: .tbl-wrap 는 overflow-x auto — 레이어 밖 hidden 이 Table 의 가로 스크롤을 이겨 좁은 폭 표가 조용히 잘렸다(18-13)
- [Phase 18]: 옛 상따·VI e2e 는 흡수 후 삭제, 옛 화면 고유 기능 4건(VI 최근 발동 줄·장 마감·VI 거래소 필터/전체 취소·미체결 출처 태그)은 사용자 결정으로 올림(18-13)
- [Phase 18]: TRADE-07 완료 표시 보류 — 18-03(마이그레이션 원격 반영) 미실행(18-13)
- [Phase 18]: 18-03: 실 DB 검증은 원격 public 스키마 덤프(supabase db dump --linked) 전후 diff 로 수행 — dma_orders 정책 0개·service_role GRANT 불변 확인
- [Phase 18]: [Phase 18 사용자 결정 2026-09-22] 돌파 목록은 가장 최신 돌파가 맨 위 — 리듀서/relay 정렬을 최신순으로 바꾼다(UI-SPEC 「최신 위」 채택, 갭 클로징에서 반영)
- [Phase 18]: [Phase 18 사용자 결정 2026-09-22] 등록 전략이 있는 카드의 ✕ 는 카드만 닫는다 — 서버 상따 전략은 유지(현 동작 확정)
- [Phase 18]: [Phase 18 사용자 결정 2026-09-22] 옛 화면 전용 기능 4개(VI 최근 발동 줄·장 마감 표시·VI 미체결 거래소 필터/전체 취소·미체결 출처 태그) 작업대 미이관 승인
- [Phase 18]: [Phase 18 사용자 결정 2026-09-22] 호가 탭 총잔량 줄 제거 승인
- [Phase 18]: 18-14: 취소 가격 = 원주문 가격 사본 — webapp·zod·조립기·DB CHECK 가 취소에 한해 0 이상 정수 한 규칙 (CR-01). 신규·정정 규칙 무변경, 마이그레이션 20260922120000 은 18-18 에서 원격 반영
- [Phase 18]: 18-15: VI 줄은 등록 전략의 계좌(server.accountNo)가 정본 — viRowAccountOf 한 값을 잠금·vi.set·확인 요약·고지가 읽고, 불일치여도 줄을 잠그지 않는다(중지 보장) (CR-02)
- [Phase 18]: WR-01: 시간외종가 선택 + 세션 null(창 닫힘·비 KRX)이면 주문을 만들지 않는다 — 확인 상세 orderType 은 요청을 만든 같은 session 에서 파생(다이얼로그 = 요청)
- [Phase 18]: WR-06: 정정 수량 ≤ 미체결 잔량 — 잔량 추종(내리기만)·제출 검증·확정 직전 재대조(불일치면 보내지 않음). 취소는 재대조 없음
- [Phase 18]: 가격 0 원주문은 OFFHOURS_PRICE_LABEL(「시간외종가」, order-confirm-dialog 단일 정의)로 표기
- [Phase 18]: 18-17: 돌파 목록 정렬 축 = exchangeTime 내림차순 · 동률 isin 오름차순 — relay sortRateCrossNewestFirst(getter·78 팬아웃)와 웹 sortRateCross 한 축, 캐시는 서버 원본 (사용자 결정 2026-09-22 · D-14)
- [Phase 18]: 18-19 WR-03: PendingOrder.kind(N/M/C) + narrowPending 요청 종류 하드 필터 — 통보 C→취소·M→정정·E→신규 대기만, requestKind New/Modify/Cancel 도 화이트리스트 하드 필터. 수정 전 6/6 재현(ws 에서 정정 요청이 cancelled 로 교차 정산)
- [Phase 18]: 18-18: 한쪽 문 체크포인트에서 사용자가 「지금 적용」(apply) 선택(2026-09-22) — 원격 dma_orders_price_check 를 취소 가격 0 허용으로 반영, 전후 덤프 diff CHECK 1줄
- [Phase 18]: 18-20: WR-02 는 CardGrid 카드별 고정 호스트 노드 + createPortal 로 닫음 — 상태 끌어올리기 기각, React Activity 금지(Next 번들 React 부재). 한 번 펼친 본문은 hidden 으로 유지
- [Phase 18]: 18-21: 작업대 카드 정체성은 작업대 발급 카드 id(wb-card-{n}) — 전략 키는 현재 값(대조용)일 뿐. 같은 종목 등록 전략 둘 = 카드 둘(D-03), 두 카드가 같은 키 금지(토글 충돌 시 기존 카드로 이동)
- [Phase 18]: [Phase 18 Plan 22]: 미체결 선택은 받을 카드를 보장한다 — 전달 조건(ISIN ∧ 거래소 ∧ 상태줄 계좌)을 느슨하게 하지 않고, 정확 일치 카드가 없으면 상태줄 계좌로 카드를 붙인다(cardForUnfilled · 송신 0)
- [Phase 18]: [Phase 18 Plan 22]: 포커스 요청 보류는 등록 목록을 알기 전에만 산다(knowsRegistered = limitChaserSnapSeq>0 ∧ 목록 비어 있지 않음). relay 는 콜드 세션에서 게이트웨이 64 전에 빈 lc.snap 을 먼저 내리므로 빈 스냅샷은 모호하게 다룬다 — 근본 수정(relay 인증 경로 3상태)은 deferred
- [Phase 18]: 18-23: 갭 클로징 10건(11행) 전부 닫힘으로 18-VALIDATION §Gap Closure 기록, TRADE-06~09 는 Gaps Found → Pending(재검증 대기) — Complete 는 재검증 몫. relay 미배포, 배포 순서 DB(완료) → relay → 검증 → webapp push
- [Phase 18]: 18-24: dma_orders_price_check 는 COALESCE(krx_session IN (G2,G3), false) 로 NULL 을 접고 G2/G3 가격 0 은 order_type=N 에만 연다 (20260922180000, 원격 반영은 18-29)
- [Phase 18]: 18-24: 18-18 T-18-82(세션 없는 가격 0 신규·정정 거부)는 사실이 아니었다 — 3값 논리로 CHECK 가 NULL 을 통과시켰다. 정정은 18-24 SUMMARY 에 기록
- [Phase 18]: 18-25: relay 통보 요청 종류 축은 wire requestKind 가 정본 — E→신규는 wire 가 비었을 때만의 휴리스틱, 통보 종류별 허용 집합 밖이면 모순 0건 (GC-WR-01)
- [Phase 18]: 18-26: relay 는 게이트웨이 64 를 받았을 때만 인증 경로 lc.snap 을 내린다(hasLimitChaserList) — lc.snap 은 언제나 확정 목록, 작업대 knowsRegistered = snapSeq > 0, 리듀서는 ready 전환마다 기준점 0. 배포는 relay 먼저 → webapp
- [Phase 18]: 18-27: 취소 확정 수량은 cancelQtyAtConfirm 으로 현재 잔량까지 내리기만(막지 않음·올리지 않음) — 폼·계좌 패널 공용 (GC-WR-02)
- [Phase 18]: 18-27: 시간외종가 원주문 판정은 order-confirm-dialog 의 isOffhoursOrder(board G2/G3 또는 가격 0) 하나 — 칩·다이얼로그·정정 잠금 공용 (GC-IN-03)
- [Phase 18]: 18-28: VI 계좌 이동은 중지 ∧ 등록 계좌≠상태줄 계좌일 때만 명시 동작 「상태줄 계좌({A})로 옮겨 시작」 하나 — 확정은 vi.set{accountNo:A, run:true} 1회, 일반 시작·수정은 계속 B (GC-WR-04)
- [Phase 18]: 18-28: 옮기기 확정 직전 viMoveTargetOf 재판정 · 스냅샷 from·to 전체 일치일 때만 송신, 아니면 VI_MOVE_STALE_TEXT · 창 유지 (T-18-118)
- [Phase 18]: 18-28: 가동 중 VI 불일치 고지는 「옮기려면 먼저 중지하세요」 — 버튼 DOM 부재 + submit 계좌 지정 가드 두 겹 (T-18-117)
- [Phase 18]: 18-30: 결과 모름(timeout) 잠금은 TradingWorkbench 가 계좌|ISIN|거래소 키로 들고 /trading 페이지를 떠날 때만 푼다 — ✕·접기·재추가·계좌 전환·DMA 게이트 전환으로 풀리지 않음. 잠긴 카드 ✕ 는 결과 모름 확인 다이얼로그(data-reason=unknown). 호가 탭은 폼 로컬 잠금 그대로 (GC-WR-03)
- [Phase 18]: 18-29: 사용자 apply 선택(위반 행 a=0·b=0) — 원격 dma_orders_price_check null-safe 적용, 전후 덤프 diff CHECK 1줄뿐(GC-CR-01 원격 닫힘)
- [Phase 18]: 18-31: 계좌 늦게 도착 시 사용자 카드의 펼침을 같은 키 등록 카드가 잇고 정리는 removeCard 와 같은 forgetCardState (GC-IN-05)
- [Phase 18]: 18-31: 잔고 평가 가격 = KRX 우선 · NXT 폴백(holdingQuotePrice, 카드 순서 무관) · NXT 전략만 「{종목명} · NXT」 꼬리(로그 who · 사이드바) (GC-IN-04)
- [Phase 18]: 18-33: R3-WR-01 상태 단조성은 relay supabaseOrderSink 조건부 UPDATE(status IN replaceableStatusesOf) — 마이그레이션 없음, 막힘은 warn+flushedNoop
- [Phase 18]: 18-34: 결과 모름 잠금 = RelayProvider 앱 수명(strategyKey) — 신규·정정만 · 진행 중 포함 · 로그아웃·새로고침에만 해제 (18-30 컨텍스트 승격 금지를 사용자 결정 1로 대체)
- [Phase 18]: 18-35: 주문 잠금 원천은 RelayProvider.orderLocks 하나 — 작업대는 ✕ 판정에만 읽고 폼은 스스로 읽는다(18-30 배선 제거)
- [Phase 18]: 18-35: 카드 정리(더티 키 · 직전 로그)는 커밋된 cards 에서 파생 — 치운 id 를 계산하지 않는다(R3-IN-03)
