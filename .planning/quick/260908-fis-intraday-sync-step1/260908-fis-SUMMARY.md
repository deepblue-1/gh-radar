---
phase: quick-260908-fis
plan: 01
subsystem: intraday-sync / server / shared
tags: [krx-short-code, mapping-regex, observability, zod-validation]
requires: []
provides:
  - "@gh-radar/shared SHORT_CODE_RE — KRX 단축코드 정규식 단일 정의"
  - "intraday-sync STEP1 매핑 실패 표본 로깅(mapErrorSamples)"
affects:
  - workers/intraday-sync (재배포 필요)
  - server (재배포 필요)
  - packages/shared (두 소비처의 빌드 의존)
tech-stack:
  added: []
  patterns:
    - "정규식 계약을 소비처마다 리터럴로 복제하지 않고 shared 단일 export 로 승격"
    - "삼켜지는 catch 는 카운트만 두지 않고 상한 있는 표본(앞 N건)을 사이클당 1줄로 남긴다"
key-files:
  created:
    - packages/shared/src/stockCode.ts
    - server/src/schemas/__tests__/stockCode.test.ts
  modified:
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
decisions:
  - "SHORT_CODE_RE = /^[0-9A-Z]{6}$/ — 대문자만 허용(키움/KRX 반환 형식). 소문자 허용 시 같은 종목이 두 키로 갈라지고 주문·챗 바디 표면만 넓어진다."
  - "g 플래그 미사용 — 공유 RegExp 인스턴스로 .test() 를 부르면 lastIndex 가 남아 결과가 흔들린다."
  - "표본 상한 5 를 명명 상수(MAP_ERROR_SAMPLE_LIMIT)로 두고 로그는 사이클당 1줄 유지 — 300여 건 실패에도 로그 폭탄 없음."
  - "chat-orchestrator.ts:166 STOCK_REF_RE 는 스코프 제외 유지(LLM 본문 괄호 오탐 위험)."
metrics:
  duration: "약 4분 (2026-09-08 02:21~02:25 UTC)"
  tasks: 3
  files: 13
  completed: 2026-09-08
---

# quick-260908-fis: intraday-sync STEP1 영문 단축코드 누락 수정 Summary

KRX 영문 포함 단축코드(예: 채비 `0011T0`)를 `/^\d{6}$/` 로 떨구던 매퍼·zod 5경로를 shared 단일 정규식 `SHORT_CODE_RE` 로 통일하고, 이 결함을 4개월 숨긴 무로그 `catch` 를 상한 5건 표본 로깅으로 대체했다.

## 문제

KRX 가 2025년부터 숫자 6자리 소진으로 영문 포함 단축코드를 발급한다(비상폐 80개, 그중 `security_group='주권'` 79개). intraday-sync STEP1 매퍼가 숫자만 통과시켜 해당 종목군이 통째로 매핑에서 탈락 → `stock_quotes` 미갱신 → `top_movers` 미진입 → 스캐너·오늘의 급등종목·홈에서 영구 누락. 프로덕션 `mapErrors ≈ 347` 중 영문코드로 설명되는 건 80건뿐이었으나, `catch { mapErrors += 1; }` 가 무로그라 나머지 ~267건의 원인은 로그로 특정할 수 없었다.

## 커밋

| Task | 커밋 | 제목 |
|------|------|------|
| 1 | `dae6914` | fix(intraday-sync): 영문 포함 KRX 단축코드 매핑 허용 |
| 2 | `bc6dfd2` | fix(intraday-sync): STEP1 매핑 실패 표본 로깅 추가 |
| 3 | `e18ea49` | fix(server): 챗봇·주문 종목코드 검증에 영문 단축코드 허용 |

## Task 별 내용

### Task 1 — 정규식 shared 승격 + 워커 3경로 완화 (`dae6914`)

- `packages/shared/src/stockCode.ts` 신규 — `SHORT_CODE_RE = /^[0-9A-Z]{6}$/` 단 하나. 한글 주석으로 KRX 숫자 소진 배경·대문자 전용 근거·`g` 플래그 금지 이유를 남겼다.
- `packages/shared/src/index.ts` barrel export 추가.
- `map.ts` / `mapOhlc.ts` / `bootstrapStocks.ts` 가 각자 갖고 있던 `/^\d{6}$/` 리터럴 3개를 shared 참조로 교체. throw 메시지 형식과 bootstrap 의 `continue` 스킵 동작은 유지.
- 테스트: `0011T0` 통과 케이스 3경로 추가 + 소문자/5자/7자 거부 케이스. **기존 `"ABCDEF_AL"` throw 기대는 새 규칙에서 유효해지므로 소문자(`0011t0`)·5자(`12345`) 로 교체**(plan 명시 사항). `bootstrapStocks.test.ts` 의 `"INVALID_AL"`(7자)은 여전히 무효라 유지하고 소문자·5자 skip 케이스를 추가해 payload 기대를 2 → 3 으로 갱신.

### Task 2 — STEP1 매핑 실패 표본 로깅 (`bc6dfd2`)

- `workers/intraday-sync/src/index.ts` STEP1 루프의 `catch { mapErrors += 1; }` → `catch (err)`. `mapErrorSamples` 에 `{ stkCd, reason }` 를 **앞 5건까지만** push. `stkCd` 는 `_AL` strip 전 원본(실패 원인이 접미사/형식 자체일 수 있음), `reason` 은 `err instanceof Error ? err.message : String(err)`.
- 상한은 `MAP_ERROR_SAMPLE_LIMIT = 5` 명명 상수. 왜 필요했는지(2026-09-08 진단 시 267건 원인 미상 / 무로그 fail-safe 금지)를 한글 주석으로 박제.
- `log.info` payload 에 `mapErrorSamples` 추가 — row 단위 로그 없이 사이클당 1줄 유지.
- `runCycle.test.ts` 에 3 케이스 추가. `../src/logger` 를 doMock 해 `logger.child()` 가 스파이를 반환하고 모듈 최상위 `info/warn/error` 도 스파이로 채웠다(완료 경로 보호). 실패 6건 → 로그 1회 · `mapErrors=6` · 표본 5건 · 첫 표본이 원본 `0011t0`, 실패 0건 → 빈 배열, `0011T0` 은 실패로 잡히지 않음(Task 1 회귀 가드).

### Task 3 — server 챗·주문 zod 완화 (`e18ea49`)

- `chat.ts` 의 `.regex(/^\d{6}$/)` 2곳(ChatPostBody / ConversationListQuery) + `orders.ts` 의 `OrderPostBody.code` 1곳을 `SHORT_CODE_RE` 로 교체.
- `chat.ts` 상단 주석의 "6자리 종목코드 정규식은 search.ts 선례(`/^\d{6}$/` 계열)" 문구와 필드 주석 "6자리 숫자" 를 정정 — 숫자 전용 가정이 이번 결함의 근원이라 낡은 주석을 남기지 않았다. `orders.ts` 는 "6자 단축코드" 주석에 영문 포함 사실 한 문장 추가.
- **정규식만 변경.** accountNo/qty/price/`superRefine`·D-28(게이트웨이 isin 을 서버가 `stocks` 조회로 채움) 규율은 손대지 않았다.
- `server/src/schemas/__tests__/stockCode.test.ts` 신규 — 3스키마 수용/거부 + 취소 주문 `orgOrderNo` superRefine 회귀 2건.

## 검증 (실제 출력)

| 커맨드 | 결과 |
|--------|------|
| `pnpm -F @gh-radar/shared build` | tsup CJS/ESM/DTS build success (`dist/index.d.ts 36.69 KB`) |
| `pnpm -F @gh-radar/intraday-sync test` (Task 1 후) | **19 files / 150 tests passed**, 0 failed |
| `pnpm -F @gh-radar/intraday-sync test` (Task 2 후) | **19 files / 153 tests passed**, 0 failed (runCycle 15 → 18) |
| `pnpm -F @gh-radar/intraday-sync typecheck` | exit 0 |
| `pnpm -F @gh-radar/server exec vitest run src/schemas` | **1 file / 16 tests passed**, 0 failed |
| `pnpm -F @gh-radar/server exec vitest run` (전량) | **31 files / 264 tests passed**, 0 failed |
| `pnpm -F @gh-radar/server typecheck` | exit 0 |
| `pnpm typecheck` (워크스페이스 전체) | exit 0 — server/webapp/relay/workers 8종 전부 Done |

plan `<verification>` #4 grep 결과:

```
$ grep -rn 'd{6}' --include='*.ts' server/src workers/intraday-sync/src packages/shared/src
server/src/services/chat-orchestrator.ts:166:const STOCK_REF_RE = /\((\d{6})\)/g;
packages/shared/src/stockCode.ts:8://   ... 기존 `/^\d{6}$/` 가정 때문에
```

`chat-orchestrator.ts:166` 은 plan 이 명시한 스코프 제외 대상(LLM 응답 본문에서 `(123456)` 추출 — 영문 확대 시 일반 괄호 텍스트 오탐). `stockCode.ts:8` 은 **주석 문자열**로, 실행 코드가 아니다. 실행 경로에 숫자 전용 단축코드 정규식은 남아 있지 않다.

## 계획 대비 편차

계획 대비 실질 편차 없음. 계획이 지시한 범위 안에서 다음 두 가지를 보강했다.

1. **`mapOhlc.test.ts` 거부 케이스 확장** — plan `<behavior>` 는 "소문자·5자 코드는 여전히 throw" 만 요구했고 기존 `"INVALID"`(7자) 케이스가 있었다. 세 형식(7자/소문자/5자)을 한 `it` 안에 모아 3경로 거부 규칙을 대칭으로 맞췄다.
2. **`runCycle.test.ts` 3번째 케이스 추가** — plan 은 표본 상한 케이스만 요구했으나, `0011T0` 이 `mapErrors` 로 잡히지 않는다는 것을 runCycle 레벨에서도 고정했다. Task 1 의 수정이 실제 사이클 경로에서 살아 있음을 보증하는 회귀 가드다(단위 매퍼 테스트만으로는 index.ts 의 호출 경로 회귀를 못 잡는다).

## 배포 필요 대상 (오케스트레이터 처리)

| 대상 | 이유 | 마이그레이션 |
|------|------|--------------|
| **workers/intraday-sync** (Cloud Run Job `gh-radar-intraday-sync`) | Task 1 + Task 2 — 재배포해야 영문코드 종목이 `stock_quotes`/`top_movers` 에 들어오고 표본 로깅이 켜진다 | 불필요 |
| **server** (Cloud Run service `gh-radar-server`) | Task 3 — 챗/주문 zod 완화 | 불필요 |

- `@gh-radar/shared` 는 두 Dockerfile 모두 이미 `pnpm -F @gh-radar/shared build` + `dist` COPY 를 수행하므로 런타임 import 추가는 배포 안전.
- 백필 불필요 — 워커 재배포 후 **다음 사이클(1분)** 에 `stock_quotes` / `top_movers` 가 자동 복구된다.
- 배포 후 확인할 것: Cloud Run 로그의 `STEP1 mapped + deduped` 에서 (a) `mapErrors` 가 347 → ~267 로 떨어지는지, (b) `mapErrorSamples` 에 남은 실패의 실제 원인이 무엇인지. 이 표본이 후속 quick 의 입력이다.

## 후속 과제 (이번 스코프 제외)

- `server/src/services/chat-orchestrator.ts:166` `STOCK_REF_RE` — 영문코드 종목은 챗 응답 본문의 종목 링크화가 여전히 누락된다. 괄호 텍스트 오탐 위험 때문에 별도 판단 필요.
- Task 2 표본 로깅이 프로덕션에서 드러낼 **나머지 ~267건 매핑 실패 원인** — 로그 확인 후 별도 quick.
- `workers/master-sync/src/krx/fetchEtpBaseInfo.ts:47` 은 ETP 전용 의도된 필터라 변경하지 않았다.

## Known Stubs

없음.

## 문서/상태 파일

제약에 따라 SUMMARY.md·STATE.md·ROADMAP.md 는 커밋하지 않았다(오케스트레이터가 별도 문서 커밋 처리). quick task 이므로 STATE.md 의 phase/plan 카운터도 변경하지 않았다.

## Self-Check: PASSED

- 파일 존재: `packages/shared/src/stockCode.ts` FOUND, `server/src/schemas/__tests__/stockCode.test.ts` FOUND
- 커밋 존재: `dae6914` FOUND, `bc6dfd2` FOUND, `e18ea49` FOUND
