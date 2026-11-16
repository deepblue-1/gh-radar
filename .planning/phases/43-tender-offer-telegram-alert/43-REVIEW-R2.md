---
phase: 43-tender-offer-telegram-alert
reviewed: 2026-11-16T01:41:20Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - workers/dart-alert/src/collector.ts
  - workers/dart-alert/src/cadence.ts
  - workers/dart-alert/src/watches.ts
  - workers/dart-alert/src/lap.ts
  - workers/dart-alert/src/config.ts
  - workers/dart-alert/src/index.ts
  - workers/dart-alert/src/apiUsage.ts
  - workers/dart-alert/src/db.ts
  - workers/dart-alert/src/message.ts
  - workers/dart-alert/src/logger.ts
  - workers/dart-alert/src/safeError.ts
  - workers/dart-alert/src/dart/client.ts
  - workers/dart-alert/src/services/supabase.ts
  - workers/dart-alert/src/telegram/client.ts
  - supabase/migrations/20261113400000_dart_alert_fix.sql
  - scripts/deploy-dart-alert.sh
  - scripts/smoke-dart-alert.sh
  - scripts/dart-alert-report.sh
  - scripts/setup-dart-alert-iam.sh
  - scripts/setup-dart-alert-secrets.sh
  - ops/alert-dart-alert-error-log.yaml
  - ops/alert-dart-alert-failure.yaml
  - ops/alert-dart-alert-scheduler-error.yaml
findings:
  critical: 1
  warning: 1
  info: 4
  total: 6
  necessity: 0
status: issues_found
---

# Phase 43: 코드 리뷰 보고서 (2회차 · 단계 마감 재리뷰)

**리뷰 시각:** 2026-11-16T01:41:20Z
**깊이:** standard (호출 사슬은 `supabase/migrations/20261113200000_dart_alert.sql` 의 임대 · 넣기 · 차례 RPC 본문과 `tests/collector.test.ts` 의 넣기 실패 시험까지 따라 읽음)
**파일 수:** 23
**상태:** issues_found

## 요약

diff_base `f253c647` 이후의 통합 최종 상태(phase 43 리뷰 수정 · quick 261113-iez · quick 261113-rn7 + 그 리뷰 수정)를 읽었다. 시험은 돌리지 않았다 — 판단은 모두 코드 · 마이그레이션 원문 대조다. `261113-rn7-REVIEW.md` 에서 고쳤거나 보류한 항목(WR-01 ~ 04 · IN-01 ~ 08)과 1회차 `43-REVIEW.md` 항목은 다시 올리지 않았다.

이번 회차의 초점은 **iez/rn7 이 들인 섞인 조회 간격(10초 · 30초 칸)과 바퀴당 호출 수 증가가, 단계 43 원래 장치(넣기 연속 실패 판정 · 임대 TTL 계산)의 전제를 깨는가** 였다. 둘 다 깨졌다.

- **CR-01** — 1회차 WR-01 에서 넣은 「넣기가 5분 넘게 계속 실패하면 error + 장애 글」 이, 바퀴마다 부르는 공개매수(D004) · 09:00 전 주요사항보고서 말고는 **동작하지 않는다**. 띄엄 조회 감시 대상(I001 · I003 · I004 · D005 · 09:00 뒤 B001)의 건은 넣기를 시도하지 않는 사이 바퀴가 실패 기록을 지워 5분에 닿지 못한다. DB 넣기만 깨진 상태(함수 서명 바뀜 · 권한 등)라면 6종 중 5종 알림이 warn 로그만 남기고 소리 없이 사라진다.
- **WR-01** — 임대 TTL 90초 계산(머리 주석 SC-2)은 조회(`collectOnce`) 시간을 빼고 세었다. rn7 뒤 한 바퀴의 OpenDART 호출은 `:00` · `:30` 칸 6 ~ 9회, 그날 첫 바퀴는 전날 확인까지 약 14회(요청마다 상한 10초)인데 그 사이 임대 연장이 없다. OpenDART 가 느린 날엔 넣기 RPC 가 55000 으로 거절돼 실행이 「lease lost — another run took over」 warn · 종료 0 으로 조용히 끝나고, 다음 실행이 같은 무거운 첫 바퀴를 되풀이한다(seed 도 종료 0).

확인한 것(문제 아님):
- **중복 송신**: 찾지 못함 — 전날 확인 · seed · 임대 교대 모두 `rcept_no` PK + `ON CONFLICT DO NOTHING` 이 막는다.
- **키 레인 · 장애 짝**: 한 키 멈춤 → 그 키 이름으로 1쌍 · 두 키 모두 멈춤 → 종료 1 · 열린 장애가 있을 때 다른 키 실패 → error 1번(`noteOutageWidened`)은 코드대로 동작한다. `failing` 집합이 띄엄 조회 대상의 「안 불린 바퀴」 가 장애를 닫지 못하게 막는 것도 맞다(DART 실패 쪽 — 넣기 실패 쪽은 CR-01).
- **늦은 알림 판정**: 감시 대상별 `lateGapMs(everyMsAt(…))` · 조회 전 판정 · 전날 확인 늘 late · `queuedOnlyHere` 예외는 서로 어긋나지 않는다.
- **조회 칸**: 멈춘 키가 칸을 소비하지 않음 · B001 09:00 경계 · seed 바퀴 뒤 첫 auto 바퀴 칸 처리 모두 맞다.
- **비밀**: 키 · 토큰 · 방 id 가 로그 · 명령줄 · 오류 문구로 나가는 길은 찾지 못했다.
- **셸 스크립트 다섯 개 · 알림 정책 셋**: 결함을 찾지 못했다(IN-04 의 안내 빠짐만).

## Critical Issues

### CR-01: 넣기 연속 실패 판정이 띄엄 조회 감시 대상에서 동작하지 않는다 — 넣기를 시도하지 않은 바퀴가 실패 기록을 지워 5분에 닿지 못하고, 그 건들은 warn 만 남기고 사라진다

**File:** `workers/dart-alert/src/collector.ts:702-705` · `collector.ts:782-794` · `collector.ts:950-954` · `workers/dart-alert/src/lap.ts:267-269` · `lap.ts:308`
**Issue:**
1회차 WR-01 수정(`cc135812`)은 「넣기가 5분 넘게 계속 실패하면 error `dart alert insert failing` + 「멈췄습니다(공시 저장 실패)」」 를 넣었다. 판정 상태 `insertFail` 은 `collectOnce` 가 던지면(넣기 실패) 시작 시각을 잡고, **`collectOnce` 가 결과를 돌려주면 무조건 null 로 지운다**(`collector.ts:702-705`). 그런데 `collectOnce` 는 넣을 건이 없으면 넣기를 아예 부르지 않고 결과를 돌려준다(`lap.ts:308` — `items.length > 0 ? … : []`). 넣기가 실패한 건은 `seen` 에 들지 않아 다음에 **그 감시 대상을 부를 때** 다시 넣는데(`lap.ts:309` 앞에서 던짐), iez/rn7 뒤로 그 감시 대상을 부르는 바퀴는 띄엄띄엄이다(`lap.ts:269` `isDue`):

- 거래소 수시공시(I001) · 09:00 뒤 주요사항보고서(B001) = 10초 칸 → 5초 바퀴 2번에 1번 넣기 시도
- 거래소 시장조치(I003) · 최대주주(I004) · 거래계획(D005) = 30초 칸 → 6번에 1번

그 사이 바퀴(넣을 건 없음 → `r` 있음)가 매번 `insertFail = null` 로 지우므로 `now - f.since` 는 많아야 25초라 `OUTAGE_AFTER_MS`(300초)에 영원히 닿지 않는다(`collector.ts:785`).

시나리오: 11:00 마이그레이션 실수로 `dart_alert_insert` 의 인자 이름이 바뀌어 PostgREST 가 `PGRST202`(함수 못 찾음 — SQLSTATE 22 · 23 이 아니라 행 거절이 아님)를 준다. 임대 · 차례 · 기록 RPC 는 멀쩡하다. 11:00:10 I001 「최대주주변경」 건 → 넣기 실패 → warn `dart alert insert failed` → 11:00:15 바퀴(I001 칸 아님 · 넣을 건 없음)가 기록을 지움 → 11:00:20 다시 실패 → … 하루 종일 같은 되풀이. 결과:
- error 로그 0(→ 운영자 메일 0) · 장애 글 0 · DB 에 행이 없어 `alert unsent over 120s` · `alerts left unsent at stop` 도 0.
- 6종 중 공개매수 말고 전부 단체방에 가지 않는다. 공개매수 건이 그날 하나라도 뜨면 그때부터(매 바퀴 재시도라) 5분 뒤 드러나지만, 공개매수가 없는 날은 다음 날 아침 전날 확인까지 아무도 모른다.

게다가 다른 길로 장애가 열려 있었다면(예: 공개매수 건으로 판정이 돌아 장애가 열림) 넣기를 시도하지 않은 바퀴의 `judgeOutage` 가 `failed.length === 0` · `failing` 빔 · 멈춘 키 없음으로 **장애를 닫고 「✅ 다시 동작」 을 보낸다**(`collector.ts:950-954`) — 넣기는 여전히 깨져 있는데. 

`tests/collector.test.ts:465-484` 는 공개매수(매 바퀴) 건 하나로만 이 판정을 묶어 이 경로를 잡지 못한다.

**Fix:** 실패 기록은 「넣기를 실제로 시도해 성공한 바퀴」 에서만 지우고, 넣기 실패가 이어지는 동안은 장애를 닫지 않는다.
```ts
// lap.ts — CollectResult 에 넣기 시도 여부를 싣는다
export interface CollectResult { results: WatchResult[]; calls: number; inserted: InsertedRow[]; insertAttempted: boolean }
…
const insertAttempted = items.length > 0;
const inserted = insertAttempted ? (await insertItems(deps, items, opts.seed, calls)).inserted : [];
for (const rceptNo of judged) state.seen.add(rceptNo);
return { results, calls, inserted, insertAttempted };

// collector.ts lap()
if (r) {
  if (r.insertAttempted) this.insertFail = null;   // 넣을 건이 없던 바퀴는 실패 기록을 지우지 않는다
  this.takeResult(r);
}

// collector.ts judgeOutage() — 넣기가 아직 실패 중이면 닫지 않는다
if (this.outage && this.failing.size === 0 && !this.anyPaused() && this.insertFail === null) await this.closeOutage();
```
그리고 「I001(10초 칸) 건 하나 · 넣기 계속 실패 → 5분 뒤 error 1번 · 장애 글 1건 · 그 사이 「다시 동작」 0」 시험을 더한다.

## Warnings

### WR-01: 임대 TTL 계산이 조회 시간을 빼고 세었다 — rn7 뒤 한 바퀴 호출이 늘어 OpenDART 가 느린 날 넣기가 55000 으로 거절되고, 실행은 「남이 넘겨받았다」 warn · 종료 0 으로 조용히 끝나며 다음 실행이 같은 바퀴를 되풀이한다

**File:** `workers/dart-alert/src/collector.ts:79-84` · `collector.ts:685-707` · `collector.ts:553-600`(특히 594) · `collector.ts:424-427` · `workers/dart-alert/src/lap.ts:267-308` · `workers/dart-alert/src/dart/client.ts:112`
**Issue:**
머리 주석(SC-2 · 체커 I-2)은 「직전 연장 뒤 최대 경과 ≈ 30초 + 송신 한 번(최악 약 55초) < TTL 90초」 라 적는데, 이 계산에는 **조회(`collectOnce`) 시간이 없다**. 임대 연장은 바퀴 시작(`maintain(now, true)`)과 조회 뒤(`maintain(this.now(), false)` · 707행)에만 있고, `collectOnce` 끝의 넣기 RPC(`lap.ts:308`)는 그 사이에서 불린다. 넣기 RPC 는 `lease_until > now()` 가 아니면 55000(마이그레이션 `20261113200000` 넣기 함수)이다. 그러므로 바퀴 시작 때 직전 연장에서 최대 30초 + 재탐침(`retryPausedLanes` · 키마다 최대 10초) + **조회 시간 X** 가 90초를 넘으면 넣기가 거절된다 — X 가 약 40 ~ 60초를 넘으면.

단계 43 원래 구조에서는 바퀴당 호출이 2회(D004 · B001) 안팎이라 문제가 없었지만, iez/rn7 뒤에는:
- `:00` · `:30` 칸 바퀴 = 감시 대상 6개 + I001 추가 쪽(4쪽 날 최대 3) = 6 ~ 9회
- 그날 첫 바퀴(실행이 바뀔 때마다) = 오늘 6 + 전날 확인 6(전 쪽 · I001 2쪽 이상) ≈ 14회

이고 요청마다 상한이 10초(`DART_REQUEST_TIMEOUT_MS`)다. 호출 평균이 3 ~ 4초만 넘어도(서울 엣지 간헐 손실 시간대 · OpenDART 아침 지연) 넘친다. 첫 바퀴는 전날 확인 건 때문에 `items` 가 거의 늘 비어 있지 않아 넣기를 반드시 부른다.

그러면:
1. 넣기 55000 → `LeaseLostError` → `run()` 이 warn `lease lost — another run took over; stopping quietly` · **종료 0** `lease_lost`(`collector.ts:424-427`). 실제로는 아무도 넘겨받지 않았다 — 잘못된 문구이고 error 가 아니라 메일도 없다.
2. `takeResult` 를 못 불러 `lastOk` · 전날 확인 표시가 DB 에 안 올라간다 → 다음 깨움(≤ 5분)의 새 실행이 **같은 무거운 첫 바퀴**(전날 확인 포함)를 다시 돌고, 느림이 이어지면 또 같은 자리에서 끝난다. 그 사이 알림 0 이고, 드러나는 길은 다음 실행들의 시작 점검이 「수집기 중단」 장애를 여는 것뿐이다.
3. seed 도 같다 — `seedLap` 은 임대를 잡은 뒤 연장 없이 오늘 + 전날 전 쪽을 읽고 594행에서 넣는다. 넘치면 `LeaseLostError` 가 그대로 위로 가 **종료 0** 이라(WR-04 수정의 「seed 실패는 종료 1」 과 어긋남) 아무것도 채우지 못한 seed 가 성공처럼 보인다(배포 안내는 `seed done` 로그 확인에 기댄다).

**Fix:**
- 넣기 직전에 임대를 연장한다(30초 시간 문이라 RPC 수는 늘지 않는다). 연장 거절 · 확인 못 함(`StopRun` 0)이 조회 쪽 catch 에 삼켜지지 않게 `lap()` 의 catch 가 `StopRun` 도 다시 던지게 한다:
```ts
// collector.ts — lapDeps.db.insert 를 감싼다
db: { ...d.db, insert: async (items, seed) => { await this.maintain(this.now(), false); return d.db.insert(items, seed); } },

// collector.ts lap()
} catch (err) {
  if (err instanceof LeaseLostError || err instanceof StopRun) throw err;
  insertErr = err;
}
```
- `seedLap` 은 `db.insert(matched, true)` 앞에 `await this.renewLease(this.now())` 를 두고(같은 보유자면 만료 뒤에도 다시 잡힌다 — 임대 함수 UPDATE 조건), 거기서 `LeaseLostError` 가 나면 `StopRun(1, "seed_failed")` 로 바꾼다.
- 머리 주석 SC-2 의 TTL 산수에 조회 시간(호출 수 × 10초 상한)을 넣어 다시 적는다.

## Info

### IN-01: 멈춘 키 재탐침이 예산을 보지 않고 재개한다 — 예산을 넘긴 키가 한 바퀴 더 돌고 「다시 동작」 · 「멈췄습니다」 가 몇 초 간격으로 붙을 수 있다

**File:** `workers/dart-alert/src/collector.ts:720-736` · `collector.ts:1230-1241` · `collector.ts:391-392`
**Issue:** `pauseLane` 은 이미 멈춘 레인을 다시 멈추지 않으므로(392행) 한도(`quota`) · 탐침 실패로 멈춘 키는 그 뒤 사용량이 예산에 닿아도 `budget_exhausted` 로 바뀌지 않는다(`budgetGate` 는 멈춘 레인을 건너뜀). 5분 재탐침(`retryPausedLanes`)이 통과하면 예산을 보지 않고 `paused = null` 로 풀어 그 바퀴에 그 키 감시 대상을 모두 부르고, 바퀴 끝 `judgeOutage` 가 장애를 닫아 「✅ 다시 동작」 → 다음 바퀴 시작 `budgetGate` 가 예산 소진으로 다시 멈춰 「⚠ 멈췄습니다(… 자체 하루 예산 소진)」 이 곧바로 이어진다. 한도로 멈춘 동안 사용량은 탐침(5분 1건)으로만 늘어 예산 바로 아래에서 020 을 받은 날에만 생긴다(키 2 가 팀원 개인 키라 OpenDART 쪽 한도가 우리 카운터보다 먼저 찰 수 있다).
**Fix:** `retryPausedLanes` 에서 탐침 전에 `budgetStateOf(l.usedKnown + l.sinceFlush, budget) === "exhausted"` 면 `l.paused = { reason: "budget_exhausted", …, retryAt: Infinity, fresh: true }` 로 바꾸고 탐침을 부르지 않는다.

### IN-02: 창 안 seed 로 시작한 실행은 하루 종일 auto 로 돌지만 멈출 때 남은 건 송신 · 미송신 error 를 건너뛴다

**File:** `workers/dart-alert/src/collector.ts:880-883` · `collector.ts:517-523`
**Issue:** 첫 배포 날 절차(창 안 seed)는 seed 바퀴 뒤 같은 실행이 20:00 까지 평소처럼 송신한다. 그런데 `drainBeforeStop` 은 `cfg.mode !== "auto"` 면 바로 돌아가므로(882행) 그 실행이 창 끝 · 예산 · 치명 신호로 멈출 때 이미 넣은 건을 한 번 더 보내지 않고 `alerts left unsent at stop` error 도 남기지 않는다(1회차 WR-05 의 보장이 이 실행에만 빠짐). 다음 날 인계의 `unsent alerts expired on takeover` error 가 뒤늦게 덮는다.
**Fix:** seed 바퀴가 끝나 auto 루프로 넘어갈 때 표시를 두고(`this.seedDone = true`) `drainBeforeStop` 조건을 `mode === "auto" || (mode === "seed" && this.seedDone)` 로 바꾼다.

### IN-03: 날을 넘긴 장애의 「다시 동작」 문구가 전날 확인 도입 뒤의 실제 동작과 다르다

**File:** `workers/dart-alert/src/message.ts:99-104` · `workers/dart-alert/src/collector.ts:914-923` · `collector.ts:950-954`
**Issue:** 전날 창 끝까지 열린 장애(예: 저녁에 키 2 예산 소진)는 다음 날 07:00 실행이 이어받아 첫 성공 바퀴에 닫으며 「✅ 공시 알림 다시 동작(M/D HH:MM 부터 멈춤) — 오늘 접수된 공시는 「(늦은 알림)」 으로 보냅니다」 를 보낸다. 그러나 07:00 첫 바퀴의 오늘 건은 기준점 07:02 안이라 늦은 알림이 아니고, 실제로 「(늦은 알림)」 으로 나가는 것은 rn7 전날 확인이 줍는 **전날** 멈춘 뒤 건이다. 키 하나 예산 소진처럼 장애가 밤을 넘기는 일이 rn7 뒤로 흔해져 문구가 자주 틀린다.
**Fix:** 날이 다른 경우 문구를 「— 멈춘 사이(M/D HH:MM 부터) 접수된 공시는 「(늦은 알림)」 으로 보냅니다」 처럼 바꾼다.

### IN-04: 주요사항보고서 종류 · 정정 env 를 바꾸는 안내에 seed 안내가 없다 — 다음 아침 전날 확인이 전날의 새로 맞는 건을 「(늦은 알림)」 으로 보낸다

**File:** `scripts/deploy-dart-alert.sh:93-99` · `workers/dart-alert/src/lap.ts:288-302`
**Issue:** 머리 주석은 rn7 의 종류 넓히기 배포에만 「배포 직후 seed」 를 요구한다(67-71행). 같은 파일 93-99행의 `DART_ALERT_B001_KINDS` · `DART_ALERT_B001_CORRECTIONS` 바꾸기 안내(`gcloud run jobs update --update-env-vars=…` · 재배포)에는 그 말이 없다. 종류를 더하거나 정정을 `include` 로 바꾸면 다음 평일 07:00 전날 확인이 전날의 새로 맞는 B001 건 전부를 「(늦은 알림)」 으로 보낸다(DB 에 없으므로 넣기가 받는다).
**Fix:** 93-99행 안내에 「허용 목록을 넓히거나 정정을 include 로 바꾼 뒤엔 그날 20:00 뒤 seed 실행을 한 번(seed done 확인)」 한 줄을 더한다.

---

_Reviewed: 2026-11-16T01:41:20Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
