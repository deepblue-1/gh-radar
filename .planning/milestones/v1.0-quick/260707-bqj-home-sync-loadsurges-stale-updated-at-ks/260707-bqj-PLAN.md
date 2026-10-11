---
phase: quick-260707-bqj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - workers/home-sync/src/pipeline/loadSurges.ts
  - workers/home-sync/src/pipeline/loadSurges.test.ts
  - workers/home-sync/src/index.ts
autonomous: true
requirements: [QUICK-260707-bqj]
must_haves:
  truths:
    - "loadSurges 는 오늘 KST 자정 이후 갱신된(updated_at >= 오늘 KST 00:00) stock_quotes 급등 행만 선정한다"
    - "어제 상한가 30%·거래정지 잔재(+177% 등) stale 행은 프리마켓/장중 모두 오늘의 급등에서 제외된다"
    - "기존 empty-retry 로직 / 종목명 해석 / 48h 뉴스 2단 정렬 top-K 는 회귀 없이 유지된다"
    - "KST 자정 컷오프 계산이 자정 직전/직후 경계에서 정확하다 (now 주입 테스트로 검증)"
    - "재배포된 home-sync Cloud Run Job 이 라이브에서 stale 오염 없는 스냅샷을 쓴다"
  artifacts:
    - path: "workers/home-sync/src/pipeline/loadSurges.ts"
      provides: "updated_at 신선도 필터 + KST 자정 헬퍼 (now 주입 가능)"
      contains: "updated_at"
    - path: "workers/home-sync/src/pipeline/loadSurges.test.ts"
      provides: "이중 gte 체이닝 mock + 자정 경계/필터 포함 테스트"
    - path: "workers/home-sync/src/index.ts"
      provides: "runHomeSyncCycle 이 computeSlot 과 동일한 now 를 loadSurges 에 전달"
  key_links:
    - from: "workers/home-sync/src/index.ts"
      to: "loadSurges"
      via: "loadSurges(supabase, cfg, { ...opts, now })"
      pattern: "loadSurges\\("
    - from: "loadSurges.ts stock_quotes 쿼리"
      to: "stock_quotes.updated_at (idx_stock_quotes_updated_at)"
      via: ".gte(\"updated_at\", 오늘 KST 자정 ISO)"
      pattern: "gte\\(\"updated_at\""
---

<objective>
home-sync 의 `loadSurges` 가 급등 종목을 선정할 때 `stock_quotes.change_rate >= surgeThreshold`
조건만 보고 신선도를 무시해, 어제 급등/거래정지 종목의 영구 잔존 시세가 "오늘의 급등"으로
홈 테마에 오염되는 버그를 수정한다.

근본 원인 (라이브 확정, 재조사 불필요):
- `stock_quotes` 는 의도적으로 stale cleanup 이 없는 테이블 (D-21, upsertQuotes.ts:11 주석).
  비활성/거래정지 종목의 마지막 시세가 영구 잔존한다.
- `loadSurges.ts:85-88` 는 `updated_at` 신선도 조건이 없어 이 잔존 행들을 그대로 급등으로 선정.
- 라이브 증거 (2026-07-07 08:26 KST, NXT 프리마켓): change_rate>=10 인 78건 중 오늘 갱신 6건,
  stale 72건 (어제 상한가 30% 다수 + 2026-06-23 미갱신 +177.78% 거래정지 종목 227100 포함).

수정: `stock_quotes` 쿼리에 `.gte("updated_at", <오늘 KST 자정 ISO>)` 추가.
`upsertQuotes` 는 매 갱신 시 `updated_at: now` 를 쓰므로(intraday-sync/src/pipeline/upsertQuotes.ts:39,91),
오늘 갱신된 행만 통과한다. `idx_stock_quotes_updated_at` 인덱스가 이미 존재해 필터는 인덱스 사용.

Purpose: 프리마켓/장중 홈 급등 테마에서 stale 오염 제거 — 트레이더가 실제 오늘 급등만 본다.
Output: 신선도 필터가 적용된 loadSurges + 경계 테스트 + home-sync Cloud Run Job 재배포.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@workers/home-sync/src/pipeline/loadSurges.ts
@workers/home-sync/src/index.ts
@workers/home-sync/src/pipeline/loadSurges.test.ts
@workers/home-sync/tests/helpers/supabase-mock.ts

<interfaces>
<!-- 실코드에서 추출한 계약. 탐색 없이 그대로 사용. -->

loadSurges 현재 시그니처 (loadSurges.ts):
```typescript
export interface LoadSurgesOptions {
  emptyRetries?: number;   // 기본 2
  retryDelayMs?: number;   // 기본 1500
}
export async function loadSurges(
  supabase: SupabaseClient,
  cfg: HomeSyncConfig,
  opts: LoadSurgesOptions = {},
): Promise<Surge[]>
```

현재 급등 쿼리 (loadSurges.ts:85-88) — 신선도 조건 없음:
```typescript
const { data, error: qErr } = await supabase
  .from("stock_quotes")
  .select("code,change_rate")
  .gte("change_rate", cfg.surgeThreshold);
```

index.ts 는 이미 동일 now 로 KST 슬롯을 계산한다 (재사용 소스):
```typescript
const KST_OFFSET_MS = 9 * 3600_000;               // index.ts:55
const now = deps.now ?? new Date();               // index.ts:102
const { tradeDate, ... } = computeSlot(now);      // KST 날짜 계산 존재
const surges = await loadSurges(supabase, cfg, deps.loadSurgesOptions); // index.ts:127
```

stock_quotes 스키마 (20260415120000_split_stocks_master_quotes_movers.sql):
- `updated_at timestamptz NOT NULL DEFAULT now()`
- `CREATE INDEX idx_stock_quotes_updated_at ON stock_quotes (updated_at DESC)` — 필터 인덱스 존재.

supabase-mock 체이닝 특성 (supabase-mock.ts):
- `gte` 는 단일 `vi.fn().mockReturnThis()` — **같은 함수가 두 gte 호출 모두 처리**.
  기존 테스트는 `sb.from("stock_quotes").gte.mockResolvedValue({data})` 로 gte 를 종결로 override.
  두 번째 `.gte` 추가 시 이 override 가 첫 gte 호출도 Promise 로 만들어 체이닝이 깨진다 → 아래 mock 지침 준수 필수.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: loadSurges 에 updated_at 신선도 필터 추가 (KST 자정 컷오프, now 주입 가능)</name>
  <files>workers/home-sync/src/pipeline/loadSurges.ts, workers/home-sync/src/pipeline/loadSurges.test.ts, workers/home-sync/src/index.ts</files>
  <behavior>
    - Test A (필터 존재): stock_quotes 쿼리에 `.gte("updated_at", <ISO>)` 가 호출되고, col="updated_at",
      값이 오늘 KST 자정(=주입한 now 의 KST 날짜 00:00 KST)을 UTC 로 변환한 ISO 와 일치.
    - Test B (경계): now = 특정 시각 주입 시, 컷오프 = 그 날 KST 00:00. 예) now=2026-07-07T08:26:00+09:00
      → 컷오프 ISO === 2026-07-06T15:00:00.000Z (오늘 KST 자정 = UTC 전일 15:00). 자정 직전(전날 23:59 KST)과
      직후(00:01 KST)를 각각 주입해 컷오프가 각자의 KST 당일 자정으로 계산되는지 확인.
    - Test C (회귀): 기존 5개 테스트(desc 정렬/종목명, surgeMax cap, Pitfall 1 top-K, 2단 정렬, 48h 창,
      retry-on-empty ×2) 전부 green 유지 — 이중 gte 체이닝 mock 으로 갱신.
  </behavior>
  <action>
1. **loadSurges.ts — KST 자정 헬퍼 추가:**
   - 파일 상단에 `const KST_OFFSET_MS = 9 * 3600_000;` (index.ts:55 와 동일값) 선언.
   - 작은 순수 헬퍼 추가:
     ```typescript
     /** now 기준 오늘 KST 자정(00:00 KST)을 UTC ISO 로. 예: 08:26 KST → 전일 15:00:00.000Z. */
     export function kstMidnightIso(now: Date): string {
       const kst = new Date(now.getTime() + KST_OFFSET_MS);
       const midnightKstMs = Date.UTC(
         kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), 0, 0, 0,
       );
       return new Date(midnightKstMs - KST_OFFSET_MS).toISOString();
     }
     ```
     (index.ts computeSlot 의 KST→UTC 변환 패턴과 동일 구조 — 검증된 방식 재사용.)
   - `LoadSurgesOptions` 에 `now?: Date;` 추가 (테스트 주입용, 미지정 시 `new Date()`).
2. **loadSurges.ts — 급등 쿼리에 신선도 필터:**
   - 함수 진입부에서 `const freshnessCutoff = kstMidnightIso(opts.now ?? new Date());`.
   - stock_quotes 쿼리(현재 loadSurges.ts:85-88)를 다음으로 변경:
     ```typescript
     const { data, error: qErr } = await supabase
       .from("stock_quotes")
       .select("code,change_rate")
       .gte("change_rate", cfg.surgeThreshold)
       .gte("updated_at", freshnessCutoff);
     ```
   - **empty-retry 루프(loadSurges.ts:84-93)는 구조 유지** — 루프 안에서 위 쿼리를 그대로 두 gte 로.
     freshnessCutoff 는 루프 밖에서 1회 계산(같은 사이클 내 고정).
   - SELECT 컬럼은 `code,change_rate` 그대로 (updated_at 은 필터만, select 불필요).
   - 주석 1줄: "stale cleanup 없는 stock_quotes(D-21)에서 어제 급등/거래정지 잔존 행 제외 — 오늘 KST 자정 이후 갱신만."
3. **index.ts — computeSlot 과 동일 now 를 loadSurges 로 전달:**
   - line 127 `await loadSurges(supabase, cfg, deps.loadSurgesOptions)` →
     `await loadSurges(supabase, cfg, { ...deps.loadSurgesOptions, now })`.
     (runHomeSyncCycle 은 이미 line 102 에 `now` 를 가짐 — computeSlot 과 loadSurges 가 같은 시각 기준.)
4. **loadSurges.test.ts — 이중 gte mock 갱신 (핵심 주의):**
   - supabase-mock 의 `gte` 는 단일 vi.fn 이라 두 gte 호출을 같은 함수가 처리한다. 기존
     `sb.from("stock_quotes").gte.mockResolvedValue({data})` 방식은 첫 gte(change_rate)까지
     Promise 로 만들어 두 번째 `.gte("updated_at")` 체이닝을 깨뜨린다.
   - **해결: column 기준 mockImplementation 으로 첫 gte 는 chain, 마지막 gte 는 resolve.** 각 테스트의
     stock_quotes 셋업을 아래 헬퍼 패턴으로 교체:
     ```typescript
     // change_rate gte → chain(this), updated_at gte → 종결 resolve.
     function setQuotes(sb, chain, responses /* Array<{data,error}> */) {
       let i = 0;
       chain.gte.mockImplementation((col: string) =>
         col === "updated_at"
           ? Promise.resolve(responses[Math.min(i++, responses.length - 1)])
           : chain, // change_rate → 체이닝 유지
       );
     }
     const q = sb.from("stock_quotes");
     setQuotes(sb, q, [{ data: [...], error: null }]);
     ```
     retry-on-empty 테스트(2개)는 responses 배열에 순차 응답을 담아 sequencing 재현
     (`[{data:[],error:null}, {data:[{...}],error:null}]`). 호출 횟수 assert 는
     `q.gte.mock.calls.filter(c => c[0] === "updated_at").length` 로 updated_at gte 횟수를 센다
     (change_rate gte 는 매 시도마다 함께 호출되므로 total/2 여도 무방 — updated_at 기준이 명확).
   - **Test A/B 신규 추가:** 고정 now 주입(`loadSurges(sb, cfg({...}), { retryDelayMs: 0, now: new Date("2026-07-07T08:26:00+09:00") })`)
     후 `q.gte.mock.calls` 에서 `["updated_at", val]` 호출을 찾아 `val === "2026-07-06T15:00:00.000Z"` 확인.
     자정 경계(전일 23:59 KST / 당일 00:01 KST) 2케이스로 컷오프가 올바른 KST 당일 자정인지 검증.
     `kstMidnightIso` 를 직접 import 해 순수 함수 단위 경계 테스트도 1개 추가(가장 명료).
  </action>
  <verify>
    <automated>cd workers/home-sync && pnpm vitest run src/pipeline/loadSurges.test.ts</automated>
  </verify>
  <done>
    - loadSurges 급등 쿼리에 `.gte("updated_at", kstMidnightIso(now))` 포함, empty-retry 유지.
    - index.ts 가 computeSlot 과 동일 now 를 loadSurges 로 전달.
    - loadSurges.test.ts: 기존 회귀 테스트 + 자정 경계/필터 신규 테스트 모두 green.
    - `pnpm -C workers/home-sync typecheck` (또는 tsc --noEmit) exit 0, `pnpm -C workers/home-sync build` exit 0.
  </done>
</task>

<task type="auto">
  <name>Task 2: home-sync Cloud Run Job 재배포 + 라이브 스모크 검증</name>
  <files>(배포만 — 코드 변경 없음)</files>
  <action>
1. **GCP 인증** (MEMORY reference_gh_radar_deployer_sa — 재요청 금지, 기존 키 사용):
   `export GOOGLE_APPLICATION_CREDENTIALS=$HOME/.config/gcloud/gh-radar-deployer.json`,
   `export CLOUDSDK_CORE_PROJECT=gh-radar`. (deploy 스크립트가 active config 를 가드하므로
   필요 시 `gcloud config` 를 gh-radar 로 정렬.)
2. **재배포:** 리포 루트에서 `bash scripts/deploy-home-sync.sh` 실행.
   - docker build → Artifact Registry push → `gcloud run jobs deploy gh-radar-home-sync --image=...:${SHA}`.
   - 어제 quick 260706-cdc 에서 검증된 경로 (이미지 태그 = git SHA). Scheduler/webapp/server 변경 없음.
3. **스모크:** `SUPABASE_SERVICE_ROLE_KEY` 를 먼저 export 후 `bash scripts/smoke-home-sync.sh`.
   - **주의(어제 오탐):** 키 미주입 시 smoke 의 Supabase REST 검증이 FAIL 오탐. 키 소스 =
     `workers/master-sync/.env` 의 `SUPABASE_SERVICE_ROLE_KEY` (MEMORY reference_krx_auth_key 인접 패턴)
     또는 Secret Manager `gh-radar-supabase-service-role`. `SUPABASE_URL` 도 함께 export.
   - 스모크가 전부 PASS 인지 확인. FAIL 이면 원인 분리(오탐 vs 실패) — 키/URL 누락이면 재export 후 재실행.
4. **라이브 오염 제거 확인 (핵심 증거):** 재배포된 Job 을 1회 수동 실행하거나 다음 스케줄 실행 후,
   최신 home_theme_snapshots payload 에 어제 상한가/거래정지 잔재(예: 종목 227100, +177% 류)가
   더 이상 급등으로 포함되지 않는지 확인. (curl REST 또는 Cloud Logging cycle 로그의 stockCount·
   themeCount 가 오늘 실제 갱신 종목 기준인지.) stale 오염 0 확인.
5. **커밋 (프로젝트 규칙):** 커밋 메시지 한글로 작성해 **사용자에게 먼저 보여주고 확인 후** HEAD↔worktree
   전체 차이를 한 번에 커밋 + push. Co-Authored-By 넣지 않음. 예시 메시지:
   `fix(home-sync): 급등 선정에 updated_at 신선도 필터 추가 (stale 시세 오염 제거)`.
  </action>
  <verify>
    <automated>bash scripts/smoke-home-sync.sh</automated>
  </verify>
  <done>
    - `gh-radar-home-sync` Job 이 신규 이미지(SHA)로 재배포됨.
    - smoke-home-sync.sh 전 항목 PASS (SUPABASE_SERVICE_ROLE_KEY/URL export 상태).
    - 라이브 최신 스냅샷에 어제/거래정지 stale 급등이 포함되지 않음 (오염 0 증거).
    - 사용자 확인 후 한글 커밋 + push 완료.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| stock_quotes(내부 DB) → loadSurges | 신뢰 데이터. 외부 입력 아님. 신선도만 문제(무결성 아님). |
| deployer SA → Cloud Run/Artifact | 기존 영구 인증(reference_gh_radar_deployer_sa). 신규 시크릿 0. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-bqj-01 | Information Disclosure | loadSurges 쿼리 로그 | accept | 신규 시크릿/PII 없음. 기존 logger redact 유지, updated_at ISO 는 비민감. |
| T-bqj-02 | Tampering | 신선도 컷오프 시각 오류 | mitigate | now 주입 경계 테스트(자정 직전/직후)로 KST↔UTC 변환 검증. computeSlot 검증 패턴 재사용. |
| T-bqj-03 | Denial of Service | updated_at 필터 풀스캔 | accept | idx_stock_quotes_updated_at 인덱스 존재 → 인덱스 필터, 추가 부하 무시 가능. |
</threat_model>

<verification>
- `pnpm -C workers/home-sync vitest run` 전체 green (loadSurges + index + 기타 회귀).
- `pnpm -C workers/home-sync typecheck` + `build` exit 0.
- smoke-home-sync.sh 전 항목 PASS.
- 라이브 스냅샷 stale 오염 0 (Task 2 step 4 증거).
</verification>

<success_criteria>
- 프리마켓/장중 홈 급등 테마에 오늘 KST 자정 이후 갱신된 종목만 선정된다.
- 어제 상한가·거래정지 잔존 시세(+177% 227100 등)가 급등에서 제외된다.
- empty-retry / 종목명 해석 / 48h 뉴스 2단 정렬 top-K 회귀 없음.
- home-sync Cloud Run Job 재배포 + 스모크 PASS + 한글 커밋/push 완료.
</success_criteria>

<output>
After completion, create `.planning/quick/260707-bqj-home-sync-loadsurges-stale-updated-at-ks/260707-bqj-SUMMARY.md`
</output>
