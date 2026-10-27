---
phase: 36-account-budget
plan: 05
subsystem: relay+db
tags: [relay, supabase, journal, pnl, d-15, one-way, pgtap, tracer]
status: complete

requires:
  - phase: 36-01
    provides: "relay 생성물 재동기화(StockDMA.fbs · journal-record.ts avgPrice/feeKrw/taxKrw/realizedPnlKrw) · frames.ts createJournalRecord 말미 0n×4 임시값"
  - phase: 36-02
    provides: "relay 관리 경로 정리(이 플랜은 저널 경로만 건드린다 — 직접 의존 없음, 웨이브 순서)"
provides:
  - "JournalRecord.avgPrice · .feeKrw · .taxKrw · .realizedPnlKrw (number · toNum 경계 · 음수 허용)"
  - "parseJournalBatch 가 80 JournalRecord 말미 4필드를 읽는다(필드 부재 = 0)"
  - "JournalApplyEvent.avg_price · .fee_krw · .tax_krw · .realized_pnl_krw — 이벤트 JSON 키 = DB 열 이름(one-way 계약)"
  - "supabase/migrations/20261027210000_dma_journal_pnl.sql — dma_journal_events bigint 4열 NOT NULL DEFAULT 0 · idx_dma_journal_events_fill_day (trade_date, account_no) WHERE notice_type = 'E' · dma_journal_apply 재정의"
  - "frames fakeJournalRecord 4필드 기본 0 · buildJournalBatchFrame 이 4값을 BigInt 로 싣는다"
affects: [36-07, 36-08, 36-09]

actuals:
  tokens: 8949
  tasks: 2
  commits: 1
plan_head_before: e928ea84d41cb4640280d0bed631cb292150f7cb
plan_head_after: d90f79292dcaf8eeed7263ae691cf81ca0018f6d

tech-stack:
  added: []
  patterns:
    - "append-only 저널 필드: fbs 말미 필드 → 도메인 타입(camelCase) → apply 이벤트 키(snake_case = DB 열) → apply INSERT 의 coalesce((ev->>'…')::bigint, 0). 옛 relay 이벤트는 키가 없어 기본 0, 옛 DB 의 apply 는 모르는 키를 무시 — 배포 순서 독립"
    - "apply 재정의는 직전 정의 파일 본문을 기계적으로 복사하고 diff 로 「추가 줄만」 을 확인한다(이번 diff = INSERT 열 4 · VALUES 4)"

key-files:
  created:
    - supabase/migrations/20261027210000_dma_journal_pnl.sql
  modified:
    - relay/src/journal/types.ts
    - relay/src/dma/envelope.ts
    - relay/src/journal/writer.ts
    - relay/tests/helpers/frames.ts
    - relay/tests/journal-codec.test.ts
    - relay/tests/journal-writer.test.ts
    - relay/tests/journal-observer.test.ts
    - relay/tests/journal-push.test.ts
    - supabase/tests/dma_journal_apply.test.sql
    - supabase/tests/dma_journal_schema.test.sql

key-decisions:
  - "D-15(one-way) 저널 손익 4키 이름 avg_price · fee_krw · tax_krw · realized_pnl_krw · bigint NOT NULL DEFAULT 0 · 백필 없음 — 사용자 승인 「승인 (권장)」(2026-10-27). gh-trade 41-04 fbs 필드명과 같다"
  - "평단 모르는 매도의 의미는 fbs 주석(「평단 모름 0」)이 아니라 인박스 261027-account-pnl 「추가」 4번(realized_pnl_krw = −(fee_krw + tax_krw))을 정본으로 JSDoc · 열 COMMENT 에 적었다"
  - "apply 재정의 복사 원본은 20261004090100_dma_journal_apply_skipped_rows.sql(grep 결과 마지막 정의 파일 — 변동 없음)"
  - "마이그레이션 타임스탬프 20261027210000 그대로(작성 직전 ls 결과 마지막 파일 20261027200100 — 충돌 없음)"

patterns-established:
  - "relay ↔ DB 이벤트 키를 늘릴 때: relay 테스트의 APPLY_KEYS · 키 수 단언 · 손수 만든 JournalRecord 픽스처를 모두 같이 갱신해야 typecheck:tests 와 키 집합 단언이 통과한다"

requirements-completed: []

coverage:
  - id: D1
    description: "relay 파서가 80 레코드 손익 4필드를 27키 레코드로 싣는다(음수 · 평단 모르는 매도 · 필드 부재 0)"
    verification:
      - kind: unit
        ref: "relay/tests/journal-codec.test.ts#②-b 36-05 D-15"
        status: pass
      - kind: unit
        ref: "relay/tests/journal-codec.test.ts#② 저널 배치(80) → batch · 27필드"
        status: pass
    human_judgment: false
  - id: D2
    description: "기록기 toApplyEvent 가 4키를 이름 그대로 싣는다(키 27종)"
    verification:
      - kind: unit
        ref: "relay/tests/journal-writer.test.ts#36-05 D-15 — toApplyEvent 키 27종"
        status: pass
      - kind: unit
        ref: "relay/tests/journal-push.test.ts (APPLY_KEYS 27종 집합 단언)"
        status: pass
    human_judgment: false
  - id: D3
    description: "dma_journal_apply 가 4키를 열에 적재 · 옛 이벤트 0 · int4 밖 값 · 재적용 skipped 뒤 rows 유지 · 권한 (f, f, t)"
    verification:
      - kind: pgtap
        ref: "supabase/tests/dma_journal_apply.test.sql#25 (ok 90~96)"
        status: pass
    human_judgment: false
  - id: D4
    description: "dma_journal_events 4열 bigint NOT NULL DEFAULT 0 · 체결 부분 인덱스"
    verification:
      - kind: pgtap
        ref: "supabase/tests/dma_journal_schema.test.sql (ok 97~114)"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-10-28
---

# Phase 36 Plan 05: 저널 손익 4필드 → DB Summary

**gh-trade 41-04 JournalRecord 손익 4필드(avg_price · fee_krw · tax_krw · realized_pnl_krw)를 relay 파서 → apply 이벤트 키 → `dma_journal_apply` coalesce 적재 → `dma_journal_events` bigint 4열로 잇는 트레이서. 체결 부분 인덱스도 추가했고, 로컬 pgTAP 으로 적재를 증명했다.**

## Performance

- **Duration:** 약 10분
- **Started:** 2026-10-28T00:2x KST(직전 커밋 e928ea84 00:24 KST 뒤)
- **Completed:** 2026-10-28T00:29 KST
- **Tasks:** 2(Task 1 체크포인트는 오케스트레이터가 해결, Task 2 트레이서)
- **Files modified:** 11(신규 1 · 수정 10)

## Task 1 체크포인트 — 사용자 답 원문

- 질문: 「저널 손익 4필드를 relay 이벤트 JSON 키와 dma_journal_events 열 이름 avg_price · fee_krw · tax_krw · realized_pnl_krw (bigint NOT NULL DEFAULT 0, 백필 없음)로 고정할까요? gh-trade 41-04 fbs 필드명과 같고 이미 합의됐습니다. 배포 뒤에는 이름을 못 바꾸고 새 열을 덧붙여야 합니다.」
- **사용자 답 원문: 「승인 (권장)」** (2026-10-27, AskUserQuestion — 오케스트레이터가 받음)
- 결과: Task 2 를 합의 이름 그대로 구현했다(precondition 충족).

## Accomplishments

- relay `JournalRecord` 에 손익 4필드를 넣고 `parseJournalBatch` 가 `toNum` 으로 읽는다(필드 부재 = 0, 음수 허용, 2^53 밖은 기존 클램프 경계).
- `toApplyEvent` 가 이벤트 키 `avg_price` · `fee_krw` · `tax_krw` · `realized_pnl_krw` 를 싣는다(키 27종, 「바꾸지 말 것(append-only)」 주석).
- 마이그레이션 `20261027210000_dma_journal_pnl.sql` 에 bigint 4열(NOT NULL DEFAULT 0 · 열 COMMENT), 부분 인덱스 `idx_dma_journal_events_fill_day`, `dma_journal_apply` 재정의(원본 본문 + INSERT 열 4 · VALUES coalesce 4), 권한 3줄을 넣었다.
- 배포 순서 독립을 실측했다. `--until 20261027200100`(옛 DB)에서 4키를 실은 배치는 `ok 90`(applied 3 · errors [])으로 통과했다 = 옛 apply 는 새 키를 무시한다. 옛 relay 이벤트(4키 없음)는 새 DB 에서 0 으로 들어간다(ok 92).

## Task Commits

1. **Task 1: [one-way] 키 · 열 계약 확인** — 커밋 없음(결정 체크포인트 · 답 「승인 (권장)」)
2. **Task 2 (tracer): 80 레코드 손익 4필드 → … → dma_journal_events 4열** — `d90f7929` (feat)

**Plan metadata:** 이 SUMMARY 커밋(docs)

## Files Created/Modified

- `supabase/migrations/20261027210000_dma_journal_pnl.sql` — 4열 · 부분 인덱스 · apply 재정의 · 권한
- `relay/src/journal/types.ts` — JournalRecord 손익 4필드 + JSDoc(인박스 「추가」 4번 정본)
- `relay/src/dma/envelope.ts` — parseJournalBatch 4필드 toNum
- `relay/src/journal/writer.ts` — JournalApplyEvent 4키 · toApplyEvent 매핑
- `relay/tests/helpers/frames.ts` — fakeJournalRecord 기본 0 · buildJournalBatchFrame 4값 BigInt
- `relay/tests/journal-codec.test.ts` — 27키 · E 4값 왕복(음수 · 평단 모르는 매도) · 접수 레코드 0
- `relay/tests/journal-writer.test.ts` — toApplyEvent 키 27종 · 4값 일치 · JSON 직렬화
- `relay/tests/journal-observer.test.ts` · `relay/tests/journal-push.test.ts` — 손수 만든 JournalRecord 픽스처 4필드, push 의 APPLY_KEYS 27종
- `supabase/tests/dma_journal_apply.test.sql` — 25절 7단언(plan 89 → 96)
- `supabase/tests/dma_journal_schema.test.sql` — 4열 × 4단언 + 인덱스 2단언(plan 96 → 114)

## Verification

| 명령 | 결과 |
|------|------|
| `pnpm --filter @gh-radar/shared build && … relay typecheck && typecheck:tests && vitest run tests/journal-codec.test.ts tests/journal-writer.test.ts --maxWorkers=2` | exit 0 · 2 files · 35 tests passed |
| 추가: journal-push · journal-observer · journal-gateway 포함 5파일 vitest | 98 passed |
| `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_journal_apply.test.sql` | exit 0 · 1..96 · not ok 0 · RESULT: PASS |
| `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_journal_schema.test.sql` | exit 0 · 1..114 · not ok 0 · RESULT: PASS |
| RED 대조: `--until 20261027200100 --test …apply.test.sql` | ok 90 통과(옛 apply 가 새 키 무시) → ok 91 에서 `column "avg_price" does not exist` 로 FAIL — 새 단언이 마이그레이션에 실제로 의존함을 확인 |

pgTAP 은 일회용 로컬 컨테이너(postgres 17.6.1.104 · 원격 접촉 0)로 실행했다. 원격 적용(`supabase db push`)은 하지 않았다. 36-09 메인 세션 몫이다.

Acceptance criteria grep 6건 전부 PASS(ADD COLUMN realized_pnl_krw · ev->>'realized_pnl_krw' · REVOKE … FROM anon, authenticated · realized_pnl_krw: r.realizedPnlKrw · toHaveLength(27) · journal_record.realized_pnl_krw).

## Decisions Made

- 키 · 열 이름과 타입은 Task 1 승인대로 정했다(위 원문).
- 평단 모르는 매도의 정본은 인박스 「추가」 4번이다. fbs 주석 「평단 모름 0」 은 낡았으므로 JSDoc · 열 COMMENT 에 −(수수료+세금)을 적었다.
- apply 복사 원본은 `20261004090100_dma_journal_apply_skipped_rows.sql` 이고 바뀌지 않았다. 마이그레이션 파일명 `20261027210000` 도 바꾸지 않았다(충돌 없음).
- pgTAP 25절은 게이트웨이 `KB3` · epoch `ep-pnl` 로 분리했다. 이렇게 하면 기존 절의 커서 · 투영 단언 번호(1~89)가 그대로 유지된다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 계획 files 목록 밖 relay 테스트 2파일 픽스처 갱신**
- **Found during:** Task 2(typecheck:tests)
- **Issue:** `journal-observer.test.ts` · `journal-push.test.ts` 가 `JournalRecord` 를 손수 만들어 4필드 누락으로 TS2739 가 났다. push 의 `APPLY_KEYS`(23종 정렬 비교)도 새 키 때문에 실패할 상태였다.
- **Fix:** 두 파일 `record()` 에 4필드 0을 넣었고, `APPLY_KEYS` 에 4키를 넣었다(주석 27종).
- **Files modified:** relay/tests/journal-observer.test.ts, relay/tests/journal-push.test.ts
- **Verification:** typecheck:tests exit 0 · 저널 5파일 98 passed
- **Commit:** d90f7929

**2. [Rule 2 - 정확성] 4열에 COMMENT ON COLUMN 추가 · pgTAP 에 int4 범위 밖 값 단언 추가**
- **Issue:** 계획에 없던 항목이다. 열 의미(음수 · 평단 모르는 매도)가 DB 에 없으면 36-07/08 집계 작성자가 fbs 의 낡은 주석을 따라갈 수 있다. 또 bigint 선택의 근거(int4 를 넘는 금액)를 증명하는 단언도 없었다.
- **Fix:** 열 COMMENT 4줄과 seq 903 realized_pnl_krw −3,000,000,000 단언을 넣었다.
- **Commit:** d90f7929

**Total deviations:** 2 auto-fixed (Rule 3 1 · Rule 2 1). **Impact:** 계약 · 시그니처 무변경. 테스트와 문서만 더 엄격해졌다.

## Issues Encountered

None.

## Next Phase Readiness

- 36-07 · 36-08 「일자별 매매손익」 이 `dma_journal_events` 의 `notice_type = 'E'` 행에서 (trade_date, account_no) 로 4열을 집계할 수 있다(부분 인덱스 준비됨).
- 36-09: 원격 적용 순서는 DB(20261027210000, 08:00~20:00 KST 밖) → relay → webapp 이다. 원격 마이그레이션 목록에서 35-10 예정 `20261028200000` 과의 순서를 점검해야 한다(Pitfall 10).
- 인박스 261027-account-pnl 의 status 는 이 플랜에서 바꾸지 않았다. 웹 페이지(4번)까지 끝난 뒤 처리할 세션이 done 으로 바꾼다.

## Self-Check: PASSED

- FOUND: supabase/migrations/20261027210000_dma_journal_pnl.sql
- FOUND: d90f7929 (git merge-base --is-ancestor)
- 수정 파일 10개 모두 커밋 d90f7929 에 포함됨
