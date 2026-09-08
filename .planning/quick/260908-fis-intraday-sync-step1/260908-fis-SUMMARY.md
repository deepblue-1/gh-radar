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

---

## 후속: 배포 중 발견한 회귀와 수정 (2026-09-08 11:30~11:50 KST, 장중)

### 배포
| 대상 | 이미지 | 결과 |
|---|---|---|
| intraday-sync (Cloud Run Job) | `intraday-sync:23bb58d` → `:c3d679d` | 배포 성공 |
| server (Cloud Run service) | `server:23bb58d` | smoke 14/14 PASS |
| master-sync (Cloud Run Job) | `master-sync:c3d679d` | smoke 6/6 PASS |

### 1차 배포 직후 실측
- `STEP1 mapped + deduped`: mapped 3,502 → **3,870**, mapErrors **364 → 0**.
  → mapErrors 잔여분(진단 시 미상이던 ~267건)은 전부 코드 형식 실패였음이 확인됐다.
- 채비(`0011T0`) `top_movers` **rank 15** 진입, `stock_quotes` 실시간 갱신 재개.

### 회귀 (본 수정이 유발)
정규식을 풀자 영문코드 ETP **297종**이 함께 유입됐고, master-sync 의 ETP 필터가 아직
숫자 전용이라 이들이 마스터에 없었다 → `bootstrapMissingStocks` 가 `security_group='주권'`
으로 등록 → `rebuildTopMovers` 화이트리스트 통과 → **ETF 9종이 급등 목록에 노출**
(SK하이닉스 단일종목 레버리지 7종: `0193T0`/`0194R0`/`0194T0`/`0195S0`/`0197W0`/`0198D0`/`0192L0`,
원자력 3종: `0091P0`/`0098F0`/`0092B0`).

원인: PLAN 이 `fetchEtpBaseInfo.ts:47` 을 "의도된 동작"으로 스코프에서 제외했는데,
그 근거였던 주석("키움은 6자리 숫자만 반환")의 전제 자체가 **이번에 고친 매퍼가 만든 착시**였다.

### 수정 — 커밋 `c3d679d`
1. `workers/master-sync/src/krx/fetchEtpBaseInfo.ts`: `CODE_RE(^\d{6}$)` → `SHORT_CODE_RE`.
   영문코드 ETF/ETN/ELW 가 마스터에 정확한 `security_group` 으로 등록된다.
2. `workers/intraday-sync/src/pipeline/bootstrapStocks.ts`: 미확인 종목을 `'주권'` 이 아닌
   `UNCLASSIFIED_SECURITY_GROUP='미확인'` sentinel 로 등록. 화이트리스트·ETP 어느 쪽에도
   속하지 않아 master-sync 가 덮을 때까지 자동 배제된다.
3. 회귀 테스트 2건 추가 (`master-sync/tests/etp-code-filter.test.ts`, `bootstrapStocks.test.ts`).
   검증: master-sync 43 passed / intraday-sync 154 passed / workspace typecheck exit 0.

### 데이터 복구 (master-sync 수동 재실행)
- `stocks` 총 3,999 → **7,453** 행. 영문코드 ETP **3,038행이 ETF/ETN/ELW 로 정확히 등록**.
- `top_movers` 에서 ETF 9종 전부 제거. 남은 영문코드는 실제 주식만
  (액스비스·채비·인벤테라·아로마티카·그린광학·세미티에스·엔비알모션).
- 정상 상태 확인: mapErrors 0, `bootstrapMissingStocks` inserted 0, `'미확인'` sentinel 0행.

### 잔존 항목 (후속)
1. **`0238P0` TIGER 미국S&P500미국채혼합50** 1건이 `security_group='주권'` 으로 남아 있다.
   수정 배포 직전 bootstrap 이 넣었고, KRX ETP 매매정보(해당 기준일)에 아직 없어 재실행으로도
   정정되지 않았다. 채권혼합 ETF 라 등락률 상위 100 진입 가능성은 사실상 없고,
   다음 master-sync(내일 08:10)에서 자동 정정된다. Supabase 직접 PATCH 는 권한 정책에 막혀
   수동 정정하지 않았다.
2. **블랙리스트/화이트리스트 비대칭**: `comovement`/`cosurge`/`surge_upper_cap` SQL 은
   `security_group NOT IN ('ETF','ETN','ELW')` 블랙리스트라 `'미확인'` sentinel 을 통과시킨다.
   sentinel 이 상시 0행이면 무해하나, 신규 상장 창에서는 노출될 수 있다.
3. `server/src/services/chat-orchestrator.ts:166` 의 `/\((\d{6})\)/g` 는 여전히 숫자 전용
   (LLM 출력 본문 파싱, 오탐 위험 때문에 의도적 보류).
