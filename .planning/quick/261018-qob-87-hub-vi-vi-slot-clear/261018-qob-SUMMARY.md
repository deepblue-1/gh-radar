---
phase: quick-261018-qob
plan: 01
subsystem: relay/hub
status: complete
tags: [relay, hub, vi, admin-87, vi.slot.clear]
requires: [quick-261017-daz]
provides: ["#dropViSlots — 87 제외 계좌 VI 슬롯 지움 + vi.slot.clear / re-assert 팬아웃"]
affects: [relay/src/hub/subscription-hub.ts]
tech-stack:
  added: []
  patterns: ["술어 기반 슬롯 지움 헬퍼 공유(#clearViOwner · #onAccounts)"]
key-files:
  created: []
  modified:
    - relay/src/hub/subscription-hub.ts
    - relay/tests/admin-session-sync.test.ts
    - relay/tests/hub-multi-session.test.ts
decisions:
  - "87 제외 계좌 VI 슬롯은 #onAccounts 에서 Ready 와 무관하게 소유 뷰 대조(무상태 차집합)로 지운다 — 21 재요청만 Ready 일 때"
  - "지움 · re-assert 송신은 #clearViOwner 와 같은 #dropViSlots 헬퍼 하나를 지난다"
metrics:
  duration: "약 10분"
  completed: 2026-10-18
actuals:
  tokens: 4600
  tasks: 2
  commits: 3
plan_head_before: 046605650f09d0ba2216f06f60f076eeeac91abd
plan_head_after: ab86af3d21012eaea053b0efaf61dfdff5f3baf0
---

# Quick 261018-qob: 87 제외 계좌 VI 슬롯 지움 Summary

87(Admin 계좌 목록)로 세션 선언 계좌에서 빠진 계좌의 VI 슬롯을 hub `#onAccounts` 가 Ready 와 무관하게 지우고, `#clearViOwner` 와 공유하는 `#dropViSlots` 헬퍼로 `vi.slot.clear`(다른 결선 세션이 알면 그 값 `vi.slot`)를 브라우저에 보낸다.

## 커밋

| Task | 종류 | 해시 | 내용 |
|---|---|---|---|
| 1 RED | test | 6c052576 | admin-session-sync ⑧ — op 4 A2 제외 → vi.slot.clear · op 3 재추가 → 21 → 61 재충전 (실패 확인: 「조건이 서지 않았습니다: A2 VI 슬롯 지움 2건」) |
| 1 GREEN | fix | aedc2897 | `#dropViSlots(userId, owner, drop)` 추출 · `#clearViOwner` 는 `() => true` 로 경유 · `#onAccounts` 옛 세션 대조 → 소유 뷰 밖 슬롯 지움(Ready 무관) → Ready 일 때만 WR-03 21 |
| 2 | test | ab86af3d | hub-multi-session P32 describe 3케이스 — 미준비 지움 · KB121 re-assert · 변화 없음/옛 세션 무동작 |

## 구현 요점

- `#dropViSlots` — 소유 접두 키만 돌고, 키를 (계좌, 거래소)로 푼 뒤 `drop(계좌)` 가 참인 것만 지운다. 다 지운 뒤 `getViSlot` 재판정 → undefined 면 `vi.slot.clear`, 아니면 `vi.slot` re-assert. 지운 수 반환.
- `#onAccounts` — `this.#sessions.get(owner) !== session` → return · `owned === null` → return · `#dropViSlots(userId, owner, (accountNo) => !owned.has(accountNo))` · 지운 수 > 0 이면 info 1줄(userId · serverKey · slots — 계좌번호 없음) · `!session.isReady` → return · 기존 모름 계좌 21 재요청.
- 주석 정렬: 머리 주석(87 제외도 같은 규칙) · `HubSession.on("accounts")` 문서 · `#onAccounts` 문서.

## 구현 전부터 통과한 케이스 (Task 1 GREEN 덕 · 동작 잠금)

Task 2 의 3케이스 전부 작성 즉시 통과했다. 이 케이스들이 실제로 동작을 막는지 변이로 확인했다(커밋 안 함, `git checkout -- <파일>` 로 되돌림):
- `#onAccounts` 의 `#dropViSlots` 호출을 `0` 으로 바꾸면 → (a) 미준비 지움 · (b) re-assert 케이스 실패.
- 옛 세션 대조 줄을 빼면 → (c) 옛 세션 케이스와 기존 WR-03 옛 세션 케이스 실패.

## 검증

- Task 1: `vitest run admin-session-sync · hub-multi-session · order-server-resync --maxWorkers=2` 3파일 111 통과 · typecheck · typecheck:tests 통과. 트레이서 게이트 — verify 를 끝에서 끝으로 다시 돌려 통과한 뒤에 확장했다.
- Task 2: 9개 relay 스위트(hub-multi-session · admin-session-sync · hub · strategy-hub · fanout · fanout-multi-session · order-server-resync · account-declare · session-routing) 411 통과 · typecheck · typecheck:tests 통과.
- 261017-daz 케이스(hub-multi-session 세션 교체 · re-assert · closeAll, order-server-resync 「IN-04 재수립」)는 단언 수정 없이 통과했다 — `#clearViOwner` 외부 동작은 그대로다.
- 변경 범위: `git diff --stat 04660565 HEAD` = subscription-hub.ts · admin-session-sync.test.ts · hub-multi-session.test.ts 셋뿐(webapp · packages/shared · relay/src/generated 변경 0).
- E2E · webapp 테스트는 돌리지 않았다(계획 범위).

## Deviations from Plan

1. **[Rule 3 - 테스트 진단성] ⑧ 의 지움 대기 `waitFor` 에 시한 2_000ms 를 지정했다.** 기본 `WAIT_MS`(5_000)가 vitest 테스트 시한(5_000)과 같아 RED 가 「조건이 서지 않았습니다」 대신 「Test timed out」 으로 떨어졌다. 시한을 줄여 계획이 말한 RED 메시지가 나오게 했다. 커밋 6c052576 에 포함. 동작 단언은 그대로다.

그 밖에는 계획대로 실행했다.

## Known Stubs

없음.

## 후속 후보 (설계 결정 8 — 범위 밖)

- (i) 재로그인 축소 경로: 끊긴 사이 users.toml 이 바뀌면 `session.ts` `#onLoginAccepted` 가 줄어든 목록으로 갈고 `ready` 만 낸다. 87 이 그 뒤에 오면 session-sync 의 gone 이 [] 라 `accounts` 이벤트가 없어 그 계좌 슬롯이 남을 수 있다(그 세션의 다음 `accounts` 이벤트가 이 작업의 대조로 지운다). 87 이 재로그인보다 먼저 오면 이 작업이 지운다.
- (ii) 87 로 빠진 계좌의 VI 주문 추적(`#viOrders`) · 계좌 상태 · 상따 캐시 몫은 그대로다 — 이 작업은 VI 설정 슬롯만 다뤘다.

## 배포 체크리스트 (실행자 범위 밖 — 오케스트레이터가 메인 세션 · 샌드박스 밖에서 집행)

웹 변경이 없어서 relay 하나만 배포한다. 순서 규칙(relay 먼저 → push 나중 — push 자체가 webapp 프로덕션 배포 경로)은 지킨다.

1. **시점:** 장 시간(08:00~20:00 KST) 밖을 권한다 — relay 재시작은 모든 wss 를 끊는다.
2. **트리 확인:** `git status -sb` 로 master 가 executor 마지막 커밋(ab86af3d)이고 남의 로컬 커밋 · 미커밋 추적 변경이 없는지 본다. `scripts/deploy-relay.sh` 는 `SHA=$(git rev-parse --short HEAD)` 로 태그하고 저장소를 빌드 컨텍스트로 쓰므로, 다른 세션 커밋이 섞였으면 이 작업 커밋에서 만든 detached worktree 에서 배포한다(32-14 선례).
3. **인증 env:** Deployer SA — `GOOGLE_APPLICATION_CREDENTIALS=~/.config/gcloud/gh-radar-deployer.json` · `CLOUDSDK_CORE_PROJECT=gh-radar`.
4. **relay 배포:** `GCP_PROJECT_ID=gh-radar SUPABASE_URL=https://<ref>.supabase.co NOTIFICATION_CHANNEL_ID=<채널 ID> bash scripts/deploy-relay.sh`. `SUPABASE_URL` 은 필수, `NOTIFICATION_CHANNEL_ID` 는 선택. 명령은 허용 규칙 접두사 그대로 쓴다 — `yes |` · 출력 파이프를 붙이지 않는다.
5. **스모크:** `bash scripts/smoke-relay.sh` — INV 전부 PASS(비밀 필요 항목 SKIP 정상). `curl -s https://dma.jx1.io/healthz` 의 `version` 이 새 SHA 인지 확인한다. Cloud Logging `relay_docker` 에 오류 · 스키마 위반 0 확인(infra/relay/README.md 조회 예시).
6. **push:** relay 스모크가 통과한 뒤에만 `git push` 한다. 이번 변경은 relay · `.planning` 뿐이라 webapp 빌드는 ignoreCommand 가 건너뛴다. relay 가 막히면 push 하지 않는다.
7. **STATE.md:** Quick Tasks Completed 표에 261018-qob 행 추가(오케스트레이터 몫 · main tree 직접 편집).

## Self-Check: PASSED

- FOUND: relay/src/hub/subscription-hub.ts (`#dropViSlots(userId, owner, () => true)` · `#dropViSlots(userId, owner, (accountNo` grep 통과)
- FOUND: relay/tests/admin-session-sync.test.ts (⑧ · `vi.slot.clear`)
- FOUND: relay/tests/hub-multi-session.test.ts (3케이스 · `vi.slot.clear`)
- FOUND: 6c052576 · aedc2897 · ab86af3d (HEAD 조상)
