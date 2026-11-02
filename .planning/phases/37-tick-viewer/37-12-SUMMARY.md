---
phase: 37-tick-viewer
plan: 12
subsystem: worker
status: complete
tags: [tick-convert, promote, tickgw, zstd, cloud-run-job, scheduler, direct-vpc]

requires:
  - phase: 37-tick-viewer (37-01)
    provides: "저장처: supabase-storage (precondition 통과)"
  - phase: 37-tick-viewer (37-02)
    provides: "splitZstdFrames · concatBytes · iterRecords · DayRateTracker — Node zstd 첫 프레임 함정 회피"
  - phase: 37-tick-viewer (37-04)
    provides: "tick_grid_upsert('promoted') 모드 규칙(promoted 는 promoted 위에만 · 반환 = 쓴 행 수) · tick_convert_run_record"
  - phase: 37-tick-viewer (37-05)
    provides: "dayStartNs(ymd, hhmm) — 08:00 · 20:00 KST 경계"
  - phase: 37-tick-viewer (37-09)
    provides: "tickgw GET /internal/ticks/export · /export/bytes · X-Tickgw-Secret · DATE_MISMATCH · closed 키만"
  - phase: 37-tick-viewer (37-18)
    provides: "MODES 표 · parseArgv · ENTRYPOINT/CMD 분리 · deploy-tick-convert.sh 구조 · entry.test.ts"
provides:
  - "CLI `promote [--date YYYYMMDD]` — runPromote · parsePromoteArgs · closeNs · decompressFrames (src/modes/promote.ts)"
  - "tickgw export 클라이언트 createTickgwExportClient · TickgwExportKey · TickgwExportList · TickgwDateMismatchError (src/tickgw-export.ts)"
  - "Config.tickgwUrl · tickgwSecret · ConfigError(종료 2) · checkTickgwUrl · requireTickgw · loadConfig({mode}) — promote 는 TICK_ARCHIVE_DIR 불필요"
  - "테스트 헬퍼 tests/helpers/fake-tickgw.ts — node:http 가짜 tickgw(두 zstd 프레임 이어붙인 바이트)"
  - "deploy-tick-convert.sh Section 7b — TICKGW_URL 이 있을 때만 Job gh-radar-tick-convert-promote + Scheduler 20:10 · 20:40 평일"
  - "ops/alert-tick-convert-failure.yaml — 승격 Job 실패도 알림(one_of)"
affects: [37-15, 37-16, 37-17, 37-19]

actuals:
  tokens: 14900      # chars/4 over git diff f7c86598..daa069a8 (59,718B · 한글 다바이트 포함 — 상한 쪽 근사)
  tasks: 2
  commits: 2         # MEASURED: git rev-list --count f7c86598..HEAD (SUMMARY 커밋 제외)
plan_head_before: f7c86598f348f21f123d8454f9be7ad0cf553abe
plan_head_after: daa069a838f838d4c2b2ebfe169b853fb74ca348

tech-stack:
  added: []
  patterns:
    - "승격본 = 하루치 전체 또는 없음 — tickgw closed(37-09) + 워커 재확인(응답 date · closed_through ≥ 20:00 · 첫 recv ≥ 08:00 · 레코드 수 · 잘린 꼬리) 두 겹"
    - "완결 재확인 1(closed_through)은 바이트를 받기 전에 — 잘린 키는 전송도 하지 않는다"
    - "키별 upsert([row]) — 반환 0 을 그 키의 skipped(nightly/request 우선)로 셀 수 있게"
    - "사설 대역 URL 가드는 접두사 정규식 + URL 파싱 hostname 재검사(userinfo 바꿔치기 차단)"
    - "가짜 tickgw 는 진짜 node:http — 클라이언트의 fetch · 헤더 · 상태 코드 경로를 그대로 탄다"

key-files:
  created:
    - workers/tick-convert/src/tickgw-export.ts
    - workers/tick-convert/src/modes/promote.ts
    - workers/tick-convert/tests/promote.test.ts
    - workers/tick-convert/tests/helpers/fake-tickgw.ts
  modified:
    - workers/tick-convert/src/config.ts
    - workers/tick-convert/src/index.ts
    - workers/tick-convert/tests/entry.test.ts
    - scripts/deploy-tick-convert.sh
    - ops/alert-tick-convert-failure.yaml

key-decisions:
  - "promote 설정 오류(공인 TICKGW_URL · TICKGW 설정 없음)는 ConfigError → 종료 2(인자 오류와 같은 급). 주입한 Config 도 runPromote 가 requireTickgw 로 같은 검사를 한다"
  - "TICKGW_URL 가드는 접두사 `^http://(10\\.|127\\.)` 에 더해 URL 파싱 hostname 이 IPv4 10./127. 인지 다시 본다 — `http://10.0.0.5@evil.example` 같은 userinfo 바꿔치기를 막는다. 배포 스크립트는 Cloud Run 에서 닿는 10. 만 받는다"
  - "promote 는 TICK_ARCHIVE_DIR 를 요구하지 않는다 — 승격 Job 은 GCS 볼륨이 없다(loadConfig({mode}))"
  - "레코드 0 · 잘린 꼬리도 incomplete 로 센다(재확인 항목 추가) — 승격 안 함"
  - "실행 기록은 두 거래소 모두 남긴다(키가 0 이어도) — nightly 날짜 고르기는 mode='nightly' 만 보므로 승격 기록이 nightly 를 막지 않는다(nightly.ts:82 확인)"
  - "upsert 반환 0(skipped)이어도 promoted 객체는 이미 올라가 있다 — 모드별 경로라 무해(메타가 가리키지 않음 · 90일 purge 가 날짜 폴더째 지운다 · store.ts 순서 계약)"

patterns-established:
  - "승격 시험: 같은 export 로 두 번 실행 → 같은 경로 · 같은 바이트 · upsert 1 · 첫 실행 뒤 closed 가 된 키는 두 번째에만 written"

requirements-completed: [D-04, D-07]

coverage:
  - id: D1
    description: "promote 트레이서 — 가짜 tickgw(closed 키 · 두 zstd 프레임) → 응답 date 일치 → 완결 재확인 → 다중 프레임 해제 → level 9 한 프레임 재압축 → promoted 경로 업로드 → tick_grid_upsert('promoted', sources ['promoted']) → 거래소별 실행 기록 → 종료 0"
    requirement: D-07
    verification:
      - kind: unit
        ref: "workers/tick-convert/tests/promote.test.ts#runPromote 트레이서"
        status: pass
    human_judgment: false
  - id: D2
    description: "하루치 전체가 아니면 승격 안 함 — closed_through 19:59:59 → incomplete(바이트 요청 0) · 정확히 20:00 통과 · 레코드 수 불일치 · 첫 recv < 08:00 → incomplete · 응답 date 불일치 → run 실패 · main 1"
    requirement: D-07
    verification:
      - kind: unit
        ref: "workers/tick-convert/tests/promote.test.ts#완결 재확인"
        status: pass
    human_judgment: false
  - id: D3
    description: "nightly 우선 — upsert 반환 0 → skipped(실패 아님) · 두 번 실행 멱등(20:10 · 20:40)"
    requirement: D-04
    verification:
      - kind: unit
        ref: "workers/tick-convert/tests/promote.test.ts#두 번 실행 멱등"
        status: pass
    human_judgment: false
  - id: D4
    description: "실패 격리 · 가드 — 키 bytes 500 · 업로드 실패는 그 키만 · 401 → run 실패 · 비밀 로그 0 · 공인/userinfo TICKGW_URL → 종료 2 · TICKGW 설정 없음 → 종료 2 · 경계 리터럴 두 값 · entry promote"
    requirement: D-07
    verification:
      - kind: unit
        ref: "workers/tick-convert/tests/promote.test.ts · tests/entry.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "배포 스크립트 승격 절 — TICKGW_URL 조건 안에서만 Job · Scheduler 20:10/20:40 · VPC private-ranges-only · TICKGW_SECRET (작성만 · 실행은 37-17)"
    requirement: D-07
    verification:
      - kind: other
        ref: "bash -n scripts/deploy-tick-convert.sh + grep 6건 + TICKGW_URL 정규식 단독 시험"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-11-02
---

# Phase 37 Plan 12: 20:00 승격 — 당일 캐시 → 그날 격자 Summary

**`promote [--date D]` 모드를 만들었다. tickgw export 의 closed 키를 받아 다시 확인한다. 응답 date 일치, closed_through ≥ 20:00 KST, 첫 recv ≥ 08:00, 레코드 수 일치, 잘린 꼬리 없음이 다 맞는 키만 이어붙인 zstd 프레임을 풀어 level 9 한 프레임으로 다시 압축한다. 그 결과를 `grid/<D>/<EX>/<isin>.promoted.ticks.zst` 에 올리고 `tick_grid_upsert('promoted')` 로 등록한다. nightly · request 격자가 있으면 건너뛴다. 배포 스크립트에는 TICKGW_URL 이 있을 때만 승격 Job 과 Scheduler 20:10 · 20:40 을 만드는 절을 더했다(작성만 · 실행 안 함).**

## Performance

- **Duration:** 약 25분
- **Started:** 2026-11-02T11:20Z 무렵
- **Completed:** 2026-11-02
- **Tasks:** 2/2
- **Files:** 새로 만든 파일 4 · 고친 파일 5

## Accomplishments

- **runPromote** 는 다음 순서로 돈다: export 목록 → 응답 date 확인 → 키마다 격리 처리 → 거래소별 실행 기록(mode promoted) → 요약 로그 한 줄.
  - 요약 로그 형식: `[tick-convert] mode=promote date=… keys=… written=… skipped=… incomplete=… unclosed=… failed=… bytes_read=… ms=…`
- **하루치 전체 또는 없음:** 두 겹으로 지킨다. tickgw 는 closed 키만 내보내고, 워커가 그 키를 다시 확인한다.
  - 마감 시각이 모자란 키는 바이트를 받기 전에 걸러진다.
  - 걸러진 키는 업로드도 upsert 도 하지 않는다. 그래서 잘린 하루가 `grid_ready` 로 요청 변환을 막는 일이 없다.
- **다중 프레임:** `splitZstdFrames` 로 나눠 프레임마다 푼다. 시험이 확인한 내용:
  - Node `zstdDecompressSync` 를 한 번만 부르면 첫 프레임만 나온다.
  - 이 모드가 내는 결과는 원래 레코드와 같다.
- **nightly 우선:** upsert 가 0 을 돌려주면 skipped 로 세고 실패로 치지 않는다. 밤 변환본이 나중에 승격본을 덮는다.
- **설정 가드:** `TICKGW_URL` 은 사설 대역만 받는다. 접두사 정규식에 더해 URL 을 파싱한 hostname 을 다시 보므로 userinfo 바꿔치기가 막힌다.
  - promote 모드에서 TICKGW 설정이 없으면 종료 2 다.
  - promote 는 `TICK_ARCHIVE_DIR` 이 필요 없다.

## 테스트

- 플랜 verify 를 돌렸다: `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/tick-convert run typecheck && … vitest run tests/promote.test.ts --maxWorkers=2`. exit 0, **promote 21/21** 통과.
- 워커 전체 vitest 는 **7 파일 104 테스트**가 통과했다.
  - 새로 더한 시험: promote 21, entry +1(promote 오버라이드 → `node dist/index.js promote`)
  - 37-06 · 37-18 회귀: request 24 · nightly 15 · archive 23 · config 11 · purge 4 · entry 5, 회귀 0
- 경계 리터럴은 37-09 tickgw `kstDayStartNs` 시험과 같은 값이다.
  - `dayStartNs("20261030")` = `1793314800000000000n`
  - `dayStartNs("20261030", "2000")` = `1793358000000000000n`
- 돌연변이로 시험을 확인했다(스크래치 사본으로 원복, `cmp` 로 동일함 확인):

  | 돌연변이 | 결과 |
  |---|---|
  | closed 비교 `<` → `<=` | 1건 빨강(정확히 20:00 통과 시험) |
  | 레코드 수 검사 제거 | 1건 빨강 |
  | 응답 date 검사 제거 | 1건 빨강 |
  | `splitZstdFrames` 제거(첫 프레임만 풀기) | 11건 빨강 |

## 배포 스크립트 변경 (작성만 · 실행 안 함 — 실행은 37-17)

- **머리 주석:** 승격 절 설명을 넣었다. 20:40 두 번째 실행이 왜 필요한지(승격 누락 방지)도 적었다. 선택 env `TICKGW_URL` 과 선행 `setup-tickgw-iam.sh` 를 추가했다.
- **Section 1:** `TICKGW_URL` 이 있으면 `^http://10.x.x.x[:port]/?$` 만 받는다. 빌드 · push 전에 거른다.
  - 단독 시험: `10.146.0.2:8092` 는 통과했다.
  - `8.8.8.8` · userinfo · `https` · `127.` 은 거부됐다.
- **Section 7b(알림 뒤):** 전체가 `if [[ -n "${TICKGW_URL:-}" ]]` 안에 있다. 하는 일은 다음 순서다.
  1. VPC `gh-radar-vpc` 와 Secret `gh-radar-tickgw-secret` 이 있는지 확인한다.
  2. Job SA 에 그 Secret 만 accessor 를 준다(멱등).
  3. Job `gh-radar-tick-convert-promote` 를 배포한다. 설정: cpu 1 · 2Gi · 1800s · max-retries 0 · `--network=gh-radar-vpc --subnet=gh-radar-subnet-an3 --vpc-egress=private-ranges-only` · `--args=promote`.
     - env: `SUPABASE_URL` · `LOG_LEVEL` · `APP_VERSION` · `TICKGW_URL` · `TICK_KEEP_DAYS` · `NODE_OPTIONS`
     - secret: `SUPABASE_SERVICE_ROLE_KEY` · `TICKGW_SECRET`
  4. scheduler SA 에 run.invoker 를 준다.
  5. Scheduler 두 개를 만든다: `gh-radar-tick-convert-promote`(`10 20 * * 1-5`)와 `gh-radar-tick-convert-promote-late`(`40 20 * * 1-5`), 시간대 Asia/Seoul.
  - `TICKGW_URL` 이 없으면 「승격 Job 건너뜀 — TICKGW_URL 미설정(당일 경로 꺼짐 · D-22)」을 출력한다.
- **Section 8:** 완료 출력에 `Promote:` 줄을 더했다.
- 이 플랜은 `gcloud` · `docker` · `supabase db push` · `git push` 를 하나도 실행하지 않았다.

## Task Commits

1. **Task 1 (tracer): 승격 모드 트레이서** — `849c2abf` (feat)
   - 트레이서 게이트(자동 verify 만 있는 경우)에서 verify 를 다시 돌렸고 exit 0 이었다. 그래서 확장으로 넘어갔다.
2. **Task 2: 승격 Job · Scheduler(TICKGW_URL 조건) + 알림 필터** — `daa069a8` (chore)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 알림 누락] 실패 알림 정책이 승격 Job 을 보지 않았다**
- **Found during:** Task 2
- **Issue:** `ops/alert-tick-convert-failure.yaml` 필터가 `job_name = "gh-radar-tick-convert"` 하나뿐이었다. 그래서 승격 Job 이 종료 1 로 끝나도(401 · 날짜 불일치 · 키 실패) 알림이 울리지 않는다.
- **Fix:** 필터를 `one_of("gh-radar-tick-convert", "gh-radar-tick-convert-promote")` 로 바꾸고 문서에 promote 종료 코드를 더했다. 승격 Job 이 아직 없으면 그 시계열이 없을 뿐이라 무해하다.
- **Files modified:** ops/alert-tick-convert-failure.yaml (플랜 files_modified 밖)
- **Commit:** `daa069a8`

**2. [Rule 2 - 보안] TICKGW_URL 접두사 가드 우회**
- **Found during:** Task 1
- **Issue:** 플랜의 `^http://(10\.|127\.)` 접두사만 보면 `http://10.0.0.5@evil.example` 이 통과한다. userinfo 때문에 실제 호스트는 evil.example 이고, 그 호스트로 비밀 헤더가 나간다.
- **Fix:** 접두사를 본 뒤 `new URL` 로 파싱한다. hostname 이 IPv4 `10.` 또는 `127.` 이고 userinfo · query · hash 가 없을 때만 받는다. 시험이 4종(공인 · https · userinfo · `10.evil.example`)을 종료 2 로 단언한다.
- **Commit:** `849c2abf`

**3. [Rule 3 - 막힘] promote 가 TICK_ARCHIVE_DIR 를 요구했다**
- **Found during:** Task 1
- **Issue:** `loadConfig()` 는 dry-run 이 아니면 `TICK_ARCHIVE_DIR` 이 필수다. 그런데 플랜의 승격 Job env 에는 그 값이 없다(GCS 볼륨 없음). 그대로면 승격 Job 이 첫 실행에서 실패한다.
- **Fix:** `loadConfig({ mode })` 로 바꿨다. promote 일 때는 `TICK_ARCHIVE_DIR` 을 요구하지 않는다. 시험 「promote 는 TICK_ARCHIVE_DIR 없이 돈다」가 env 경로를 끝까지 확인한다.
- **Commit:** `849c2abf`

### 작은 조정

- 재확인 2 에 두 항목을 더했다. 「레코드 0」과 「잘린 꼬리(마지막 온전한 레코드 끝 ≠ 해제 길이)」도 incomplete 다.
- `runPromote(deps, args)` 의 deps 는 `JobDeps & { tickgw?: TickgwExportClient }` 다. 클라이언트를 주입할 수 있게 했지만, 시험은 진짜 node:http 가짜 tickgw 를 쓴다.
- upsert 는 키마다 한 번 부른다(`[row]`). 반환 0 을 그 키의 skipped 로 세기 위해서다.
- `ConfigError` 를 새로 만들었다. main 은 이것을 `UsageError` 와 같이 종료 2 로 다룬다.

---

**Total deviations:** 자동 수정 3건(Rule 2 ×2 · Rule 3 ×1). 범위 확대는 알림 YAML 필터 한 줄뿐이다.

## Known Stubs

없다(TODO · FIXME · placeholder grep 0건).

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: outbound-secret-header | workers/tick-convert/src/tickgw-export.ts | Job → radar-gw 내부 HTTP 에 `X-Tickgw-Secret` 을 싣는다. 사설 대역 · hostname 재검사로 대상을 묶었다. 오류 메시지 · 로그에는 비밀이 없다(시험이 단언). |

## Issues Encountered

- 워크트리 격리 쉘이 복합 git 명령(`$(git rev-parse …)` 포함 · 반복문 안의 bash 정규식)을 거부했다. 그래서 명령을 쪼개 돌렸다.
  - 플랜 커밋 원장 파일 대신 base `f7c86598` 을 직접 원장 값으로 썼다(`git rev-list --count f7c86598..HEAD` = 2).
  - 정규식 단독 시험은 스크래치 스크립트로 돌렸다.
- `tsconfig.json` 의 include 가 `src` 뿐이다. 그래서 시험 파일은 typecheck 대상이 아니고 vitest(esbuild)로만 확인된다. 기존 관례 그대로다.

## Next Phase Readiness

- **37-17(메인 세션 · 당일 경로 켜기):** 다음 순서로 진행한다.
  1. `bash scripts/setup-tickgw-iam.sh`
  2. tickgw 배포
  3. `TICKGW_URL=http://<radar-gw 내부 IP>:8092 SUPABASE_URL=… NOTIFICATION_CHANNEL_ID=… GCP_PROJECT_ID=gh-radar bash scripts/deploy-tick-convert.sh`. 이 실행이 승격 Job 과 Scheduler 두 개를 만들고, 알림 정책 필터도 갱신된다.
  - 첫 승격 스모크는 tickgw 가 08:00 이전부터 떠 있던 평일 20:10 이후에 한다. 방법: `gcloud run jobs execute gh-radar-tick-convert-promote --wait` 로 돌리고 로그에서 `[tick-convert] mode=promote … unclosed=` 줄을 본다.
  - 20:01 이후 처음 뜬 tickgw 는 그날 승격할 데이터가 없다(37-09).
- **37-15(server):** `X-Tickgw-Secret` 과 사설 대역 가드는 같은 정신이다. 이 플랜의 `checkTickgwUrl` hostname 재검사를 server 쪽에도 맞추는 것을 권한다.

## Self-Check: PASSED

- FOUND: workers/tick-convert/src/{tickgw-export.ts, modes/promote.ts} · tests/{promote.test.ts, helpers/fake-tickgw.ts}
- FOUND: 커밋 `849c2abf` · `daa069a8` (HEAD 조상)
- 수용 기준: Task 1 grep 5건 · Task 2 verify 사슬(`bash -n` + grep 6건) 전부 PASS
- 워커 전체 vitest 104/104 · typecheck 통과
- STATE.md · ROADMAP.md · state.json 미수정
