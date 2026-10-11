---
phase: 29-dma-multi-server-admin
plan: 03
subsystem: relay
tags: [relay, registry, dma, observer, healthz, supabase]

requires:
  - phase: 29-01
    provides: "dma_servers 열 이름(key · broker · host · port · enabled · is_order_server · is_quote_primary · sort_order) — 테스트는 스텁이라 원격 적용과 무관"
provides:
  - "DMA_REGISTRY_SOURCE 원천 게이트(env 기본 | db — db 는 production 전용, production 은 db 필수)"
  - "RelayConfig.envServers · observerSecretOf(broker) · quoteSecretOf(broker)"
  - "ServerRegistry(env | db · start · ready · reload · close · all · enabled · get · orderServerOf · quotePrimary · changed) · REGISTRY_REFRESH_MS"
  - "ServerPipelines(sync · get · all · stopAll · drainAll · closeAll) · createJournalPipeline(registry/pipelines.ts 로 이동)"
  - "JournalObserverDeps.expectedBroker — 79 broker 대조 정지"
  - "SessionManagerOptions.resolveTarget · SessionTarget"
  - "healthz brokers.{KB,KYOBO} = { server, alerting } · journalGateways 키 = 레지스트리 키(요청마다)"
affects: [29-06, 29-08, 29-11, 29-16, 29-20, 29-22, 29-23, 29-24, 29-25]

actuals:
  tokens: 21600
  tasks: 2
  commits: 2
plan_head_before: 6f995f1acc36f5931b02863ca249b3cbcce260e7
plan_head_after: a60ef1567f80c78a506294c9e7a9378c76eef711

tech-stack:
  added: []
  patterns:
    - "레지스트리 적재기 = identities.ts 규율 복제(부팅 1회 + 60초 · 겹침 금지 Promise 공유 · 실패/불변식 위반 시 직전 유지 · 첫 성공 전 fail closed)"
    - "top-level await registry.ready() — 첫 적재 전 리스너 · 관찰자 · quote · 세션 0"
    - "fanout 에 넘기는 주 매핑 · journal.state 는 호출마다 현재 파이프라인을 보는 파사드(재생성돼도 이어짐)"
    - "healthz 의 서버 의존 deps 는 요청마다 부르는 함수(dmaHost · journalGateways · brokers)"

key-files:
  created:
    - relay/src/registry/registry.ts
    - relay/src/registry/pipelines.ts
    - relay/tests/config-registry.test.ts
    - relay/tests/registry.test.ts
    - relay/tests/pipelines.test.ts
  modified:
    - relay/src/config.ts
    - relay/src/index.ts
    - relay/src/journal/observer.ts
    - relay/src/order/order-api.ts
    - relay/src/dma/session-manager.ts
    - relay/tests/config-upstreams.test.ts
    - relay/tests/config-quote.test.ts
    - relay/tests/journal-observer.test.ts
    - relay/tests/order-api.test.ts
    - relay/tests/journal-boot.test.ts
    - relay/tests/session-manager.test.ts

key-decisions:
  - "production 비밀 필수 검사(DMA_OBSERVER_SECRET)를 레지스트리 원천 게이트보다 먼저 본다 — Phase 19 기동 거부 문구 불변"
  - "DMA_BROKER 는 KB | KYOBO 밖이면 기동 거부(비밀 · 키 접두가 증권사별)"
  - "79 broker 불일치는 #halt 대신 키 · 기대 · 받은 broker 를 싣는 error 1줄 + #stopLoop(rejected) — 매핑 · 커서를 건드리기 전에 멈춘다"
  - "host · port · broker 변경은 같은 키 재생성(옛 벌 drain 과 겹칠 수 있음 — 커서는 적용 RPC 안에서만 전진 · PK 흡수), 역할 · 정렬만 바뀌면 연결 유지"
  - "브라우저 journal.state · 주 결선 = 부팅 때 KB 주문 서버 키(없으면 첫 enabled 서버) · healthz journal = 지금의 KB 주문 서버 파이프라인"
  - "GatewayIdentities gateways = 부팅 때 레지스트리의 주 서버 외 전 키(꺼진 서버 포함) — 그런 키가 없으면 신원 조회 0건(종전과 같다), 런타임 신규 키는 신원 없음(fail closed)"

patterns-established:
  - "레지스트리 행 → ServerPipelines.sync → onCreated 결선 → observer.start (결선이 start 보다 먼저)"

requirements-completed: [ADMIN-04]

coverage:
  - id: D1
    description: "DMA_REGISTRY_SOURCE 게이트 — 비프로덕션 db 거부 · production env 거부 · env 합성 · 증권사별 비밀"
    requirement: ADMIN-04
    verification:
      - kind: unit
        ref: "relay/tests/config-registry.test.ts"
        status: pass
      - kind: integration
        ref: "relay/tests/journal-boot.test.ts#Phase 29 D-09 레지스트리 원천 게이트 — 실 프로세스"
        status: pass
    human_judgment: false
  - id: D2
    description: "ServerRegistry db 적재 — 첫 적재 ready · changed 1회 · 재적재 무변화 무이벤트 · 불변식 위반/select 실패 시 직전 유지 · 겹침 금지 · close 뒤 타이머 0"
    requirement: ADMIN-04
    verification:
      - kind: unit
        ref: "relay/tests/registry.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "트레이서 — 레지스트리 행 2개 → 스텁 게이트웨이 2대에 증권사별 비밀로 관찰자 로그인 · 끄기 · 주소 변경 · 비밀 없음 · 79 broker 불일치 정지"
    requirement: ADMIN-04
    verification:
      - kind: integration
        ref: "relay/tests/pipelines.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "index 레지스트리 결선 — 세션 = KB 주문 서버 · quote = 시세 주 서버 · healthz brokers · 동적 journalGateways · env 모드 부팅 회귀"
    requirement: ADMIN-04
    verification:
      - kind: unit
        ref: "relay/tests/order-api.test.ts#Phase 29 brokers · 동적 journalGateways"
        status: pass
      - kind: unit
        ref: "relay/tests/session-manager.test.ts#resolveTarget"
        status: pass
      - kind: integration
        ref: "relay/tests/journal-boot.test.ts (11건)"
        status: pass
      - kind: e2e
        ref: "playwright:e2e/specs/trading-workbench.spec.ts -g P28-1"
        status: unknown
    human_judgment: false

duration: 25min
completed: 2026-10-07
status: complete
---

# Phase 29 Plan 03: relay 서버 레지스트리 트레이서 Summary

⚠ 29-24 전환 잠금 전 relay 재배포 금지 — 옛 `scripts/deploy-relay.sh` 는 `DMA_REGISTRY_SOURCE=db` 를 넣지 않아(`NODE_ENV=production` 만) 이 커밋의 운영 relay 가 기동을 거부한다 · 전환은 29-24 잠금이 선 뒤 29-25 배포 창의 `--registry-cutover` 1회뿐

**레지스트리 행 하나가 관찰자 연결 하나가 된다 — `DMA_REGISTRY_SOURCE` 게이트(db 는 production 전용) · `ServerRegistry`(env 합성 | `dma_servers` 60초 재적재 · fail closed) · `ServerPipelines`(서버별 관찰자 한 벌 생성/정지/재생성) · 증권사별 관찰자 비밀 · 79 broker 대조 정지, 그리고 index 가 레지스트리를 순회해 세션 = KB 주문 서버 · quote = 시세 주 서버 · healthz `brokers.{KB,KYOBO}` 로 결선한다.**

## Performance

- **Duration:** 약 25분
- **Started:** 2026-10-06 23:44 KST
- **Completed:** 2026-10-07 00:05 KST
- **Tasks:** 2/2
- **Files modified:** 16 (신규 5 · 수정 11)

## Accomplishments

- **원천 게이트(D-09)** — `DMA_REGISTRY_SOURCE` 미설정 → `env`. `db` + 비프로덕션 → 기동 거부(문구에 D-09), production + env/미설정 → 기동 거부, 알 수 없는 값 → 기동 거부. 로컬 · 테스트 · e2e relay 는 운영 Supabase 레지스트리를 읽을 수 없다. 실서버 주소 리터럴 0(`10.41.` · `10.16.207` grep 0).
- **env 합성** — 오늘의 `DMA_HOST`(기본 127.0.0.1) · `DMA_PORT` · `DMA_BROKER` 로 주 행(주문 + 시세 주), `DMA_KYOBO_HOST` 로 KYOBO 행(KYOBO 주문 서버). 키는 종전 `KB`/`KYOBO` 그대로 — e2e · journal-boot 결과가 종전과 같다.
- **증권사별 비밀** — `observerSecretOf("KB")` = `DMA_OBSERVER_SECRET` · `("KYOBO")` = `DMA_OBSERVER_SECRET_KYOBO` · `quoteSecretOf("KB")` = `DMA_QUOTE_OBSERVER_SECRET` ‖ `DMA_OBSERVER_SECRET` · `("KYOBO")` = `DMA_OBSERVER_SECRET_KYOBO`. 비밀은 함수 필드 뒤에 있어 설정 객체를 직렬화해도 나가지 않는다.
- **ServerRegistry** — identities.ts 규율 복제. 불변식(키 중복 · 증권사당 주문 서버 2 · 시세 주 2 · 비활성 주문/시세 서버 · broker 값 · 키 접두) 위반이나 select 실패면 직전 값 유지 + `safePgError` 로그. 행이 바뀐 경우에만 `changed` 1회(added · removed · changed · roles). `reload()` 공개(29-11 용).
- **ServerPipelines** — `createJournalPipeline` 을 index 에서 옮겼다. 새 키 생성 → `onCreated`(결선) → `observer.start()`, 빠짐/비활성 → stop → drain(2초) → close → `onRemoved`, host/port/broker 변경 → 재생성, 역할만 바뀌면 연결 유지.
- **79 broker 대조** — `expectedBroker` 와 다르면(빈 값 · `"MOCK"` 제외) 매핑 · 커서를 건드리기 전에 `rejected` 영구 정지 + error 1줄(키 · 기대 · 받은 broker).
- **index 결선** — top-level await 로 첫 적재 대기 → `pipelines.sync(registry.enabled())` → `changed` 마다 재sync. 세션 `resolveTarget` = KB 주문 서버, quote = 시세 주 서버, 종료 절차 = `registry.close` · `quoteFeed.stop` · `pipelines.stopAll` · `drainAll(2초)` · `closeAll`.
- **healthz** — `journal` = KB 주문 서버 저널(503 축 불변), `journalGateways.<서버 키>` = 그 밖 enabled 서버(요청마다 · 본문 전용), 신규 `brokers.{KB,KYOBO} = { server, alerting }`(본문 전용 · uptime 고정 JSONPath 원천 — Pitfall 3).

## 바꾼 healthz 본문 예시

env 모드 KB 단독(journal-boot M1):

```json
{ "status": "ok", "vpn": true, "dma": true, "version": "…", "sessionCount": 0, "everReadyCount": 0, "stalledCount": 0,
  "journal": { "state": "live", … },
  "brokers": { "KB": { "server": "KB", "alerting": false } },
  "quote": { … } }
```

env 모드 KB + KYOBO(journal-boot M2):

```json
{ …, "journal": { "state": "live", … },
  "journalGateways": { "KYOBO": { "state": "live", "lastSeq": 1, …, "alerting": false } },
  "brokers": { "KB": { "server": "KB", "alerting": false }, "KYOBO": { "server": "KYOBO", "alerting": false } } }
```

db 모드(29-25 이후 · 키 개명 뒤)에는 `journalGateways.KYOBO119` · `brokers.KYOBO.server = "KYOBO119"` 가 된다 — uptime 은 `$.brokers.KYOBO.alerting` 로 옮기면 키 개명에 흔들리지 않는다(29-24 몫).

## 이 플랜이 남긴 것(뒤 플랜 몫 — 확인)

- **신원:** 추가 서버 푸시 신원은 여전히 `GatewayIdentities.viewOf(key)`. gateways = 부팅 때 레지스트리의 주 서버 외 전 키(꺼진 서버 포함). 런타임에 새로 추가된 키는 신원 없음(푸시 없음 · fail closed) — 29-06 이 `AppAccess` 로 교체.
- **세션 단일:** 사용자 세션은 KB 주문 서버 하나(`resolveTarget`). 레지스트리에 KB 주문 서버가 없으면 생성자 값 폴백 + warn — 29-16 · 29-20 이 (유저, 서버) 로.
- **journal.state 고정:** 브라우저 `journal.state` · 주 매핑 라우팅은 부팅 때 KB 주문 서버 키의 파이프라인(같은 키로 재생성되면 새 벌로 이어짐). 런타임 KB 주문 서버 전환은 29-22.
- **quote 고정:** quote 는 부팅 때 시세 주 서버에 고정 — 29-23 이 전환.
- **배포 스크립트:** `scripts/deploy-relay.sh` 의 `DMA_REGISTRY_SOURCE=db` 주입 · `registry_cutover_gate` 는 29-24. 레거시 env-host 폴백을 넣지 않았다(D-12).

## Task Commits

1. **Task 1: 트레이서 — 원천 게이트 · 증권사별 비밀 · ServerRegistry · ServerPipelines · 스텁 2대 통합** — `a9a0d45e` (feat)
2. **Task 2: index 레지스트리 결선 — 세션 = KB 주문 서버 · quote = 시세 주 서버 · 라이브 sync · healthz brokers · 부팅 회귀** — `a60ef156` (feat)

## Decisions Made

frontmatter `key-decisions` 참조. 요점: production 비밀 검사를 원천 게이트보다 먼저(문구 불변), `DMA_BROKER` 값 검증 추가, 79 불일치는 매핑 전 정지, 주소 변경은 같은 키 재생성.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1 커밋이 타입체크를 통과하도록 index.ts 최소 다리 수정**
- **Found during:** Task 1
- **Issue:** `journalUpstreams` · `JournalUpstream` 제거로 index.ts 가 컴파일되지 않음(index 결선은 Task 2 몫).
- **Fix:** Task 1 에서 index.ts 를 `createJournalPipeline` import + `envServers` · `observerSecretOf` 로 최소 치환(동작 동일), Task 2 에서 레지스트리 순회로 재작성.
- **Commit:** a9a0d45e

**2. [Rule 3 - Blocking] production 을 쓰는 기존 config 테스트 갱신(플랜 files 밖 2개)**
- **Found during:** Task 1
- **Issue:** `config-quote.test.ts` ① · `journal-observer.test.ts` ⑮ 가 production 에서 `loadConfig()` 성공을 기대 — 새 게이트(production ⇔ db)로 기동 거부.
- **Fix:** 해당 케이스에 `DMA_REGISTRY_SOURCE=db` 를 넣고 env 저장/복원 목록에 추가. `journalUpstreams[0].secret` 단언은 `observerSecretOf("KB")` · `quoteSecretOf("KB")` 로. `journal-observer.test.ts` 의 `createOrderApi` 호출은 Task 2 에서 `dmaHost: () => …` 로.
- **Commits:** a9a0d45e · a60ef156

**3. [Rule 2 - Correctness] fanout 의 주 매핑 · journal.state 를 파사드로**
- **Found during:** Task 2
- **Issue:** fanout 은 생성자에서 `journalAccess` · `journalState` 객체를 받는다. 주 서버의 host/port 가 바뀌어 파이프라인이 재생성되면 fanout 이 닫힌 옛 객체를 계속 본다.
- **Fix:** 호출마다 현재 주 파이프라인을 보는 `primaryAccessView` · `{ frame() }` 파사드를 넘긴다. 상태 frame · applied 결선은 `onCreated` 에서 새 벌마다 다시 붙는다.
- **Commit:** a60ef156

**4. [Rule 2 - Correctness] `OrderApiDeps.journal.health` 반환에 `undefined` 허용**
- **Issue:** KB 주문 서버 파이프라인이 없으면(레지스트리 비어 있음 등) `journal` 소스가 값을 못 준다.
- **Fix:** 반환 타입을 `JournalHealth | undefined` 로 넓혔다 — undefined 면 `journal` 키가 없고 판정에서 빠진다(기존 처리 경로 그대로). 테스트 1건 추가.
- **Commit:** a60ef156

**5. [Rule 2 - 테스트] session-manager.test.ts 에 resolveTarget 케이스 2건 추가(플랜 files 밖)**
- 플랜 verify 가 `tests/session-manager.test.ts` 를 돌리고 behavior 가 resolveTarget 동작을 요구하므로 추가했다.
- **Commit:** a60ef156

**6. [검증 환경] 플랜 `<automated>` 의 `cd /Users/alex/repos/gh-radar && …` 를 워크트리 루트에서 실행**
- 플랜 명령의 절대 경로는 메인 체크아웃을 가리킨다(그대로 돌리면 이 워크트리 변경을 검증하지 않는다). 같은 명령을 워크트리 루트에서 실행했다(워크트리에 `pnpm install --frozen-lockfile --prefer-offline` 선행 — 새 패키지 없음).

`relay/src/logger.ts` 는 `*.DMA_OBSERVER_SECRET_KYOBO` redact 가 이미 있어 바꾸지 않았다(플랜 ⑤ 「있으면 그대로」).

## Verification

- `pnpm --filter @gh-radar/shared build` · relay `typecheck` · `typecheck:tests` — 통과
- Task 1 테스트 4파일(config-registry · config-upstreams · registry · pipelines) — 통과
- Task 2 테스트(order-api · journal-boot · session-manager) — 3파일 78건 통과
- relay 전체 단위 테스트 — **39파일 1045건 통과**(기준선 36파일 1012건)
- **e2e P28-1 — 미실행.** 워크트리에 `webapp/.env.test.local`(Supabase 테스트 로그인)이 없고, 메인 체크아웃 파일을 연결하는 것은 비밀 파일 읽기 가드가 막았다. 대체 근거: journal-boot 의 Phase 26 「quote 키만(e2e 구성 흉내)」 · env 모드 부팅 케이스 전부 green(e2e 픽스처와 같은 env 형태 — `NODE_ENV=test` · `DMA_HOST=127.0.0.1` · 레지스트리 env 기본). **메인 세션에서 `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g "P28-1" --reporter=list` 를 한 번 돌려야 한다.**
- 운영 재배포: 하지 않음(금지).

## Known Stubs

없음.

## Self-Check: PASSED

- FOUND: relay/src/registry/registry.ts · relay/src/registry/pipelines.ts · relay/tests/config-registry.test.ts · relay/tests/registry.test.ts · relay/tests/pipelines.test.ts
- FOUND commits: a9a0d45e · a60ef156 (HEAD 조상)
- 경고 줄: 제목 바로 아래 첫 본문 줄 — `DMA_REGISTRY_SOURCE=db` · `deploy-relay.sh` · `--registry-cutover` · 「기동을 거부」 포함
