---
phase: 15-dma-relay-kb-gh-trade-server-10-wss
plan: 05
subsystem: api
tags: [entrypoint, graceful-shutdown, express, healthz, timing-safe, docker, multi-stage, non-root, aes-256-gcm, admin-script, dev-tooling]

# Dependency graph
requires:
  - phase: 15-01
    provides: "relay 워크스페이스 · config(loadConfig) · logger(redact) · vitest 설정"
  - phase: 15-03
    provides: "SessionManager(acquire/release/closeAll/stats) · DmaSession · DmaClient"
  - phase: 15-04
    provides: "SubscriptionHub(closeAll) · WsFanout · createRelaySupabase · encryptDmaPassword"
  - phase: 15-06
    provides: "infra/relay/Caddyfile(/healthz → 8091, 기본 라우트 → 8090) · setup-relay-iam.sh"
  - phase: 15-07
    provides: "실가동 VM radar-gw · Secret 3종 실체화 · dma.jx1.io TLS 종단"
provides:
  - "relay/src/index.ts — 부팅 결선(config→supabase→SessionManager→Hub→WsFanout→OrderApi) + 4단계 graceful shutdown + 5초 데드맨 + unhandled 핸들러"
  - "relay/src/order/order-api.ts — createOrderApi(): /healthz(공개) + X-Relay-Secret 상수시간 관문 + {error:{code,message}} envelope"
  - "relay/Dockerfile + Dockerfile.dockerignore — amd64 멀티스테이지 pnpm deploy · non-root · GIT_SHA 주입 (빌드 실증)"
  - "scripts/dma-credentials.ts — 관리자 수기 자격증명 등록(AES-GCM upsert · stdin 전용 비밀번호 · --list)"
  - "WsFanout.handleUpgrade() 공개 · WsFanout.closeAll(code) 정상 close 프레임 경로"
  - "dev.sh --with-relay opt-in + 로컬 포트 규약(3100/8080/8090/8091) 문서화"
  - "relay/README.md — mock 기동 절차 · env 표 · D-27 실서버 경고 · 자격증명 등록법"
affects: [15-08, 15-09, 15-10, 15-14, 15-16, 15-17, 15-19, 15-20]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "안전한 쪽이 기본값이다 — DMA_HOST 기본값을 실서버가 아니라 로컬 mock 으로 두면 env 를 깜빡한 실행이 사고가 되지 않는다"
    - "장기 연결 프로세스의 종료는 절차다 — 새 연결 차단 → 정상 close 프레임 → 업스트림 정리 → 타이머 회수, 그리고 데드맨"
    - "인증 실패 응답은 아무것도 설명하지 않는다 — 사유를 친절히 알려 주는 것이 곧 오라클이다"
    - "공개 헬스 페이로드는 필드 화이트리스트를 테스트로 고정한다 — 필드가 느는 순간 테스트가 먼저 깨져야 한다"
    - "부팅 결선 파일이 포트 라우팅을 전부 쥔다 — 한 포트의 업그레이드/평문 분기를 두 모듈이 나눠 갖지 않는다"

key-files:
  created:
    - relay/src/index.ts
    - relay/src/order/order-api.ts
    - relay/tests/order-api.test.ts
    - relay/Dockerfile
    - relay/.dockerignore
    - relay/Dockerfile.dockerignore
    - relay/README.md
    - scripts/dma-credentials.ts
  modified:
    - relay/src/ws/fanout.ts
    - relay/src/config.ts
    - relay/package.json
    - dev.sh

key-decisions:
  - "WsFanout.deps.server 를 선택으로 완화하고 handleUpgrade 를 공개 — 8090 서버는 업그레이드뿐 아니라 Caddy 가 넘기는 평문 HTTP 에도 응답해야 하므로 라우팅 결정을 부팅 결선이 전부 쥔다"
  - "종료 시 terminate 가 아니라 close(1001) 를 먼저 보낸다 — 프레임 없이 끊으면 브라우저가 즉시 재접속을 시도하는데 그 시점의 컨테이너는 아직 내려가는 중이라 백오프만 벌어진다"
  - "config.ts 의 DMA_HOST 기본값을 10.41.1.120 → 127.0.0.1 로 뒤집었다 (T-15-25 mitigate) — 실서버를 기본값으로 두는 한 '깜빡함'이 곧 실계좌 접속이다"
  - "/healthz 의 vpn 과 dma 를 같은 신호에서 파생시켰다 — 능동 TCP 프로브를 두면 아무도 접속하지 않은 시간에도 KB 게이트웨이로 주기 트래픽이 나가고 그것은 D-27 과 정면으로 어긋난다"
  - "degraded 를 HTTP 503 으로 내린다 — 본문만 바꾸면 Cloud Monitoring uptime check 가 내부 장애를 영원히 못 잡는다 (Assumption A7)"
  - "relay/package.json 에 files:[\"dist\"] 를 명시 — pnpm deploy 가 .npmignore 부재 시 .gitignore 를 대신 읽어 dist 를 통째로 제외한다"
  - "테스트를 supertest 가 아니라 실제 http.Server + fetch 로 짰다 — relay 의 devDependency 를 늘리지 않고, 헤더 부재/오타/길이 불일치는 실제 왕복으로 봐야 의미가 있다"

patterns-established:
  - "비밀번호 프롬프트는 raw 모드로 직접 읽는다 — readline 의 출력 억제는 내부 API(_writeToOutput) 의존이라 깨지기 쉽다"
  - "파이프 입력은 한 번에 전부 읽어 줄 큐로 나눠 준다 — stdin 은 end 이후 재독이 불가라 두 번째 프롬프트가 영원히 대기한다"
  - "루트 scripts/ 의 tsx 스크립트는 bare import 를 쓰지 않는다 — 저장소 루트에 node_modules 가 없어 어떤 cwd 로 실행해도 해석되지 않는다. 워크스페이스 모듈을 상대 경로로 경유한다"

requirements-completed: [RELAY-01, RELAY-03]

# Metrics
duration: 83min
completed: 2026-09-06
---

# Phase 15 Plan 05: relay 실행 가능 프로세스 완성 (부팅·종료·컨테이너·관리 도구) Summary

**흩어져 있던 relay 모듈들을 실제로 뜨고 내려가는 프로세스로 묶고, 내부 HTTP 관문·amd64 컨테이너·관리자 자격증명 등록 경로까지 세워 "인프라 없이 로컬에서 완전 검증 가능한" 마지막 지점(D-40)에 도달했다 — 부팅→서비스→SIGTERM 정리와 컨테이너 기동을 실측으로 증명했다.**

## Performance

- **Duration:** 약 83분
- **Started:** 2026-09-05T14:03Z
- **Completed:** 2026-09-05T15:26Z
- **Tasks:** 3/3
- **Files:** 12 (신규 8 · 수정 4)

## Accomplishments

- **relay 가 실제로 뜬다.** 15-04 까지는 "`WsFanout`/`SubscriptionHub` 를 생성하는 코드가 없어 프로세스를 띄워도 wss 가 열리지 않는" 상태였다(15-04 Known Stubs). 이제 `node dist/index.js` 가 8090/8091 을 열고, `/healthz` 200 · 비밀 없는 내부 경로 401 · 올바른 비밀 404 도달 · 8090 평문 GET 404 를 **실측으로 확인**했다.
- **종료가 절차가 됐다 (SC-8).** SIGTERM → HTTP 2개 close → wss `close(1001)` → `sessionManager.closeAll()` → `hub.closeAll()` → exit(0) 이 로그로 확인된다. 5초 데드맨이 있어 소켓 사정에 매달리지 않는다. `--restart=always` 재시작마다 KB 게이트웨이에 고아 세션이 쌓이는 경로(T-15-24)를 닫았다.
- **공유 비밀이 상수시간으로 검증된다 (T-15-06).** `crypto.timingSafeEqual` + 길이 선검사. 401 응답 본문은 `{error:{code:"UNAUTHORIZED_RELAY",message:"Unauthorized"}}` 고정이고 기대값도, 그 조각도, 요청 본문도 싣지 않는다 — 테스트가 응답 원문에 비밀 문자열이 없음을 직접 단언한다.
- **공개 `/healthz` 가 아무것도 흘리지 않는다 (T-15-22).** 페이로드 키를 화이트리스트(`dma`/`sessionCount`/`status`/`version`/`vpn`)로 **테스트가 고정**했다. 필드를 늘리는 순간 테스트가 먼저 깨진다. 소스에 `accountNo`/`account_no` 문자열이 0건이다.
- **amd64 이미지가 빌드되고 non-root 로 돈다 (T-15-23).** 컨테이너를 실제로 띄워 `uid=100(app)` 확인, `/healthz` 200 응답, `docker stop` 시 즉시 정상 종료를 확인했다. `pnpm deploy --prod` 라 dev 의존성이 최종 이미지에 없다.
- **자격증명 등록 경로가 실동작한다 (T-15-05).** 가짜 Supabase 스텁을 세워 등록 왕복을 실측했다 — 비밀번호는 화면에 표시되지 않고, DB 로 간 값은 **암호문**이며, 로그 어디에도 평문이 없음을 확인했다(스텁 로그에 평문 0건). `--list` 도 동작한다.
- **로컬 실행이 실서버에 붙지 않는다 (T-15-25).** `DMA_HOST` 기본값을 실서버에서 로컬 mock 으로 뒤집었다. 이것이 이 plan 에서 가장 실질적인 안전 개선이다 — 종전에는 relay 를 로컬에서 env 없이 띄우면 곧장 KB 사내망 게이트웨이로 향했다.

## Task Commits

| Task | 내용 | Commit | Type |
|------|------|--------|------|
| 2 | 내부 HTTP — `/healthz` + `X-Relay-Secret` 상수시간 관문 | `369d8a3` | feat |
| 1 | 부팅 결선 + graceful shutdown (+ `WsFanout` 결선 API) | `b1b31f3` | feat |
| 3 | Dockerfile · 자격증명 스크립트 · dev.sh · README | `653b9de` | feat |

> **실행 순서는 2 → 1 → 3 이다.** Task 1 의 `index.ts` 가 Task 2 의 `createOrderApi` 를 import 하므로 Task 2 를 먼저 만들지 않으면 Task 1 의 acceptance(빌드 성공)를 만족할 수 없다. 두 태스크의 내용은 그대로이고 순서만 의존 방향에 맞췄다.

## Files Created/Modified

| 파일 | 역할 |
|------|------|
| `relay/src/index.ts` | 부팅 결선 · 8090 서버(업그레이드 + 평문 404) · 8091 listen · 4단계 종료 + 5초 데드맨 · unhandledRejection/uncaughtException |
| `relay/src/order/order-api.ts` | `createOrderApi()` · `relaySecretGuard`(timingSafeEqual) · `/healthz` · `RelayApiError` · 404 + errorHandler · `TODO(D-25)` 마커 |
| `relay/tests/order-api.test.ts` | 10건 — healthz 무비밀 200 · 키 화이트리스트 · 비밀 부재/오타/길이불일치 401 · 정상 비밀 404 도달 · 세션 0 ok · Ready 0 → 503 · 전 메서드 관문 |
| `relay/Dockerfile` | 멀티스테이지 · `corepack prepare pnpm@10` · `USER app` · `EXPOSE 8090 8091` · `CMD dist/index.js` · `ARG GIT_SHA` |
| `relay/.dockerignore` | 컨텍스트가 relay/ 인 경우용 (server/ 관례 동형) |
| `relay/Dockerfile.dockerignore` | **루트 컨텍스트 빌드에서 BuildKit 이 실제로 읽는 이름** — `.env` 가 builder 레이어까지 따라가는 것을 차단 |
| `scripts/dma-credentials.ts` | 인자 파싱 · raw 모드 비밀번호 프롬프트(2회 확인) · 파이프 줄 큐 · `DMA_CRED_KEY`→Secret Manager · 이메일→user_id 페이징 조회 · AES-GCM upsert · `--list` |
| `relay/README.md` | D-27 실서버 경고 · mock 기동 절차(9100 충돌 대처 포함) · env 표 2종 · 자격증명 등록법 · 컨테이너 · 디렉터리 구조 |
| `relay/src/ws/fanout.ts` | **수정** — `handleUpgrade` 공개, `deps.server` 선택화, `closeAll(code)` 추가(정상 close 프레임 + 250ms 후 잔여 terminate), `close()` 별칭 유지 |
| `relay/src/config.ts` | **수정** — `DMA_HOST` 기본값 `10.41.1.120` → `127.0.0.1` (T-15-25) |
| `relay/package.json` | **수정** — `files: ["dist"]` 추가 (pnpm deploy 가 dist 를 빠뜨리던 문제) |
| `dev.sh` | **수정** — 8090/8091 kill 추가 · `--with-relay` opt-in · 포트 규약 헤더 주석 · relay 기동 블록 |

## Decisions Made

**1. `WsFanout` 의 결선 방식을 바꿨다 — plan 의 `<interfaces>` 가 실제와 달랐다.**
plan 은 `WsFanout` 이 `handleUpgrade(req, socket, head)` 와 `closeAll(code)` 를 공개한다고 적었으나, 15-04 의 실제 산출물은 **생성자가 `deps.server` 에 `upgrade` 리스너를 스스로 붙이고** `close()`(즉시 terminate)만 노출한다. 15-04 가 `DmaSession` 이벤트에서 겪은 것과 같은 종류의 예측 오차다.

그대로 두고 index.ts 가 생성자 부작용에 의존하게 만들 수도 있었지만, **8090 서버는 업그레이드만 받는 게 아니다** — Caddy 는 `dma.jx1.io` 의 기본 라우트를 전부 8090 으로 넘기므로 평문 GET 도 온다. `request` 핸들러가 없으면 그 요청이 응답 없이 소켓을 붙들다 타임아웃난다. 한 포트의 라우팅(업그레이드 vs 평문)을 두 모듈이 나눠 갖는 구조가 되므로, `deps.server` 를 **선택**으로 완화하고 부팅 결선이 둘 다 쥐게 했다. 15-04 테스트 하네스는 `server` 를 계속 넘기므로 12건이 그대로 통과한다.

**2. 종료는 `terminate` 가 아니라 `close(1001)` 로 시작한다.**
`close()` 는 close 프레임 없이 TCP 를 끊는다. 브라우저 훅(15-12)은 비정상 단절을 재접속 신호로 보므로, 배포 중 컨테이너가 내려가는 **바로 그 순간** 모든 탭이 재접속을 시도하고 전부 실패해 백오프만 벌어진다. `1001 going away` 를 먼저 보내면 "서버가 의도적으로 내려간다"가 전달된다. close 프레임이 실제로 나가려면 이벤트 루프가 한 바퀴 돌아야 하므로 250ms 만 기다린 뒤 잔여 소켓을 terminate 한다.

**3. `/healthz` 의 `vpn` 과 `dma` 는 같은 신호에서 나온다 — 그리고 그것을 숨기지 않았다.**
plan 은 `vpn` 을 "게이트웨이 TCP 도달성 최근 결과로 근사"하라고 했다. 정확히 하려면 주기적 TCP connect 프로브가 필요한데, 그러면 **아무도 접속하지 않은 시간에도 KB 게이트웨이로 주기 트래픽이 나간다.** D-27("실서버 접속은 사용자 지시가 있을 때만")과 정면으로 어긋나므로 능동 프로브를 두지 않았다.

대신 두 값 모두 `sessionCount === 0 || readyCount > 0` 에서 파생시키고, **두 필드가 v1 에서 동일 신호라는 사실을 코드 주석에 명시**했다. 계약 형태(`{status, vpn, dma}`)는 RESEARCH Open Question 4 의 결론이라 유지했다. 능동 프로브는 모니터링 wave 의 몫이다.

**4. `degraded` 는 HTTP 503 이다.**
200 으로 내리면서 본문에만 `"degraded"` 를 적으면 Cloud Monitoring 기본 uptime check 는 본문을 보지 않으므로 컨테이너 내부 장애가 영원히 감지되지 않는다(Assumption A7). 판정 기준은 "**활성 세션이 있는데 Ready 가 0개**"다. 세션이 0개면 게이트웨이에 아무것도 요구하지 않은 상태이므로 `ok` 다 — 아무도 접속하지 않은 장 시작 전이 알람 상태여서는 안 된다.

**한계 기록:** 사용자가 1명뿐이고 그 1명의 자격증명이 틀린 경우(`session_rejected`) 도 `readyCount === 0` 이라 degraded 로 잡힌다. 사용자 단위 문제와 회선 문제를 구분하려면 `SessionManager.stats()` 에 상태 분포가 필요한데, 그 반환 형태는 15-03 테스트가 `toEqual`/`Object.keys` 로 고정하고 있어 이 plan 에서 넓히지 않았다.

**5. 테스트는 supertest 대신 실제 `http.Server` + `fetch` 로 짰다.**
plan 은 supertest 를 지목했지만 relay 에는 없는 의존성이다(server 에만 있다). 15-04 가 세운 relay 테스트 규율은 "이 계층의 리스크는 배선이므로 스텁을 최소화하고 진짜를 쓴다"이고, 헤더 부재·오타·길이 불일치는 실제 HTTP 왕복으로 봐야 의미가 있다. devDependency 를 늘리지 않고 같은(더 강한) 검증을 얻었다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - 블로킹] `WsFanout` 에 `handleUpgrade`·`closeAll` 공개 API 가 없었다**
- **Found during:** Task 1
- **Issue:** plan `<interfaces>` 는 두 메서드를 전제했으나 15-04 실제 산출물에는 없다. 그대로면 index.ts 가 plan 이 요구한 결선·종료를 구현할 수 없다.
- **Fix:** 기존 내부 로직을 공개 메서드 `handleUpgrade()` 로 승격, `deps.server` 를 선택으로 완화, `closeAll(code?, reason?, graceMs?)` 추가(코드를 주면 정상 close 프레임). `close()` 는 별칭으로 남겨 15-04 하네스를 건드리지 않았다.
- **Files modified:** `relay/src/ws/fanout.ts`
- **Commit:** `b1b31f3`

**2. [Rule 3 - 블로킹] `pnpm deploy` 가 `dist` 를 통째로 빼서 이미지 빌드가 실패했다**
- **Found during:** Task 3 (첫 `docker build`)
- **Issue:** `COPY --from=builder /out/dist ./dist` 가 `"/out/dist": not found` 로 실패. 원인은 `relay/.gitignore` 의 `dist/` 다 — 패키지에 `files`/`.npmignore` 가 없으면 pnpm 이 `.gitignore` 를 대신 읽는다. `server/` 는 `.gitignore` 가 **없어서** 우연히 통과하고 있었다.
- **Fix:** `relay/package.json` 에 `"files": ["dist"]` 명시 + 이유를 `//files` 주석으로 박제. 근본 원인 수정이고 배포 대상이 명시적으로 좁혀지는 부수 효과도 있다.
- **Files modified:** `relay/package.json`
- **Commit:** `653b9de`

**3. [Rule 1 - 버그] 파이프 입력 시 두 번째 비밀번호 프롬프트가 영원히 대기했다**
- **Found during:** Task 3 (스크립트 자체 검토)
- **Issue:** stdin 은 `end` 이후 다시 읽을 수 없다. 비-TTY 경로에서 확인 입력을 위해 `readHidden` 을 두 번 부르면 두 번째가 영구 대기한다.
- **Fix:** 비-TTY 에서는 stdin 을 **한 번에 전부 읽어** 줄 큐로 나눠 주고, 확인 입력은 TTY 일 때만 받는다(파이프 값은 이미 확정된 값이라 되물을 대상이 없다).
- **Files modified:** `scripts/dma-credentials.ts`
- **Commit:** `653b9de`

**4. [Rule 3 - 블로킹] 루트 `scripts/` 에서 bare import 가 해석되지 않았다**
- **Found during:** Task 3
- **Issue:** 저장소 루트에는 `node_modules` 가 없다(pnpm 워크스페이스). `scripts/dma-credentials.ts` 가 `@supabase/supabase-js` 를 직접 import 하면 Node 가 파일 위치부터 위로 올라가다 루트에서 실패한다 — **어떤 cwd 로 실행하든** 마찬가지다. plan 의 실행 예시(`pnpm exec tsx scripts/...`)는 루트에 tsx 도 없어 성립하지 않는다.
- **Fix:** 외부 패키지를 직접 import 하지 않고 relay 모듈을 상대 경로로 경유한다(`createRelaySupabase`, `encryptDmaPassword`). 그 안의 bare import 는 `relay/node_modules` 에서 풀린다. 실행 명령도 `pnpm --filter @gh-radar/relay exec tsx ../scripts/dma-credentials.ts` 로 문서화했다. 인계 사항 8("두 번째 crypto 경로를 만들지 말 것")과도 정합한다.
- **Files modified:** `scripts/dma-credentials.ts`
- **Commit:** `653b9de`

**5. [Rule 2 - 위협 완화 누락] `DMA_HOST` 기본값이 실서버였다 (T-15-25)**
- **Found during:** Task 3 (threat register 대조)
- **Issue:** threat register 는 T-15-25 에 "README·**config 기본값**을 로컬 mock 으로 두고 실서버 주소는 배포 env 로만 주입"을 mitigate 로 배정했는데, `relay/src/config.ts` 는 `DMA_HOST` 기본값이 실서버였다. env 를 깜빡한 로컬 실행이 곧바로 KB 사내망 게이트웨이로 향한다.
- **Fix:** 기본값을 `127.0.0.1` 로 뒤집고 사유를 주석에 박제. `dev.sh` 도 `DMA_HOST="${DMA_HOST:-127.0.0.1}"` 로 이중 방어.
- **Files modified:** `relay/src/config.ts`, `dev.sh`
- **Commit:** `653b9de`
- **⚠ 15-08 필수 조치:** 배포 env 가 `DMA_HOST` 를 **반드시 명시**해야 한다. 지금은 미설정 시 조용히 로컬 mock 을 향한다.

**6. [Rule 2 - 보강] `Dockerfile.dockerignore` 추가**
- **Found during:** Task 3
- **Issue:** BuildKit 은 `-f` 로 지정한 Dockerfile 옆의 `<Dockerfile>.dockerignore` 를 먼저 찾고, 없으면 컨텍스트 루트의 `.dockerignore` 를 본다. 루트 컨텍스트 빌드에서 `relay/.dockerignore`(plan 이 지정한 이름)는 **읽히지 않는다** — `server/.dockerignore` 도 같은 이유로 현재 사문이다. 그 결과 저장소 안의 모든 `.env` 가 빌드 컨텍스트에 들어가고 `COPY relay/ ./relay/` 로 builder 레이어까지 따라간다(최종 이미지에는 남지 않지만 빌드 캐시에는 남는다).
- **Fix:** plan 이 요구한 `relay/.dockerignore` 를 그대로 만들되(컨텍스트가 relay/ 인 경우용 + server/ 관례 동형), 실제로 적용되는 `relay/Dockerfile.dockerignore` 를 함께 두고 두 파일 상단에 서로를 가리키는 주석을 달았다.
- **Files modified:** `relay/.dockerignore`, `relay/Dockerfile.dockerignore`
- **Commit:** `653b9de`

### 계획과 다르게 한 것 (사실 정정 — 기능 축소 아님)

| 항목 | plan | 실제 | 이유 |
|------|------|------|------|
| 태스크 실행 순서 | 1 → 2 → 3 | **2 → 1 → 3** | `index.ts` 가 `createOrderApi` 를 import 한다. Task 2 없이는 Task 1 의 빌드 acceptance 자체가 불가능 |
| 테스트 도구 | supertest | 실제 `http.Server` + `fetch` | relay 에 supertest 가 없다. 의존성을 늘리지 않고 실제 HTTP 왕복으로 더 강하게 검증 |
| 테스트 건수 | 7건 이상 | **10건** | 요구 7종 전부 + 전 메서드 관문·degraded 503·Ready>0 ok 3종 추가 |
| 스크립트 실행 명령 | `pnpm exec tsx scripts/…` | `pnpm --filter @gh-radar/relay exec tsx ../scripts/…` | 루트에 `node_modules`·tsx 가 없다(위 deviation 4) |
| Dockerfile 주석 | — | `@gh-radar/server` 문자열 제거 | acceptance(`== 0`)가 주석의 설명 문구까지 세어 코드 의미를 바꾸지 않고 표현만 조정 |

## Verification

### plan `<verification>` 전항목

| 항목 | 결과 |
|------|------|
| `pnpm --filter @gh-radar/relay test` | **exit 0 · 10 files · 134 tests** (15-04 의 124건 + 이 plan 10건) |
| `pnpm --filter @gh-radar/relay run build` | exit 0 · `relay/dist/index.js` 존재 |
| `docker build --platform=linux/amd64 -f relay/Dockerfile -t gh-radar-relay:planbuild .` | exit 0 |
| `bash -n dev.sh` | exit 0 |
| `grep -c 'timingSafeEqual' relay/src/order/order-api.ts` | 5 (요구 ≥1) |
| `pnpm --filter @gh-radar/relay run typecheck` / `typecheck:tests` | exit 0 / exit 0 |

### acceptance grep 실측

| 대상 | 기준 | 실측 |
|------|------|------|
| `index.ts` `handleUpgrade` | == 1 | **1** |
| `index.ts` `SIGTERM` / `closeAll` / `1001` / `unhandledRejection` | ≥1 / ≥2 / ≥1 / ≥1 | 2 / 6 / 3 / 3 |
| `order-api.ts` `healthz` / `TODO(D-25)` | ≥2 / ≥1 | 5 / 1 |
| `order-api.ts` `cors\|rateLimit` / `accountNo\|account_no` | 0 / 0 | **0 / 0** |
| `Dockerfile` `@gh-radar/relay` / `@gh-radar/server` | ≥2 / ==0 | 2 / **0** |
| `Dockerfile` `EXPOSE 8090 8091` / `USER app` / `corepack prepare pnpm@10` | ==1 / ==1 / ==1 | 1 / 1 / 1 |
| `dma-credentials.ts` `gh-radar-dma-cred-key` / `process.argv` | ≥1 / ≥1 | 2 / 1 |
| `dma-credentials.ts` `console.log(.*(plain\|password\|key))` | == 0 | **0** |
| `dev.sh` `8090` / `3100` | ≥1 / ≥1 | 5 / 6 |
| `README.md` `10.41.1.120` (같은 문단에 D-27 경고) | ≥1 | 1 — 제목이 `## 실서버 접속 경고 (D-27)` |
| `README.md` 비밀번호/계정 값 문자열 | == 0 | **0** |

### 런타임 실측 (문서 주장이 아니라 실행 결과)

**호스트 프로세스** — `node dist/index.js`, 포트 18090/18091:

| 확인 | 결과 |
|------|------|
| 부팅 로그 | `{wsPort, orderApiPort, dmaHost, dmaPort, env, version}` — 비밀 필드 0건 |
| `GET /healthz` (비밀 없음) | `200` · `{"status":"ok","vpn":true,"dma":true,"version":"smoke-sha","sessionCount":0}` |
| `POST /internal/orders` (비밀 없음) | `401` · `{"error":{"code":"UNAUTHORIZED_RELAY","message":"Unauthorized"}}` |
| `POST /internal/orders` (정상 비밀) | `404` · `{"error":{"code":"NOT_FOUND",…}}` — 관문 통과 확인 |
| `GET /` (ws 포트 평문) | `404` JSON — 소켓 붙들림 없음 |
| `SIGTERM` | `종료 절차 시작` → `[DMA] 전 세션 종료 완료 {count:0}` → `종료 절차 완료` → 1초 내 exit |

**컨테이너** — `gh-radar-relay:planbuild`:

| 확인 | 결과 |
|------|------|
| 실행 사용자 | `uid=100(app) gid=101(app)` — non-root |
| `/healthz` | `200` |
| `docker stop` | 즉시 종료(10초 유예 미소진) |

**자격증명 스크립트** — 가짜 Supabase 스텁(127.0.0.1:54399) 상대:

| 확인 | 결과 |
|------|------|
| `--password` 인자 | 거부 — "비밀번호는 인자로 받지 않습니다" |
| env 누락 | `SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다` |
| 인자 부족 | usage 출력 후 exit 1 |
| 등록(파이프 비밀번호) | `등록 완료: user_id=…  dma_user_id=alex-radar` — 비밀번호 미표시 |
| DB 로 간 값 | `dma_password_enc` = base64 **암호문** (평문 아님) |
| 평문 유출 | 스텁 로그 전체에서 평문 문자열 **0건** |
| `--list` | 3열(user_id · dma_user_id · updated) 출력, 암호문 컬럼 미조회 |

**dev.sh 인자 회귀** — 기존 사용법이 그대로인지 확인:

| 입력 | MODE | WITH_RELAY |
|------|------|-----------|
| (없음) | `all` | 0 |
| `--webapp-only` | `--webapp-only` | 0 |
| `--server-only --with-relay` | `--server-only` | 1 |
| `--with-relay --webapp-only` | `--webapp-only` | 1 |

## Threat Model 대응

| Threat ID | 대응 | 증거 |
|-----------|------|------|
| T-15-06 (공유 비밀 위조) | `timingSafeEqual` 상수시간 + 길이 선검사 · 401 고정 본문 · 기대값/요청본문 미노출 | 테스트 ③④⑥⑩ · 응답 원문에 비밀 문자열 부재 단언 |
| T-15-22 (공개 healthz 정보 노출) | 페이로드 5필드 화이트리스트 · 식별자 키 부재 · grep `accountNo\|account_no` 0건 | 테스트 ② (`Object.keys` 고정 + 금지어 스캔) |
| T-15-05 (자격증명 등록 경로 노출) | 비밀번호 stdin 전용(인자·env 거부) · 화면 미표시 · 평문/AES 키 미출력 · 키는 Secret Manager | 스텁 실측 — DB 로 암호문, 로그에 평문 0건 |
| T-15-23 (컨테이너 권한 상승) | `USER app` non-root · `pnpm deploy --prod`(dev 의존성 배제) | `docker run --entrypoint id` → `uid=100(app)` |
| T-15-24 (재시작 시 고아 세션) | 종료 절차 4단계 + 5초 데드맨 · wss `close(1001)` · `sessionManager.closeAll()` | SIGTERM 로그 시퀀스 실측 |
| T-15-25 (실서버 오접속) | `config.ts` 기본값을 로컬 mock 으로 반전 · `dev.sh` 이중 방어 · README D-27 경고 | `grep 'DMA_HOST' config.ts` → `?? "127.0.0.1"` |

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-public-surface | `relay/src/index.ts` | 8090 서버가 **평문 HTTP 요청에 응답**하기 시작했다(이전에는 업그레이드만 상정). Caddy 기본 라우트가 8090 이므로 인터넷에서 도달 가능하다. 응답은 고정 404 JSON 이고 `Server` 헤더·스택·경로 반사가 없어 노출 정보는 0 이지만, **이 핸들러에 라우트를 추가하면 그 순간 공개 API 가 된다** — 추가 시 인증을 먼저 검토할 것 |

## Known Stubs

**의도된 미구현 1건 (plan 이 명시적으로 지시한 범위 제한):**

| 위치 | 내용 | 해소 시점 |
|------|------|-----------|
| `relay/src/order/order-api.ts` — `TODO(D-25)` | `POST /internal/orders` 주문 라우트 본체. 현재는 관문만 있고 라우트가 없어 404 로 떨어진다. | gh-trade 17 완료 + `sync-relay-schema.sh` 재실행 후 (15-16) |

이것은 **UI 로 흐르는 거짓 값이 아니다** — 주문 기능은 아직 어떤 화면에도 노출되지 않았고, 관문(401)과 라우트 부재(404)가 명확히 구분된다.

`/healthz` 의 `vpn` 필드는 스텁이 아니라 **문서화된 근사**다(Decisions 3). 값이 하드코딩돼 있지 않고 실제 세션 상태에서 파생된다.

그 밖에 하드코딩 빈 값·placeholder 문자열은 없다.

## Follow-up (후속 plan 이 알아야 할 것)

1. **⚠ 15-08 은 `DMA_HOST` 를 배포 env 에 반드시 명시해야 한다.** 기본값이 로컬 mock 으로 바뀌었다. 누락하면 relay 가 컨테이너 안의 `127.0.0.1:9100` 에 붙으려다 실패한다(조용한 오접속보다 낫지만, 명시가 필수다).
2. **`RELAY_ORDER_SECRET` 은 필수 env 다.** 없으면 `loadConfig()` 가 기동 즉시 throw 한다 — 15-08 의 컨테이너 실행 명령에 Secret 4종(`SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`·`DMA_CRED_KEY`·`RELAY_ORDER_SECRET`)이 전부 들어가야 한다.
3. **`dma_credentials` 테이블은 아직 없다.** 15-09 마이그레이션 전에는 등록 스크립트가 DB 오류로 끝나고, wss 인증도 자격증명 조회에서 실패한다. 스크립트 docblock 과 README 에 명시해 두었다.
4. **주문 라우트(15-16)는 `order-api.ts` 의 `TODO(D-25)` 자리에 붙인다.** 관문·404·errorHandler·envelope 가 이미 서 있으므로 라우터만 끼우면 된다. `sessionManager.get(userId)?.isReady` 가 409 `SESSION_NOT_READY` 판정의 단일 질문이다(15-03 인계).
5. **세션 축출 경로는 여전히 없다.** 자격증명을 갱신해도 이미 열린 `session_rejected` 세션은 재생성되지 않는다(15-03·15-04 가 연속으로 남긴 인계 사항). 등록 스크립트가 성공 시 그 사실을 stderr 로 안내하도록 해 두었으나, 근본 해결은 `SessionManager.evict(userId)` 다 — 자격증명 회전 UI/스크립트를 만드는 plan 이 함께 처리할 것.
6. **`/healthz` 의 degraded 판정을 정밀화하려면** `SessionManager.stats()` 에 상태 분포가 필요하다. 그 반환 형태는 15-03 테스트가 `toEqual`/`Object.keys` 로 고정하고 있으니 넓힐 때 테스트도 함께 손볼 것.
7. **`server/.dockerignore` 도 현재 사문이다** (BuildKit 이 읽지 않는 이름). 이 plan 의 범위 밖이라 손대지 않았고 `deferred-items.md` 에 기록했다.

## User Setup Required

없음. 이 plan 은 파일만 만든다 — VM 배포·이미지 push·VPN 기동·KB 게이트웨이 접속을 일절 하지 않았다. 로컬 `docker build` 와 로컬 프로세스 기동만 수행했다.

## Self-Check

생성 주장 파일 존재 확인:
- `relay/src/index.ts` · `relay/src/order/order-api.ts` · `relay/tests/order-api.test.ts` · `relay/Dockerfile` · `relay/.dockerignore` · `relay/Dockerfile.dockerignore` · `relay/README.md` · `scripts/dma-credentials.ts` — 전부 FOUND
- 수정 주장 파일: `relay/src/ws/fanout.ts` · `relay/src/config.ts` · `relay/package.json` · `dev.sh` — 전부 FOUND

커밋 존재 확인: `369d8a3` · `b1b31f3` · `653b9de` — 전부 `git log` 에서 확인

작업 트리: clean (untracked 0건)

## Self-Check: PASSED

---
*Phase: 15-dma-relay-kb-gh-trade-server-10-wss*
*Completed: 2026-09-06*
