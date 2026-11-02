---
phase: 37-tick-viewer
plan: 09
subsystem: infra
status: complete
tags: [tickgw, radar-gw, ssh, controlmaster, zstd, poller, lease, backoff, lru, docker, internal-http]

requires:
  - phase: 37-01
    provides: "119 인덱서 강제 명령 계약 제안(인계 노트 ②) · 저장처 · D-19 범위 결정"
  - phase: 37-06
    provides: "tick-convert 워커 관례(vitest maxWorkers 2 · LOG_LEVEL silent · 워크스페이스 꼴)"
provides:
  - "워크스페이스 @gh-radar/tickgw (node 내장만 · 런타임 의존성 0) — src/{config,log,indexer,cache,poller,server}.ts"
  - "server ↔ tickgw 내부 계약: GET /internal/ticks/live · /internal/ticks/export · /internal/ticks/export/bytes · /healthz · 헤더 X-Tickgw-Secret · X-Tick-* 6종"
  - "119 ssh 강제 명령 어댑터 indexer.ts(37-01 노트 ② 제안 — 회신 차이는 이 파일만)"
  - "키당 폴러(리스 30초 · 동시성 1 · 키 상한 8 · 백오프 · 75 · 전역 60초 차단 · 20:01 closeSweep)"
  - "tickgw/Dockerfile(node:24-alpine · openssh-client · 빌드 인자 TICKPULL_UID/GID · USER tickpull)"
  - "infra/relay/tickpull/install.sh · scripts/setup-tickgw-iam.sh · scripts/deploy-tickgw.sh · docs/relay-operations.md 「tickgw」 절"
affects: [37-12, 37-15, 37-17, 37-19]

actuals:
  tokens: 33600     # chars/4 over 추가 줄 134,399B(한글 다바이트 포함 — 상한 쪽 근사)
  tasks: 3
  commits: 4        # MEASURED: git rev-list --count 657af817..e8dcbeb4 (SUMMARY 커밋 제외)
plan_head_before: 657af8172ae3057d3931bf816b67a7b7aa941037
plan_head_after: e8dcbeb4ff902e61f686f0c7863042bb5b8a9afb

tech-stack:
  added: []
  patterns:
    - "폴러는 step() 하나를 사슬로 직렬화(전역 동시성 1) — 시계 · 수면 · 난수 주입으로 가짜 시계 시험이 step 을 직접 돈다"
    - "캐시는 119 zstd 프레임 원본 그대로 · epoch(UUID) + 바이트 offset 커서 — 엔트리가 지워지면 새 epoch(409 로 처음부터)"
    - "ssh 종료 판정 = exit + stdout 끝(+stderr 200ms 유예) — ControlPersist 배경 마스터가 stderr 를 늦게 닫아도 묶이지 않는다"
    - "가짜 119 강제 명령 픽스처(tests/fixtures/fake-indexer.mjs)를 TICKGW_SSH_BIN 자리에 놓고 끝에서 끝 시험"

key-files:
  created:
    - tickgw/package.json
    - tickgw/tsconfig.json
    - tickgw/vitest.config.ts
    - tickgw/Dockerfile
    - tickgw/src/config.ts
    - tickgw/src/log.ts
    - tickgw/src/indexer.ts
    - tickgw/src/cache.ts
    - tickgw/src/poller.ts
    - tickgw/src/server.ts
    - tickgw/tests/fixtures/fake-indexer.mjs
    - tickgw/tests/indexer.test.ts
    - tickgw/tests/poller.test.ts
    - tickgw/tests/server.test.ts
    - infra/relay/tickpull/install.sh
    - scripts/setup-tickgw-iam.sh
    - scripts/deploy-tickgw.sh
  modified:
    - pnpm-workspace.yaml
    - pnpm-lock.yaml
    - docs/relay-operations.md

key-decisions:
  - "X-Tick-State 표 — closed→ready · 순번>MAX_KEYS→queued(k) · 전역 차단→delayed · 인자 오류 64→blocked(60초 뒤 재시도) · 실패 백오프→delayed · 하루치 전→loading · 그 밖 ready"
  - "X-Tick-Complete 값은 \"true\"/\"false\"(08:00 시작 ∧ 이어받기 끊김 없음) · X-Tick-Queue 는 대기 순번 k(활성이면 0) · X-Tick-Last-Recv-Ns 는 없으면 빈 문자열"
  - "live 409 조건 = epoch 가 주어졌는데 다름 · epoch 없이 offset>0 · offset > 끝 — 응답 {epoch}"
  - "전역 차단이 풀린 뒤 첫 호출(탐침)이 또 연결 실패면 곧바로 60초 재차단 — 차단 뒤 3회를 다시 두드리지 않는다"
  - "closedThroughNs 는 마무리 폴링 사슬의 첫 호출 시각 − 2초(실패 · 바쁨 뒤 재시도는 새 사슬) · 하한 그날 20:00:00 KST"
  - "마감 마무리는 하루 한 번 — 20:01 이후 처음 연 키는 그날 closed 가 되지 않아 승격되지 않는다(스펙 그대로)"
  - "배포 비밀은 Mac 을 거치지 않고 VM 이 메타데이터 토큰으로 Secret Manager REST 를 읽어 /dev/shm env-file 에 쓴다(deploy-relay.sh 동형)"
  - "Dockerfile 은 베이스의 같은 uid(node 1000)를 지우고 같은 gid 그룹은 재사용 — radar-gw tickpull uid 가 무엇이든 빌드된다"

patterns-established:
  - "tickgw 운영 스크립트 3종(설치기 · setup-*-iam · deploy-*)은 limitup-pull · deploy-relay 문법 그대로 — 지문 대조 · 키는 없을 때만 · tmpfs env-file · 기동 확인 · 자기 시험 실패면 정지"

requirements-completed: [D-05, D-06, D-07]

coverage:
  - id: D1
    description: "가짜 119 → indexer 어댑터 → 키 폴러(08:00 하루치 · has_more 이어받기 · lastRecvNs+1 증분) → 원본 프레임 캐시 → GET /internal/ticks/live 바이트 offset 응답(epoch 409 · 비밀 401 · 400)"
    requirement: D-05
    verification:
      - kind: integration
        ref: "tickgw/tests/server.test.ts#GET /internal/ticks/live — 트레이서"
        status: pass
      - kind: unit
        ref: "tickgw/tests/indexer.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "같은 키 브라우저 5개 동시 요청 → 119 호출 키당 1(+이어받기) — 사용자 수와 독립(D-07)"
    requirement: D-07
    verification:
      - kind: integration
        ref: "tickgw/tests/server.test.ts#같은 키 브라우저 5개 동시 요청 → 119 호출은 키당 1(+이어받기) — D-07"
        status: pass
    human_judgment: false
  - id: D3
    description: "호출 규율 — 리스 30초 · 키 상한 8(대기 k건) · 동시성 1 · 백오프 5·10·20·40·60·60 · 75 재시도(실패 미산입) · 연결 실패 3연속 전역 60초 차단(호출 0) · 64 blocked"
    requirement: D-06
    verification:
      - kind: unit
        ref: "tickgw/tests/poller.test.ts#Poller — 리스 30초 · 활성 키 상한 8 · 백오프 · 바쁨 · 차단"
        status: pass
    human_judgment: false
  - id: D4
    description: "20:01 마감 마무리(리스 끝난 키 포함 · has_more 이어받기 · 실패 3회 → closed 아님 · closed 뒤 호출 0 · 차단 중엔 대기) · KST 경계 리터럴(37-12 와 동일값)"
    requirement: D-07
    verification:
      - kind: unit
        ref: "tickgw/tests/poller.test.ts#Poller — 20:01 마감 마무리(closeSweep) · KST 경계"
        status: pass
    human_judgment: false
  - id: D5
    description: "캐시 LRU 128MB(면제 없음) · 유휴 15분(오늘 complete 는 21:00 까지 면제) · 삭제 뒤 새 epoch · export closed 만 · unclosed 수 · DATE_MISMATCH 400 · export/bytes 404"
    requirement: D-07
    verification:
      - kind: integration
        ref: "tickgw/tests/server.test.ts#TickCache — LRU · 유휴 / GET /internal/ticks/export"
        status: pass
    human_judgment: false
  - id: D6
    description: "Dockerfile — 빌드 인자 없으면 빌드 실패 · uid 1000/996 빌드 성공 · 컨테이너 id -un=tickpull · ssh -G 성공 · healthz 200 · 무비밀 live 401"
    requirement: D-07
    verification:
      - kind: other
        ref: "docker build --platform=linux/amd64 -f tickgw/Dockerfile (로컬 · push 없음) + docker run 자기 시험"
        status: pass
    human_judgment: false
  - id: D7
    description: "radar-gw 설치기 · 방화벽/비밀 · 배포 스크립트 · 운영 문서 — 실제 radar-gw · 119 · GCP 에서의 동작"
    verification:
      - kind: other
        ref: "bash -n 3종 · deploy-tickgw.sh --self-test(10 cases) · 원격 본문 bash -n"
        status: pass
    human_judgment: true
    rationale: "radar-gw · 119 · GCP 쓰기는 37-17 메인 세션(20:00 KST 이후) 몫 — 이 플랜은 문법 · 오프라인 자가 시험만 했다"

duration: 18min
completed: 2026-11-02
---

# Phase 37 Plan 09: 당일 경로 radar-gw 컨테이너 tickgw Summary

**119 인덱서 ssh 강제 명령(ControlMaster 다중화)을 (종목, 거래소, 오늘)당 폴러 하나로 일원화하고, 받은 zstd 프레임을 풀지 않은 채 epoch + 바이트 offset 커서로 내부 HTTP(`/internal/ticks/live` · `/export`)에 내주는 node 내장 전용 컨테이너 tickgw — 리스 30초 · 동시성 1 · 키 상한 8 · 5→60초 백오프 · 전역 60초 차단 · 20:01 마감 마무리 · 128MB LRU — 와 radar-gw 설치 · 방화벽/비밀 · 배포 스크립트 · 운영 문서.**

## Performance

- **Duration:** 약 18분
- **Started:** 2026-11-02T11:05:16Z
- **Completed:** 2026-11-02T11:23Z
- **Tasks:** 3/3 (트레이서 1 · TDD 1 · 운영 1)
- **Files:** 17 생성 · 3 수정

## Accomplishments

- **트레이서(Task 1):** 가짜 119 강제 명령(`fake-indexer.mjs` — 계약 ②대로 pcap-ns 레코드 + zstd stdout · stderr 끝 줄 JSON · 종료코드 흉내)을 `TICKGW_SSH_BIN` 자리에 놓고, 진짜 `runIndexer` → `Poller` → `TickCache` → `createTickgwServer` 끝에서 끝으로 하루치(08:00 KST) + has_more 이어받기 바이트가 두 응답을 이어붙인 것과 바이트 단위로 같음을 확인. 트레이서 게이트 재실행 통과 후 확장.
- **호출 규율(Task 2 · TDD):** 가짜 시계로 `step()` 을 직접 돌려 리스 · 대기열 · 백오프 수열 · 75 · 전역 차단 · 탐침 재차단 · 64 · 20:01 closeSweep(리스 끝난 키 포함 · 이어받기 · 실패 3회 · 차단 중 대기)을 단언.
- **이미지:** 로컬 `docker build`(push 없음)로 빌드 인자 없으면 실패 · uid 1000(베이스 node 사용자와 충돌)/996 성공 · 컨테이너가 `id -un`=tickpull · `ssh -G` 성공 · `/healthz` 200 · 무비밀 401 확인 후 이미지 삭제.
- **운영:** 설치기(지문 대조 · 키는 없을 때만 · 공개키 본문 미출력) · setup(방화벽 tcp:8092 · Secret 값 미출력 · accessor 2) · deploy(평일 장중 가드 · uid 먼저 · 빌드 인자 · /dev/shm env-file · 256MB · OOM 500 · healthz · 자기 시험 실패면 정지) · 문서 절.

## 내부 계약 (37-15 server · 37-12 승격 · 37-19 웹이 쓴다)

| 경로 | 인증 | 요청 | 응답 |
|------|------|------|------|
| `GET /healthz` | 없음 | — | 200 `{ok, keys, bytes}` |
| `GET /internal/ticks/live` | `X-Tickgw-Secret`(timingSafeEqual · 틀리면 401) | `isin`(`^[A-Z0-9]{12}$`) · `ex`(KRX\|NXT) · `epoch`(선택 · ≤64) · `offset`(정수 ≥0 · 기본 0) — 날짜는 언제나 KST 오늘 · 요청마다 리스 30초 갱신 | 200 `application/octet-stream` = offset 이후 원본 zstd 바이트 · `Cache-Control: no-store` · 409 `{epoch}`(epoch 다름 · epoch 없이 offset>0 · offset>끝) · 400 `BAD_REQUEST` |
| `GET /internal/ticks/export?date=YYYYMMDD` | 같은 헤더 | date = KST 오늘만 | 200 `{date, keys:[{isin, ex, bytes, records, first_recv_ns, last_recv_ns, closed_through_ns}], unclosed}` — **closed 키만** · ns 는 십진 문자열 · 400 `{error:"DATE_MISMATCH", today}` |
| `GET /internal/ticks/export/bytes?date&isin&ex` | 같은 헤더 | 같은 date 검사 | 200 전체 바이트(+`X-Tick-Records`) · 404 `{error:"NOT_CLOSED"}` · 400 `DATE_MISMATCH` |

live 응답 헤더:

| 헤더 | 값 |
|------|----|
| `X-Tick-Epoch` | 캐시 엔트리 UUID — 바뀌면 클라이언트는 offset 0 부터 |
| `X-Tick-Offset-End` | 본문 끝 바이트 offset = 다음 요청 `offset` |
| `X-Tick-Last-Recv-Ns` | 마지막 레코드 recv epoch ns(십진) · 없으면 빈 문자열 |
| `X-Tick-State` | `loading` · `ready` · `queued` · `delayed` · `blocked`(아래 표) |
| `X-Tick-Queue` | 대기 순번 k(queued 일 때) · 그 밖 0 |
| `X-Tick-Complete` | `true` / `false` — 08:00 시작 ∧ 이어받기 끊김 없음 |

상태 표(위가 우선):

| 조건 | state | queue |
|------|-------|-------|
| 엔트리 closed(마감 마무리 끝) | ready | 0 |
| 리스 살아 있는 키 중 순번 > 8 | queued | k |
| 전역 차단 중(119 도달 불가) | delayed | 0 |
| 인자 오류(64) 뒤 60초 재시도 대기 | blocked | 0 |
| 실패 백오프 중 | delayed | 0 |
| 08:00 하루치(+이어받기) 아직 | loading | 0 |
| 그 밖 | ready | 0 |

env: `TICKGW_SECRET`(필수 ≥32) · `TICKGW_PORT` 8092 · `TICKGW_INDEXER_HOST` smok95@10.16.207.119 · `TICKGW_SSH_KEY` /ssh/id_ed25519 · `TICKGW_KNOWN_HOSTS` /ssh/known_hosts · `TICKGW_SSH_BIN` ssh · `TICKGW_POLL_MS` 5000 · `TICKGW_POLL_JITTER_MS` 500 · `TICKGW_LEASE_MS` 30000 · `TICKGW_CACHE_BYTES` 128MB · `TICKGW_MAX_KEYS` 8 · `TICKGW_IDLE_MS` 15분 · `TICKGW_CLOSE_DELAY_MS` 60000 · `TICKGW_KEEP_UNTIL` 21:00 · `TICKGW_INDEXER_TIMEOUT_MS` 60000 · `LOG_LEVEL`.

## Task Commits

1. **Task 1 (tracer): tickgw 트레이서** — `09460d0d` (feat)
2. **Task 2 RED: 호출 규율 실패 시험** — `3cb1a8e9` (test)
3. **Task 2 GREEN: 호출 규율 · export · Dockerfile** — `49d69f72` (feat)
4. **Task 3: radar-gw 운영 스크립트 · 문서** — `e8dcbeb4` (chore)

## 테스트

- `pnpm --filter @gh-radar/tickgw run typecheck && pnpm --filter @gh-radar/tickgw exec vitest run --maxWorkers=2` → exit 0 · **3 파일 39 테스트 통과**(indexer 10 · server 14 · poller 15).
- Task 1 verify(indexer + server) 16/16 — 트레이서 게이트 재실행도 16/16.
- Task 3 verify(`bash -n` 3종 + grep 사슬) → exit 0 · `deploy-tickgw.sh --self-test` → `self-test OK 10 cases` · 원격 본문 추출 `bash -n` 통과.

## TDD Gate Compliance

- **RED** `3cb1a8e9` — 대상 `tests/poller.test.ts > Poller — 백오프 · 바쁨 · 차단 > 실패 연속 → 5 · 10 · 20 · 40 · 60 · 60초 · 성공하면 다시 5초`. `vitest run tests/poller.test.ts --reporter=junit` exit 1 · 15 중 13 실패. `gsd-tools check tdd-red-evidence` → **RED_EVIDENCE_OK**(`target_test_failed` · junit · report_errors 없음). 의미 판정: 대상 시험이 실제로 실행돼 계획한 단언(간격 수열 deep-equal)에서 실패했다 — 실제 `[5000, 5000, …]`(Task 1 폴러엔 백오프 없음) · 기대 `[5000, 10000, 20000, 40000, 60000, 60000, 5000]`. 다른 실패도 전부 AssertionError(구문 · 로드 · 픽스처 오류 없음).
- **GREEN** `49d69f72` — 39/39 통과.
- REFACTOR 없음.

## Files Created/Modified

- `tickgw/src/config.ts` — env 로딩 · `kstDayStartNs` · `kstMs` · `kstToday` · `kstHhmm`(shared 복제 · 리터럴 시험)
- `tickgw/src/log.ts` — JSON 한 줄 로그(비밀 · 본문 금지)
- `tickgw/src/indexer.ts` — `IndexerArgs` · `IndexerMeta` · `IndexerResult` · `sshArgv` · `parseMeta` · `runIndexer`(시간 초과 · stdout 32MB 상한 kill)
- `tickgw/src/cache.ts` — `TickCache` · `CacheEntry` · `makeKey` · `parseKey`(LRU · 유휴 면제)
- `tickgw/src/poller.ts` — `Poller` · `KeyState` · `closeSweep` · `backoffMs` · `isUnreachable`
- `tickgw/src/server.ts` — `createTickgwServer` · `secretOk` · `main()`
- `tickgw/Dockerfile` — 2단 · openssh-client · tickpull 사용자
- `tickgw/tests/*` — 가짜 119 픽스처 · 시험 3 파일
- `infra/relay/tickpull/install.sh` · `scripts/setup-tickgw-iam.sh` · `scripts/deploy-tickgw.sh` — 운영 3종(실행 권한 755)
- `docs/relay-operations.md` — 「gh-radar 당일 틱 경로 tickgw (Phase 37)」 절
- `pnpm-workspace.yaml` · `pnpm-lock.yaml` — `tickgw` 워크스페이스(+12줄)

## 실행하지 않은 것 (명시)

- **radar-gw · 119 · GCP 쓰기 없음.** `install.sh` · `setup-tickgw-iam.sh` · 실제 배포 · `docker push` · 방화벽/Secret 쓰기 · `git push` 는 하지 않았다 — 37-17(20:00 KST 이후 · 메인 세션 · 비밀은 사용자 `!`).
- **예외 1건(읽기 전용 · 실패):** 가드 동작을 보려고 `bash scripts/deploy-tickgw.sh` 를 인자 없이 1회 실행했는데, 셸 환경에 `GCP_PROJECT_ID=gh-radar` 가 이미 있어 gcloud 가드 · 시각 가드(20:21 KST 통과)를 지나 ③단계의 읽기 전용 `gcloud compute ssh radar-gw --command 'id -u tickpull …'` 를 시도했다. 그 호출은 실패(uid 미수신 — 샌드박스의 IAP 차단 또는 tickpull 미설치)했고 스크립트는 「tickpull 미설치」 로 **종료 2** — 빌드 · push · 원격 변경 단계 전이다. radar-gw 에는 아무 변경도 없다. 이후 이 스크립트는 `--self-test` 로만 돌렸다.
- 로컬 `docker build`/`docker run`(push 없음)은 했고 시험 이미지는 지웠다.

## Decisions Made

- frontmatter key-decisions 참조. 요점: 상태 표 · 409 조건 · 탐침 재차단 · closedThroughNs 기준 · 하루 한 번 마무리 · VM 측 비밀 읽기 · Dockerfile uid 충돌 처리.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] step() 직렬화 · stdout 상한 · stderr 유예 종료 판정**
- **Found during:** Task 1 · 2
- **Issue:** 플랜은 「전역 동시 1」 을 루프 하나로만 적었는데 `step()` 이 동시에 불리면(시험 · 향후 호출부) 119 호출이 겹친다. ssh 응답이 계약(16MB)을 크게 넘으면 256MB 컨테이너가 위험하다. ControlPersist 배경 마스터가 stderr 를 늦게 닫는 OpenSSH 판에서 `close` 만 기다리면 첫 호출이 120초 묶인다.
- **Fix:** `step()` 을 promise 사슬로 직렬화(시험: 동시 3회 호출 → 최대 동시 1) · stdout 32MB 넘으면 kill(code −1) · 종료 = exit + stdout 끝(+stderr 200ms 유예).
- **Files modified:** tickgw/src/poller.ts · tickgw/src/indexer.ts
- **Committed in:** 09460d0d · 49d69f72

**2. [Rule 2 - Missing Critical] 전역 차단 뒤 탐침 재차단 · 인자 오류(64) 처리 · `TICKGW_INDEXER_TIMEOUT_MS` · `TICKGW_POLL_JITTER_MS`**
- **Found during:** Task 2
- **Issue:** 차단이 풀린 뒤 연결 실패를 다시 3회 두드리면 운영 기준 4(재시도로 두드리지 않음)에 어긋난다. 64(날짜 ≠ 119 오늘 등)를 일반 실패로 백오프하면 상태를 구분할 수 없다. ssh 상한 · 지터는 시험에서 고정해야 한다.
- **Fix:** 차단 뒤 첫 호출이 연결 실패면 곧바로 60초 재차단 · 64 → `blocked` 상태 + 60초 뒤 재시도 · env 두 개 추가(기본 60초 · 500ms).
- **Committed in:** 49d69f72 · 09460d0d

**3. [Rule 3 - Blocking] Dockerfile — 베이스 이미지 uid/gid 충돌**
- **Found during:** Task 2 로컬 빌드
- **Issue:** `node:24-alpine` 에 uid/gid 1000(node)이 있어 radar-gw tickpull uid 가 1000 이면 `adduser` 가 실패한다. 또 busybox `id -un <uid>` 는 uid 를 받지 않는다.
- **Fix:** 같은 uid 사용자는 지우고 같은 gid 그룹은 재사용 · 확인은 `id -u/-g tickpull` 비교. uid 1000 · 996 로컬 빌드 성공.
- **Committed in:** 49d69f72

**4. [Rule 2 - 보안 · 설계 선택] 배포 비밀을 Mac 이 아니라 VM 이 읽는다**
- **Found during:** Task 3
- **Issue:** 플랜 문구는 「Secret 을 Mac 에서 읽어 tmpfs env-file 로 IAP SSH 전송」 이다. deploy-relay.sh 의 정착된 꼴은 VM 이 메타데이터 토큰으로 Secret Manager REST 를 읽어 `/dev/shm` env-file 에 쓰는 것이고, 그러면 값이 Mac · 명령줄 · 전송 경로에 전혀 없다. setup 스크립트가 relay VM SA accessor 를 이미 주므로 그대로 된다.
- **Fix:** VM 측 읽기 + `/dev/shm` 0600 · trap 삭제(수용 기준 `/dev/shm` 충족).
- **Committed in:** e8dcbeb4

**5. [시험 수정] closeSweep 실패 3회 시험의 시계 범위**
- **Found during:** Task 2 GREEN
- **Issue:** 20:30 까지 돌리면 complete 아닌 키 2 가 정상적으로 유휴 삭제(20:14)돼 단언이 undefined 를 읽었다 — 구현이 아니라 시험 범위 문제.
- **Fix:** 20:10 까지만 돌린다(시도 3회는 20:01:15 에 끝남).
- **Committed in:** 49d69f72

**6. [기타] 장중 가드는 평일만**
- deploy-tickgw.sh 시각 가드는 limitup-pull 의 `daytime_blocked` 와 같은 꼴로 **평일** 08:00~20:00 KST 만 막는다(주말 배포 허용). 자가 시험 10건에 경계값 포함.

---

**Total deviations:** 6 (Rule 2 ×3 · Rule 3 ×1 · 시험 범위 1 · 해석 1)
**Impact on plan:** 계약 · 경로 · 헤더 · env 이름은 플랜 그대로. 추가 env 2개는 선택값(기본값으로 플랜 수치와 같음).

## Issues Encountered

- 위 「실행하지 않은 것」 의 읽기 전용 gcloud ssh 시도 1건(실패 · 무변경).
- `shellcheck` 가 이 맥에 없어 쉘 정적 분석은 `bash -n` 과 자가 시험으로 대신했다.

## User Setup Required

None — 설치 · 키 등록 · 비밀 · 배포는 37-17(메인 세션 · 20:00 KST 이후 · 비밀은 사용자 `!` · 119 등록은 gh-trade 사용자).

## Next Phase Readiness

- **37-15(server):** 위 계약 표 그대로 — `X-Tickgw-Secret` · 헤더 6종 · 409 `{epoch}` · state/queue 그대로 중계. `X-Tick-Complete` 는 `"true"/"false"` 문자열.
- **37-12(승격):** `export` 는 closed 키만 · `closed_through_ns` ≥ 그날 20:00:00 KST · `export/bytes` 는 이어붙인 zstd 프레임 원본 — **`splitZstdFrames`(37-02)로 프레임별 해제 필요**(Node zstd 는 첫 프레임만 푼다). date ≠ KST 오늘이면 400 `DATE_MISMATCH`.
- **37-17:** 119 회신 차이는 `tickgw/src/indexer.ts`(인자 · JSON 키 · 종료코드)만 고친다. 순서: setup-tickgw-iam(사용자 `!`) → install.sh(지문) → 119 등록(gh-trade) → deploy-tickgw.sh → server 결선 → push. 20:01 이후 처음 기동한 날은 그날 승격 입력이 없다(마무리는 하루 한 번).

---
*Phase: 37-tick-viewer*
*Completed: 2026-11-02*

## Self-Check: PASSED

- FOUND: key-files.created 17개 전부(`ls` 17건)
- FOUND: 커밋 09460d0d · 3cb1a8e9 · 49d69f72 · e8dcbeb4 (`git log 657af817..HEAD`)
- 수용 기준: Task 1(workspace · name · dependencies 0 · ControlMaster · timingSafeEqual · live 경로) · Task 2(Dockerfile 5 · export · DATE_MISMATCH · closeSweep) · Task 3(공개키 cat 0 · 08:00 · /dev/shm · verify 사슬) 전부 PASS
- 플랜 verification: tickgw 전체 vitest 39/39 · Task 3 verify exit 0
- STATE.md · ROADMAP.md · state.json 미수정
