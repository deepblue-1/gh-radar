---
phase: quick-261113-rn7
fixed_at: 2026-11-13T12:14:42Z
review_path: .planning/quick/261113-rn7-dart-alert-two-keys-cadence-and-new-kind/261113-rn7-REVIEW.md
iteration: 1
findings_in_scope: 12
fixed: 7
skipped: 5
status: partial
---

# Quick 261113-rn7: 코드 리뷰 수정 보고서

**수정 시각:** 2026-11-13T12:14:42Z
**원본 리뷰:** .planning/quick/261113-rn7-dart-alert-two-keys-cadence-and-new-kind/261113-rn7-REVIEW.md
**회차:** 1
**처분 기준:** 메인 세션 결정(리뷰의 Fix 제안과 다르면 결정 쪽을 따름)

**요약:**
- 리뷰 항목: 12(경고 4 · 참고 8)
- 고침: 7(WR-01 · WR-02 · WR-03 · WR-04 · IN-04 · IN-05 · IN-06)
- 보류: 5(IN-01 · IN-02 · IN-03 · IN-07 · IN-08 — 메인 세션 결정)

## 검증(실제 출력 · 메인 체크아웃에서 실행 — worktree 아님)

- `pnpm --filter @gh-radar/dart-alert exec vitest run --maxWorkers=2` → **Test Files 18 passed · Tests 463 passed**(수정 전 456 → +7)
- `pnpm --filter @gh-radar/dart-alert typecheck` → `tsc --noEmit` 통과(출력 없음)
- `bash -n scripts/setup-dart-alert-secrets.sh` · `bash -n scripts/deploy-dart-alert.sh` → 둘 다 OK
- `GCP_PROJECT_ID=gh-radar SUPABASE_URL=https://x.supabase.co bash scripts/deploy-dart-alert.sh --self-test` → `SELF-TEST OK — scheduler=gh-radar-dart-alert-wake (*/5 7-19 * * 1-5) · task-timeout=14h · max-retries=0 · parallelism=1 · DART_ALERT_DAILY_BUDGET=15000 (15001 거부) · OpenDART 키 2개 · 키마다 예산 15000 · alert policies=3`
- IN-05 는 저장소 밖 가짜 `gcloud`(스크래치 패드 · 가짜 40자 값)로 7가지 경우를 돌려 확인 — 실제 Secret 접근 없음 · 값 출력 없음.
- 배포 · push · Secret 접근 · 텔레그램 송신은 하지 않았다.

## 고친 항목

### WR-01: 전날 확인이 「넣기 실패」 · 「전날 조회 실패」 때 상한 없이 매 조회 다시 돈다 — 키 1 여유 238 을 태우고, 전날 조회의 치명 분류는 키 레인 전체를 멈춘다

**처분:** 고침
**고친 파일:** `workers/dart-alert/src/collector.ts`, `workers/dart-alert/src/lap.ts`, `workers/dart-alert/tests/watchMix.test.ts`
**커밋:** fd82bdff
**달라진 점:**
- 전날 조회는 `{ fullRead: true, prevDay: true }` 로 부른다. `countedList` 는 `prevDay` 호출의 오류 중 **quota(020 · HTTP 429)만** `noteListError`(키 멈춤)로 올리고, 그 밖(100 · 101 · 키 · 모르는 코드 · 일시)은 기존대로 warn `dart prev-day list failed` + `prevOk: false` 로 끝낸다. 오늘 조회 결과는 성공 그대로.
- 감시 대상별 시도 상한 `PREV_DAY_MAX_TRIES = 3`(KST 하루) · 시도 사이 `PREV_DAY_RETRY_MS = 300_000`. 시도는 `prevDayDue` 가 날짜를 돌려줄 때(= collectOnce 가 곧바로 전날 조회를 시작할 때) 센다 → 넣기 실패로 표시를 못 남긴 바퀴도 1번. 메모리만(재기동이면 다시 3번).
- 3번 다 표시를 못 남기면 그 감시 대상의 다음 조회 때 warn `prevday sweep gave up`(`watch` · `day` · `tries`) 1번 뒤 그날은 메모리 표시로 건너뛴다. **DB 완료 표시는 남기지 않았다** — 남기면 `dart-alert-report.sh stats` 의 「전날 확인(오늘)」 이 실패를 완료로 센다. 대신 재기동하면 다시 최대 3번(유한).
- 시험: 넣기가 계속 실패하는 동안 D004 · B001 전날 조회가 07:00:00 · 07:05:00 · 07:10:00 세 번뿐 · gave up 감시 대상마다 1번 · DB 표시 없음 / 전날만 `100` 이면 종료 0 · 오늘 D004 132번 그대로 · error 0 · 한도 의심 표시 0 · 장애 글 0 / 전날 `020` 은 종료 1 `quota` · 한도 의심 1(지금처럼).
- 기존 시험 「I001 금요일 800 → 07:00:10 재시도」 는 5분 규칙에 맞춰 07:05:00 재시도 · 07:05:30 연장이 표시를 싣는 것으로 바꿨다(산수 주석 포함).
- 논리 변경이라 사람 확인 권장: 「시도 = 전날 조회 시작」 · 「포기 시 DB 표시 없음」 두 선택.

### WR-02: 한 키 멈춤으로 열린 장애가 다른 키의 일시 장애를 가린다 — 단체방 글 0 · 메일 0

**처분:** 고침(최소 수정 — error 로그만 · 단체방 보충 글 없음)
**고친 파일:** `workers/dart-alert/src/collector.ts`, `workers/dart-alert/tests/watchMix.test.ts`
**커밋:** be313f4f
**달라진 점:**
- 열린 장애(`OpenOutage`)에 `keys`(연 키) · `widenedLogged` 를 둔다. 연 키: `settleHalts` 키 멈춤 = 그 키 · `judgeOutage` 실패 = 실패한 감시 대상들의 키 · 시작 점검 「수집기 중단」 = 멈춘 감시 대상들의 키 · 넣기 실패 = 쓰는 키 전부 · DB 에서 이어받음 / 남의 열린 장애(opened false) = null(모름).
- `judgeOutage` 에서 장애가 열려 있으면 `noteOutageWidened` — 연 키가 아닌 키의 감시 대상이 기준점에서 `OUTAGE_AFTER_MS` 넘게 실패하면 error `dart outage widened — other key failing`(`watches` · `errs` · `outageKeys` · `outageSince`)을 **장애 1건당 1번**. 장애가 닫히면 상태째 사라져 초기화된다.
- 연 키를 모르면 **지금 멈춘 키**를 연 키로 본다(주석에 근거 — 이어받은 장애가 남는 흔한 까닭이 그 키 멈춤이고, 멈춘 키 감시 대상은 부르지 않아 실패가 안 나온다).
- 시험 2: 키 2 예산 소진 장애 중 키 1 이 10:01 부터 800 → 10:06:00 에 error 1번(D004 · B001 · `outageKeys: [2]`) · 장애 글 1건 그대로 / DB 에서 이어받은 장애 + 시작 때 키 2 예산 소진 + 키 1 800 → 10:05:00 에 error 1번 · 새 글 0 · open 0.

### WR-03: 예산 여유가 계산상 상한이 아니다 — 키 1 여유 238 · 키 2 의 I001 추가 쪽은 「최악 2쪽」 이 아니라 쪽 수만큼 늘고, 소진되면 그 키는 그날 끝까지 멈춘다

**처분:** 부분 고침(I001 등 추가 쪽 하한 30초 · 키 1 감속 규칙은 만들지 않음 — 사용자 결정)
**고친 파일:** `workers/dart-alert/src/dart/client.ts`, `workers/dart-alert/src/cadence.ts`, `workers/dart-alert/tests/dartClient.test.ts`, `workers/dart-alert/tests/cadence.test.ts`, `scripts/deploy-dart-alert.sh`, `CLAUDE.md`
**커밋:** a7361dd4
**달라진 점:**
- `fetchWatchRows` 전 쪽 조건 = (total 이 **마지막 전 쪽 읽기 때의 total**(`tracker.lastTotal`)보다 늘었고 그로부터 `GREW_REREAD_MIN_MS = 30_000` 이상) 또는 `FULL_REREAD_MS = 60_000` 경과. `lastTotal` 은 원래 전 쪽 읽기 때만 갱신되므로, 하한 때문에 건너뛴 증가는 다음 기회(30초)에 반드시 읽힌다. 1쪽은 매 조회 · 전날 확인(`fullRead` = 새 tracker)은 늘 전 쪽(영향 없음).
- 산수(주석 · 시험): 추가 쪽 상한 = 46,800 ÷ 30 × (쪽 수 − 1) = 1,560 × (쪽 수 − 1). 키 2: 2쪽 10,920 · 3쪽 12,480 · 4쪽 14,040 ≤ 15,000 · **5쪽 15,600 > 15,000**(시험이 넘는 것을 단언). 전날 확인까지 더한 4쪽 날 14,047. 키 1 의 B001 이 100건을 넘는 날은 14,760 + 1,560 = 16,320 > 15,000 — 감속 규칙 없음을 주석 · 시험에 드러냈다.
- 기존 시험 「150 → 151 이면 바로 전 쪽(+5초)」 은 「+5초 1쪽만 · +30초 전 쪽」 으로 바꿨다(옛 규칙이 상한이 없던 근거 주석). 새 시험: 건너뛴 증가가 직전 조회 대비가 아니라 전 쪽 읽기 때 대비로 30초에 읽힘 · 10초 칸 1시간 매번 늘어도 전 쪽 120번(= 3,600 ÷ 30).
- `cadence.ts` 머리 주석 · `CLAUDE.md` OpenDART 예산 줄 · `scripts/deploy-dart-alert.sh` 머리 주석의 「최악 매 조회 2쪽 14,040 / 14,045」 를 같은 산수로 바꿨다. `docs/stack.md` 에는 해당 수치가 없어 손대지 않았다.

### WR-04: seed 를 빼먹으면 다음 아침 쏟아지는 것을 막는 장치가 수동 절차뿐이다 — seed 는 임대가 남에게 있으면 조용히 종료 0

**처분:** 부분 고침(seed 임대 실패를 실패로 드러냄 · 새 감시 대상 자동 seed · 1회성 env 는 만들지 않음)
**고친 파일:** `workers/dart-alert/src/collector.ts`, `workers/dart-alert/tests/modes.test.ts`, `scripts/deploy-dart-alert.sh`
**커밋:** 74e12320
**달라진 점:**
- seed 모드에서 임대를 못 잡으면 error `seed skipped — lease held by another run, nothing inserted (run seed again)` + 종료 1(이유 `seed_lease_held`). OpenDART 0 · 넣기 0 · 남의 임대 해제 0 · 장애 글 0. auto 의 `lease_held` 종료 0 은 그대로(`collector.test.ts` 기존 시험이 묶음).
- 배포 스크립트 머리 주석 seed 안내에 「실행 뒤 로그 `seed done` 확인 · 임대 보유 중이면 error 와 함께 실패(종료 1)로 끝나니 잠시 뒤 다시」 를 더했다.
- 시험: 기존 「seed 도 종료 0 lease_held」 를 종료 1 `seed_lease_held` · error 1 · seed done 0 · 해제 0 · 송신 0 으로 바꿨다.

### IN-04: 시작 때 이미 예산이 찬 키는 error · 장애 글 없이 조용히 멈춘다

**처분:** 고침
**고친 파일:** `workers/dart-alert/src/collector.ts`, `workers/dart-alert/tests/watchMix.test.ts`
**커밋:** 1153d610
**달라진 점:**
- `budgetAtStart` 는 DB 장애 상태를 읽기 전(②~③)이라 지금처럼 `fresh=false` 로 멈추고, ⑤ `loadLastOk` 뒤 DB 에 열린 장애가 없으면 예산 멈춤 레인을 `fresh=true` 로 돌린다 → 같은 시작 경로의 `settleHalts` 가 error `dart key paused — other key keeps running`(used · budget) + 장애 글. 열려 있으면 지금처럼 조용히.
- 기존 시험 「시작 예산 키 1 used 15,000 → 장애 글 0(앞 실행이 이미 냄)」 은 그 전제를 DB 열린 장애로 명시해 그대로 통과 · 새 시험: DB 장애 없음 → error 1 · 장애 글 1(「(공개매수 · 주요사항보고서 — 자체 하루 예산 소진)」) · 키 2 계속 · 탐침 0 · 한도 의심 0.
- 쓰는 키가 **전부** 시작 때 예산으로 찬 경우는 지금처럼 곧바로 종료 0 `budget_at_start`(settleHalts 에 닿지 않음 — 범위 밖이라 그대로 둠).

### IN-05: 비밀 스크립트의 「키 2 ≠ 키 1」 검사가 한쪽 방향이고 읽기 실패 때 조용히 건너뛴다

**처분:** 고침
**고친 파일:** `scripts/setup-dart-alert-secrets.sh`
**커밋:** 12bfed64
**달라진 점:**
- 키 1 · 키 2 줄 중 하나라도 있으면 비교한다. 파일에 없는 쪽만 그 Secret 최신 값을 변수로 읽고 비교 뒤 곧바로 비운다(값 · 길이 비출력 · 명령줄에 올리지 않음 — 기존 규약 그대로).
- 상대 Secret 을 읽지 못하면 `SKIP 같은 값 검사 — <Secret 이름> 을 읽지 못함` 한 줄. 같으면 새 버전 없이 ERROR(키 1 줄만이면 「ERROR OPENDART_API_KEY — 키 2(Secret gh-radar-opendart-key-2)와 같은 값이다」).
- 가짜 gcloud 로 확인한 7경우: 키 1 줄만 · 키 2 Secret 같음 → ERROR · 종료 1 · 새 버전 0 / 다름 → OK / 못 읽음 → SKIP 같은 값 검사 / 키 2 줄만 · 같음 → ERROR / 못 읽음 → SKIP / 두 줄 같음 → ERROR / 방 id 줄만 → 검사 없음.

### IN-06: 배포 자체시험의 `grep | head` 가 `set -e` 아래에서 FAIL 문구 없이 스크립트를 끝낸다

**처분:** 고침
**고친 파일:** `scripts/deploy-dart-alert.sh`
**커밋:** 2bbf2e16
**달라진 점:** `secrets_line="$(grep -E '^[[:space:]]+--set-secrets=' "$self" | head -1 || true)"`. 같은 꼴을 따로 떼어(줄 없는 파일) 돌려 옛 꼴은 종료 1 · 문구 없음, 새 꼴은 「FAIL: 배포 명령의 --set-secrets 에 … 가 없다」 뒤 계속 감을 확인. 실제 자체시험은 `SELF-TEST OK`.

## 보류 항목

### IN-01: 전날 확인 건의 `rcept_dt` 를 오늘 날짜로 덮어써 칸 의미가 깨진다

**File:** `workers/dart-alert/src/lap.ts:291`
**처분:** 보류 — 진짜 접수일은 접수번호 앞 8자리로 복원할 수 있다(마이그레이션 없이 가는 지금 길 유지 · 메인 세션 결정).
**Original issue:** 송신 차례 RPC 가 오늘 행만 골라 전날 확인 · seed 건의 `rcept_dt` 를 넣은 날로 적는다.

### IN-02: 아침 전날 확인 건이 새 건보다 먼저 나갈 수 있고, 전날 하루가 통째로 비었으면 수십 건이 한꺼번에 나간다

**File:** `workers/dart-alert/src/lap.ts:284-298`
**처분:** 보류 — 수집기가 전날 종일 죽어 있던 드문 경우이고 U-3 사용자 결정 범위(메인 세션 결정).
**Original issue:** 우선순위 차례 때문에 늦은 I003 묶음이 새 I001 보다 앞서고, 전날 통째 공백이면 수십 건.

### IN-03: 「(자회사의 주요경영사항)」 꼬리가 같은 종류로 통과해 자회사 사건이 모회사 종목으로 알림된다

**File:** `workers/dart-alert/src/watches.ts:191-195`
**처분:** 보류 — 자회사 표기 통과는 261113-iez 에서 사용자에게 안내한 기존 동작(메인 세션 결정).
**Original issue:** 「최대주주변경(자회사의 주요경영사항)」 등이 모회사 종목 알림으로 나간다.

### IN-07: 필요성 — 멈춘 키 그물(`countedList` 의 paused 검사)은 지금 호출 사슬에서 닿지 않는다

**File:** `workers/dart-alert/src/collector.ts` `countedList`
**처분:** 보류 — 방어 코드 유지(메인 세션 결정).
**Original issue:** 현재 호출자는 모두 `isDue` 를 거쳐 그 분기가 실행되지 않는다.

### IN-08: 한 바퀴 안 순차 호출 — 30초 경계 · 첫 바퀴에 호출이 몰리고, 장애 글이 송신 창(60초 18건)을 기다리는 동안엔 조회가 전부 멈춘다

**File:** `workers/dart-alert/src/collector.ts` `sendNotice` · `lap.ts:263-300`
**처분:** 보류 — 기존 구조(바퀴 안 순차 · 공용 송신 창)의 한계(메인 세션 결정).
**Original issue:** 첫 바퀴 호출 몰림 · 장애 글 송신 대기 동안 D004 조회 0.

## 설계와 달라진 점 · 메모

1. **WR-01 포기 때 DB 표시 없음** — 지시가 「가장 단순한 쪽」 이었고 두 쪽 모두 한 줄이라, 보고 스크립트가 실패를 「전날 확인 완료」 로 세지 않는 쪽(메모리 표시만)을 골랐다. 재기동이면 그날 다시 최대 3번.
2. **WR-01 gave up 로그 시점** — 3번째 시도가 실패한 바로 그 바퀴가 아니라 그 감시 대상의 다음 오늘 조회 성공 때(D004 5초 · 30초 칸 감시 대상은 최대 30초 뒤) 남긴다. 넣기 실패 · 전날 조회 실패를 한 길로 판정하려는 선택.
3. **WR-01 시험 관찰** — 넣기 실패가 전날 건이 든 바퀴에서만 나면 그 사이 바퀴의 넣기는 성공(넣을 건 없음)이라 `dart alert insert failing`(5분 연속) error 는 나지 않는다. 기존 판정 그대로이고 이번 범위 밖이라 손대지 않았다.
4. **WR-02 연 키 결정** — 넣기 실패 장애는 쓰는 키 전부를 연 키로 둔다(「공시 저장 실패」 는 모든 알림이 멈췄다는 글이라 다른 키 실패를 따로 알릴 필요가 없음). 남이 연 장애(opened false)도 연 키를 모르는 것으로 둔다.
5. **IN-04 범위** — 쓰는 키가 전부 시작 때 예산으로 찬 경우(종료 0 `budget_at_start`)는 바꾸지 않았다.
6. 커밋은 지시대로 `git add <경로>` · 한글 메시지 · 귀속 줄 없음. 이 문서와 REVIEW.md 는 커밋하지 않았다.

---

_Fixed: 2026-11-13T12:14:42Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
