---
phase: quick-260929-c8e
plan: 01
subsystem: relay (journal observer) · ops (deploy/IAM) · docs
tags: [relay, journal, observer, kyobo, multi-gateway, healthz, deploy]
status: complete
requires:
  - Phase 19 관찰자 기록 경로 (JournalWriter · JournalAccess · JournalObserver · JournalStatus)
  - DB 게이트웨이 키 구조 (dma_journal_cursor PK gateway · p_gateway advisory lock) — 마이그레이션 불필요
provides:
  - config.journalUpstreams (0번 = 주 게이트웨이 · 추가 관찰자 env 표 행 1개 KYOBO)
  - 게이트웨이별 독립 기록 파이프라인 · /healthz journalGateways(503 판정 밖)
  - deliverJournalRows(rows, access?) — 추가 게이트웨이 매핑 푸시
  - deploy-relay.sh KYOBO 호스트 보존/해제 · 비치명 비밀 점검 · setup-relay-iam.sh KYOBO Secret 껍데기
  - README §다중 게이트웨이 관찰자
affects:
  - Task 3 (메인 세션) — 비밀 생성 · gh-trade 인계 · relay 배포 · 라이브 검증
tech-stack:
  added: []
  patterns:
    - env 표(행 추가만으로 게이트웨이 확장) → index.ts 는 키 리터럴 없이 순회
    - 주 게이트웨이 결선 불변 + 추가 게이트웨이는 푸시만 결선(상태 frame 은 브라우저로 안 감)
key-files:
  created:
    - relay/tests/config-upstreams.test.ts
  modified:
    - relay/src/config.ts
    - relay/src/index.ts
    - relay/src/order/order-api.ts
    - relay/src/ws/fanout.ts
    - relay/src/journal/writer.ts
    - relay/src/journal/access.ts
    - relay/src/logger.ts
    - relay/tests/journal-boot.test.ts
    - relay/tests/order-api.test.ts
    - relay/tests/journal-push.test.ts
    - scripts/deploy-relay.sh
    - scripts/setup-relay-iam.sh
    - infra/relay/README.md
decisions:
  - 추가 게이트웨이(KYOBO) 관찰자는 /healthz 503 판정 밖 — 본문 journalGateways.<키>.alerting 으로만 드러낸다 (healthy 판정식 불변)
  - 브라우저 journal.state 는 주 게이트웨이(KB) 상태 하나만 — 추가 게이트웨이 frame 은 결선하지 않는다
  - 추가 게이트웨이 비밀 부재는 production 에서도 기동을 막지 않는다(disabled) · 게이트웨이 키 충돌은 기동 거부
  - deploy-relay.sh KYOBO 비밀 점검 · VM fetch 는 비치명 — 실패 시 KB 단독 배포
metrics:
  duration: ~15m
  completed: 2026-09-29
  tasks_completed: 2
  tasks_total: 3
actuals:
  tokens: 21000
  tasks: 2
  commits: 4
plan_head_before: 078023004bc47b5896a55d382ab230a681feb174
---

# Phase quick-260929-c8e Plan 01: relay 관찰자 다중 업스트림 (KB + 교보 KYOBO) Summary

KYOBO env 3종(DMA_KYOBO_HOST · DMA_KYOBO_PORT · DMA_OBSERVER_SECRET_KYOBO)이 있으면 relay 가 게이트웨이마다 독립된 기록 파이프라인(기록기 · 매핑 · 관찰자 · 상태)을 띄운다. KYOBO 상태는 `/healthz` 본문 `journalGateways.KYOBO` 에만 드러나고 503 판정 밖이다. KYOBO 적용 행은 KYOBO 매핑으로만 푸시된다. env 가 없으면 relay 는 오늘과 같다. deploy-relay.sh 는 KYOBO 호스트를 보존하거나 `off` 로 해제하고, 비밀이 없으면 KB 단독으로 배포한다.

## 커밋 (Tasks 1 · 2)

| Task | 커밋 | 메시지 | 파일 |
|------|------|--------|------|
| 1 RED | 77af8444 | test(quick-260929-c8e): 관찰자 다중 업스트림 실패 테스트 — … | relay/tests/config-upstreams.test.ts(신규) · journal-boot · order-api · journal-push |
| 1 GREEN | 104ab050 | feat(quick-260929-c8e): relay 관찰자 다중 업스트림 — … | relay/src/config.ts · index.ts · order/order-api.ts · ws/fanout.ts · journal/writer.ts · journal/access.ts · logger.ts |
| 2 | eee8032d | feat(quick-260929-c8e): deploy-relay.sh · setup-relay-iam.sh KYOBO 관찰자 env · 비밀 — 없으면 KB 단독 배포 | scripts/deploy-relay.sh · scripts/setup-relay-iam.sh |
| 2 | 7f08bb36 | docs(quick-260929-c8e): README 다중 게이트웨이 관찰자 절 — … | infra/relay/README.md |

전 커밋은 한글이고 Co-Authored-By 가 없다. push 하지 않았다. 경로를 명시해 stage 했고, 커밋 직전마다 `git status -sb` 를 확인했다.

## 검증 결과

- **relay 전량:** 29파일 665건 통과. 기준선은 28파일 651건이고, 신규는 config-upstreams 5 · order-api a–e 5 · journal-push ⑥ 1 · journal-boot M1–M3 3 으로 14건이다. 기존 케이스는 수정하지 않았다. 하네스(`start` · `spawnRelay`)에는 선택 옵션만 더했다.
- **RED 확인:** 구현 전 신규 12건이 실패했다(tsc 타입 오류 포함). M1 과 a 는 기존 동작을 잠그는 케이스라 구현 전에도 통과한다.
- **typecheck · typecheck:tests:** 0 으로 끝났다.
- **webapp relay 소비자 3파일**(relay-socket · relay-provider · today-orders-card): 183건 통과. webapp 소스는 바꾸지 않았다.
- **bash -n:** deploy-relay.sh · setup-relay-iam.sh · kyobo-secret.sh 모두 OK.
- **하네스 `all`:** ALL PASS, 52 PASS / 0 FAIL(R1–R17 · O1–O17 · C1–C5). resolve_kyobo_host 6케이스, 치명 4종 루프 불변, 스크립트 실주소 0, README 핵심어 10종이 모두 통과했다.

## Deviations from Plan

### 관찰 사항 (수정 없음)

**1. [범위 밖 · 간헐] `tests/fanout.test.ts` ㉒ 한 번 실패**
- Task 1 verify 중 첫 전량 실행에서 ㉒(「다른 사용자의 전략 스냅샷은 절대 넘어가지 않는다」)가 1건 실패했다. 그 뒤 단독 3회와 전량 4회는 모두 통과했다.
- 이 케이스는 전략 스냅샷(lc.snap) 경로이고 `flushIo(30)` 타이밍에 기대므로 저널 변경과 무관하다. 부팅 테스트가 프로세스를 여럿 띄워 CPU 부하가 걸릴 때 나는 타이밍 flake 로 판단한다.
- 제약상 .planning/ 에 다른 파일을 만들 수 없어 deferred-items.md 대신 여기에 적는다.

**2. 계획 시점 HEAD 와 실행 시점 HEAD 가 다르다**
- 디스패치 시점 HEAD 는 fb7c9b0f 였다. 실행 전에 다른 세션이 1a2c9944(webapp 수정)와 07802300(STATE docs)을 커밋하고 push 했다.
- 그래서 c8e 커밋 4건은 07802300 위에 있다. 원장 `plan_head_before` 는 07802300 이다.
- 하네스 commit 모드는 BASE fb7c9b0f 에서 `--grep quick-260929-c8e` 로 거르므로 영향이 없다(C1–C5 PASS).
- ⚠ 같은 브랜치에서 다른 세션이 push 하면 c8e 커밋 4건도 함께 올라간다(C5 가 뒤집힌다).

이 밖의 계획은 그대로 실행했다.

## 구현 메모

- `index.ts` 에는 게이트웨이 키 리터럴이 없다(하네스 R4). 주 게이트웨이는 종전 이름(`journalWriter` · `journalAccess` · `journalStatus`)으로 구조분해했다. 그래서 fanout · orderApi · 두 결선 줄은 글자 그대로다. `journalObserver` 변수는 쓰이지 않게 되어 뺐다. 부팅 로그의 `journalObserver` 필드는 그대로다.
- 종료 절차는 전 관찰자 stop → 전 기록기 drain 병렬(각 2초) → 전 close 순서다. 미완이면 기존 warn 문구를 그대로 쓰고 `gateways` 필드를 싣는다.
- `read_live_env` 에는 식별자 정규식 가드를 더했다(sed 식 주입 방지). 주석에는 「비밀 키 이름으로 부르지 않는다」를 적었다.
- deploy-relay.sh 의 KYOBO 사전 점검은 `set -eo pipefail` 아래에서 파이프 대입에 `|| true` 를 붙여 비치명을 보장한다.

## Known Stubs

없음.

## Threat Flags

없음. 새 표면(`/healthz` journalGateways · KYOBO env-file 경로)은 계획의 threat_model(T-c8e-01 · 04 · 05 · 07)에 있고 전부 완화를 적용했다.
- 부팅 M2 는 두 비밀 문자열이 출력에 없음을 단언한다.
- order-api e 는 식별자 · host · secret 키가 없음을 단언한다.
- logger redact 에 `*.DMA_OBSERVER_SECRET_KYOBO` 를 더했다.

## Task 3 (main-session) — 완료 (2026-09-29 10:07 KST)

Task 3(`checkpoint:human-action` · `executor="main-session"`)은 gsd-executor 가 실행하지 않았다. 메인 세션이 (0) → (a) → (b) → (c) → (d) → (e) 순서로 진행하고, 이 절에 「라이브 반영 결과」를 채운다.

### 라이브 반영 결과

### 라이브 반영 결과 (메인 세션 · 2026-09-29 KST)

| 단계 | KST | 결과 |
|------|-----|------|
| (a) 비밀 생성 | 09:5x | 사용자가 `!` 로 `260929-c8e-kyobo-secret.sh` 실행. `gh-radar-dma-observer-secret-kyobo` 생성 · 버전 1 · relay SA secretAccessor 바인딩. sha256 앞 12자 **b672eca72f2e**. VM SA 로 latest 읽어 해시 재계산 → 동일 |
| (b) gh-trade 인계 | 09:58~10:03 | Phase 22 세션에 KYOBO 키 · 시크릿 이름 · 해시 전달. 회신: kyobo127 `config/observer.toml`(600, 87B) 배치, 파일 해시 b672eca72f2e **일치**, 게이트웨이 재시작 10:01:39, observer_probe LOGIN success broker=KYOBO accounts=3 |
| (c) 배포 전 확인 | 10:00 | `relay` · `packages/shared` porcelain 0. 배포 중 버전 94ebc91c → HEAD 사이 relay/shared 커밋: c8e 2건(77af8444 · 104ab050) + Phase 24 의 shared/relay.ts 주석만 바꾼 2건(ad23dc97 · 99ed28af, 비주석 변경 0줄). 장중 배포는 사용자 승인(「회신 즉시 배포」) |
| (c) 배포 | 10:04~10:07 | 깨끗한 detached worktree(HEAD 4c143596)에서 `GCP_PROJECT_ID=gh-radar SUPABASE_URL=… NOTIFICATION_CHANNEL_ID=… DMA_KYOBO_HOST=10.16.207.127 bash scripts/deploy-relay.sh`. VM 로그 「비밀 4종 획득 · KYOBO 포함」, 요약 「KYOBO: 10.16.207.127 : 9100 ← 관찰자 전용」, DMA_HOST 10.41.1.120 보존. uptime check · 알림 정책 갱신 정상. worktree 제거 완료 |
| (d)1 healthz | 10:07 / 10:12 | `{"status":"ok","version":"4c143596","kb":"live","kb_lastSeq":1283,"kyobo":"live","kyobo_headSeq":0,"alerting":false}` — 기동 직후부터 KYOBO live |
| (d)2 로그 | 10:07 | KYOBO: connecting→logging_in, 로그인 요청 sinceSeq 0 epoch "", 응답 epoch 20260928-eedf314c… headSeq 0 oldestSeq 0 resync false **accounts 3**, logging_in→live. KB: sinceSeq 1279 epoch 20260925-f337f3e7… → live (회귀 없음) |
| (d)3 신원 교차 확인 | 10:12 | KYOBO 매핑 3행(dma_user_id ezmesya · junysim · milles — KB 와 동일 ID 집합). dma_credentials 교집합: junysim → gh-radar 사용자 2명, milles → 1명, ezmesya → 매칭 없음(KB 도 동일). **사용자 승인: 「같은 사람」**(T-c8e-02). 조회는 컨테이너 안 node 스크립트로 서비스롤 사용, 계좌는 뒤 4자리 · user_id 앞 8자만 출력 |
| (d)4 KB smoke | 10:08 | `scripts/smoke-relay.sh` PASS 10 · FAIL 0 · SKIP 2(INV-9 토큰 미설정 · INV-10 키 미해석 — 평소와 같음) |

- 계획 `<verify>` jq: status ok · journal.state live · journalGateways.KYOBO.state live → **충족**.
- 교보 주문 포트 링크가 아직 DOWN 이라 KYOBO 저널은 0건(headSeq 0). 링크 개통 후 첫 레코드 apply 는 gh-trade 가 통보하면 확인한다.
- 잔여: 컨테이너 `/tmp/c8e-idcheck.js`(비밀 없음, env 만 읽는 조회 스크립트) 삭제가 권한 문제로 실패 — 다음 배포 때 컨테이너 교체로 사라짐.
- 저장소 변경은 Task 1 · 2 커밋뿐이다. push 는 이 quick 범위 밖이다.


(미실행 — 메인 세션 대기)

## Self-Check: PASSED

- 파일 존재: relay/tests/config-upstreams.test.ts FOUND
- 커밋 존재: 77af8444 · 104ab050 · eee8032d · 7f08bb36 FOUND (git log)
- 하네스 all ALL PASS · relay 665/665 · webapp 183/183
