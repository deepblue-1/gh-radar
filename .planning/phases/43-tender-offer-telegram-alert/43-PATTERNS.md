# Phase 43: 공개매수 공시 텔레그램 알림 - Pattern Map

**Mapped:** 2026-11-12
**Files analyzed:** 27 (새로 만듦 24 · 고침 3)
**Analogs found:** 25 / 27

모든 analog 경로는 `git ls-files` 로 추적 소스임을 확인했다. 새 워커 이름은 RESEARCH 권고 `workers/dart-alert/` 를 따른다(재량 — 바꾸면 아래 경로를 일괄 치환).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `workers/dart-alert/src/index.ts` | entry (Job) | batch / event-driven | `workers/kis-news-sync/src/index.ts` | exact |
| `workers/dart-alert/src/config.ts` | config | — | `workers/kis-news-sync/src/config.ts` | exact |
| `workers/dart-alert/src/logger.ts` | utility | — | `workers/kis-news-sync/src/logger.ts` | exact |
| `workers/dart-alert/src/apiUsage.ts` | service | CRUD (카운터) | `workers/kis-news-sync/src/apiUsage.ts` | exact (서비스 키만 다름) |
| `workers/dart-alert/src/cadence.ts` | utility (순수) | transform | `workers/kis-news-sync/src/pipeline/cadence.ts` | exact |
| `workers/dart-alert/src/collector.ts` | service (루프) | polling batch | `workers/kis-news-sync/src/collector.ts` | role-match (걸음 루프 → 고정 간격 바퀴로 단순화) |
| `workers/dart-alert/src/dart/client.ts` | HTTP client | request-response | `workers/kis-news-sync/src/kis/client.ts` + `src/kis/newsTitle.ts` | role-match |
| `workers/dart-alert/src/telegram/client.ts` | HTTP client | request-response | `workers/kis-news-sync/src/kis/client.ts` | role-match |
| `workers/dart-alert/src/watches.ts` | config(상수) + 순수 거르기 | transform | `workers/kis-news-sync/src/pipeline/classify.ts` | partial |
| `workers/dart-alert/src/message.ts` | utility (문구) | transform | — | 없음 (RESEARCH 코드 예시 사용) |
| `workers/dart-alert/src/services/supabase.ts` | service | — | `workers/kis-news-sync/src/services/supabase.ts` | exact |
| `workers/dart-alert/tests/*.test.ts` (+ `fixtures/`) | test | — | `workers/kis-news-sync/tests/*` | exact |
| `workers/dart-alert/tests/schedule.test.ts` | test | — | `workers/kis-news-sync/tests/schedule.test.ts` | exact |
| `workers/dart-alert/{Dockerfile,package.json,tsconfig.json,vitest.config.ts}` | config | — | `workers/kis-news-sync/` 같은 이름 파일 | exact |
| `supabase/migrations/2026111xxxxxxx_dart_alert.sql` | migration | CRUD + claim-once | `supabase/migrations/20261112200000_kis_news_collector.sql` · `20261107100100_dma_push_claim.sql` | exact (임대) / role-match (한 번만 잡기) |
| `supabase/tests/dart_alert.test.sql` | test (pgTAP) | — | `supabase/tests/kis_news_collector.test.sql` | exact |
| `scripts/deploy-dart-alert.sh` | script (배포) | — | `scripts/deploy-kis-news-sync.sh` (+ `deploy-limitup-sync.sh` Section 7) | exact |
| `scripts/setup-dart-alert-iam.sh` | script | — | `scripts/setup-kis-news-sync-iam.sh` | exact |
| `scripts/setup-dart-alert-secrets.sh` | script (비출력 비밀) | — | `scripts/setup-kis-secrets.sh` | exact |
| `scripts/smoke-dart-alert.sh` | script | — | `scripts/smoke-kis-news-sync.sh` | exact |
| `scripts/dart-alert-report.sh` | script (survey · stats) | — | `scripts/kis-news-report.sh` | exact |
| `scripts/telegram-find-chat.sh` | script (getUpdates 로 chat id 찾기) | — | — | 없음 (`setup-kis-secrets.sh` 의 비출력 규칙만 차용) |
| `ops/alert-dart-alert-failure.yaml` | config (모니터링) | — | `ops/alert-limitup-sync-failure.yaml` · `ops/alert-tick-convert-failure.yaml` | exact |
| `ops/alert-dart-alert-error-log.yaml` | config (로그 기반) | — | `ops/alert-discussion-sync-source-failure.yaml` | role-match |
| `CLAUDE.md` (고침) | docs | — | 기존 「공식 API 운영 기준」 블록(41 ~ 55행) | exact |
| `docs/stack.md` (고침) | docs | — | 기존 공식 API 절 | exact |
| `.planning/ROADMAP.md` (고침) | docs | — | Phase 43 절(670행 부근 · 목록 73행) | exact |

`pnpm-workspace.yaml` 은 `workers/*` 와일드카드(6행)라 고칠 필요 없다. `pnpm-lock.yaml` 은 `pnpm install` 로 새 importer 가 자동 추가된다(Dockerfile 이 `--frozen-lockfile` 이라 반드시 커밋).

## Pattern Assignments

### `workers/dart-alert/src/index.ts` (entry, batch)

**Analog:** `workers/kis-news-sync/src/index.ts` (153행 전체를 복제 후 축소)

- **pgError · rpcBool 도우미** (27 ~ 37행) 그대로:
```typescript
function pgError(name: string, e: unknown): Error {
  const o = (e ?? {}) as { code?: unknown; message?: unknown };
  const code = typeof o.code === "string" ? ` (${o.code})` : "";
  return new Error(`${name} 실패: ${typeof o.message === "string" ? o.message : "unknown"}${code}`);
}
async function rpcBool(supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw pgError(fn, error);
  return data === true;
}
```
- **abortableSleep** (39 ~ 51행) 그대로 — SIGTERM 시 바퀴 사이 대기를 즉시 깬다.
- **buildDeps** (53 ~ 117행): `holder = \`${process.env.CLOUD_RUN_EXECUTION ?? "local"}:${randomUUID().slice(0, 8)}\`` · `clock: { now: () => Date.now() }` · `db.leaseAcquire/leaseRelease` 를 `dart_alert_lease_acquire/release` 로 바꾼다. `kis` 블록 대신 `dart.list(...)` · `telegram.send(...)` 를 결선. 토큰 발급(`getKisAccessToken`)은 필요 없다(OpenDART 는 `crtfc_key` 쿼리 인자).
- **main()** (120 ~ 144행): 설정 오류는 `msg1` 에 env 이름만, `log.child({ app: "dart-alert", version })`, `process.once("SIGTERM"|"SIGINT")` → `ac.abort()`, 예외는 `safeErrorFields(err)` 만 로그 후 `return 1`.
- **CLI 가드** (147 ~ 153행): `if (process.argv[1]?.endsWith("index.js")) main().then(code => process.exit(code), () => process.exit(1));`

### `workers/dart-alert/src/config.ts` (config)

**Analog:** `workers/kis-news-sync/src/config.ts` (83행)

- `import "dotenv/config";` 첫 줄 · `req()` / `optional()` / `intEnv(key, fallback, min, max)` / `parseMode()` (40 ~ 67행) 그대로 복사.
- 비밀은 `req("DART_API_KEY")` · `req("TELEGRAM_BOT_TOKEN")` · `req("TELEGRAM_CHAT_ID")` 류(이름은 플랜 재량, 배포 스크립트 `--set-secrets` 와 같은 계약). 오류 메시지에는 env 이름만 — `throw new Error(\`missing env: ${key}\`)` (42행 꼴).
- 모드 `auto | probe | seed | test-send` (RESEARCH 「config.ts」 줄) — `MODES` 배열 + `parseMode` 꼴 그대로.
- 예산 상한: `intEnv("DART_ALERT_DAILY_BUDGET", 15_000, 1, 15_000)` 처럼 **최대값을 15,000 으로 막는다**(kis 의 `KIS_MAX_RPS_LIMIT` 상한 꼴, 31 ~ 32행).

### `workers/dart-alert/src/logger.ts` (utility)

**Analog:** `workers/kis-news-sync/src/logger.ts` (42행 전체)

```typescript
const SECRET_KEYS = [ /* … */ ] as const;
const SECRET_CONTAINERS = ["headers", "config"] as const;
export const REDACT_PATHS: string[] = [...SECRET_KEYS, ...SECRET_CONTAINERS].flatMap((k) => [k, `*.${k}`]);
export function createLogger(level = "info", destination?: DestinationStream) {
  const options: pino.LoggerOptions = { level, redact: { paths: REDACT_PATHS, censor: "[redacted]" } };
  return destination ? pino(options, destination) : pino(options);
}
```
`SECRET_KEYS` 를 `crtfc_key` · `botToken` · `token` · `url`(텔레그램 URL 에 토큰이 박힘) · `dartApiKey` · `telegramBotToken` · `supabaseServiceRoleKey` 로 교체. 테스트는 `workers/kis-news-sync/tests/logger.test.ts` 꼴(destination 주입 후 문자열에 비밀 없음 단언).

### `workers/dart-alert/src/apiUsage.ts` (service, 카운터)

**Analog:** `workers/kis-news-sync/src/apiUsage.ts` (109행 — 서비스 키 상수만 바꿔 복제)

- 상수 (32 ~ 34행): `export const DART_USAGE_SERVICE = "opendart_list";` 류 · `BUDGET_WARN_RATIO = 0.8`.
- `kstDateString` (39 ~ 42행) · `checkBudget` (45 ~ 60행) · `incrementUsage` → `supabase.rpc("incr_api_usage", { p_service, p_date, p_amount })` (63 ~ 76행) · `budgetStateOf` (89 ~ 93행) · `UsageCounter`(flush 실패 시 되돌림, 95 ~ 109행) 그대로.
- 한도 소진(OpenDART status `020`) 신호 시 「quota strike」 기록 + 다음 실행 단독 탐침 — `readQuotaStrikes`/`recordQuotaStrike` (78 ~ 86행) 꼴 그대로(CLAUDE.md 공식 API 기준 ④).
- `api_usage` 표와 `incr_api_usage` RPC 는 `supabase/migrations/20260417120000_api_usage.sql` 에 이미 있다 — service 는 자유 text 라 마이그레이션 불필요.

### `workers/dart-alert/src/cadence.ts` (utility, 순수)

**Analog:** `workers/kis-news-sync/src/pipeline/cadence.ts` (62행)

```typescript
const KST_OFFSET_MS = 9 * 3_600_000;
function kstShifted(now: Date): Date { return new Date(now.getTime() + KST_OFFSET_MS); }
export function kstMinuteOfDay(now: Date): number {
  const t = kstShifted(now);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}
export function kstDayOfWeek(now: Date): number { return kstShifted(now).getUTCDay(); }
export function fastWindowEndOf(now: Date): Date { /* 51 ~ 56행 — KST 자정 + 분 */ }
```
새 함수 `roundIntervalMs(now)`: 주말 → null · `420 ≤ m < 540` → 5,000 · `540 ≤ m < 1200` → 10,000 · 그 밖 null (RESEARCH Pattern 2). 창 상수는 `FAST_WINDOW_START_MIN = 420` · `END_MIN = 1200` 꼴로 export(스케줄 테스트가 읽는다).

### `workers/dart-alert/src/collector.ts` (service, polling 루프)

**Analog:** `workers/kis-news-sync/src/collector.ts` (689행 — 골격만 차용, 걸음 · 토큰 버킷은 버린다)

- **DI 계약** (96 ~ 102행 부근): `CollectorDeps { cfg; log; clock; sleep; signal; holder; db: { leaseAcquire(holder, ttl); leaseRelease(holder); usage; strikes; … } }` — 같은 꼴에 `dart` · `telegram` · `db.claim/markSent/...` 를 더한다. 단위 테스트가 가짜 시계로 결선한다(`tests/collector.test.ts` 꼴).
- **시작 임대** (227 ~ 236행): `this.haveLease = await db.leaseAcquire(holder, LEASE_TTL_S); if (!this.haveLease) { log.info(..., "lease held by another run — exiting"); return { code: 0, reason: "lease_held" }; }`
- **시작 예산 확인** (243 ~ 246행) · `budgetGate()` (599 ~ 604행): exhausted 면 `throw new StopRun(1, "budget_exhausted")`.
- **임대 연장** (628 ~ 644행): 실패 시 5초 재시도, 너무 오래 미확인이면 `StopRun(0, "lease_unconfirmed")`, 거절이면 `StopRun(0, "lease_lost")`.
- **SIGTERM** (672 ~ 674행): `if (this.d.signal?.aborted) throw new StopRun(0, "aborted");`
- **finally 해제** (680 ~ 689행): 사용량 flush 후 `leaseRelease(holder)`.
- `StopRun(code, reason)` 예외 클래스로 종료 코드를 운반하는 패턴을 그대로 쓴다.

### `workers/dart-alert/src/dart/client.ts` · `telegram/client.ts` (HTTP client)

**Analog:** `workers/kis-news-sync/src/kis/client.ts` (106행) · `src/kis/newsTitle.ts` (쪽 호출)

- **오류 분류 함수** (43 ~ 53행 꼴):
```typescript
export function classifyKisError(status: number, msgCd: string | null | undefined): KisErrorKind {
  if (status === 0 || status >= 500) return "transient";
  if (status === 429) return "rate_limit";
  …
}
```
→ `classifyDartStatus(status: string)` (`000` ok · `013` 빈 결과 · `020` 한도 · `010/011/012/901` 키 · 그 밖 unknown) · `classifyTelegramError(code, description, parameters)` (429 `retry_after` · `migrate_to_chat_id` · 403 · 401).
- **오류 클래스** (55 ~ 70행): `class KisApiError extends Error { readonly status; readonly kind; }` 꼴.
- **safeErrorFields** (85 ~ 106행): axios 오류에서 `status · code · kind` 만 뽑고 `config`/`request` 는 보지 않는다 — 텔레그램 URL 에 토큰이 들어 있으므로 **필수**.
- `createKisHttp(baseUrl)` 꼴로 axios 인스턴스(timeout 고정) 생성.

### `workers/dart-alert/src/watches.ts` · `message.ts`

- `watches.ts`: RESEARCH Pattern 1 코드(330 ~ 354행)를 그대로 쓴다. 순수 정규식 분류 꼴은 `workers/kis-news-sync/src/pipeline/classify.ts` 참고.
- `message.ts`: 코드베이스에 텔레그램 HTML 문구 analog 없음 — RESEARCH 의 문구 · 이스케이프 예시 사용.

### `workers/dart-alert/src/services/supabase.ts`

**Analog:** `workers/kis-news-sync/src/services/supabase.ts` (15행) — `createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })` 그대로.

### 패키지 · 빌드 파일

- `package.json`: kis 와 동일, `"name": "@gh-radar/dart-alert"`. 의존성 `@supabase/supabase-js` · `axios` · `dotenv` · `pino` (`@gh-radar/shared` 는 쓰지 않으면 빼되, 빼면 Dockerfile 의 shared 복사 줄도 같이 뺀다).
- `Dockerfile`: kis 파일의 `kis-news-sync` 문자열만 `dart-alert` 로 치환(2단계 빌드 · `pnpm deploy --legacy` · `cp dist` · `USER app` · `ARG GIT_SHA → APP_VERSION`).
- `vitest.config.ts`: 그대로 (`maxWorkers: Number(process.env.VITEST_MAX_WORKERS) || 2` — Mac 메모리 고갈 방지).
- `tsconfig.json`: 그대로.

### `workers/dart-alert/tests/schedule.test.ts`

**Analog:** `workers/kis-news-sync/tests/schedule.test.ts` (186행)

배포 스크립트를 `readFileSync` 로 읽어 `declare -a DART_SCHEDULERS=( "이름|cron" … )` 배열을 `parseBashArray` (19 ~ 27행)로 파싱 → 1주일 × 1440분 전개해 `cadence.ts` 창(평일 `07:00 ~ 20:00`)과 분 단위 일치 단언. `SCRIPT_PATH = path.resolve(__dirname, "../../../scripts/deploy-dart-alert.sh")`.

### `supabase/migrations/2026111xxxxxxx_dart_alert.sql` (migration)

**Analog A — 임대 · 권한:** `supabase/migrations/20261112200000_kis_news_collector.sql`
- 헤더 주석에 RPC 목록 · 권한 정책 · 되돌리기(`DROP FUNCTION …`) 블록 (1 ~ 40행 꼴).
- 표 권한 (54 ~ 56행):
```sql
REVOKE ALL ON TABLE public.kis_access_tokens FROM PUBLIC;
REVOKE ALL ON TABLE public.kis_access_tokens FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.kis_access_tokens TO service_role;
```
- 임대 획득 (60 ~ 91행): 인자 검증 `RAISE EXCEPTION … USING ERRCODE = '22023'` → `UPDATE … SET lease_holder = p_holder, lease_until = now() + make_interval(secs => p_ttl_seconds) WHERE … AND (lease_holder IS NULL OR lease_until IS NULL OR lease_until < now() OR lease_holder = p_holder)` → 함수 권한 3줄(REVOKE PUBLIC · REVOKE anon, authenticated · GRANT service_role) → `COMMENT ON FUNCTION`.
- 해제 (97 ~ 123행) 같은 꼴.
- SECURITY INVOKER · `SET search_path` 고정 (33 ~ 35행 주석 규칙).

**Analog B — 한 번만 잡기:** `supabase/migrations/20261107100100_dma_push_claim.sql`
- `ON CONFLICT … DO NOTHING` 으로 접수번호(rcept_no) 기준 1회 insert (474 · 510행 꼴), 권한 3줄 (528 ~ 530행).

### `supabase/tests/dart_alert.test.sql` (pgTAP)

**Analog:** `supabase/tests/kis_news_collector.test.sql` — 머리 주석의 「잠그는 것: L(임대) · … · P(권한)」 목록 꼴, 한 트랜잭션 + ROLLBACK, `now()` 고정이라 「n분 전」 은 `now() - interval` 로 박는다. 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dart_alert.test.sql`.

### `scripts/deploy-dart-alert.sh`

**Analog:** `scripts/deploy-kis-news-sync.sh`
- Section 0 상수 · `declare -a KIS_SCHEDULERS=(…)` (56 ~ 85행) — 이름 `DART_SCHEDULERS`.
- Section 0b `--self-test` (86 ~ 150행): 배열 원소 수 · cron 리터럴 · `grep -Eq '^[[:space:]]+--max-retries=0[[:space:]]*\\$' "$self"` 처럼 배포 명령 줄을 자기 파일에서 검사, GCP 접촉 0, `SELF-TEST OK — …` 출력.
- 인자 처리 (154 ~ 166행) `--self-test · --help`.
- 비밀 존재 + ENABLED 버전 확인 (208 ~ 223행) — 없으면 `! bash scripts/setup-dart-alert-secrets.sh` 안내.
- `gcloud run jobs deploy … --task-timeout=… --max-retries=0 --set-secrets="SUPABASE_SERVICE_ROLE_KEY=…:latest,…"` (285 ~ 300행 꼴).
- Scheduler update-or-create 루프 (316 ~ 340행): `"${entry%%|*}"` / `"${entry#*|}"`.
- **알림 정책 Section** — `scripts/deploy-limitup-sync.sh` 158 ~ 185행 그대로: `NOTIFICATION_CHANNEL_ID` 정규화 → `sed` 치환 → `gcloud alpha monitoring policies list --filter=displayName=…` → update 또는 create. 정책 파일 2개면 루프로.
- 배포는 메인 세션이 실행(서브에이전트 배포 분류기 차단 — executor 는 커밋까지).

### `scripts/setup-dart-alert-secrets.sh` · `setup-dart-alert-iam.sh`

- 비밀: `scripts/setup-kis-secrets.sh` — `read -s` 입력 → `put_secret()` (166 ~ 180행): 현재 값과 같으면 SKIP, `printf '%s' "$secret_value" | gcloud secrets versions add "$secret" --data-file=-`, 변수는 쓰고 나서 즉시 비움. 사용자 안내는 `! bash scripts/setup-dart-alert-secrets.sh` (비밀 주입은 사용자 `!` 실행 규칙).
- IAM: `scripts/setup-kis-news-sync-iam.sh` 복제(SA 생성 · Secret 빈 껍데기 생성 · accessor 바인딩).

### `scripts/smoke-dart-alert.sh` · `dart-alert-report.sh` · `telegram-find-chat.sh`

- smoke: `scripts/smoke-kis-news-sync.sh` 꼴(Job execute → 로그 확인).
- report: `scripts/kis-news-report.sh` 의 하위명령(`survey` · `stats`) 꼴.
- telegram-find-chat: analog 없음 — 토큰은 Secret Manager 에서 읽어 변수로만 쓰고 출력하지 않으며 chat id · 제목만 출력.

### `ops/alert-dart-alert-failure.yaml` · `alert-dart-alert-error-log.yaml`

**Analog:** `ops/alert-limitup-sync-failure.yaml` — `displayName` · `documentation.content`(원인 · 확인 명령 한국어) · `conditionThreshold` filter `resource.type = "cloud_run_job" AND resource.labels.job_name = "gh-radar-dart-alert" AND metric.type = "run.googleapis.com/job/completed_execution_count" AND metric.labels.result = "failed"` · `notificationChannels: ["${NOTIFICATION_CHANNEL_ID}"]` · `autoClose: 1800s`. 로그 기반 조건(장애 5분 기준)은 `ops/alert-discussion-sync-source-failure.yaml` 의 로그 조건 꼴을 따른다.

### 문서 고침

- `CLAUDE.md` 「공식 API 운영 기준」(41 ~ 55행): 제목 괄호에 OpenDART 추가, 「공식 한도」 · 「소비처」 · 「예산」 · 「수집 주기」 불릿에 OpenDART 20,000/일 · `api_usage` 서비스 키 · 15,000 상한 · 평일 `07:00 ~ 20:00` 5초/10초를 한 줄씩 덧붙인다(기존 Naver 줄은 유지).
- `docs/stack.md`: 근거 · 대안 비교(한투 · KIND 제외 이유)는 여기로.
- `.planning/ROADMAP.md`: 73행 목록 · 670행 Phase 43 절. 동시 세션 경합 주의(main tree 직접 편집 · 경로 지정 커밋).

## Shared Patterns

### 비밀 안전 로그
**Source:** `workers/kis-news-sync/src/logger.ts` + `src/kis/client.ts` `safeErrorFields`
**Apply to:** 워커 전 파일 — catch 에서는 `safeErrorFields(err)` 만 로그, 로거 redact 가 마지막 그물. LLM 은 없지만 「무로그 fail-safe 금지」 원칙대로 모든 catch 는 사유를 남긴다.

### 임대(단일 실행) + StopRun 종료 코드
**Source:** `collector.ts` 227 ~ 236 · 628 ~ 689행, 마이그레이션 60 ~ 123행
**Apply to:** collector · migration · pgTAP L 절.

### 예산 카운터 + 한도 소진 시 단독 탐침
**Source:** `apiUsage.ts` 전체
**Apply to:** collector · config(상한 15,000) · report stats.

### 함수 권한 3줄
**Source:** `20261112200000_kis_news_collector.sql` 89 ~ 91행
**Apply to:** 새 RPC 전부 — `REVOKE … FROM PUBLIC; REVOKE … FROM anon, authenticated; GRANT EXECUTE … TO service_role;` (auto-grant 함정).

### 배포 스크립트 ↔ 테스트 정합
**Source:** `deploy-kis-news-sync.sh` `--self-test` + `tests/schedule.test.ts`
**Apply to:** deploy 스크립트 · cadence · schedule 테스트.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `workers/dart-alert/src/message.ts` | utility | transform | 텔레그램 HTML 문구 생성 코드가 저장소에 없음 — RESEARCH 예시 사용 |
| `scripts/telegram-find-chat.sh` | script | request-response | 텔레그램 getUpdates 사용처 없음 — 비출력 규칙만 `setup-kis-secrets.sh` 에서 차용 |

## Metadata

**Analog search scope:** `workers/kis-news-sync/` · `supabase/migrations/` · `supabase/tests/` · `scripts/` · `ops/` · `CLAUDE.md` · `pnpm-workspace.yaml`
**Files scanned:** 약 30
**Pattern extraction date:** 2026-11-12
