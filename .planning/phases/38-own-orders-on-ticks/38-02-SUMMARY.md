---
phase: 38-own-orders-on-ticks
plan: 02
subsystem: ticks
tags: [tick-viewer, matching, oracle, fixtures, zstd]

requires:
  - phase: 38-own-orders-on-ticks
    provides: "38-01 matchOwnFills · a3TimeMs · OWN_MATCH_* 상수 · TickOwnFill/Event 계약"
  - phase: 37-tick-viewer
    provides: "A3Columns · buildTickIndex · encodeRecord · splitZstdFrames · 픽스처 README 규칙"
provides:
  - "A3Columns.cumVolume(Float64Array · fieldOff(A3_LAYOUT, \"cum_volume\")) — 근거 · 앵커 조인 키"
  - "scripts/tick-oracle/gen-own-fixtures.mjs(--in · --out · --check) — 로컬 사본 → 창 격자 · 익명 저널 · 자기검사"
  - "픽스처 own1030-{krx|nxt}-{ISIN}.ticks.zst 5개(합 290,708B) + own1030.journal.json(체결 406 · 이벤트 124 · ACC1/ACC2)"
  - "SC-2 오라클 ticks-own.golden.test.ts — 5키 표 · 합 236/165/5/108 · 401/406 · 못찾음 5건 집합"
  - "matchOwnFills 합성 경계 ticks-own.test.ts(8 케이스)"
affects: [38-05, 38-06, 38-07, 38-09]

actuals:
  tokens: 42700
  tasks: 2
  commits: 2
plan_head_before: 7e060f86a87068f4c662e3c128996bf8c85f612f
plan_head_after: 0a692daf90527bef04ba064ede27201ac40a663e

tech-stack:
  added: []
  patterns:
    - "오라클 픽스처는 「창」 격자 — 원본 레코드 순서 보존 필터 + 생성기 안 원본=창 짝짓기 동일성 자기검사"
    - "생성기는 빌드된 packages/shared/dist 를 import 해 테스트와 같은 함수로 자기검사한다(gh-trade venv 불필요)"

key-files:
  created:
    - scripts/tick-oracle/gen-own-fixtures.mjs
    - packages/shared/src/__fixtures__/ticks/own1030-krx-KR7184230001.ticks.zst
    - packages/shared/src/__fixtures__/ticks/own1030-krx-KR7011080009.ticks.zst
    - packages/shared/src/__fixtures__/ticks/own1030-krx-KR7051630002.ticks.zst
    - packages/shared/src/__fixtures__/ticks/own1030-krx-KR7092190008.ticks.zst
    - packages/shared/src/__fixtures__/ticks/own1030-nxt-KR7046890000.ticks.zst
    - packages/shared/src/__fixtures__/ticks/own1030.journal.json
    - packages/shared/src/__tests__/ticks-own.golden.test.ts
    - packages/shared/src/__tests__/ticks-own.test.ts
  modified:
    - packages/shared/src/ticks/record-index.ts
    - packages/shared/src/__tests__/ticks-record-index.test.ts
    - packages/shared/src/__fixtures__/ticks/README.md

key-decisions:
  - "own1030.journal.json 최상위 · 행 키는 전부 알파벳 정렬(events · fills · source 순) — README 「행마다 한 줄 · 키 정렬」 규칙을 계획의 나열 순서보다 우선"
  - "10/30 다섯 종목 원본 격자에는 같은 (board, seq) 중복 A3 가 0건 — 「중복 제외 시」 수치가 단언 수치와 같아 RESEARCH Open Q4 는 이 데이터로는 판별 불가(규칙은 probe 그대로 유지)"

patterns-established:
  - "합성 A3 헬퍼(a3Rec)는 shared 테스트 안 지역 함수 — A3_LAYOUT 필드 이름 · trade_time 은 KST 13:00:00 기준 µs 오프셋 · 공백 칸이면 tNs −1n"

requirements-completed: []

coverage:
  - id: D1
    description: "A3Columns.cumVolume 열 = decodeFields(A3).cum_volume(컷 13시 KRX · NXT 전 A3) · A3Trade/toTrades 무변경 · D-16 골든 3종 그대로"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/ticks-record-index.test.ts#a3ColumnsOf 값 = decodeFields(A3) 값(전 A3)"
        status: pass
      - kind: unit
        ref: "vitest ticks-record-index · ticks-pnl.golden · ticks-orders-krx.golden · ticks-orders-nxt.golden (61 passed · 2 skipped = 기존 선택 블록)"
        status: pass
    human_judgment: false
  - id: D2
    description: "생성기 gen-own-fixtures.mjs — 레코드 수 · 406 · 124 · 파일당 ≤1.5MB · 원본=창 짝짓기 자기검사 · --check 바이트 결정성 · 계좌 익명"
    verification:
      - kind: command
        ref: "node scripts/tick-oracle/gen-own-fixtures.mjs --check (6개 파일 바이트 일치 · exit 0)"
        status: pass
      - kind: command
        ref: "grep -cE '\"account_no\": ?\"[0-9]' own1030.journal.json = 0 · 원본 계좌 3종 문자열 등장 0(값 비출력 대조)"
        status: pass
    human_judgment: false
  - id: D3
    description: "SC-2 오라클 — 5키 (같은수량 · 일부 · 못찾음 · 추정) 정확값 · 합 236/165/5/108 · 401/406 ≥ 98% · 못찾음 5건 집합"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/ticks-own.golden.test.ts#우리 체결 ↔ A3 짝짓기 오라클 10/30 (SC-2) (9 passed)"
        status: pass
    human_judgment: false
  - id: D4
    description: "matchOwnFills 합성 경계 — dt −200/+1500 · 차감 · 추정 19.9/20ms · 동률 작은 j · 가격 불일치 · tNs 없음 · 입력 순서"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/ticks-own.test.ts#matchOwnFills 합성 경계 (8 passed)"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-11-03
status: complete
---

# Phase 38 Plan 02: 10/30 우리 체결 오라클 Summary

**`A3Columns.cumVolume` 열을 더하고, 저장소 밖 10/30 로컬 사본을 「창」 격자 5개(합 290,708B) + 익명 저널(체결 406 · 이벤트 124)로 바꾸는 결정적 생성기를 만들어, 커밋된 픽스처 위에서 `matchOwnFills` 가 ROADMAP 수치(짝 401/406 · 일부 165 · 추정 108 · 못찾음 5건)를 정확히 재현함을 테스트로 잠갔다.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-11-03T06:03:05Z
- **Completed:** 2026-11-03T06:09:15Z
- **Tasks:** 2 (tracer 1 · auto/tdd 1)
- **Files modified:** 12 (새 9 · 수정 3)

## Accomplishments
- `record-index.ts` — `A3Columns.cumVolume`(`cumValue` 옆) · `A3_OFF.cumVolume = fieldOff(A3_LAYOUT, "cum_volume")` · 루프 `toNum(parseUint(…, 12))` · 반환 객체. `A3Trade` · `toTrades()` 무변경. 레코드 인덱스 테스트에 decodeFields 동일성 한 줄.
- `scripts/tick-oracle/gen-own-fixtures.mjs` — 입력 `/Users/alex/gh-radar-own-probe-1030/`(원격 접근 0) · 창 규칙(A3: 체결 [g−3000, g+1000] ∨ 이벤트 수신 [e−3500, e+500] ∨ cum 일치 ∨ 주기매도 (before, after] · B6: 이벤트 수신 창) · zstd-19 한 프레임 · 계좌 `ACC1…` · 자기검사 4종 · `--check`.
- 생성 결과(키별 원본 → 남김 · 바이트 · 짝):

  | 키 | 원본 레코드 | 남긴 레코드 | zstd | 체결(짝) | 이벤트 |
  |---|---|---|---|---|---|
  | KRX_KR7184230001 | 11,130 | 2,199 | 40,685 B | 227 (225) | 32 |
  | KRX_KR7011080009 | 6,421 | 460 | 10,408 B | 58 (58) | 5 |
  | KRX_KR7051630002 | 126,135 | 476 | 11,318 B | 43 (42) | 29 |
  | KRX_KR7092190008 | 118,990 | 4,458 | 94,849 B | 35 (33) | 48 |
  | NXT_KR7046890000 | 587,383 | 7,108 | 133,448 B | 43 (43) | 10 |
  | **합** | | | **290,708 B** | **406 (401)** | **124** |

- 오라클 `ticks-own.golden.test.ts` — 표 그대로 통과(184230 153/72/2/71 · 011080 25/33/0/12 · 051630 20/22/1/3 · 092190 13/20/2/12 · NXT 046890 25/18/0/10 · 합 236/165/5/108 · 401/406 = 98.8%) · 못찾음 5건 = {S 2490×193 · S 2510×246 · B 3150×11 · S 10210×151 · B 9110×4}.
- 합성 `ticks-own.test.ts` — behavior 8항 전부(+ 헬퍼 자체 확인 1).

## 「중복 제외 시」 수치 (RESEARCH Open Q4 — 단언 아님)

`[own-oracle] 중복 제외 시 — 중복 A3 0 · 같은수량 236 · 일부 165 · 못찾음 5 · 추정 108 (짝 401/406)`

원본 격자 5개를 직접 훑어도 같은 (board, seq) 중복 A3 는 0건이다(KRX 2,813 · 1,612 · 36,562 · 33,223 · NXT 146,390 A3). 즉 10/30 데이터로는 중복 제외 여부가 결과를 바꾸지 않는다 — 규칙은 probe 그대로(중복 포함) 유지하고 채택 판단은 38-10 UAT 뒤 후속.

## dt 분포 (참고 · 단언 아님)

`[own-oracle]` 출력: 184230 p50 −0.0 · p95 559.6 · max 729.0 / 011080 −0.3 · 233.1 · 710.9 / 051630 −0.1 · 31.4 · 58.1 / 092190 25.4 · 79.4 · 113.2 / NXT 046890 23.3 · 191.2 · 746.2 ms. max 는 RESEARCH 표(729 · 711 · 58 · 113 · 746)와 같고, p95 는 분위 정의(이 테스트는 `floor(q·n)` 자리)가 probe 원문에 없어 몇 십 ms 다르다 — 그래서 단언하지 않는다.

## Task Commits

1. **Task 1 (tracer): cumVolume 열 → 생성기 → 픽스처 · --check** — `ad133f2e` (test)
2. **Task 2: SC-2 오라클 + matchOwnFills 합성 경계** — `0a692daf` (test)

**Plan metadata:** 이 SUMMARY 커밋(docs)

## Files Created/Modified
- `packages/shared/src/ticks/record-index.ts` — `cumVolume` 열
- `packages/shared/src/__tests__/ticks-record-index.test.ts` — `a3.cumVolume[j]` 단언 한 줄
- `scripts/tick-oracle/gen-own-fixtures.mjs` — 생성기(머리 주석 = 목적 · 입력 · 창 규칙 · 익명화 · 자기검사 · 사용법 · purge 메모)
- `packages/shared/src/__fixtures__/ticks/own1030-*.ticks.zst` 5개 · `own1030.journal.json` — 픽스처
- `packages/shared/src/__fixtures__/ticks/README.md` — 재생성 2줄 · 표 6행 · 생성일
- `packages/shared/src/__tests__/ticks-own.golden.test.ts` — SC-2 오라클(38-05 가 SC-3 절을 더한다)
- `packages/shared/src/__tests__/ticks-own.test.ts` — 합성 경계

## Verification (실행 결과 그대로)
- Task 1 `<verify>`: `pnpm --filter @gh-radar/shared build` · `run typecheck` 통과 · `node scripts/tick-oracle/gen-own-fixtures.mjs --check` → 「6개 파일 바이트 일치」 exit 0 · vitest(record-index · pnl.golden · orders-krx.golden · orders-nxt.golden) 4 files · 61 passed · 2 skipped(빅텍 10/22 하루 골든 선택 블록 — 기존과 같음).
- 트레이서 게이트: auto 아님 · human_verify_mode end-of-phase · `<verify>` 자동만 → 전체 재실행 통과 후 확장(체크포인트 없음).
- Task 2 `<verify>`: build · typecheck 통과 · vitest(ticks-own.golden · ticks-own) 2 files · 17 passed.
- 수용 기준: grep 3종(record-index) · 픽스처 5개 · 각 ≤ 1,572,864B(최대 133,448B) · 406/124 node 검사 exit 0 · 숫자 계좌 grep 0 · README 생성기 줄 + 6행 · grep 4종(golden) 전부 PASS.
- 계획 `<verification>`: `git show --stat HEAD~1 HEAD` = files_modified 안 파일만(10 + 2).
- 미실행: 전체 shared 회귀 · webapp/server 테스트(이 플랜은 shared 와 저장소 밖 입력만 다룸 · 메모리 고갈 이력으로 파일 단위만).

## Decisions Made
- frontmatter key-decisions 2건.
- 생성기의 `--check` 는 임시 디렉터리에 같은 6파일을 쓰고 `--out` 과 바이트 비교 뒤 지운다(README 는 손으로 쓰는 파일이라 비교 대상 아님).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 테스트 버그] 합성 「가격 다르면 후보 아님」 케이스의 A3 시각을 창 안으로**
- **Found during:** Task 2(TDD 첫 실행)
- **Issue:** 같은 가격 A3 를 +300ms 에 둬서 dt = −295(창 밖)였다 — 구현이 아니라 테스트 입력 실수.
- **Fix:** +100ms(dt −95)로 옮겼다. `own-fills.ts` 는 고치지 않았다.
- **Files modified:** packages/shared/src/__tests__/ticks-own.test.ts
- **Commit:** 0a692daf

### 계획과 다른 수치(편차 아님 · 기록)
- 창 격자 남긴 레코드 · 크기가 RESEARCH 「크기만 계산」 표(2,616 · 607 · 644 · 4,879 · 8,517 · 합 347,433B)보다 작다(2,199 · 460 · 476 · 4,458 · 7,108 · 합 290,708B). 계획 문구대로 B6 는 이벤트 수신 창만 남겼기 때문으로 보인다(RESEARCH 는 체결 창의 B6 까지 넣은 것으로 읽힌다). 생성기 자기검사(원본 = 창 짝짓기)는 통과했다. 38-05 의 호가 근거 B6 창 [e−3000, e+50] 은 이 창 [e−3500, e+500] 안이다.

---

**Total deviations:** 1 auto-fixed (Rule 1 테스트 입력 1건)
**Impact on plan:** 없음 — 규칙 · 구현 · 단언 수치 무변경.

## Issues Encountered
- 이 세션의 격리 정책이 공유 `.git/worktrees/phase-38/` 아래 원장 파일 쓰기를 막아, 커밋 수는 기준 SHA `7e060f86` 에서 `git rev-list --count` 로 직접 쟀다(2).
- 같은 정책이 복합 git 명령을 막아 git 은 단순 명령으로 나눠 실행했다(결과물 영향 없음).

## Known Stubs
없음.

## User Setup Required
None — 원격 접근 · 배포 없음. 생성기 재실행에는 로컬 사본 `/Users/alex/gh-radar-own-probe-1030/` 이 필요하다(Storage 원본은 2027-01-28 무렵 purge).

## Next Phase Readiness
- 38-05(근거 · 앵커 SC-3)가 `A3Columns.cumVolume` 과 이 픽스처(이벤트 124 · cum 일치 A3 · 주기매도 구간 · 이벤트 주변 B6)를 바로 쓸 수 있다 — 같은 `ticks-own.golden.test.ts` 에 SC-3 `describe` 를 더한다.

## Self-Check: PASSED
- 새 파일 9개 · 수정 3개 존재 확인 · 커밋 `ad133f2e` · `0a692daf` 가 HEAD 조상 · `git rev-list --count 7e060f86..HEAD` = 2.
