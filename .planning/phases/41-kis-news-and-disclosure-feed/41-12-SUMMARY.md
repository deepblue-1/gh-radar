---
phase: 41-kis-news-and-disclosure-feed
plan: 12
subsystem: worker · shared
status: complete
tags: [kis-news-sync, classify, ingest, etp, supabase-rpc, vitest]
requires:
  - phase: 41-01
    provides: "kis_news_ingest(p_rows, p_via, p_queried_code) 행 키 계약 · newsTitleKey"
  - phase: 41-06
    provides: "KisNewsTitleRow · 실측 표본 픽스처 · 워크스페이스 골격"
provides:
  - "shared etp.ts — ETP_NAME_PATTERN · isEtpProduct (수집기 · home-sync 공용 단일 정의)"
  - "workers/kis-news-sync/src/pipeline/classify.ts — toIngestRows · IngestRow · IngestLink · HiddenReason · StockMeta · ClassifyOptions · ClassifyStats · DERIVATIVE_NOTICE_PATTERN · DISCLOSURE_PROVIDERS · writtenAtOf"
  - "workers/kis-news-sync/src/pipeline/ingest.ts — ingestRows · IngestVia · IngestResult"
affects: [41-08, 41-10]
actuals:
  tokens: 10800   # chars/4 over 전체 diff(43202자, tdd-red 기록 2개 포함)
  tasks: 2
  commits: 4
plan_head_before: ba6c3aeeea2eee7b77b03d61e6134458bcfd689d
plan_head_after: 807166c87ba6c732e9e5a8c30acb55007a61d245
tech-stack:
  added: []
  patterns:
    - "한투 응답 → DB 행 변환은 순수 함수 하나(toIngestRows) — 루프는 시계 · 순서만"
    - "연결 숨김 사유는 연결 칸마다 계산(조회 종목 일반 · 표시 종목 ETF 가 한 글에 섞일 수 있다)"
key-files:
  created:
    - packages/shared/src/etp.ts
    - packages/shared/src/__tests__/etp.test.ts
    - workers/kis-news-sync/src/pipeline/classify.ts
    - workers/kis-news-sync/src/pipeline/ingest.ts
    - workers/kis-news-sync/tests/classify.test.ts
    - workers/kis-news-sync/tests/ingest.test.ts
    - .planning/phases/41-kis-news-and-disclosure-feed/tdd-red/41-12-T1-red.json
    - .planning/phases/41-kis-news-and-disclosure-feed/tdd-red/41-12-T2-red.json
  modified:
    - packages/shared/src/index.ts
key-decisions:
  - "한 연결이 ETP 이면서 파생 안내 공시이면 hidden_reason 은 etp(종목 성질 먼저) — 어느 쪽이든 조회에서 빠진다"
  - "queriedCode 는 meta 에 없어도 연결한다(Pitfall 2 — 조회한 종목엔 반드시 연결) · 모양이 틀리면 호출부 버그로 throw"
  - "unknownCodes 는 모양 위반 코드와 meta 에 없는 코드를 연결 칸 단위로 함께 센다"
  - "제목 · 정규화 키 빈 글, 일련번호 · 제공업체 빈 글도 invalid 로 센다(시각 오류와 같은 칸)"
  - "ingestRows 는 행 0개여도 늘 RPC 를 부른다 — feed 경로 feed_at 갱신 · 종목 경로 수집 시각 기록"
patterns-established:
  - "ETP 판정은 shared isEtpProduct 만 — 새 판별자 금지(그룹 목록은 krxTick ETP_SECURITY_GROUPS)"
requirements-completed: [SC-1]
coverage:
  - id: D1
    description: "shared ETP 판정 단일 정의 isEtpProduct(그룹 ETF/ETN/ELW · 이름 패턴 · 스팩 제외)"
    requirement: SC-1
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/etp.test.ts (9 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "한투 행 → 들여오기 행 분류(D-07 · D-09 · D-11 · 작성 시각) — 실측 표본 350행으로 잠금"
    requirement: SC-1
    verification:
      - kind: unit
        ref: "workers/kis-news-sync/tests/classify.test.ts (24 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "kis_news_ingest RPC 호출(인자 · 빈 행 호출 · 오류 · 모양 위반 throw)"
    requirement: SC-1
    verification:
      - kind: unit
        ref: "workers/kis-news-sync/tests/ingest.test.ts (5 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "파생 안내 제목 패턴(DERIVATIVE_NOTICE_PATTERN)이 실제 파생 안내 공시를 맞게 거르는지"
    verification: []
    human_judgment: true
    rationale: "실제 파생 안내 공시 제목 표본이 없다([ASSUMED]) — D-10 사용자 확인(41-09 UAT)에서 다듬는다"
duration: 6min
completed: 2026-11-12
---

# Phase 41 Plan 12: ETP 판정 단일 정의 · 한투 행 분류 · 들여오기 Summary

**shared `isEtpProduct`(krxTick 그룹 목록 재사용 · 스팩 제외)를 단일 ETP 판정으로 세우고, 한투 news-title 행을 `kis_news_ingest` 행(종류 · data_dt+data_tm 시각 · newsTitleKey · 조회 코드 + iscd1..10 연결 · etp/derivative_notice 숨김)으로 바꾸는 순수 함수와 RPC 호출을 실측 표본 350행으로 잠갔다.**

## Performance

- **Duration:** 약 6분(실작업 · 문서 읽기 제외)
- **Started:** 2026-11-11T15:19:35Z
- **Completed:** 2026-11-11T15:25:13Z
- **Tasks:** 2 (둘 다 TDD)
- **Files modified:** 9 (생성 8 · 수정 1)

## 표본 분류 수치 (2026-11-11 실측 표본 · 종목 정보 = 표본의 코드 → 이름 · 그룹 「주권」)

| 입력 | total | 행(연결됨) | unlinked | unknownCodes | invalid | 공시 | 연결 수 | 숨김 사유 |
|---|---|---|---|---|---|---|---|---|
| 고유 350행(`steps.*.output` 일련번호로 모음) | 350 | 140 | 210 | 0 | 0 | 13 (F 2 · G 11) | 140 | 전부 null(표본에 ETP · 파생 안내 없음) |
| `stock_005930` 40행 · queriedCode `005930` | 40 | 40 | 0 | 0 | 0 | — | 59 (005930 40 + 다른 iscd1 19) | 전부 null |

- 서울경제 3건(`2026111117305105916` 등)은 일련번호 앞 14자리 ≠ data_dt+data_tm — 행의 `written_at` 은 data_dt+data_tm(`2026-11-11T18:41:38+09:00`).
- 공매도 과열종목 지정 6건 · (정정)단일판매ㆍ공급계약체결 1건 → 숨김 없음.

## Accomplishments

- `packages/shared/src/etp.ts` — `ETP_NAME_PATTERN` · `isEtpProduct(name, group)`(그룹 trim · 대문자로 `ETP_SECURITY_GROUPS` 비교 · 이름 패턴 · 스팩 제외) · index 재수출
- `classify.ts` — `toIngestRows(raw, { queriedCode?, meta })` → `{ rows, stats: { total, unlinked, unknownCodes, invalid } }` · `writtenAtOf(dt, tm)`(달력 검증 · 실패 null) · `DISCLOSURE_PROVIDERS` · `DERIVATIVE_NOTICE_PATTERN`
- `ingest.ts` — `ingestRows(supabase, rows, via, queriedCode?)` → rpc `kis_news_ingest` `{ p_rows, p_via, p_queried_code: queriedCode ?? null }` → `{ inserted, revisions, linked }`

## Task Commits

1. **Task 1: shared ETP 판정 단일 정의** — RED `f83076d2` (test) → GREEN `8a7c6e24` (feat)
2. **Task 2: 분류 · 들여오기** — RED `7e5a4a7c` (test) → GREEN `807166c8` (feat)

REFACTOR 커밋 없음(정리할 것 없음).

## Files Created/Modified

- `packages/shared/src/etp.ts` — ETP 판정 단일 정의
- `packages/shared/src/__tests__/etp.test.ts` — 9건
- `packages/shared/src/index.ts` — `export * from "./etp"`
- `workers/kis-news-sync/src/pipeline/classify.ts` — 한투 행 → 들여오기 행
- `workers/kis-news-sync/src/pipeline/ingest.ts` — RPC 호출
- `workers/kis-news-sync/tests/classify.test.ts` — 24건(it 19 + it.each 5)
- `workers/kis-news-sync/tests/ingest.test.ts` — 5건
- `.planning/phases/41-kis-news-and-disclosure-feed/tdd-red/41-12-T1-red.json` · `41-12-T2-red.json` — RED 근거

## 계약 메모 (41-08 루프 · 41-10 home-sync 가 읽을 것)

- `toIngestRows` 의 `meta` 는 `ReadonlyMap<code, { name, group }>` — 41-02 `kis_news_stock_meta()` 결과를 이 모양으로 바꿔 넘긴다. meta 에 없는 코드는 연결하지 않는다(조회 코드는 예외 — 늘 연결).
- `queriedCode` 모양이 `SHORT_CODE_RE` 에 맞지 않으면 throw 한다.
- 행 0개여도 `ingestRows` 를 부른다(종목 경로 수집 시각 · 피드 경로 feed_at).
- 41-10 은 home-sync `isExcludedProduct` 를 shared `isEtpProduct` 로 바꾼다(규칙 동일).

## TDD Gate Compliance

- **T1 RED (`f83076d2`):** 늘 false 를 돌려주는 스텁으로 9건 중 6건 실패(참 기대 단언). `gsd_run check tdd-red-evidence` → `RED_EVIDENCE_OK`(target `증권그룹 ETF 는 ETP 다`). 의미 판정: 대상이 실제 실행돼 `expected false to be true` 단언에서 실패 · 로드 오류 없음. 거짓 기대 3건은 스텁에서도 통과(의도).
- **T1 GREEN (`8a7c6e24`):** 9/9 · shared typecheck 통과.
- **T2 RED (`7e5a4a7c`):** 타입만 맞춘 스텁으로 classify 24건 중 23건 · ingest 5건 전부 단언 실패. 전체 실행 tap-flat 보고는 vitest 가 여러 줄 diff 를 YAML 밖으로 내보내 판정기가 `invalid_record`(Non-TAP data) 로 거부 → `-t D-07` 로 대상만 다시 돌린 보고로 `RED_EVIDENCE_OK`(target `D-07: 고유 350행 중 종목코드가 붙은 글만 행이 된다(140)`). 의미 판정: 표본을 실제로 읽고 `expected [] to have a length of 140 but got +0` 에서 실패 · 픽스처 · import 오류 없음.
- **T2 GREEN (`807166c8`):** 29/29 · kis-news-sync typecheck 통과.
- 순서: 두 태스크 모두 `test(41-12)` 다음에 그 후손인 `feat(41-12)`.

## 검증

- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared exec vitest run src/__tests__/etp.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/shared run typecheck` → 9 passed · tsc 오류 0
- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/kis-news-sync exec vitest run tests/classify.test.ts tests/ingest.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/kis-news-sync run typecheck` → 2 files · 29 passed · tsc 오류 0
- 수용 기준: `export function isEtpProduct` 1 · `ETP_SECURITY_GROUPS` 4 · `./etp"` 1 · etp `it(` 9 · classify 의 표본 파일명 1 · `isEtpProduct` 3 · `newsTitleKey` 3 · ingest 의 `kis_news_ingest` 4 · classify `it(` 19(+ it.each 5)

## Decisions Made

- ETP 이면서 파생 안내 공시인 연결은 `etp` — 종목 성질이 글 성질보다 안정적이라 먼저 쓴다. 어느 쪽이든 조회에서 빠지므로 표시 결과는 같다.
- 조회 코드는 meta 에 없어도 연결 — 대상 목록이 DB 에서 오므로 정상 경로에선 늘 있고, 없더라도 Pitfall 2(조회한 종목 누락)를 막는 쪽을 택했다.
- `category` 는 `news_lrdv_code` trim · 비면 null.

## Deviations from Plan

### 계약 추가(변경 아님)

**1. 보조 타입 export** — `IngestLink` · `HiddenReason` · `StockMeta` · `ClassifyOptions` · `ClassifyStats`(classify) · `IngestVia` · `IngestResult`(ingest). Artifacts 표의 이름은 모두 그대로이고 그 인자 · 반환 타입에 이름을 붙였다.

### 자동 보완

**2. [Rule 2 - 핵심 기능 보완] RPC 결과 모양 검증** — 계획은 「rpc 오류 → throw」만 적었다. 결과가 `{inserted, revisions, linked}` 정수가 아니면 빈 결과로 숨기지 않고 throw(41-01 의 「RPC 결과 모양 위반은 throw」 관례). 테스트 1건으로 잠금. 커밋 `807166c8`.

**3. [Rule 2] 일련번호 · 제공업체 · 정규화 키 빈 글도 invalid** — 계획은 「빈 제목 · 빈 키 제외」 · 「잘못된 날짜 → invalid」 를 따로 적었다. 빈 srno/provider 는 RPC 가 예외를 던져 run 전체가 죽으므로 행 단계에서 빼고 같은 `invalid` 칸으로 센다(stats 키는 계획 그대로 4개).

**Total deviations:** 2 auto-fixed (Rule 2) + 계약 추가 1
**Impact on plan:** 이름 · 시그니처 · 행 키는 Artifacts 표와 41-01 계약 그대로.

## Issues Encountered

- vitest `tap-flat` 보고가 여러 줄 diff 를 YAML 블록 밖으로 내보내 RED 판정기가 거부 — 대상 테스트만 `-t` 로 다시 돌려 해결(위 TDD 절).

## Known Stubs

없음 — RED 스텁은 GREEN 커밋에서 실제 구현으로 바뀌었다. `DERIVATIVE_NOTICE_PATTERN` 은 `[ASSUMED]` 규칙(실제 제목 표본 없음)이라 coverage D4 를 사람 판정으로 남겼다.

## User Setup Required

None.

## Next Phase Readiness

- 41-08 루프가 41-13(호출 · 토큰 · 페이징)과 이 플랜(분류 · 들여오기)을 엮을 수 있다.
- 41-10 은 home-sync 를 shared `isEtpProduct` 로 바꾼다.

## Self-Check: PASSED

- FOUND: packages/shared/src/etp.ts · packages/shared/src/__tests__/etp.test.ts · workers/kis-news-sync/src/pipeline/classify.ts · workers/kis-news-sync/src/pipeline/ingest.ts · workers/kis-news-sync/tests/classify.test.ts · workers/kis-news-sync/tests/ingest.test.ts · tdd-red/41-12-T1-red.json · tdd-red/41-12-T2-red.json
- FOUND: f83076d2 · 8a7c6e24 · 7e5a4a7c · 807166c8 (HEAD 조상)
- STATE.md · ROADMAP.md 변경 없음

---
*Phase: 41-kis-news-and-disclosure-feed*
*Completed: 2026-11-12*
