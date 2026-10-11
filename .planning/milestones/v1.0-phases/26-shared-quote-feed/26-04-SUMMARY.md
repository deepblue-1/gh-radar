---
phase: 26-shared-quote-feed
plan: 04
subsystem: relay
tags: [relay, config, boot, quote-feed, d-17, secrets, redact]

requires:
  - phase: 26-02
    provides: "QuoteFeed({ secret, host, port }) · start/stop · 스텁 게이트웨이 quote 모드(respondQuoteLogin · quoteLoginRequests · waitForQuoteConnection)"
  - phase: 26-03
    provides: "hub.attachFeed(feed) · HubQuoteFeed 표면 · feed ready = 합집합 재구독 유일 트리거"
provides:
  - "RelayConfig.dmaQuoteObserverSecret — DMA_QUOTE_OBSERVER_SECRET 우선 · 없거나 빈 값이면 DMA_OBSERVER_SECRET 폴백(D-17)"
  - "logger redact *.DMA_QUOTE_OBSERVER_SECRET · *.dmaQuoteObserverSecret"
  - "relay/src/index.ts 부팅 결선 — QuoteFeed 생성 · hub.attachFeed(quoteFeed) · 관찰자 start 옆 quoteFeed.start() · 종료 4단계 quoteFeed.stop()"
  - "부팅 로그 quoteFeed: enabled | disabled"
  - "journal-boot.test.ts describe 「Phase 26 quote 연결 부팅 (D-17)」 2케이스 + spawnRelay 가 상속 DMA_QUOTE_OBSERVER_SECRET 을 지운다"
affects: [26-05 e2e fixture, 26-11 QuoteStatus, 26-12 healthz quote axis, 26-15 deploy]

actuals:
  tokens: 5781
  tasks: 2
  commits: 4
plan_head_before: b4df7d9caef3ffb26c4e321901a4910461d13cda

tech-stack:
  added: []
  patterns:
    - "비밀 폴백은 config 한 곳(`optional(A) || B`)에서만 — 빈 문자열은 「없음」, production 필수 검사는 저널 비밀만 본다"
    - "부팅 로그는 연결마다 enabled/disabled 한 단어 — 판정 근거는 config 의 비밀 유무, 값은 싣지 않는다"
    - "장기 연결(관찰자 · quote)은 결선이 다 붙은 뒤 같은 자리에서 start, 종료 4단계 같은 자리에서 stop"

key-files:
  created:
    - relay/tests/config-quote.test.ts
  modified:
    - relay/src/config.ts
    - relay/src/logger.ts
    - relay/src/index.ts
    - relay/tests/journal-boot.test.ts

key-decisions:
  - "quote 비밀 폴백은 production 필수 검사 뒤에 계산한다 — NODE_ENV=production 에서 DMA_OBSERVER_SECRET 이 없으면 quote 키가 있어도 기동 거부(19 D-13 무변경)"
  - "종료 4단계에서 quoteFeed.stop() 을 저널 관찰자 stop 보다 먼저 둔다 — 둘 다 새 프레임 차단이라 순서 의존은 없고, 시세 쪽이 로그인 타이머 · 재접속 백오프를 먼저 내려 매달림 여지를 줄인다"
  - "quote 연결은 주 게이트웨이(config.dmaHost · dmaPort)에만 붙는다 — 추가 게이트웨이(KYOBO)는 관찰자 전용 그대로"

patterns-established:
  - "실 프로세스 부팅 테스트에서 연결 ready 는 relay 출력의 상태 로그(`[QUOTE] 시세 관찰자 로그인 성공 — ready`)를 waitFor 로 기다린다"

requirements-completed: []

coverage:
  - id: D1
    description: "D-17 quote 비밀 규칙 — 저널 비밀만 → 폴백 · 둘 다 → quote 키 우선 · quote 키만(test) → 저널 undefined · 둘 다 없음 → undefined · production 저널 비밀 없음 → quote 키 있어도 기동 거부"
    verification:
      - kind: unit
        ref: "relay/tests/config-quote.test.ts#① ~ ⑤ (loadConfig — dmaQuoteObserverSecret (Phase 26 D-17))"
        status: pass
      - kind: unit
        ref: "relay/tests/config-upstreams.test.ts (무수정 green)"
        status: pass
    human_judgment: false
  - id: D2
    description: "실 relay 프로세스 부팅(폴백) → quote 로그인 role 1 · client gh-radar-relay/quote · secret = DMA_OBSERVER_SECRET · ready · 저널 role 0 1건 · SIGTERM 코드 0 · 종료 순서 · 출력에 비밀 없음 · 부팅 로그 quoteFeed enabled"
    verification:
      - kind: integration
        ref: "relay/tests/journal-boot.test.ts#Phase 26 quote 연결 부팅 (D-17) > DMA_OBSERVER_SECRET 만(폴백) → quote 로그인 role 1 · client gh-radar-relay/quote · 같은 비밀 · 저널 role 0 1건 · SIGTERM 0 · 비밀 부재"
        status: pass
    human_judgment: false
  - id: D3
    description: "실 relay 프로세스 부팅(quote 키만 · e2e 구성) → 저널 로그인 0 · 커서 조회 0 · quote 로그인이 그 비밀 · SIGTERM 0 · 비밀 부재"
    verification:
      - kind: integration
        ref: "relay/tests/journal-boot.test.ts#Phase 26 quote 연결 부팅 (D-17) > DMA_QUOTE_OBSERVER_SECRET 만(e2e 구성) → 저널 관찰자 로그인 0 · quote 로그인 그 비밀 · SIGTERM 0 · 비밀 부재"
        status: pass
    human_judgment: false
  - id: D4
    description: "두 비밀이 다 없으면 quote 연결도 disabled — 게이트웨이 소켓 0 · quote 로그인 0 · 부팅 로그 quoteFeed disabled · 기존 부팅 케이스 전부 green · deploy-relay.sh 무변경"
    verification:
      - kind: integration
        ref: "relay/tests/journal-boot.test.ts#DMA_OBSERVER_SECRET 없음 + NODE_ENV test → healthz 200 · journal.state disabled · 관찰자 로그인 0"
        status: pass
      - kind: other
        ref: "pnpm --filter @gh-radar/shared build && relay typecheck && relay typecheck:tests && relay test (33 files · 779 tests) · git diff b4df7d9c..HEAD -- scripts/deploy-relay.sh = 0줄"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-09-30
status: complete
---

# Phase 26 Plan 04: relay 부팅 quote 연결 결선 · D-17 비밀 폴백 Summary

**`loadConfig` 에 `dmaQuoteObserverSecret`(D-17: `DMA_QUOTE_OBSERVER_SECRET` 우선 · 없거나 빈 값이면 `DMA_OBSERVER_SECRET` 폴백)을 더했다. `relay/src/index.ts` 가 이 비밀로 `QuoteFeed` 를 만들어 `hub.attachFeed(quoteFeed)` 로 hub 의 유일한 시세 업스트림 송신자로 결선한다. 실 relay 프로세스 부팅 테스트로 「부팅 → role 1 · `gh-radar-relay/quote` 로그인 → ready → SIGTERM 코드 0 · 출력에 비밀 없음」 을 증명했다. 프로덕션 배포 경로(`deploy-relay.sh` · Secret Manager)는 한 줄도 바뀌지 않았다.**

## Performance

- **Duration:** 약 5분
- **Started:** 2026-09-30T13:31:38Z
- **Completed:** 2026-09-30T13:36:30Z
- **Tasks:** 2 (둘 다 TDD — RED 커밋 → GREEN 커밋)
- **Files modified:** 5 (신규 1 · 수정 4)

## D-17 판정표 (env 조합 → quote / 저널 비밀)

| NODE_ENV | `DMA_OBSERVER_SECRET` | `DMA_QUOTE_OBSERVER_SECRET` | 저널 관찰자 비밀 | quote 비밀 | 결과 |
|---|---|---|---|---|---|
| production | 있음 | 없음 | 그 값 | **그 값(폴백)** | 오늘 프로덕션 — Secret Manager 무변경으로 두 연결 모두 켜진다 |
| 아무거나 | 있음 | 있음 | `DMA_OBSERVER_SECRET` | `DMA_QUOTE_OBSERVER_SECRET` | quote 키가 이긴다 · 저널 비밀은 영향 없음 |
| test/dev | 없음 또는 `""` | 있음 | undefined | quote 키 | e2e 구성 — 저널 관찰자 꺼짐 · quote 연결만 켜짐 |
| test/dev | 없음 또는 `""` | 없음 또는 `""` | undefined | undefined | QuoteFeed disabled — 게이트웨이 소켓을 열지 않는다 |
| production | 없음 또는 `""` | 있음 | — | — | **기동 거부** `DMA_OBSERVER_SECRET must be set in production (Phase 19 D-13)` (무변경) |
| 아무거나 | 있음 | `""` | 그 값 | 그 값(빈 문자열 = 없음) | 폴백 |

## 부팅 로그 예시 (비밀 없음)

```json
{"message":"gh-radar-relay listening","wsPort":8090,"orderApiPort":8091,"dmaHost":"127.0.0.1","dmaPort":9100,"env":"test","version":"boot-test","journalObserver":"enabled","quoteFeed":"enabled"}
```

`quoteFeed` 는 `config.dmaQuoteObserverSecret` 유무만 보고 `"enabled"` / `"disabled"` 한 단어를 싣는다. 두 부팅 케이스가 출력 전체에 비밀 문자열이 없음을 단언한다(T-19-03 · T-26-05).

## 종료 순서 (index.ts 머리 주석 · shutdown 본문)

1. HTTP 서버 2개 `close()` — 새 연결 차단
2. `fanout.closeAll(1001)` — wss going away
3. `sessionManager.closeAll()` — 사용자 세션 구독 해제 + DMA TCP 종료
4. **quote 연결 `stop`** · 전 게이트웨이 `observer.stop()` — 새 시세 프레임 · 새 배치 차단. quote 로그인 타이머 · 재접속 백오프도 여기서 멈춘다
5. 전 기록기 drain(2초 · 병렬) → 기록기 · access · status · 신원 적재기 close
6. `hub.closeAll()` · `symbols` · 종목마스터 타이머 정리

폴백 부팅 케이스가 로그 순서로 `[DMA] 전 세션 종료 완료` < `[QUOTE] 시세 연결 종료` < `[relay] 종료 절차 완료` 를 잠근다.

## 부팅 테스트 이름

`relay/tests/journal-boot.test.ts` — `describe("Phase 26 quote 연결 부팅 (D-17)")`
- `DMA_OBSERVER_SECRET 만(폴백) → quote 로그인 role 1 · client gh-radar-relay/quote · 같은 비밀 · 저널 role 0 1건 · SIGTERM 0 · 비밀 부재`
- `DMA_QUOTE_OBSERVER_SECRET 만(e2e 구성) → 저널 관찰자 로그인 0 · quote 로그인 그 비밀 · SIGTERM 0 · 비밀 부재`

기존 케이스 `DMA_OBSERVER_SECRET 없음 + NODE_ENV test → …` 에 `quoteLoginRequests() == []` 와 `"quoteFeed":"disabled"` 단언을 더했다. 원래 있던 `gateway.sockets` 0 단언은 이제 두 연결이 모두 꺼졌음을 함께 잠근다.

## Accomplishments

- D-17 비밀 원천을 처음부터 최종 규칙으로 넣었다. 임시 원천을 두었다가 교체하는 두 단계는 만들지 않았다.
- 26-03 이 의도적으로 남긴 ① 「프로덕션 부팅 경로에 feed 가 없음」 을 닫았다. 이제 부팅 경로에서도 구독이 quote 연결로 나간다.
- 기존 부팅 케이스 8개는 테스트 코드를 고치지 않고 green 이다. 폴백으로 quote 연결이 같이 뜨지만, 스텁이 role 1 을 저널 목록과 따로 기록하기 때문이다.

## TDD Gate Compliance

| Task | RED | GREEN | 관측된 RED 실패 |
|---|---|---|---|
| 1 config | `7b97642f` test(26-04) | `d3d5823c` feat(26-04) | ①②③ `AssertionError: expected undefined to be 'journal-observer-secret-test' / 'quote-observer-secret-test'`(필드 없음). ④⑤ 는 기존 규칙을 잠그는 케이스라 RED 에서도 통과 |
| 2 boot | `52fa74e4` test(26-04) | `5b2245b2` feat(26-04) | 새 두 케이스 `Error: 가짜 게이트웨이 quote 연결 대기 시간 초과 (15000ms)` · 둘 다 없음 케이스 `expected '…' to contain '"quoteFeed":"disabled"'` |

REFACTOR 커밋은 없다(정리할 것 없음). `check tdd-red-evidence` 는 vitest 출력을 파싱하지 못하는 알려진 도구 문제가 있어서, 관측한 실패 출력을 위 표에 대신 적었다.

## Task Commits

1. **Task 1: D-17 quote 비밀 폴백** — `7b97642f` (test) → `d3d5823c` (feat)
2. **Task 2: 부팅 결선 · 실 프로세스 부팅 테스트** — `52fa74e4` (test) → `5b2245b2` (feat)

**Plan metadata:** 이 SUMMARY 커밋 (docs(26-04))

## Files Created/Modified

- `relay/tests/config-quote.test.ts` (신규) — D-17 다섯 갈래. env 저장 · 복원 규율과 비밀 계열 선삭제, throw 문구에 비밀이 없음을 단언한다
- `relay/src/config.ts` — `RelayConfig.dmaQuoteObserverSecret` + JSDoc · `optional("DMA_QUOTE_OBSERVER_SECRET") || dmaObserverSecret` · 머리 주석 26 D-17
- `relay/src/logger.ts` — redact `*.DMA_QUOTE_OBSERVER_SECRET` · `*.dmaQuoteObserverSecret`
- `relay/src/index.ts` — QuoteFeed import · 생성 · `hub.attachFeed` · start · stop · 부팅 로그 `quoteFeed`. 머리 주석에 D-12 한 줄, 종료 순서 4번, 「하지 않는 것」 의 TCP 수를 갱신했다
- `relay/tests/journal-boot.test.ts` — `spawnRelay` 가 `DMA_QUOTE_OBSERVER_SECRET` 을 선삭제한다 · 새 describe 2케이스 · 비밀 없음 케이스 단언 2개

## Decisions Made

- quote 비밀 폴백은 production 필수 검사 **뒤에** 계산한다. production 규칙은 저널 비밀만 보고, quote 키로 우회할 수 없다.
- 종료 4단계에서 quote stop 을 저널 관찰자 stop 바로 앞에 둔다. 둘 다 「새 프레임 차단」 단계라 순서 의존은 없다.
- quote 연결은 주 게이트웨이에만 붙인다. 추가 게이트웨이(KYOBO)는 계속 관찰자 전용이다.

## Deviations from Plan

None - plan executed exactly as written.

(acceptance `grep -c "quoteFeed.stop()" == 1` 을 맞추려고, 머리 주석 종료 순서 4번의 표기를 코드 리터럴 대신 「quote 연결 `stop`」 으로 적었다. 같은 태스크 안에서 바로잡았고 동작 변경은 없다.)

## Issues Encountered

- 사용자 규약상 이 저장소는 master 에서 작업하고, orchestrator 가 master main tree 에서 순차 실행하도록 지정했다. 그래서 26-01 ~ 26-03 과 같이 master 에 커밋했다. push · 배포는 하지 않았다.
- 동시 세션의 미커밋 파일(webapp `card-header.tsx` · `strategy-card.tsx`)과 untracked 파일(`milestone.lock` · `shots/` · `research/.cache/`)은 스테이징하지 않았다. 매 커밋 직전에 `git status -sb` · `git diff --cached --stat` 로 확인했다.
- 사용자 전역 규칙(Co-Authored-By 금지)에 따라 커밋 메시지에 Co-Authored-By 를 넣지 않았다. 26-01 ~ 26-03 과 같다.
- `webapp/e2e/fixtures/relay.ts` 도 `src/index.ts` 를 띄운다. 이 플랜 뒤로는 그 fixture 가 `DMA_OBSERVER_SECRET` 을 주면 quote 연결도 함께 열린다. e2e 쪽 quote 로그인 응답 · 픽스처는 26-05 범위라 여기서는 webapp e2e 를 돌리지 않았다.

## User Setup Required

None - no external service configuration required. (프로덕션은 폴백으로 동작하므로 Secret Manager 에 새 키를 넣지 않는다.)

## Next Phase Readiness

- 26-05: e2e fixture 에 `extraEnv` 격인 `DMA_QUOTE_OBSERVER_SECRET` 만 넣으면 저널은 꺼진 채 quote 연결만 켜진다(판정표 3행). 스텁 게이트웨이의 `respondQuoteLogin` 이 필요하다.
- 26-11 · 26-12: `quoteFeed` 인스턴스가 index 최상위에 있다. `QuoteStatus` · `/healthz` quote 축은 여기서 `quoteFeed` 를 넘겨 결선하면 된다.
- 26-15 배포: `deploy-relay.sh` 무변경. 폴백으로 같은 비밀을 쓴다.

---
*Phase: 26-shared-quote-feed*
*Completed: 2026-09-30*

## Self-Check: PASSED

- 파일 5개 존재 · 커밋 4개(`7b97642f` · `d3d5823c` · `52fa74e4` · `5b2245b2`) 존재
- acceptance: `optional("DMA_QUOTE_OBSERVER_SECRET")` 1 · config `dmaQuoteObserverSecret` 3 · redact 두 표기 각 1 · `deploy-relay.sh` diff 0줄 · config-quote `it(` 5 · `hub.attachFeed(quoteFeed)` 1 · `quoteFeed.start()` 1 · `quoteFeed.stop()` 1 · index `config.dmaQuoteObserverSecret` 3 · 「Phase 26 quote 연결 부팅」 1 · boot test `DMA_QUOTE_OBSERVER_SECRET` 3
- relay: shared build · typecheck · typecheck:tests clean, 33 files / 779 tests green. 스텁 패턴(TODO/FIXME/placeholder) 0
