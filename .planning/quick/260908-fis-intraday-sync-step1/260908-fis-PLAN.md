---
phase: quick-260908-fis
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/shared/src/stockCode.ts
  - packages/shared/src/index.ts
  - workers/intraday-sync/src/pipeline/map.ts
  - workers/intraday-sync/src/pipeline/mapOhlc.ts
  - workers/intraday-sync/src/pipeline/bootstrapStocks.ts
  - workers/intraday-sync/src/index.ts
  - workers/intraday-sync/tests/map.test.ts
  - workers/intraday-sync/tests/mapOhlc.test.ts
  - workers/intraday-sync/tests/bootstrapStocks.test.ts
  - workers/intraday-sync/tests/runCycle.test.ts
  - server/src/schemas/chat.ts
  - server/src/schemas/orders.ts
  - server/src/schemas/__tests__/stockCode.test.ts
autonomous: true
requirements: [D-fis-01, D-fis-02, D-fis-03, D-fis-04, D-fis-05]

must_haves:
  truths:
    - "KRX 영문 포함 단축코드(예: 0011T0 채비)가 intraday-sync STEP1 매핑을 통과한다 — 스캐너/오늘의 급등종목/홈에서 더 이상 누락되지 않는다"
    - "동일 코드가 STEP2(ka10001 OHLC) 매핑과 stocks bootstrap 에서도 통과한다"
    - "STEP1 매핑 실패는 더 이상 무로그로 삼켜지지 않는다 — 실패 stk_cd 와 사유가 사이클당 최대 5건 표본으로 로그에 남는다"
    - "표본 로깅은 사이클당 로그 1줄을 넘기지 않는다 (300여 건 실패에도 로그 폭탄 없음)"
    - "챗봇 stockCode / 주문 code zod 가 영문 포함 단축코드를 수용한다"
    - "잘못된 형식(5자리, 소문자, 7자 이상)은 모든 경로에서 여전히 거부된다"
  artifacts:
    - path: "packages/shared/src/stockCode.ts"
      provides: "단축코드 정규식 단일 정의 (worker·server 공용)"
      exports: ["SHORT_CODE_RE"]
      contains: "0-9A-Z"
    - path: "workers/intraday-sync/tests/map.test.ts"
      provides: "영문 포함 코드 통과 + 잘못된 형식 거부 회귀 테스트"
      contains: "0011T0"
    - path: "server/src/schemas/__tests__/stockCode.test.ts"
      provides: "chat/orders zod 단축코드 수용·거부 회귀 테스트"
      contains: "0011T0"
  key_links:
    - from: "workers/intraday-sync/src/pipeline/map.ts"
      to: "SHORT_CODE_RE"
      via: "@gh-radar/shared 런타임 import"
      pattern: "SHORT_CODE_RE"
    - from: "workers/intraday-sync/src/index.ts"
      to: "log.info STEP1 payload"
      via: "mapErrorSamples 필드"
      pattern: "mapErrorSamples"
    - from: "server/src/schemas/orders.ts"
      to: "SHORT_CODE_RE"
      via: "z.string().regex(...)"
      pattern: "SHORT_CODE_RE"
---

<objective>
KRX 가 2025년부터 숫자 6자리 소진으로 **영문 포함 단축코드**(예: 채비 `0011T0`, ISIN `KR70011T0008`)를
발급하는데, intraday-sync 매퍼가 `/^\d{6}$/` 로 숫자만 통과시켜 해당 종목 전체(비상폐 기준 80개)가
STEP1 매핑에서 탈락 → `stock_quotes` 미갱신 → `top_movers` 미진입 → 스캐너·오늘의 급등종목·홈에서
**영구 누락**되던 결함을 제거한다.

동시에 이 결함을 4개월 넘게 숨긴 원인 — `catch { mapErrors += 1; }` 의 **무로그 fail-safe** — 를 표본
로깅으로 고친다. 오늘 프로덕션 mapErrors ≈ 347 중 영문코드로 설명되는 건 80건뿐이고 나머지 ~267건은
원인 미상이다. 표본 로깅이 그 나머지를 드러내는 유일한 경로다.

Purpose: 급등 종목 포착이 이 앱의 코어 밸류인데, 신규 상장 종목군이 통째로 레이더에서 빠져 있었다.
Output: 정규식 단일 정의(shared) + intraday-sync 3개 매퍼 완화 + STEP1 실패 표본 로깅 + server zod 2종 완화 + 회귀 테스트.

**진단은 이미 끝났다.** 원인·증거·수정 대상은 아래 컨텍스트에 확정 사실로 주어진다. 재조사하지 말고 그대로 구현하라.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

@workers/intraday-sync/src/pipeline/map.ts
@workers/intraday-sync/src/pipeline/mapOhlc.ts
@workers/intraday-sync/src/pipeline/bootstrapStocks.ts
@workers/intraday-sync/tests/map.test.ts
@server/src/schemas/chat.ts
@server/src/schemas/orders.ts

## 확정 진단 (재조사 금지)

- 채비 = `stocks` 마스터에 정상 등록 (`code=0011T0, market=KOSDAQ, security_group=주권, isin=KR70011T0008, is_delisted=false`).
  eligibleCodes 화이트리스트 문제 아님.
- `stock_quotes` 의 `0011T0` 마지막 갱신 = 2026-05-13(종목상세 on-demand 흔적). 워커가 **한 번도** 쓰지 못함.
- 오늘 `top_movers` 100행 중 영문 코드 **0건**.
- Cloud Run 로그(매 분): `STEP1 mapped + deduped` → mapped ≈ 3,400 / **mapErrors ≈ 347**.
- `stock_daily_ohlcv` 의 `0011T0` 은 9/7까지 정상(close 4,695) — candle-sync 는 `stocks` 마스터 기반 ka10081 호출.
  → **키움은 `0011T0` 을 정상 수용한다. 키움 문제가 아니라 우리 정규식 문제다.**
- 비상폐 영문코드 종목 = 80개(그 중 `security_group='주권'` 79개). 예: 0155E0 해치텍, 0220W0 한화머시너리앤서비스홀딩스,
  0218L0 네오뷰, 0039P0 매드업, 0117P0 피스피스스튜디오, 0156T0 에이치엘지노믹스, 0011A0 액스비스.
- mapErrors 347 중 영문코드로 설명되는 건 80건뿐 — **나머지 ~267건은 catch 가 무로그라 원인 미상.**

## 수정 대상이 아닌 것 (건드리지 말 것)

- `workers/master-sync/src/krx/fetchEtpBaseInfo.ts:47` — ETP 전용 필터, 의도된 동작.
- `server/src/routes/stocks.ts:97` — 이미 `/^[A-Za-z0-9]{1,10}$/` 로 정상.
- `server/src/services/chat-orchestrator.ts:166` `STOCK_REF_RE = /\((\d{6})\)/g` — LLM 출력 **본문**에서
  `(123456)` 패턴을 추출하는 용도. 영문까지 넓히면 일반 괄호 텍스트 오탐 위험. 이번 스코프 제외(Notes 후속 과제).

## 배포/마이그레이션

불필요. 워커는 다음 사이클(1분)에 자동 복구된다. 배포는 이번 스코프 밖(사용자 별도 판단).
</context>

<interfaces>
<!-- 신규로 만들 계약. 실행자는 아래 시그니처를 그대로 쓴다. -->

packages/shared/src/stockCode.ts (신규):
```typescript
/** KRX 단축코드 6자 — 숫자 + 대문자 영문 (2025~ 숫자 소진분 대응). */
export const SHORT_CODE_RE: RegExp;
```

packages/shared/src/index.ts 에 barrel export 추가:
```typescript
export { SHORT_CODE_RE } from "./stockCode";
```

기존 소비처가 대체할 리터럴 (전부 `/^\d{6}$/`):
- workers/intraday-sync/src/pipeline/map.ts:77
- workers/intraday-sync/src/pipeline/mapOhlc.ts:13
- workers/intraday-sync/src/pipeline/bootstrapStocks.ts:24
- server/src/schemas/chat.ts:22, 34
- server/src/schemas/orders.ts:29

빌드 순서: `@gh-radar/shared` 는 tsup 으로 `dist` 를 만든 뒤 소비된다.
테스트·타입체크 전에 반드시 `pnpm -F @gh-radar/shared build` 를 먼저 돌린다.
(Dockerfile 은 이미 `pnpm -F @gh-radar/shared build` + `COPY .../packages/shared/dist ./node_modules/@gh-radar/shared/dist`
를 하므로 런타임 import 추가는 배포 안전. server 는 이미 `THEME_STOCK_SOURCES`, `parseNaverBoardDate` 등 런타임 값을 shared 에서 import 중.)
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: 단축코드 정규식을 shared 단일 정의로 올리고 intraday-sync 3개 매퍼 완화</name>
  <files>packages/shared/src/stockCode.ts, packages/shared/src/index.ts, workers/intraday-sync/src/pipeline/map.ts, workers/intraday-sync/src/pipeline/mapOhlc.ts, workers/intraday-sync/src/pipeline/bootstrapStocks.ts, workers/intraday-sync/tests/map.test.ts, workers/intraday-sync/tests/mapOhlc.test.ts, workers/intraday-sync/tests/bootstrapStocks.test.ts</files>
  <behavior>
    - map.test.ts: `stk_cd:"0011T0_AL"` → `code === "0011T0"` 로 정상 매핑 (채비 회귀 케이스, 종목명 "채비")
    - map.test.ts: 기존 `"005930_AL"`, `"007460_AL"` 케이스는 그대로 통과 (숫자 코드 회귀 없음)
    - map.test.ts: `"12345_AL"`(5자) → throw `/Invalid stk_cd/`
    - map.test.ts: `"0011t0_AL"`(소문자 포함) → throw `/Invalid stk_cd/`
    - map.test.ts: `"0011T0X_AL"`(7자) → throw `/Invalid stk_cd/`
    - mapOhlc.test.ts: `stk_cd:"0011T0"` 인 최소 ka10001 row → `code === "0011T0"` 정상 매핑
    - mapOhlc.test.ts: 소문자·5자 코드는 여전히 throw `/Invalid ka10001 stk_cd/`
    - bootstrapStocks.test.ts: `"0011T0_AL"` row 가 upsert payload 에 `{code:"0011T0"}` 로 포함
    - bootstrapStocks.test.ts: 잘못된 코드 skip 동작 유지
  </behavior>
  <action>
    1. `packages/shared/src/stockCode.ts` 신규 생성. `export const SHORT_CODE_RE = /^[0-9A-Z]{6}$/;` 단 하나만 둔다(D-fis-01).
       파일 상단 한글 주석으로 **왜**를 남길 것: KRX 가 2025년부터 숫자 6자리 소진으로 영문 포함 단축코드를 발급하며
       (예: 채비 `0011T0`, ISIN `KR70011T0008` 의 중간 6자), 키움 ka10027/ka10001 은 이를 **대문자로** 반환하므로
       소문자는 허용하지 않는다(표면 확대 회피). 기존 map.ts 주석의 밀도·톤(근거 + 정책 명시)에 맞춘다.
       `g` 플래그를 붙이지 말 것 — `.test()` 를 공유 인스턴스로 호출할 때 lastIndex 상태가 남아 매 호출마다 결과가 흔들린다.
    2. `packages/shared/src/index.ts` 에 `export { SHORT_CODE_RE } from "./stockCode";` 추가. 기존 export 배치 관례를 따른다.
    3. `map.ts:77` 의 `/^\d{6}$/` 를 `SHORT_CODE_RE` 로 교체하고 `import { SHORT_CODE_RE } from "@gh-radar/shared";` 추가
       (기존 `import type {...}` 줄과 별개의 값 import). 함수 JSDoc 의 "stk_cd 가 6자 숫자가 아니면 throw" 문구를
       "6자 단축코드(숫자+대문자) 가 아니면 throw" 로 정정. throw 메시지 형식은 그대로 유지(기존 테스트 정규식 의존).
    4. `mapOhlc.ts:13`, `bootstrapStocks.ts:24` 도 동일하게 `SHORT_CODE_RE` 로 교체. 세 파일이 같은 값을 중복 정의하지 않도록
       반드시 shared 를 참조한다(D-fis-01). bootstrapStocks 의 `continue` 스킵 동작 자체는 유지.
    5. **기존 테스트 중 새 규칙과 충돌하는 케이스를 반드시 고칠 것.** `tests/map.test.ts` 의 `"ABCDEF_AL"` throw 기대와
       `tests/bootstrapStocks.test.ts` 의 `"INVALID_AL"` skip 기대를 점검한다: `ABCDEF` 는 6자 대문자라 **이제 유효**하므로
       그 케이스는 `"0011t0_AL"`(소문자) 또는 `"12345_AL"`(5자) 로 교체한다. `INVALID`(7자) 는 여전히 무효라 유지 가능.
    6. 위 `<behavior>` 케이스를 기존 vitest 관례(describe/it, 한글 it 설명)로 추가한다. 픽스처 신규 생성 없이
       인라인 row 객체로 충분하다(mapOhlc 는 기존 fixture 를 spread 후 `stk_cd` 만 덮어쓰면 최소 변경).
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm -F @gh-radar/shared build && pnpm -F @gh-radar/intraday-sync test && pnpm -F @gh-radar/intraday-sync typecheck</automated>
  </verify>
  <done>`0011T0` 이 map/mapOhlc/bootstrap 3경로 모두 통과하고, 소문자·5자·7자는 여전히 거부된다. intraday-sync vitest 전량 green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: STEP1 매핑 실패를 표본 로깅으로 드러내기 (무로그 fail-safe 제거)</name>
  <files>workers/intraday-sync/src/index.ts, workers/intraday-sync/tests/runCycle.test.ts</files>
  <behavior>
    - 매핑 실패 row 가 있으면 `STEP1 mapped + deduped` 로그 payload 에 `mapErrorSamples` 배열이 실린다
    - 각 표본은 원본 `stk_cd`(strip 전 값)와 실패 사유 메시지를 담는다
    - 실패가 6건 이상이어도 표본은 **정확히 5건**까지만 담긴다 (`mapErrors` 카운트는 전체 건수 유지)
    - 실패가 0건이면 payload 에 빈 배열이거나 필드가 없다 — 정상 사이클 로그를 오염시키지 않는다
    - 로그 호출 횟수는 실패 건수와 무관하게 사이클당 1회 (row 단위 로그 금지)
  </behavior>
  <action>
    1. `workers/intraday-sync/src/index.ts` 의 STEP1 매핑 루프(약 228~240줄, `let mapErrors = 0;` ~ `"STEP1 mapped + deduped"`)에서
       `catch { mapErrors += 1; }` 를 `catch (err)` 로 바꾼다. `mapErrors` 증가는 그대로 두고,
       `mapErrorSamples` 배열(`{ stkCd, reason }`)에 **앞 5건까지만** push 한다(`if (mapErrorSamples.length < 5)`).
       `stkCd` 는 strip 전 원본 `row.stk_cd` 를 기록해야 한다 — 실패 원인이 접미사/형식 자체일 수 있기 때문이다.
       `reason` 은 `err instanceof Error ? err.message : String(err)`.
    2. 기존 `log.info({ mapped: step1Updates.length, mapErrors }, "STEP1 mapped + deduped")` payload 에 `mapErrorSamples` 를 추가한다.
       **row 마다 로그를 찍지 말 것** — 사이클당 300여 건이라 로그 폭탄이 된다(D-fis-02). 사이클당 1줄 유지.
    3. 상한 5 는 매직넘버로 흩뿌리지 말고 루프 위에 명명 상수(예: `MAP_ERROR_SAMPLE_LIMIT`)로 둔다.
       한글 주석으로 **왜**를 남길 것: 2026-09-08 채비(`0011T0`) 누락 진단 당시 이 catch 가 무로그라
       mapErrors 347 중 267건의 원인을 프로덕션에서 특정할 수 없었다 — 무로그 fail-safe 금지 원칙.
    4. `tests/runCycle.test.ts` 에 케이스를 추가한다. 기존 파일의 `vi.doMock` + 동적 import 스타일을 그대로 따르고,
       `../src/logger` 를 doMock 해 `logger.child()` 가 스파이(info/warn/error)를 반환하도록 스텁한다
       (모듈 최상위 `logger.info`/`logger.error` 도 스파이로 채워야 `runIntradayCycle` 완료 경로가 깨지지 않는다).
       `fetchKa10027` 이 정상 row 1~2건 + 매핑 실패 row 6건(예: 소문자·5자 코드)을 반환하게 하고,
       `"STEP1 mapped + deduped"` 로 호출된 `info` payload 의 `mapErrorSamples` 길이가 5, `mapErrors` 가 6 임을 단언한다.
       stale 가드에 걸려 조기 return 되지 않도록 기존 케이스와 동일하게 supabase 스텁의 `stock_daily_ohlcv` 는 빈 배열로 둔다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm -F @gh-radar/shared build && pnpm -F @gh-radar/intraday-sync test && pnpm -F @gh-radar/intraday-sync typecheck</automated>
  </verify>
  <done>매핑 실패 6건 시 로그 1줄에 `mapErrors=6` + `mapErrorSamples` 5건(원본 stk_cd + 사유)이 실린다. runCycle 기존 케이스 전부 green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: server 챗봇·주문 zod 종목코드 검증 완화</name>
  <files>server/src/schemas/chat.ts, server/src/schemas/orders.ts, server/src/schemas/__tests__/stockCode.test.ts</files>
  <behavior>
    - `ChatPostBody` 가 `stockCode:"0011T0"` 를 통과시킨다
    - `ConversationListQuery` 가 `stockCode:"0011T0"` 를 통과시킨다
    - `OrderPostBody` 가 `code:"0011T0"` 인 정상 신규 주문 바디를 통과시킨다
    - 세 스키마 모두 `"0011t0"`(소문자), `"12345"`(5자), `"0011T0X"`(7자) 를 거부한다
    - `OrderPostBody` 의 취소 주문 `orgOrderNo` superRefine 규칙은 그대로 동작한다 (회귀 없음)
  </behavior>
  <action>
    1. `server/src/schemas/chat.ts` 의 두 `.regex(/^\d{6}$/)`(22, 34줄)를 `.regex(SHORT_CODE_RE)` 로 교체하고
       `import { SHORT_CODE_RE } from "@gh-radar/shared";` 추가. 파일 상단 주석 8줄의
       "6자리 종목코드 정규식은 search.ts 선례(`/^\d{6}$/` 계열)와 동일 패턴" 문구도 정정한다
       (숫자 전용 가정이 이번 결함의 근원이므로 낡은 주석을 남기면 안 된다).
       stockCode 필드 주석의 "6자리 숫자" 도 "6자 단축코드(숫자+대문자)" 로 고친다.
    2. `server/src/schemas/orders.ts:29` 의 `code: z.string().regex(/^\d{6}$/)` 를 `SHORT_CODE_RE` 로 교체.
       **정규식만 바꾼다**(D-fis-03) — accountNo/qty/price/superRefine 등 다른 검증은 손대지 않는다.
       28줄 주석 "6자 단축코드"는 유지하되 영문 포함 사실을 한 문장 덧붙인다.
       게이트웨이 종목 키(isin)를 서버가 `stocks` 조회로 채우는 D-28 규율은 그대로다 — 바디 표면은 넓히지 않는다.
    3. `server/src/schemas/__tests__/stockCode.test.ts` 신규 생성. 위 `<behavior>` 케이스를 vitest 로 작성한다.
       server vitest 는 `globals: false` 이므로 `import { describe, it, expect } from "vitest"` 를 명시하고,
       include 패턴이 `src/**/*.test.ts` 를 이미 잡으므로 별도 설정 변경은 불필요하다.
       `safeParse` 로 success 여부만 단언하는 최소 테스트로 유지한다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm -F @gh-radar/shared build && pnpm -F @gh-radar/server exec vitest run src/schemas && pnpm -F @gh-radar/server typecheck</automated>
  </verify>
  <done>챗/주문 zod 가 `0011T0` 을 수용하고 소문자·5자·7자를 거부한다. server typecheck + 신규 스키마 테스트 green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 브라우저 → `POST /api/orders` | 미신뢰 입력이 DMA 주문 조립 경로로 진입 |
| 브라우저 → `POST /api/chat` | 미신뢰 입력이 Anthropic 프롬프트/PostgREST 바인딩으로 진입 |
| 키움 ka10027/ka10001 응답 → 워커 매퍼 | 외부 응답이 DB upsert 로 진입 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-fis-01 | Tampering | `OrderPostBody.code` | mitigate | 정규식만 완화하되 `^[0-9A-Z]{6}$` 앵커 유지 — 길이 6 고정, 소문자·특수문자·구분자 불허. 게이트웨이 종목 키(isin)는 여전히 바디에서 받지 않고 서버가 `stocks` 조회로 채운다(D-28). accountNo 소유권 판정은 relay 소관으로 불변. |
| T-fis-02 | Injection | `ChatPostBody.stockCode` | mitigate | 동일 앵커 정규식. 대문자 A–Z 26자만 추가되고 따옴표·괄호·공백·와일드카드는 전부 계속 거부되므로 PostgREST/프롬프트 표면 증가 없음. |
| T-fis-03 | Information Disclosure | `mapErrorSamples` 로그 | accept | 로깅 값은 키움이 반환한 공개 종목코드와 매퍼 자체 에러 메시지뿐. pino redact 대상(토큰·키) 미포함. 표본 5건 상한으로 로그 볼륨도 제한. |
| T-fis-04 | Tampering | 워커 매퍼 → `stocks` bootstrap | accept | 완화된 코드가 bootstrap 으로 신규 등록될 수 있으나 이는 기존 설계(`ON CONFLICT DO NOTHING` + master-sync 가 다음 실행에 정확 정보로 보강)이며 코드 형식 제약은 오히려 유지된다. |
| T-fis-SC | Tampering | 패키지 설치 | n/a | 신규 의존성 설치 없음 — 기존 워크스페이스 패키지(`@gh-radar/shared`) 참조만 추가. |
</threat_model>

<verification>
1. `pnpm -F @gh-radar/shared build && pnpm typecheck` — 워크스페이스 전체 타입 정합.
2. `pnpm -F @gh-radar/intraday-sync test` — 매퍼·bootstrap·runCycle 회귀 전량 green.
3. `pnpm -F @gh-radar/server exec vitest run` — server 테스트 회귀 없음.
4. `grep -rn 'd{6}' --include='*.ts' server/src workers/intraday-sync/src packages/shared/src` 결과가
   `chat-orchestrator.ts:166`(스코프 제외, LLM 본문 추출용) 외에는 남아 있지 않을 것.
</verification>

<success_criteria>
- `SHORT_CODE_RE = /^[0-9A-Z]{6}$/` 가 `@gh-radar/shared` 에 **단 한 번** 정의되고, intraday-sync 3파일 + server 2파일이 모두 이를 참조한다.
- `0011T0` 이 STEP1/STEP2/bootstrap/챗/주문 5경로 전부를 통과한다.
- 소문자·5자·7자 코드는 5경로 전부에서 여전히 거부된다.
- STEP1 매핑 실패가 사이클당 1줄, 최대 5건 표본으로 로그에 남는다.
- 신규 회귀 테스트가 위 3항목을 자동 검증한다.
</success_criteria>

<notes>
## 커밋 (한글, task 당 1개)

- Task 1: `fix(intraday-sync): 영문 포함 KRX 단축코드 매핑 허용`
- Task 2: `fix(intraday-sync): STEP1 매핑 실패 표본 로깅 추가`
- Task 3: `fix(server): 챗봇·주문 종목코드 검증에 영문 단축코드 허용`

## 배포

이번 스코프 밖. 마이그레이션·백필 불필요 — 워커 재배포 후 다음 사이클(1분)에 `stock_quotes`/`top_movers` 가 자동 복구된다(D-fis-04).

## 후속 과제 (이번 스코프 제외)

- `server/src/services/chat-orchestrator.ts:166` `STOCK_REF_RE = /\((\d{6})\)/g` — LLM 응답 본문에서 `(123456)` 종목 참조를
  추출하는 패턴. 영문까지 넓히면 일반 괄호 텍스트 오탐 위험이 있어 별도 판단 필요. 현재는 영문코드 종목의
  챗 응답 내 링크화가 누락된다.
- Task 2 의 표본 로깅이 프로덕션에서 드러낼 **나머지 ~267건 매핑 실패 원인** — 로그 확인 후 별도 quick 으로 처리.
- `workers/master-sync/src/krx/fetchEtpBaseInfo.ts:47` 은 ETP 전용 의도된 필터라 변경하지 않았다.
</notes>

<output>
Create `.planning/quick/260908-fis-intraday-sync-step1/260908-fis-SUMMARY.md` when done
</output>
