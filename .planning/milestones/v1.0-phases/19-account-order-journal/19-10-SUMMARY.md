---
phase: 19-account-order-journal
plan: 10
subsystem: relay
tags: [relay, journal, observer, boot, shutdown, deploy, secret-manager, healthz, seq-regression, D-04, D-10, D-13, D-14, T-19-03, T-19-36, T-19-37, T-19-38]
status: complete

requires:
  - phase: 19-account-order-journal
    provides: "19-05 JournalWriter · JournalAccess · journal/types.ts"
  - phase: 19-account-order-journal
    provides: "19-07 JournalObserver · JournalStatus · /healthz journal 필드 · config DMA_OBSERVER_SECRET production fail-fast"
  - phase: 19-account-order-journal
    provides: "19-09 createJournalCodec 실 코덱 · 가짜 게이트웨이 관찰자 모드(respondObserverLogin · pushJournalBatch · observerLoginRequests · waitForObserverConnection)"
provides:
  - "relay/src/index.ts 부팅 결선 — journalWriter · journalAccess · journalObserver(createJournalCodec) · journalStatus, applied → fanout.deliverJournalRows, frame → fanout.deliverJournalState, WsFanout{journalAccess, journalState}, createOrderApi{journal}, 결선 뒤 journalObserver.start()"
  - "종료 6단계: HTTP close → fanout.closeAll → sessionManager.closeAll → journalObserver.stop → journalWriter.drain(JOURNAL_DRAIN_TIMEOUT_MS=2000) · close · access/status close → hub·symbols·종목마스터 (5초 데드맨 유지)"
  - "부팅 로그 journalObserver: enabled|disabled"
  - "relay/tests/helpers/supabase-stub.ts startSupabaseStub — stocks · dma_journal_cursor(seedCursor) · rpc/dma_journal_sync_access · rpc/dma_journal_apply · 요청 기록 · unknownRequests"
  - "relay/tests/journal-boot.test.ts — 실 relay 프로세스(tsx src/index.ts) 부팅 종단 4케이스"
  - "seq 역행 방어: JournalWriter.beginEpoch(epoch, {resync, headSeq}) — 같은 epoch ∧ headSeq < lastReceivedSeq 면 resync 여부와 무관하게 유지 · error 로그 · health 카운터"
  - "JournalWriterHealth.seqRegressions · lastSeqRegressionAtMs / JournalHealth(/healthz journal).seqRegressions · lastSeqRegressionAgeSec — 503 판정 제외"
  - "deploy-relay.sh 비밀 4종(gh-radar-dma-observer-secret 사전 검사 · OBS_SECRET fetch · 빈 값 검사 · env-file DMA_OBSERVER_SECRET)"
  - "setup-relay-iam.sh Secret 4종 껍데기 + secretAccessor 루프"
  - "ops/alert-relay-down.yaml 문서: journal rejected · 비-live 180초 · db_error 행 + 8번 대응 절차"
  - "infra/relay/README.md Secret 4종 · 관찰자 비밀 비출력 파이프 주입 · 해시 대조 · 순환 순서"
  - "docs/relay-operations.md 「관찰자 기록 연결 (Phase 19)」"
affects: [19-11, 19-12, 19-13]

actuals:
  tokens: 20368
  tasks: 3
  commits: 5
plan_head_before: 6b04615cb5238e090631459957ee2fae1e2370dc

tech-stack:
  added: []
  patterns:
    - "부팅 결선은 실 프로세스(tsx spawn) + 가짜 게이트웨이 + PostgREST 스텁으로 증명 — 결선 누락·순서·종료 순서는 단위 테스트가 못 잡는다"
    - "관찰자 start 는 모든 결선(applied/frame 리스너 · fanout · orderApi) 뒤 — 첫 배치가 리스너 없이 버려지지 않게"
    - "seq 역행은 표시 신호(카운터 + 마지막 관측 경과초) — 파생 상태·journalAlerting 에 섞지 않는다"
    - "비밀 두 목적지 주입은 로컬 0600 임시 파일 하나 → stdin 파이프 → 해시 앞 12자 대조"

key-files:
  created:
    - relay/tests/journal-boot.test.ts
    - relay/tests/helpers/supabase-stub.ts
  modified:
    - relay/src/index.ts
    - relay/src/journal/writer.ts
    - relay/src/journal/observer.ts
    - relay/src/journal/status.ts
    - relay/src/journal/types.ts
    - relay/tests/journal-writer.test.ts
    - relay/tests/journal-observer.test.ts
    - relay/tests/journal-status.test.ts
    - relay/tests/journal-push.test.ts
    - relay/tests/order-api.test.ts
    - scripts/deploy-relay.sh
    - scripts/setup-relay-iam.sh
    - ops/alert-relay-down.yaml
    - infra/relay/README.md
    - docs/relay-operations.md

key-decisions:
  - "seq 역행(같은 epoch · 로그인 head < 마지막 수신 seq)은 resync 값과 무관하게 lastReceivedSeq 를 유지한다 — 비우면 1..head 재생 → since+1 → 갭 → since=head 재접속이 끝없이 반복된다(gh-trade Phase 23 합의 · 게이트웨이는 다음 seq 를 since+1 로 올린다)"
  - "seq 역행은 /healthz 503 을 만들지 않는다 — 스트림은 정상으로 이어지므로 알림이 아니라 표시 신호(journal.seqRegressions · lastSeqRegressionAgeSec)"
  - "판정 위치는 기록기(beginEpoch) — lastReceivedSeq 리셋 규칙의 주인이 기록기라서. 관찰자는 headSeq 를 넘기기만 한다"
  - "관찰자 비밀 순환 순서는 「두 곳 교체 → 게이트웨이 재시작 → relay 재배포(마지막)」 — relay 는 로그인 거부 뒤 재시작 전 재시도하지 않으므로 relay 를 먼저 올리면 rejected 로 굳는다(plan 문구의 역순을 바로잡음)"
  - "healthz journal 필드 키 6종 → 8종(seqRegressions · lastSeqRegressionAgeSec) — 식별자 없음 유지"

patterns-established:
  - "relay 실 프로세스 부팅 테스트: 빈 포트 2개 · DMA_HOST=127.0.0.1 명시 · LOG_LEVEL info 전 출력 수집 후 비밀 부재 단언 · afterEach 에서 SIGKILL 정리"
  - "PostgREST 스텁은 모르는 경로도 200 [] 로 받고 기록 → unknownRequests() 가 [] 인지 단언(부팅이 새 경로를 부르기 시작하면 드러난다)"

requirements-completed: [D-04, D-10, D-13, D-14]

coverage:
  - id: D1
    description: "실 relay 프로세스가 사용자 접속 없이 관찰자 연결 1개를 연다 — 커서 조회 1회 → 관찰자 로그인(secret · since 0 · epoch '') → 매핑 RPC(p_rows 2) → 배치 → 적용 RPC(seq 1) → healthz journal live · lastSeq 1"
    requirement: "D-13"
    verification:
      - kind: integration
        ref: "relay/tests/journal-boot.test.ts#부팅 → 커서 조회 → 관찰자 로그인 → 매핑 RPC → 배치 → 적용 RPC → healthz live → SIGTERM 0 · 비밀 부재"
        status: pass
    human_judgment: false
  - id: D2
    description: "SIGTERM 종료 순서(사용자 세션 → 관찰자 stop → drain → 완료) · 5초 안 코드 0 · 출력 전체에 비밀 문자열 없음"
    requirement: "D-13"
    verification:
      - kind: integration
        ref: "relay/tests/journal-boot.test.ts#부팅 → 커서 조회 → 관찰자 로그인 → 매핑 RPC → 배치 → 적용 RPC → healthz live → SIGTERM 0 · 비밀 부재"
        status: pass
    human_judgment: false
  - id: D3
    description: "production 비밀 누락 시 기동 거부(코드 ≠0 · 'DMA_OBSERVER_SECRET must be set') · test 비밀 없음 → disabled · 관찰자 로그인 0"
    requirement: "D-10"
    verification:
      - kind: integration
        ref: "relay/tests/journal-boot.test.ts#production + DMA_OBSERVER_SECRET 없음 → 5초 안에 비정상 종료 · 사유 문구"
        status: pass
      - kind: integration
        ref: "relay/tests/journal-boot.test.ts#DMA_OBSERVER_SECRET 없음 + NODE_ENV test → healthz 200 · journal.state disabled · 관찰자 로그인 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "seq 역행 방어 — 같은 epoch · head < 받은 seq(resync true/false) → 유지 · 곧바로 live · since+1 수용 · error 1 · healthz 신호 · 503 아님. 새 epoch · 같은 epoch resync(head ≥ 수신)는 종전대로 비움"
    requirement: "D-13"
    verification:
      - kind: unit
        ref: "relay/tests/journal-writer.test.ts#⑦b seq 역행"
        status: pass
      - kind: unit
        ref: "relay/tests/journal-observer.test.ts#seq 역행 방어 — 같은 epoch 인데 게이트웨이 head 가 받은 seq 보다 작다 (gh-trade 23 합의)"
        status: pass
      - kind: integration
        ref: "relay/tests/journal-boot.test.ts#seq 역행(같은 epoch · head 7 < 커서 10 · resync) → 커서 유지 · 11 적용 · healthz seqRegressions 1 · 200"
        status: pass
      - kind: unit
        ref: "relay/tests/order-api.test.ts#seq 역행 신호(seqRegressions > 0)만으로는 503 이 아니다 — 스트림은 정상, 본문에만 드러난다"
        status: pass
    human_judgment: false
  - id: D5
    description: "배포·IAM 스크립트가 관찰자 비밀을 4번째로 사전 검사·주입(값 비출력) — 문법 검사만 가능(실 GCP 실행은 19-11)"
    requirement: "D-10"
    verification:
      - kind: other
        ref: "bash -n scripts/deploy-relay.sh && bash -n scripts/setup-relay-iam.sh && grep -c gh-radar-dma-observer-secret (3 · 3)"
        status: pass
    human_judgment: true
    rationale: "스크립트는 실 GCP 에 대해 돌려 보지 않았다(plan 금지) — 19-11 전환 창의 실제 배포가 첫 실행이다"
  - id: D6
    description: "알림 정책 문서에 journal 503 행 3종 + 대응 절차 · 정책 조건 불변 · 운영 문서(비밀 주입·순환·전환·롤백·seq 역행)"
    requirement: "D-04"
    verification:
      - kind: other
        ref: "ruby -ryaml YAML.load_file(ops/alert-relay-down.yaml) · git diff 변경 hunk 가 documentation 블록(21-23 · 75-95행 < mimeType 142행)에만"
        status: pass
    human_judgment: true
    rationale: "문서 내용의 운영 적합성은 사람이 판단한다"

metrics:
  duration: 12min
  completed: 2026-09-25
---

# Phase 19 Plan 10: 관찰자 부팅 결선 · 배포 스크립트 · 운영 문서 Summary

relay 를 켜기만 하면 관찰자 연결 1개가 붙어 기록을 시작하고(실 프로세스 부팅 테스트로 증명), SIGTERM 에 6단계 순서로 내려가며, 배포 스크립트는 관찰자 비밀을 4번째 비밀로 비출력 주입한다. 추가로 gh-trade Phase 23 과 합의한 「seq 역행」 방어(같은 epoch 인데 게이트웨이 head 가 받은 seq 보다 작을 때 마지막 수신 seq 유지 + healthz 신호)를 RED→GREEN 으로 넣었다.

## Performance

- **Duration:** 12분
- **Started:** 2026-09-25T06:11Z (KST 15:11)
- **Completed:** 2026-09-25T06:23Z
- **Tasks:** 2 (Task 1 tracer · Task 2) + 추가 범위 1건(seq 역행)
- **Files modified:** 17 (신규 2)

## Accomplishments

- `index.ts` 결선: 기록기 · 매핑 · 관찰자(실 코덱) · 상태 → fanout(`deliverJournalRows` · `deliverJournalState` · 인증 직후 스냅샷) · `/healthz` journal 한 원천. 결선 뒤 `journalObserver.start()`.
- 종료 6단계 + `JOURNAL_DRAIN_TIMEOUT_MS = 2_000` · 5초 데드맨 유지. 머리 주석의 「부팅 시 DMA 게이트웨이에 미리 접속하지 않는다」 를 「사용자 세션은 그렇다 · 관찰자 1개는 예외(D-13)」 로 고침.
- 실 프로세스 부팅 테스트 4케이스(tracer · seq 역행 · production 거부 · disabled) + PostgREST 스텁 헬퍼.
- seq 역행 방어 + healthz `seqRegressions` · `lastSeqRegressionAgeSec`(503 제외).
- 배포·IAM 스크립트 비밀 4종 · 알림 정책 문서 journal 행 · README 관찰자 비밀 절 · relay-operations 관찰자 기록 연결 항목.

## Task Commits

1. **Task 1 RED: 실 relay 부팅 종단 테스트 · Supabase 스텁** — `289fc81` (test)
2. **Task 1 GREEN: index.ts 결선 · 종료 6단계** — `b5fb66f` (feat) — ⚡ Tracer verified end-to-end — expanding
3. **추가 RED: seq 역행 재현** — `17fe8e2` (test)
4. **추가 GREEN: seq 역행 시 lastReceivedSeq 유지 · healthz 신호** — `4525c1e` (fix)
5. **Task 2: 배포·IAM 스크립트 · 알림 문서 · 운영 문서** — `f3cdb11` (chore)

## Verification

- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && … typecheck:tests && … test` → **28 files / 628 tests green**(기준 27 / 616 → +1 파일 · +12 테스트), `error TS` 0.
- tracer: `pnpm --filter @gh-radar/relay exec vitest run tests/journal-boot.test.ts` → 4/4 pass(≈2.5초). 실제 `tsx src/index.ts` 프로세스가 가짜 게이트웨이에 관찰자 로그인 → 스텁이 `dma_journal_sync_access`(p_gateway KB · p_rows 2) · `dma_journal_apply`(p_epoch ep-boot · seq 1) 수신 → healthz `journal.state live · lastSeq 1` → SIGTERM 코드 0. 로그 순서 `[DMA] 전 세션 종료 완료` < `[JOURNAL] 관찰자 종료` < `[relay] 종료 절차 완료`, drain 미완 로그 없음, 출력(LOG_LEVEL info 전량)에 `boot-test-secret` 없음, 스텁 `unknownRequests()` = [].
- 수동 확인: `tsx src/index.ts` 에 SIGTERM → tsx 가 신호를 자식에 넘기고 exit 0(부팅 테스트 전제).
- Task 2: `bash -n` 두 스크립트 OK · `gh-radar-dma-observer-secret` 카운트 3 · 3 · YAML 파싱 OK(임계 [0.9, 0.9] · combiner AND 불변).
- `ops/alert-relay-down.yaml` diff (PLAN_BASE `6b04615`..HEAD): hunk 2개 `@@ -20,0 +21,3 @@` · `@@ -71,0 +75,21 @@` — 둘 다 `documentation.content` 블록 안(mimeType 142행 앞), 추가만(삭제 0). conditions · combiner · alertStrategy 무변경.
- 새 문서 줄의 실서버 IP 리터럴 0 (`git diff … | grep '^+' | grep -cE '10\.41\.[0-9]+\.[0-9]+'` = 0 — README · relay-operations 모두).
- README 비밀 주입 파이프의 로컬 부분(생성 → TOML 감싸기 → stdin 수신 · 0600 → sed 추출 해시 = 원본 해시)을 스크래치에서 재현해 해시 일치 확인.

## Acceptance Criteria

| 기준 | 결과 |
|------|------|
| `grep -n "journalObserver.start()" relay/src/index.ts` ≥ 1 | PASS (198) |
| `deliverJournalRows\|deliverJournalState` ≥ 2 | PASS (172 · 173 + 주석) |
| `sessionManager.closeAll` < `journalObserver.stop` < `journalWriter.drain` (코드 줄) | PASS (253 < 255 < 257) |
| 부팅 테스트가 비밀 문자열 부재를 단언 | PASS |
| `DMA_OBSERVER_SECRET` · `빈 비밀: dma observer secret` in deploy-relay.sh | PASS (344 · 328) |
| `journal` in alert yaml ≥ 3 · 정책 조건 무변경 | PASS (14 · hunk 가 documentation 안) |
| `observer.toml` in README ≥ 1 · `관찰자 기록 연결` in relay-operations ≥ 1 | PASS |
| relay-operations 새 줄 실서버 IP 0 | PASS |

## Deviations from Plan

### 합의된 추가 범위

**1. [추가 범위 — gh-trade Phase 23 합의] 저널 seq 역행 방어**
- **발견 경위:** gh-trade Phase 23 세션과의 합의(게이트웨이가 같은 epoch 를 되살렸지만 최신 날짜 파일을 잃어 head < relay lastReceivedSeq). 오케스트레이터가 이 plan 에 얹었다.
- **변경:** `JournalWriter.beginEpoch(epoch, {resync, headSeq})` — 같은 epoch ∧ `headSeq < lastReceivedSeq` 면 resync 여부와 무관하게 `lastReceivedSeq` 유지, `[JOURNAL] 저널 seq 역행 — 같은 epoch 인데 게이트웨이 head 가 받은 seq 보다 작다`(gateway · epoch · headSeq · lastReceivedSeq · resync) error, `seqRegressions`/`lastSeqRegressionAtMs` 카운터. `JournalStatus.health` → `/healthz journal.seqRegressions` · `lastSeqRegressionAgeSec`. 관찰자는 headSeq 를 넘긴다. 그 뒤 head ≤ 수신 이므로 기존 규칙대로 곧바로 live.
- **503 여부:** 만들지 않는다(표시만) — 스트림은 정상으로 이어진다. `journalAlerting` 무변경.
- **기존 동작 유지:** 다른 epoch → null · 같은 epoch resync ∧ head ≥ 수신(보관 범위 밖) → null (회귀 테스트로 잠금).
- **테스트:** 기록기 단위(⑦b ×2) · 관찰자(resync true/false · 회귀 3종) · order-api(503 아님 · 키 8종) · 실 프로세스 부팅(커서 10 · head 7 → 11 적용 · 재로그인 없음).
- **부수 변경:** 기존 테스트의 `beginEpoch` 호출 11곳에 `headSeq` 추가(⑦ 은 커서 42 라 headSeq 42 로 — 0 을 넣으면 역행으로 판정된다), status/observer/order-api 의 healthz 기대값에 새 두 키.
- **커밋:** `17fe8e2`(RED) · `4525c1e`(GREEN)

### Auto-fixed Issues

**2. [Rule 1 - Bug] 관찰자 비밀 순환 순서를 「게이트웨이 재시작 → relay 재배포(마지막)」 로 문서화**
- **발견:** Task 2 README 작성 중
- **문제:** plan 은 「relay 재배포 → 게이트웨이 재시작」 순서를 적었다. 그러나 relay 관찰자는 로그인 거부를 받으면 **relay 재시작 전까지 재시도하지 않는다**(19-07 D-13 · T-19-28). relay 를 먼저 새 값으로 올리면 옛 값을 든 게이트웨이(핫리로드 없음)가 거부 → relay 가 `rejected` 로 굳고, 게이트웨이를 재시작해도 풀리지 않는다.
- **수정:** README 순환 절 · relay-operations 「로그인 거부」 항목에 게이트웨이 재시작 → relay 재배포(마지막) 순서와 이유를 적음. 초기 전환 순서(D-14: gh-trade → relay)와도 일치한다.
- **파일:** infra/relay/README.md · docs/relay-operations.md
- **커밋:** `f3cdb11`

**Total deviations:** 1 합의된 추가 범위 + 1 자동 수정(Rule 1 문서 순서). **Impact:** 코드 계약 변화는 healthz journal 키 +2(식별자 없음)와 `beginEpoch` 시그니처 1건. 기존 동작 무변경.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None — 새 네트워크 표면 없음. `/healthz` journal 필드에 계수 2개가 늘었을 뿐 식별자 없음(T-19-07 키 grep 테스트 유지).

## Next Phase Readiness — 19-11(전환 창)이 알아야 할 것

- **비밀 순서:** `setup-relay-iam.sh` 로 `gh-radar-dma-observer-secret` 껍데기 + relay SA 접근권 → README §Secret 4종 값 주입 파이프로 Secret Manager 새 버전 + 게이트웨이 `config/observer.toml` 에 같은 값 → 해시 앞 12자 3곳 대조. 이 비밀이 없으면 `deploy-relay.sh` 가 사전 검사에서 멈춘다(`--rollback` 포함).
- **배포 순서:** 게이트웨이(관찰자 지원판) 재시작이 relay 배포보다 **먼저**. 옛 게이트웨이에 새 relay 가 붙으면 관찰자 로그인(5)에 답이 없어 5초 타임아웃 → 재접속이 반복된다(장 밖이라 503 은 아니지만 기록 0). 비밀 불일치면 relay 가 `rejected` 로 굳으므로, 값을 맞춘 뒤 **relay 를 다시 배포**해야 한다.
- **배포 후 검증:** `/healthz` `journal.state = live` · `journal.lagSeq 0` · `seqRegressions 0` · `dma_account_access` 행 수 = users.toml 계좌 수 · `dma_journal_cursor` 행 존재. `deploy-relay.sh` 의 기동 확인은 `curl -sf`(503 이면 실패)라, 장중에 rejected 면 배포 단계가 실패로 끝난다 — 전환은 20:00 이후라 장 밖 200 이다.
- **빌드 대상:** relay 배포는 메인 체크아웃 HEAD/작업 트리를 빌드한다 — `git status -sb` 로 다른 세션의 미push 커밋이 섞이는지 먼저 본다. master 는 origin 보다 50 커밋 넘게 앞서 있다(이 plan 도 push 안 함).
- **seq 역행 신호:** 전환 뒤 `journal.seqRegressions > 0` 이면 게이트웨이가 최신 기록 파일을 잃은 것 — gh-trade 에 알리고 게이트웨이가 since+1 부터 잇는지 확인(같은 seq 를 다시 쓰면 relay 는 중복으로 건너뛴다 — 아래 잔여 위험).
- **잔여 위험(합의 전제):** seq 역행 시 게이트웨이가 합의와 달리 head+1..since 구간 seq 를 **새 내용으로 다시 쓰면**, relay 는 그 레코드를 중복(≤ lastReceivedSeq)으로 건너뛴다(debug 로그만). 방어는 gh-trade 의 「since+1 로 올린다」 합의에 기댄다 — error 로그 + healthz 신호가 그 상황을 드러낸다.

## Self-Check: PASSED

- FOUND: relay/tests/journal-boot.test.ts · relay/tests/helpers/supabase-stub.ts · relay/src/index.ts(journalObserver.start)
- FOUND commits: 289fc81 · b5fb66f · 17fe8e2 · 4525c1e · f3cdb11 (`git rev-list --count 6b04615..HEAD` = 5)
