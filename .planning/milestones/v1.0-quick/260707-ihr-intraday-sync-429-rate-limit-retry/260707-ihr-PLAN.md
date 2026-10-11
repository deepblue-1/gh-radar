---
phase: quick-260707-ihr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - workers/intraday-sync/src/retry.ts
  - workers/intraday-sync/tests/retry.test.ts
  - workers/intraday-sync/src/config.ts
  - workers/intraday-sync/src/kiwoom/rateLimiter.ts
  - workers/intraday-sync/src/kiwoom/fetchHotSet.ts
  - scripts/deploy-intraday-sync.sh
autonomous: true
requirements: [QUICK-260707-ihr]
must_haves:
  truths:
    - "키움 429 (rate limit) 에러 시 withRetry 가 최대 5회 시도한다 (대기 1s/2s/4s/8s, 총 최대 15초)"
    - "비-429 에러는 기존과 동일하게 3회 시도 / 200ms base backoff 를 유지한다 (회귀 없음)"
    - "withRetry 의 기존 시그니처 (fn, label, attempts=3) 가 호출부 무변경으로 호환된다"
    - "키움 호출 속도가 worker 전반(ka10027 페이지네이션 + ka10001 hot set 공유 token bucket)에서 4 req/s 로 하향된다"
    - "deploy-intraday-sync.sh 의 KA10001_RATE_LIMIT env 가 4 로 코드 default 와 일치한다"
    - "workers/intraday-sync 기존 vitest 전부 green + 429 5회 재시도 동작을 검증하는 테스트가 존재한다"
  artifacts:
    - path: "workers/intraday-sync/src/retry.ts"
      provides: "rate-limit 에러 시 유효 attempts 를 5 로 승격하는 withRetry"
      contains: "RATE_LIMIT_ATTEMPTS"
    - path: "workers/intraday-sync/tests/retry.test.ts"
      provides: "429 5회 재시도 (1000/2000/4000/8000ms) + 비-429 3회 유지 검증"
    - path: "workers/intraday-sync/src/config.ts"
      provides: "ka10001RateLimitPerSec default 4"
      contains: "KA10001_RATE_LIMIT, 4"
    - path: "workers/intraday-sync/src/kiwoom/rateLimiter.ts"
      provides: "BUCKET_CAPACITY_DEFAULT / REFILL_RATE_PER_SEC_DEFAULT = 4 + 2026-07-03 관측 주석"
      contains: "= 4"
    - path: "scripts/deploy-intraday-sync.sh"
      provides: "COMMON_ENV KA10001_RATE_LIMIT=4"
      contains: "KA10001_RATE_LIMIT=4"
  key_links:
    - from: "workers/intraday-sync/src/retry.ts isRateLimitError 분기"
      to: "유효 attempts 5 승격 (maxAttempts)"
      via: "rate-limit 감지 시 maxAttempts = Math.max(maxAttempts, RATE_LIMIT_ATTEMPTS)"
      pattern: "RATE_LIMIT_ATTEMPTS"
    - from: "workers/intraday-sync/src/index.ts:77"
      to: "kiwoom/rateLimiter.ts token bucket"
      via: "configureKiwoomRateLimiter({ capacity/refillRatePerSec: config.ka10001RateLimitPerSec })"
      pattern: "configureKiwoomRateLimiter"
    - from: "scripts/deploy-intraday-sync.sh COMMON_ENV"
      to: "config.ts loadConfig KA10001_RATE_LIMIT"
      via: "Cloud Run Job env var"
      pattern: "KA10001_RATE_LIMIT=4"
---

<objective>
intraday-sync 키움 429 rate limit 장애 방어 강화. 2026-07-07 Cloud Run Job 3회 실패 (KST 09:12/09:53/11:23) — fetchKa10027 페이지네이션에서 키움 429 가 withRetry 3회 (1s/2s 대기) 를 전부 소진하고 exit(1). 429 경합은 7/3부터 급증 (일 1~6건 → 127~150건) 했고 내부 요인 (사이클 겹침·row 증가·appkey 공유·코드 변경) 은 로그로 배제됨 → 키움 측 실효 유량 한도가 7/3경 축소된 것으로 추정.

대응 2축: ① 429 에 한해 재시도 5회 (1s/2s/4s/8s, 총 15s) 로 회복 여유 확대, ② 호출 속도 5→4 req/s 하향으로 429 발생 자체 감소.

Purpose: 매분 사이클의 간헐 429 로 인한 Job 실패 (exit 1) 를 제거하고, 갱신 공백 (stale 시세) 을 방지.
Output: retry.ts 429 백오프 강화 + 테스트, rate limit 4 req/s 통일 (config/rateLimiter/deploy 스크립트), 주석 실측 근거 갱신.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@workers/intraday-sync/src/retry.ts
@workers/intraday-sync/tests/retry.test.ts
@workers/intraday-sync/src/config.ts
@workers/intraday-sync/src/kiwoom/rateLimiter.ts
@scripts/deploy-intraday-sync.sh

배경:
- 7/6 sort_tp 1+3 병합 배포 (quick-260706-ktd) 로 ka10027 호출이 사이클당 2회 — 하락 종목 일봉 동결 버그 수정이므로 유지 (롤백 불가).
- ka10027 페이지네이션 (fetchRanking.ts) 과 ka10001 hot set (fetchHotSet.ts) 이 동일 token bucket (rateLimiter.ts) 을 공유 — refill rate 하향은 worker 전체 키움 호출에 적용됨.
- server/src/kiwoom/rateLimiter.ts (on-demand ~100건/일) 는 이번 범위 밖 — 저볼륨이라 5 유지, worker 쪽 주석에 비대칭을 명시.
- 배포는 계획 범위 밖 (사용자가 scripts/deploy-intraday-sync.sh 로 수행).

<interfaces>
From workers/intraday-sync/src/retry.ts (현재):
```typescript
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  attempts = 3,
): Promise<T>
// 내부: isRateLimitError(err) → baseMs 1000 (아니면 200), waitMs = baseMs * 2^(i-1)
```

From workers/intraday-sync/src/kiwoom/rateLimiter.ts:
```typescript
export function configureKiwoomRateLimiter(opts: { capacity: number; refillRatePerSec: number }): void;
export async function acquireKiwoomRateToken(): Promise<void>;
export function resetKiwoomRateLimiter(): void;
// module-level bucket 초기값: BUCKET_CAPACITY_DEFAULT / REFILL_RATE_PER_SEC_DEFAULT (현재 5/5)
```

From workers/intraday-sync/src/config.ts:
```typescript
ka10001RateLimitPerSec: parseNumberEnv(process.env.KA10001_RATE_LIMIT, 5)  // → 4 로 변경
```

Wiring (무변경): index.ts:77 `configureKiwoomRateLimiter({ capacity: config.ka10001RateLimitPerSec, refillRatePerSec: config.ka10001RateLimitPerSec })` 형태로 config 값이 bucket 에 주입됨.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: retry.ts 429 백오프 강화 — rate-limit 에러 시 유효 attempts 5 승격</name>
  <files>workers/intraday-sync/src/retry.ts, workers/intraday-sync/tests/retry.test.ts</files>
  <behavior>
    - 429 에러 연속 4회 후 5번째 성공 → 결과 반환, fn 5회 호출, 대기 1000/2000/4000/8000ms 관측
    - 429 에러 5회 모두 실패 → 마지막 에러 throw, fn 정확히 5회 호출 (6회 아님)
    - 비-429 에러 3회 모두 실패 → 기존과 동일하게 3회에서 throw (승격 없음), 대기 200/400ms
    - 기존 테스트 유지: 성공 1회 / 일반 에러 200/400ms / rate-limit 키워드 감지 1000ms
    - 혼합 케이스: 일반 에러 후 429 발생 시에도 429 시점부터 attempts 승격 적용 (총 시도 5회까지 허용)
  </behavior>
  <action>
    **테스트 먼저 (RED):** `workers/intraday-sync/tests/retry.test.ts` 갱신.
    - 기존 "키움 429 에러는 1000/2000ms backoff" 테스트는 유지 (2회 실패 후 성공 — 여전히 유효).
    - 신규: "키움 429 는 최대 5회 시도 (1s/2s/4s/8s)" — mockRejectedValue 4회 `new Error("키움 429 — rate limit")` 후 mockResolvedValueOnce("ok"). setTimeout spy 로 waitMs 배열에 1000/2000/4000/8000 포함 확인 + fn 5회 호출.
    - 신규: "429 5회 모두 실패 시 throw" — 5회 전부 reject, fn 정확히 5회 (승격 상한 검증).
    - 신규: "비-429 는 3회에서 중단 (승격 없음)" — 기존 "3회 모두 실패" 테스트가 이미 커버하나, 429 승격 도입 후에도 3회 유지됨을 명시하는 이름으로 확인 (기존 테스트 그대로 두면 충분 — 중복 추가 금지).
    - fake timers 는 기존 패턴 (vi.useFakeTimers + runAllTimersAsync) 재사용.

    **구현 (GREEN):** `workers/intraday-sync/src/retry.ts` —
    - 시그니처 `withRetry<T>(fn, label, attempts = 3)` 무변경 (호출부 10곳 호환).
    - 모듈 상수 `const RATE_LIMIT_ATTEMPTS = 5;` 추가.
    - 루프 상한을 지역변수 `let maxAttempts = attempts;` 로 두고, catch 에서 `isRateLimitError(err)` 이면 `maxAttempts = Math.max(maxAttempts, RATE_LIMIT_ATTEMPTS);` 로 승격 후 `if (i === maxAttempts) break;` 판정. baseMs 분기 (429=1000 / 그 외=200) 와 `waitMs = baseMs * 2^(i-1)` 지수 로직은 무변경 → 429 대기 자연히 1s/2s/4s/8s (총 15s).
    - 주의: 승격 판정 (`maxAttempts` 갱신) 을 `if (i === maxAttempts) break;` **이전에** 수행 — 3번째 시도에서 처음 429 를 만나도 5회까지 확장되게.
    - 파일 상단 주석 갱신: "1s/2s/4s (총 7s)" 서술 → "429 는 시도 5회로 승격, 대기 1s/2s/4s/8s (총 최대 15s)" + 근거 한 줄 추가: "2026-07-07 운영 로그: 7/3부터 429 급증 (일 1~6건 → 127~150건), 3회/총 3s 대기로 회복 불가 → Job 3회 실패".
  </action>
  <verify>
    <automated>cd workers/intraday-sync && npx vitest run tests/retry.test.ts</automated>
  </verify>
  <done>retry.test.ts 전부 green. 429 경로: fn 최대 5회 + 대기 1000/2000/4000/8000ms 검증 테스트 존재. 비-429 경로: 3회/200ms base 기존 테스트 무변경 통과. withRetry 호출부 (index.ts 10곳) 무수정.</done>
</task>

<task type="auto">
  <name>Task 2: 키움 호출 속도 5→4 req/s 하향 (config + rateLimiter + deploy 스크립트)</name>
  <files>workers/intraday-sync/src/config.ts, workers/intraday-sync/src/kiwoom/rateLimiter.ts, workers/intraday-sync/src/kiwoom/fetchHotSet.ts, scripts/deploy-intraday-sync.sh</files>
  <action>
    세 곳의 default/env 를 4 로 통일 + 주석에 2026-07-03 관측 근거 추가:

    1. `workers/intraday-sync/src/config.ts`
       - line 56: `parseNumberEnv(process.env.KA10001_RATE_LIMIT, 5)` → fallback `4`.
       - line 20 주석: `default 5 (2026-05-15 실측 후 하향, ...)` → `default 4 (2026-05-15 실측 5 → 2026-07-03 키움 실효 한도 축소 관측으로 4 재하향, deploy 스크립트와 일치)`.

    2. `workers/intraday-sync/src/kiwoom/rateLimiter.ts`
       - `BUCKET_CAPACITY_DEFAULT = 5` → `4`, `REFILL_RATE_PER_SEC_DEFAULT = 5` → `4`.
       - 파일 상단 주석 문단에 추가: "2026-07-03경 키움 실효 유량 한도 축소 관측 — 5 req/s 로도 429 급증 (일 1~6건 → 127~150건, 7/6 sort_tp 1+3 병합으로 ka10027 노출 2배 겹침) → 4 로 재하향 (2026-07-07)." 그리고 기존 "양쪽 동일 default 적용" 문장을 정정: "server (on-demand ~100건/일, 저볼륨) 는 5 유지 — worker 만 4 로 비대칭 하향."

    3. `scripts/deploy-intraday-sync.sh`
       - line 88 COMMON_ENV: `KA10001_RATE_LIMIT=5` → `KA10001_RATE_LIMIT=4`.
       - line 78-81 KA10001_RATE_LIMIT 주석 블록 끝에 추가: `##   2026-07-03경 키움 실효 한도 재축소 (429 일 127~150건 급증, 7/7 Job 3회 실패) → 4 로 재하향 (2026-07-07).`

    4. (drive-by 주석 정정) `workers/intraday-sync/src/kiwoom/fetchHotSet.ts` line 15: "token bucket 강제 (24 req/s default)" — stale 값. "(4 req/s default)" 로 정정. 코드 변경 없음.

    사이클 시간 영향 (변경 불요, 확인만): STEP1 ka10027 (~60페이지 × 2 sort_tp) + STEP2 ka10001 (100건) ≈ 160 호출 / 4 req/s ≈ 40~45초 — 60초 주기 내 안전. worst case (429 재시도 +15s) 는 드묾, 허용.
  </action>
  <verify>
    <automated>cd workers/intraday-sync && npx vitest run && npx tsc --noEmit && grep -c "KA10001_RATE_LIMIT=4" ../../scripts/deploy-intraday-sync.sh</automated>
  </verify>
  <done>config.ts default 4 / rateLimiter.ts 두 상수 4 / deploy 스크립트 env 4 — 세 값 일치. 주석 3곳에 2026-07-03 실효 한도 축소 관측 근거 반영. fetchHotSet.ts stale "24 req/s" 주석 정정. 전체 vitest + typecheck exit 0.</done>
</task>

</tasks>

<verification>
- `cd workers/intraday-sync && npm test` (vitest run) 전체 green — retry 신규 테스트 포함, 기존 테스트 (fetchRanking/fetchHotSet/runCycle 등) 회귀 없음.
- `npx tsc --noEmit` exit 0.
- `grep -rn "KA10001_RATE_LIMIT" workers/intraday-sync/src/config.ts scripts/deploy-intraday-sync.sh` — 두 곳 모두 4.
- `grep -n "= 4" workers/intraday-sync/src/kiwoom/rateLimiter.ts` — capacity/refill 둘 다 4.
- 배포는 범위 밖: 사용자가 `bash scripts/deploy-intraday-sync.sh` 수행 후 다음 장중 429 warning 건수 감소 및 Job 실패 0 을 로그로 확인.
</verification>

<success_criteria>
- 429 에러 시 withRetry 가 5회 시도 (대기 1s/2s/4s/8s, 총 최대 15초), 비-429 는 기존 3회/200ms 유지 — 테스트로 증명.
- withRetry 시그니처 호환 유지, 호출부 (index.ts 10곳) 무수정.
- 키움 호출 속도 4 req/s 로 config default / rateLimiter default / deploy env 3곳 일치.
- 주석 (retry.ts 헤더, rateLimiter.ts 헤더, config.ts, deploy 스크립트) 이 실제 동작·근거와 일치.
- workers/intraday-sync vitest 전체 + typecheck green.
</success_criteria>

<output>
After completion, create `.planning/quick/260707-ihr-intraday-sync-429-rate-limit-retry/260707-ihr-SUMMARY.md`
</output>
