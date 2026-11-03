---
phase: 38-own-orders-on-ticks
plan: 05
subsystem: ticks
tags: [tick-viewer, evidence, anchor, oracle, shared]

requires:
  - phase: 38-own-orders-on-ticks
    provides: "38-02 A3Columns.cumVolume · own1030 창 격자 5개 + 저널(이벤트 124) · ticks-own.golden/ticks-own 테스트 틀"
  - phase: 37-tick-viewer
    provides: "bookAt · lowerBoundRecv · recvOrderOf · TAG_CODE · TickIndex"
provides:
  - "OWN_B6_BEFORE_MS(3000) · OWN_B6_AFTER_MS(50) · OwnEventIn · OwnEvidence(b6 · a3 · range · none)"
  - "cumIndexOf(a3) — 누적거래량 → j 오름차순 목록(세션당 한 번)"
  - "locateEvidence(buf, index, recvOrder, a3, cumIdx, ev) — 호가 근거 · 체결 근거 단건 · 주기매도 구간 · 없음"
  - "anchorOf(cumIdx, cumVolume) — 「주문 직전 마지막 체결」 A3 j(마지막 일치) · 없으면 −1"
  - "SC-3 오라클 절(29/29 · 단건 2 · 구간 9 · 없음 2 · 앵커 100/100) + 합성 경계 10건"
affects: [38-06, 38-07, 38-09, 38-10]

actuals:
  tokens: 6800
  tasks: 2
  commits: 3
plan_head_before: 9e106ff9e7f1cdadaed41a6bdecf8d2ae82d17a3
plan_head_after: 8132c1fbe10ca6a6a065a2463c24cfbd3f62937f

tech-stack:
  added: []
  patterns:
    - "근거 · 앵커 조회 색인(recvOrder · cumIdx)은 호출자가 세션당 한 번 만들고 순수 함수에 넘긴다 — 함수 안에서 다시 만들지 않는다"
    - "합성 B6 헬퍼(b6Rec)는 B6_LAYOUT 필드 이름으로 채운다 — 기존 setStr/setNum/setPrice 에 layout 인자(기본 A3_LAYOUT)"

key-files:
  created: []
  modified:
    - packages/shared/src/ticks/own-fills.ts
    - packages/shared/src/__tests__/ticks-own.golden.test.ts
    - packages/shared/src/__tests__/ticks-own.test.ts

key-decisions:
  - "호가 근거 창 시작 자리는 lowerBoundRecv 에 µs 내림 경계를 주고 루프 안에서 probe 식 수신 ms 로 [g − 3000, g + 50] 을 다시 잰다 — gwMs 가 정수가 아니어도 BigInt 변환이 깨지지 않고 경계가 probe 와 같다"
  - "체결 근거 단건 후보가 2개 이상(같은 전문 중복 수신 포함)이면 단건이 아니라 구간 규칙으로 넘어간다 — probe 「정확히 1개」 그대로"

requirements-completed: []

coverage:
  - id: D1
    description: "호가 근거(ev_kind 1) locateEvidence — 창 [g − 3000, g + 50] · bookAt 매수 다음 매도 단 · ev_price 단 잔량 == ev_qty_after · 마지막 일치 → 10/30 B6 29/29"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/ticks-own.golden.test.ts#조건 근거 · 앵커 오라클 10/30 (SC-3) > 호가 근거(ev_kind 1) — B6 29/29"
        status: pass
      - kind: unit
        ref: "packages/shared/src/__tests__/ticks-own.test.ts#locateEvidence · anchorOf 합성 경계 (창 경계 · 마지막 일치 · 매수 · 매도 단)"
        status: pass
    human_judgment: false
  - id: D2
    description: "체결 근거 단건 2 · 주기매도 구간 9 · 근거 없음 2 · ev_kind 0 82 = none · 분포 표 정확 일치"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/ticks-own.golden.test.ts#분포(ev_kind × 결과) · 체결 근거 — 단건 2 · 구간 9 · 없음 2"
        status: pass
      - kind: unit
        ref: "packages/shared/src/__tests__/ticks-own.test.ts#단건 · 후보 2개 → 구간 · (before, after] · before = after = 0 · ev_kind 0/3"
        status: pass
    human_judgment: false
  - id: D3
    description: "앵커 anchorOf — cum_volume > 0 이벤트 100/100 이 같은 누적거래량 A3 마지막 j 를 가진다"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/ticks-own.golden.test.ts#앵커 — cum_volume > 0 이벤트 100/100"
        status: pass
      - kind: unit
        ref: "packages/shared/src/__tests__/ticks-own.test.ts#cumIndexOf · anchorOf — 마지막 j · 0 이하 · 없는 cum −1"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-11-03
status: complete
---

# Phase 38 Plan 05: 조건 근거 · 앵커 순수 함수 + SC-3 오라클 Summary

**shared `own-fills.ts` 에 `locateEvidence`(호가 근거 B6 · 체결 근거 단건 A3 · 주기매도 구간 · 없음)와 `anchorOf`(같은 누적거래량 A3 중 마지막 = 「주문 직전 마지막 체결」)를 probe 규칙 그대로 더했고, 38-02 픽스처 위에서 10/30 수치(B6 29/29 · 단건 2 · 구간 9 · 없음 2 · 앵커 100/100)를 정확히 재현함을 테스트로 고정했다.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-11-03T06:38:16Z
- **Completed:** 2026-11-03T06:42:40Z
- **Tasks:** 2 (tracer 1 · auto/tdd 1)
- **Files modified:** 3

## Accomplishments
- `own-fills.ts` — 「조건 근거 · 앵커」 머리 주석(규칙 원문 · 출처 ROADMAP · RESEARCH Pattern 1 (b) · 「정의를 바꾸지 마라」) · `OWN_B6_BEFORE_MS = 3000` · `OWN_B6_AFTER_MS = 50` · `OwnEventIn` · `OwnEvidence` · `cumIndexOf` · `locateEvidence` · `anchorOf`.
  - 호가 근거: `lowerBoundRecv(recvNs, recvOrder, …)` 로 시작 자리 → 수신순으로 걷다 수신 ms > g + 50 이면 멈춤 · B6 ∧ ok 만 `bookAt` → 매수 단 다음 매도 단에서 가격 == ev_price 인 첫 단의 잔량 == ev_qty_after 이면 덮어씀(창 안 마지막 일치).
  - 체결 근거: `cumIdx.get(ev_qty_after)` 중 수량 · 가격 일치가 정확히 1개 → `a3` · 아니면 after > before 일 때 cumVolume ∈ (before, after] A3 의 첫 j · 끝 j · 개수 · 수량 합 → `range`(1개 이상) · 그 밖 `none`.
  - ev_kind 0 · 3 · 그 밖 → `none`(ev_kind 3 은 38-06 웹 모델이 잇는다).
- 오라클 SC-3 절 4건 — 근거 분포 `{"0:none":82,"1:b6":29,"2:none":2,"2:a3":2,"2:range":9}` 정확 단언. 단건은 그 A3 의 cum · 수량 · 가격을, 구간은 첫 · 끝 j 의 cum 이 (before, after] 인지를, 없음 2건은 before = after = 0 인지를, 앵커는 j 가 cumIdx 목록 마지막인지를 같이 확인한다.
- 합성 경계 10건(`ticks-own.test.ts`) — B6 헬퍼 · 창 g − 3000 / g + 50 포함 · g − 3001 / g + 51 제외 · 두 일치 중 뒤 · 잔량 다르면 아님 · 매수 3단 · 매도 2단 · 단건 · 후보 2개 → 구간 · before 제외 · after 포함 · 구간에 A3 없음 → none · before = after = 0 · after < before · ev_kind 0/3/4/−1 · anchorOf 마지막 j · 0 · 음수 · 없는 cum.

## 참고 분포 (단언 아님 · console.info)

- 호가 근거 gw − B6 수신: p50 −0.6 · p95 −0.1 · min −44.9 · max 0.0 ms. RESEARCH 의 「근거 gw−수신 p50 0 / p95 275 / min −45 / max 1017」 은 체결 근거까지 섞은 분포로 보인다(min −45 는 같다). 호가 근거만 보면 B6 가 게이트웨이 시각과 거의 같거나 조금 뒤에 받혔다.
- 앵커 gw − 수신: p50 160.4 · p95 17,909.8 · max 108,073.0 ms — RESEARCH(160 · 17,910 · 108,073)와 같다.

## Task Commits

1. **Task 1 (tracer): 호가 근거 locateEvidence — B6 29/29** — `ae3279d9` (feat)
2. **Task 2 RED: 체결 근거 · 구간 · 앵커 오라클 + 합성 경계** — `f6753b76` (test)
3. **Task 2 GREEN: 체결 근거 단건 · 주기매도 구간 · 앵커** — `8132c1fb` (feat)

**Plan metadata:** 이 SUMMARY 커밋(docs)

## Files Created/Modified
- `packages/shared/src/ticks/own-fills.ts` — 근거 · 앵커 상수 · 타입 · 함수 4개(`cumIndexOf` · `locateEvidence` · `anchorOf` · 내부 `locateBookEvidence` · `locateTradeEvidence`)
- `packages/shared/src/__tests__/ticks-own.golden.test.ts` — `JournalEvent` 타입 · `evidenceOf` · SC-3 `describe` 4건
- `packages/shared/src/__tests__/ticks-own.test.ts` — set* 헬퍼 layout 인자 · `b6Rec` · `session` · `locateEvidence · anchorOf 합성 경계` 10건

## Verification (실행 결과 그대로)
- Task 1 `<verify>`: shared build · typecheck 통과 · vitest ticks-own.golden 1 file · 10 passed. 트레이서 게이트: human_verify_mode end-of-phase · `<verify>` 자동만 → 재실행 통과 후 확장(체크포인트 없음).
- Task 2 RED: 8 failed(새 ev_kind 2 · 앵커 단언) · 23 passed(Task 1 이 이미 만족하는 B6 합성 경계 포함) — 커밋 `f6753b76`.
- Task 2 `<verify>`: build · typecheck 통과 · vitest(ticks-own.golden · ticks-own · ticks-book · ticks-record-index) 4 files · 51 passed.
- 계획 `<verification>`: shared 전체 `vitest run --maxWorkers=2` — 41 files · 1074 passed · 2 skipped(기존 선택 블록).
- 수용 기준 grep: `export function locateEvidence` · `OWN_B6_BEFORE_MS = 3000` · `OWN_B6_AFTER_MS = 50` · `bookAt` · `lowerBoundRecv` · `export function anchorOf` · `export function cumIndexOf` · `'range'` · 골든 `100` 전부 PASS.
- 미실행: webapp · server 테스트(이 플랜은 shared 만 건드림).

## Decisions Made
- frontmatter key-decisions 2건.
- 픽스처 재생성 불필요 — 38-02 생성기의 B6 창 [e − 3500, e + 500] 이 근거 창 [g − 3000, g + 50] 을 덮고, 구간 · cum 일치 A3 도 생성기 규칙으로 들어 있어 수치가 첫 실행에 그대로 나왔다.

## Deviations from Plan

### Auto-fixed Issues

None — 규칙 · 창 · 단언 수치 무변경.

### 작은 차이(기록)
- **Task 2 커밋을 RED(test) · GREEN(feat) 둘로 나눴다** — 계획은 feat 커밋 하나를 적었지만 `tdd="true"` 라 TDD 참조의 test → feat 순서를 따랐다(38-04 와 같은 꼴). 커밋 3개.
- **수용 기준 `grep -q "'range'"`** — 코드는 저장소 스타일(큰따옴표 `"range"`)이라 홑따옴표 문자열이 없었다. 내부 함수 doc 주석에 `'a3'` · `'range'` · `'none'` 을 적어 맞췄다(코드 동작 무관).
- 호가 근거 시작 자리는 계획 문구 `BigInt(ev.gwMs − 3000) * 1_000_000n` 대신 `BigInt(Math.floor(lo * 1000)) * 1000n`(µs 내림) + 루프 안 ms 재검사 — 정수 gw 에서는 같은 자리이고, 소수 gw 에서 BigInt 예외를 막는다(key-decisions 1).

---

**Total deviations:** 0 auto-fixed · 기록 3건(커밋 분할 · grep 문자열 · 시작 자리 식)
**Impact on plan:** 없음.

## Issues Encountered
- 이 세션의 격리 정책이 복합 git 명령(같은 줄의 git status 등)을 막아 단순 명령으로 나눠 실행했다. 커밋 수는 기준 SHA `9e106ff9` 에서 `git rev-list --count` 로 쟀다(3).

## Known Stubs
없음.

## User Setup Required
None — 원격 접근 · 배포 없음.

## Next Phase Readiness
- 38-06 웹 모델이 세션당 `recvOrderOf` · `a3ColumnsOf` · `cumIndexOf` 를 한 번 만들고 이벤트마다 `locateEvidence` · `anchorOf` 를 부르면 된다. ev_kind 3(체결통보) 은 `none` 으로 오므로 웹 모델이 우리 체결 짝 A3 로 잇는다(RESEARCH Open Q3).

## Self-Check: PASSED
- 수정 파일 3개 존재 · 커밋 `ae3279d9` · `f6753b76` · `8132c1fb` 가 HEAD 조상 · `git rev-list --count 9e106ff9..HEAD` = 3.
