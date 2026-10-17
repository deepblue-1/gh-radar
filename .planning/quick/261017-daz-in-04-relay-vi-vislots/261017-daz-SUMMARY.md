---
phase: quick-261017-daz
plan: 01
subsystem: relay-hub · webapp-relay-reducer
status: complete
tags: [IN-04, vi-slot, relay, wire-contract, D-17]
requires: [Phase 32 D-17 VI 슬롯 3상태]
provides: [RelayViSlotClearMsg vi.slot.clear, hub #clearViOwner 지움 팬아웃, resyncUser 1012 전 hub 정리, 웹 리듀서 vi.slot.clear 갈래]
affects: [사이드바 VI 줄, /me 상태줄, 이 계좌 끄기 활성 판정, 작업대 VI 설정 행]
tech-stack:
  added: []
  patterns: [지운 슬롯마다 getViSlot 재확인 후 clear 또는 값 re-assert]
key-files:
  created: []
  modified:
    - packages/shared/src/relay.ts
    - relay/src/hub/subscription-hub.ts
    - relay/src/ws/fanout.ts
    - webapp/src/lib/use-relay-socket.ts
    - relay/tests/hub-multi-session.test.ts
    - relay/tests/order-server-resync.test.ts
    - webapp/src/lib/__tests__/relay-socket.test.ts
    - webapp/src/components/trading/__tests__/strategy-status-card.test.tsx
    - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
    - webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx
decisions:
  - "VI 슬롯 지움은 새 t vi.slot.clear (cfg 뺀 vi.slot 은 구 번들 사이드바 TypeError) — 구 webapp 은 리듀서 default 로 무시"
  - "hub 는 지운 (계좌, 거래소)마다 getViSlot 재확인 — 다른 결선 세션이 알면 지움 대신 그 값 vi.slot (지운 직후 브라우저 = 병합 뷰)"
  - "resyncUser 는 hub.retainSessions 를 #users entry 삭제 앞으로 — 지움이 1012 close 전에 전달"
  - "웹 리듀서는 키 삭제(null 아님 — D-17 3상태) → VI 행은 미조회 잠금 + 입력값 보존"
metrics:
  duration: "~8분"
  completed: 2026-10-17
estimate:
  tokens: 140000
  tasks: 3
actuals:
  tokens: 8300
  tasks: 3
  commits: 5
plan_head_before: fd86037094db4c1297a6019b3cce1512105f0433
plan_head_after: f45302f7f6f564b1e057ba820d28b639c3a628b3
---

# Quick 261017-daz Plan 01: IN-04 — relay VI 슬롯 지움 프레임 vi.slot.clear Summary

relay hub 가 세션 분리 · 교체 · 재수립으로 VI (계좌, 거래소) 슬롯 캐시를 지울 때 브라우저에 `{t:"vi.slot.clear", a, x}`(다른 결선 세션이 그 슬롯을 알면 그 값 `vi.slot`)를 보내고, 웹 리듀서가 그 키를 지워(「모름」) 사이드바 VI 줄 · /me 상태줄 · 「이 계좌 끄기」 · 작업대 VI 행이 relay 가 아는 사실을 따른다.

## 커밋

| Task | 단계 | 커밋 | 내용 |
|---|---|---|---|
| 1 (tracer) | RED | 14f0bb94 | hub-multi-session 분리 케이스 vi.slot.clear 단언 · relay-socket 리듀서 3케이스 |
| 1 (tracer) | GREEN | dfbc56ae | shared `RelayViSlotClearMsg` · hub `#clearViOwner(userId, owner)` 팬아웃 · 웹 리듀서 `case "vi.slot.clear"` |
| 2 | RED | 51f1f6bf | 세션 교체 · re-assert · closeAll 무프레임(hub) · 재수립 1012 전 전달(order-server-resync) |
| 2 | GREEN | 76d26f50 | fanout `resyncUser` 순서 변경(retainSessions → entry 삭제) · hub/fanout 주석 |
| 3 | test | f45302f7 | 사이드바 VI 줄 · 이 계좌 끄기 · 작업대 VI 행 지움 뒤 단언 |

## 구현 전부터 통과한 케이스(동작 잠금)

- Task 1 webapp: `vi.slot.clear — 모르는 키 · VI 거래소 밖 x 는 상태 참조 그대로` — 구현 전엔 리듀서 default 무시로 같은 결과(상태 참조 불변). RED 는 나머지 두 리듀서 케이스(키 삭제 · 미등록 삭제)가 맡았다.
- Task 2 hub-multi-session 3케이스(세션 교체 · re-assert · closeAll) — Task 1 구현 덕에 처음부터 통과. RED 는 order-server-resync 재수립 케이스(지움 0건 → `expected 0 to be greater than 0`)가 맡았다.
- Task 3 소비처 3케이스 전부 — 소비처가 이미 `viSlots` 에서 파생하므로 작성 즉시 통과(설계 결정 5 그대로 · 소비처 코드 무변경).

## Task 2 에서 고친 기존 단언

없음. 순서 변경 뒤 relay 9개 스위트(hub-multi-session · hub · strategy-hub · strategy-sweeper · fanout · fanout-multi-session · order-server-resync · ws-latch · ws-autosell) 463 테스트 전부 그대로 통과했다. Task 1 에서 기존 분리 케이스(hub-multi-session 「KB121 분리(retainSessions)」)의 제목 · 주석을 새 동작(지움 1건)으로 고쳤다 — `vi.slot` 재팬아웃 수 불변 · vi.list 스냅 · 84 보존 단언은 그대로다.

## 와이어 하위 호환 (코드 읽기 재확인)

- 구 webapp + 새 relay: `webapp/src/lib/use-relay-socket.ts` `parseFrame`(현재 2346 — 이 작업이 건드리지 않음, `t` 가 문자열인지만 봄)과 리듀서 `default`(현재 1219-1220 「알 수 없는 `t` 는 무시한다 … T-15-41」 — 무변경)가 모르는 `t` 를 버린다. 이 파일의 diff 는 `case "vi.slot.clear"` 갈래와 `RelayData.viSlots` 문서 두 hunk 뿐이다(라인 이동은 갈래 삽입 13줄 때문).
- 새 webapp + 구 relay: 구 relay 는 이 프레임을 내지 않는다 → 새 갈래가 잠자고 지금 동작 그대로.
- gh-trade 생성물: `git diff --stat fd860370 HEAD -- relay/src/generated` 비어 있음(StockDMA.fbs 사본 · 생성물 변경 0).

## 검증

- Task 1: `pnpm --filter @gh-radar/shared build` · relay `hub-multi-session` 72/72 · webapp `relay-socket` 159/159 · relay typecheck · typecheck:tests · webapp typecheck 통과.
- Task 2: relay 9 스위트 463/463 · relay typecheck · typecheck:tests 통과.
- Task 3: webapp 5 파일(strategy-status-card · app-sidebar · vi-settings-rows · me-client · relay-socket) 368/368 · webapp typecheck 통과.
- 모든 vitest 는 `--maxWorkers=2`, 전체 E2E 미실행(계획 지시).

## Deviations from Plan

None - plan executed exactly as written.

## 후속 후보 (범위 밖 관찰)

- **87 계좌 제외 시 hub VI 슬롯 잔존** — `DmaSession.removeAllowedAccounts`(relay/src/dma/session.ts:427-440) → `accounts` 이벤트 → hub `#onAccounts`(relay/src/hub/subscription-hub.ts 현재 ~3800-3820, 계획 시점 3784-3803)는 21 재요청만 판단하고 제외된 계좌 슬롯을 지우지 않는다. hub 캐시에 잔존하므로 IN-04 와 다른 결함 — 고치려면 그 경로에서도 제외 계좌 슬롯 삭제 + `vi.slot.clear` 팬아웃이 필요하다.

## 배포 체크리스트 (실행자 범위 밖 — 오케스트레이터가 메인 세션에서 집행)

순서는 **relay 먼저 → webapp push** 다(D-16 · 메모리 「배포는 relay 먼저 · push 나중」 — push 자체가 webapp 프로덕션 배포). 이 변경은 두 조합 모두 안전하지만(설계 결정 1) 순서 규칙은 지킨다.

1. **시점:** 장 시간(08:00~20:00 KST) 밖 권장 — relay 재시작은 모든 wss 를 끊는다.
2. **트리 확인:** `git status -sb` 로 master 가 executor 마지막 커밋(f45302f7)이고 남의 로컬 커밋 · 미커밋 변경이 없는지 본다. `scripts/deploy-relay.sh` 는 `SHA=$(git rev-parse --short HEAD)`(485)로 태그하고 저장소를 빌드 컨텍스트로 쓰므로, 다른 세션 커밋이 섞였으면 이 작업 커밋에서 만든 detached worktree 에서 배포한다(32-14 선례).
3. **인증 env:** Deployer SA — `GOOGLE_APPLICATION_CREDENTIALS=~/.config/gcloud/gh-radar-deployer.json` · `CLOUDSDK_CORE_PROJECT=gh-radar`.
4. **relay 배포:** `GCP_PROJECT_ID=gh-radar SUPABASE_URL=https://<ref>.supabase.co NOTIFICATION_CHANNEL_ID=<채널 ID> bash scripts/deploy-relay.sh` (infra/relay/README.md:129-131). `SUPABASE_URL` 은 필수(deploy-relay.sh:491 `:?`), `NOTIFICATION_CHANNEL_ID` 는 선택(319-323 — 없으면 알림 정책 단계만 건너뜀). 레지스트리 모드 운영이라 플래그 없이 정상 배포가 열린다(전환 잠금 509-). 명령은 허용 규칙 접두사 그대로 — `yes |` · 출력 파이프를 붙이지 않는다.
5. **스모크:** `bash scripts/smoke-relay.sh` — INV 전부 PASS(INV-9 · 10 은 비밀 필요로 SKIP 정상). 버전 확인 `curl -s https://dma.jx1.io/healthz` 의 `version` 이 새 SHA. Cloud Logging `relay_docker` 에 오류 · 스키마 위반 0 확인(infra/relay/README.md 조회 예시).
6. **webapp:** relay 스모크 통과 뒤에만 `git push`(master → Vercel 프로덕션). relay 가 막히면 push 하지 않는다.
7. **STATE.md:** Quick Tasks Completed 표에 261017-daz 행 추가(오케스트레이터 몫 · main tree 직접 편집).

## Self-Check: PASSED
