---
phase: 43-tender-offer-telegram-alert
fixed_at: 2026-11-16T02:20:00Z
review_path: .planning/phases/43-tender-offer-telegram-alert/43-REVIEW-R2.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 43: 코드 리뷰 수정 보고서 (2회차 · 단계 마감 재리뷰)

**수정 시각:** 2026-11-16T02:20:00Z
**원본 리뷰:** .planning/phases/43-tender-offer-telegram-alert/43-REVIEW-R2.md
**회차:** 1

**요약:**
- 범위 안 항목: 6 (치명 1 · 경고 1 · 참고 4 — 사용자 결정 2026-11-16 「전부 고치고 닫기」, fix_scope `all`)
- 수정: 6
- 건너뜀: 0

**검증 위치:** 모든 시험 · 타입 검사는 **메인 체크아웃**(`/Users/alex/repos/gh-radar`, master)에서 돌렸다 — 지금 트리에서 그대로 다시 돌릴 수 있다. 실행자 지시(「master 에 커밋 · 경로를 지정해 add」 · dart-alert 패키지에서 시험)를 따라 임시 worktree 를 만들지 않았다(worktree 에는 `node_modules` 가 없어 시험을 못 돌린다).

**최종 검증:**
- `workers/dart-alert` — `pnpm exec vitest run --maxWorkers=2` → 18 파일 · **471 통과**(수정 전 463 + 새 시험 8) · `pnpm exec tsc --noEmit` 통과
- `bash -n scripts/deploy-dart-alert.sh` 통과 · `bash scripts/deploy-dart-alert.sh --self-test` → `SELF-TEST OK`
- 코드 수정(CR-01 · WR-01 · IN-01 · IN-02 · IN-03)은 먼저 시험을 더해 **수정 전 코드에서 실패하는 것을 확인한 뒤** 고쳤다.
- 배포 · push · gcloud · supabase 명령은 하지 않았다.

**운영 동작 영향:** OpenDART 호출 수 · 바퀴 · 조회 칸 · 예산 · 알림 종류는 바뀌지 않는다. WR-01 의 넣기 직전 연장은 기존 30초 시간 문을 지나므로 임대 RPC 수도 늘지 않는다(seed 바퀴만 넣기 전 연장 RPC 1건이 더해진다 — DB RPC 이고 OpenDART 호출이 아님). IN-01 은 예산에 닿은 키의 탐침 1건과 그 뒤 한 바퀴 호출을 **줄인다**.

## Fixed Issues

### CR-01: 넣기 연속 실패 판정이 띄엄 조회 감시 대상에서 동작하지 않는다 — 넣기를 시도하지 않은 바퀴가 실패 기록을 지워 5분에 닿지 못하고, 그 건들은 warn 만 남기고 사라진다

**Status:** fixed: requires human verification (판정 로직 변경)
**Files modified:** `workers/dart-alert/src/lap.ts`, `workers/dart-alert/src/collector.ts`, `workers/dart-alert/tests/collector.test.ts`
**Commit:** e7cc1445
**Applied fix:** `CollectResult` 에 `insertAttempted`(넣을 건이 있었나)를 더하고, `lap()` 은 넣기를 실제로 시도해 성공한 바퀴에서만 `insertFail` 을 지운다. `judgeOutage` 는 `insertFail !== null` 이면 장애를 닫지 않는다. 시험 2개 — ① 거래소 수시공시(I001 10초 칸) 건 넣기가 `PGRST202` 로 계속 실패 → 5분 넘긴 시도(10:05:20 ~ 10:05:31)에 error `dart alert insert failing` 1번 · 「멈췄습니다(공시 저장 실패 PGRST202)」 1건 · close 0 · 「다시 동작」 0, ② 열린 장애 + I001 넣기 실패 중 → 넣기를 시도하지 않은 바퀴가 닫지 않고, 넣기가 된 10:03:00 칸 뒤에만 「다시 동작」 1건. 둘 다 수정 전 코드에서 실패(① error 0, ② 10:00:05 에 닫힘)를 확인했다.

### WR-01: 임대 TTL 계산이 조회 시간을 빼고 세었다 — rn7 뒤 한 바퀴 호출이 늘어 OpenDART 가 느린 날 넣기가 55000 으로 거절되고, 실행은 「남이 넘겨받았다」 warn · 종료 0 으로 조용히 끝나며 다음 실행이 같은 바퀴를 되풀이한다

**Status:** fixed: requires human verification (임대 · 종료 경로 변경)
**Files modified:** `workers/dart-alert/src/lap.ts`, `workers/dart-alert/src/collector.ts`, `workers/dart-alert/tests/collector.test.ts`, `workers/dart-alert/tests/modes.test.ts`
**Commit:** 09e6e422 (본 수정) · 3a745e43 (머리 주석 ⑥ 연장 시점 한 줄)
**Applied fix:** 리뷰 제안(`db.insert` 감싸기) 대신 `collectOnce` 에 `beforeInsert` 훅을 두어 넣을 건이 있을 때 넣기 RPC 직전에 `maintain(now, false)`(30초 시간 문)로 연장한다 — 감싸기로 하면 연장 거절(`StopRun`)이 `insertItems` 의 catch 를 지나며 거짓 warn `dart alert insert failed` 를 남기기 때문이다. `lap()` 의 catch 는 `LeaseLostError` 와 함께 `StopRun` 도 다시 던진다. `seedLap` 은 넣기 전에 `renewLease` 를 부르고, 연장 거절 · 확인 못 함(`StopRun` 0) · 넣기 55000 을 error `seed failed — lease lost before insert, nothing inserted (run seed again)` + 종료 1 `seed_failed` 로 바꾼다. 머리 주석 SC-2 의 TTL 산수에 조회 시간(호출 수 × 요청 상한 10초)을 넣어 다시 적었다. 시험 4개 — 자동: 첫 바퀴 12회 × 8초(96초) 뒤 10:01:36 넣기와 같은 시각에 연장 · 55000 0 · 알림 1, 넣기 직전 연장 거절 → 그 바퀴에서 곧바로 `lease_lost` · 조회 12회뿐 · 넣기 0 · 거짓 넣기 실패 warn 0 / seed: 96초 조회 뒤 연장해 seeded 1건, 넣기 직전 연장 거절 → 종료 1 `seed_failed` · 넣기 0. 넷 다 수정 전 코드에서 실패를 확인했다.

### IN-01: 멈춘 키 재탐침이 예산을 보지 않고 재개한다 — 예산을 넘긴 키가 한 바퀴 더 돌고 「다시 동작」 · 「멈췄습니다」 가 몇 초 간격으로 붙을 수 있다

**Status:** fixed: requires human verification (레인 상태 전이 변경)
**Files modified:** `workers/dart-alert/src/collector.ts`, `workers/dart-alert/tests/watchMix.test.ts`
**Commit:** ec258a52
**Applied fix:** `retryPausedLanes` 에서 탐침 전에 `budgetStateOf(usedKnown + sinceFlush, budget) === "exhausted"` 면 탐침을 부르지 않고 `paused` 를 `budget_exhausted`(재탐침 없음 · fresh)로 바꾸고 `lastPaused` 를 그 레인으로 둔다 — 바퀴 끝 `settleHalts` 가 error(예산 소진)를 남기고 열린 장애는 그대로 둔다. 시험: 키 2 used2 14,999 · 10:00:00 I003 020 으로 멈춤(15,000) → 10:05:00 재탐침 시각에 탐침 0 · 키 2 조회 그 뒤 0 · `dart key paused` error 두 번(quota → budget_exhausted) · 단체방 글은 「멈췄습니다(020)」 1건뿐 · 키 1 은 끝까지. 수정 전 코드에서 실패를 확인했다.

### IN-02: 창 안 seed 로 시작한 실행은 하루 종일 auto 로 돌지만 멈출 때 남은 건 송신 · 미송신 error 를 건너뛴다

**Status:** fixed: requires human verification (종료 경로 조건 변경)
**Files modified:** `workers/dart-alert/src/collector.ts`, `workers/dart-alert/tests/modes.test.ts`
**Commit:** 00017b9b
**Applied fix:** 리뷰 제안의 `seedDone`(seed 바퀴 성공) 대신 `autoLapsRan`(auto 바퀴를 실제로 돌았나 — `loop()` 가 `lap()` 직전에 표시)으로 조건을 잡았다: `drainBeforeStop` 은 `mode === "auto" || this.autoLapsRan` 일 때만. `seedDone` 로 하면 **창 밖 seed**(배포 안내가 권하는 20:00 뒤 seed)도 seed 바퀴 뒤 곧바로 `window_end` 로 끝나면서 drain 을 돌아, 그날 남은 pending 건을 20:00 뒤에 보내 「seed 는 송신 0」 약속을 깨기 때문이다. 시험: 19:59 창 안 seed → 19:59:30 새 건 송신 실패 → 20:00 `window_end` 에 countUnsent 1 · error `alerts left unsent at stop`(unsent 1 · window_end). 기존 창 밖 seed 시험에 countUnsent 0 단언을 더했다. 수정 전 코드에서 실패를 확인했다.

### IN-03: 날을 넘긴 장애의 「다시 동작」 문구가 전날 확인 도입 뒤의 실제 동작과 다르다

**Status:** fixed
**Files modified:** `workers/dart-alert/src/message.ts`, `workers/dart-alert/tests/message.test.ts`, `workers/dart-alert/tests/outage.test.ts`
**Commit:** 39d88766
**Applied fix:** 날이 다른 경우 문구를 `✅ 공시 알림 다시 동작 — 멈춘 사이(M/D HH:MM 부터) 접수된 공시는 「(늦은 알림)」 으로 보냅니다.` 로 바꿨다(같은 날 문구는 그대로). message 시험의 기대 문자열을 새 문구로 바꾸고 「오늘 접수된」 이 없음을 단언했다(수정 전 실패 확인). outage 시험의 날 넘김 단언도 `멈춘 사이(11/16 19:50 부터)` 로 맞췄다. 지난 계획 · 요약 문서(43-06 · 43-09 SUMMARY/PLAN)의 옛 문구는 기록이라 고치지 않았다.

### IN-04: 주요사항보고서 종류 · 정정 env 를 바꾸는 안내에 seed 안내가 없다 — 다음 아침 전날 확인이 전날의 새로 맞는 건을 「(늦은 알림)」 으로 보낸다

**Status:** fixed
**Files modified:** `scripts/deploy-dart-alert.sh`
**Commit:** 0de7abb6
**Applied fix:** `DART_ALERT_B001_KINDS` · `DART_ALERT_B001_CORRECTIONS` 바꾸기 안내 끝에 「허용 목록을 넓히거나 정정을 include 로 바꾼 뒤엔 그날 평일 20:00 뒤 seed 실행 한 번 · 로그 「seed done」 확인(위 종류 · 감시 대상을 넓힌 배포와 같은 명령) — 빼먹으면 다음 아침 전날 확인이 전날 건을 「(늦은 알림)」 으로 한꺼번에 보낸다」 세 줄을 더했다. 주석만 바뀌어 코드 시험은 없고, `bash -n` 과 `--self-test`(SELF-TEST OK)로 확인했다.

---

_Fixed: 2026-11-16T02:20:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
