---
phase: 27-auto-sell-integration
plan: 02
subsystem: relay+shared+e2e-fixture (자동매도 41 · 사용자 설정 42/43 중계)
tags: [flatbuffers, relay, zod, wss, idor-guard, user-settings, tdd]
status: complete

requires:
  - phase: 27-auto-sell-integration
    provides: "27-01 — MSG 41/42/43/84 · 생성물 AutoSellCommandReq/UserSettings · parseUserSettings · hub #userSettings 캐시 · getUserSettings · RelayUserSettingsValues/Msg"
provides:
  - relay 조립기 buildAutoSellCommandReq(41 · 슬롯 86) · buildSetUserSettingsReq(42 · 슬롯 88 · present 미적재) · buildGetUserSettingsReq(43 · 빈 Envelope)
  - shared 인바운드 계약 RelayAutoSellCmdMsg · RelayUserSettingsSetMsg · RelayInbound +2 · USER_SETTINGS_RANGES(서버 42 범위 정본)
  - relay wss 분기 autosell.cmd(세션 → 계좌 화이트리스트 → 41) · user.settings.set(세션 → 42) · AUTO_SELL_ACTION_WIRE
  - Ready 마다 43 송신(34 바로 뒤) · 인증 직후 user.settings 재생(84 캐시 있을 때만)
  - 테스트 헬퍼 readAutoSellCommandRequest · readSetUserSettingsRequest · sendUserSettings · seedUserSettings(43 자동응답 기본 null)
  - e2e 픽스처 재수출 + LocalRelay.pushUserSettings · seedUserSettings(reset 이 null)
affects: [27-05 바로시작/중지(autosell.cmd · readAutoSellCommandRequest), 27-06 /me 기본설정(user.settings.set · USER_SETTINGS_RANGES · pushUserSettings · readSetUserSettingsRequest), 27-07 84 시딩(pushUserSettings), 27-09 배포(relay 먼저)]

actuals:
  tokens: 19300     # chars/4 over git diff 32132806..HEAD (packages · relay · webapp — 77,392 chars)
  tasks: 2
  commits: 2        # MEASURED rev-list 32132806..HEAD
plan_head_before: 321328064db7a3d3c411e21ac490e91d8a43935a

tech-stack:
  added: []
  patterns:
    - "브라우저 동작 문자열 → 와이어 숫자 매핑은 계약 키에 Record 로 못박은 모듈 상수(AUTO_SELL_ACTION_WIRE — ARM_LATCH_MSG_TYPE 동형)"
    - "범위 정본은 shared 상수 하나 — relay zod 는 userSettingInt(k) 로 그 상수에서 만든다(리터럴 재기재 금지)"
    - "테스트 게이트웨이의 새 조회 자동응답은 시드 옵션 기본 null — 기존 프레임 개수 단언 보호(Pitfall 10)"

key-files:
  created:
    - relay/tests/ws-autosell.test.ts
  modified:
    - packages/shared/src/relay.ts
    - packages/shared/src/index.ts
    - relay/src/dma/envelope.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - relay/src/ws/protocol.ts
    - relay/src/ws/fanout.ts
    - relay/src/hub/subscription-hub.ts
    - relay/tests/helpers/fake-gateway.ts
    - relay/tests/protocol.test.ts
    - relay/tests/fanout.test.ts
    - relay/tests/hub.test.ts
    - webapp/e2e/fixtures/relay.ts

key-decisions:
  - "buildAutoSellCommandReq 는 action 1·2 밖을 RangeError 로 막는다 — 서버 「action 불명」 왕복을 만들지 않는다(zod 가 앞에서 막으므로 실사용 경로는 없다 · 조립기 단독 방어)"
  - "readAutoSellCommandRequest · readSetUserSettingsRequest 는 플랜대로 payload 1인자 — msg_type 은 페이로드에서 직접 읽어 41/42 가 아니면 null(42 는 84 와 슬롯 88 을 공유하므로 번호로 가른다)"
  - "fake-gateway 에는 reset() 이 없다 — seedUserSettings(null) 로 끄고, e2e LocalRelay.reset() 이 그것을 부른다"

requirements-completed: []

coverage:
  - id: D1
    description: "41 · 42 · 43 조립기 — 슬롯 86/88 왕복 · 41 가드 3종 + action RangeError · 42 present 슬롯 미적재 · 43 빈 본문 · 반사 프레임 방어 · USER_SETTINGS_RANGES 11키 = 계약 키"
    verification:
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#Phase 27 요청 조립기 41 · 42 · 43"
        status: pass
    human_judgment: false
  - id: D2
    description: "zod — autosell.cmd start/stop 통과 · 위반(pause · 숫자 · ISIN · 계좌 · 거래소) · user.settings.set 11값 경계 통과 · 11키 각각 min-1/max+1 위반 · 키 누락 위반 · present strip"
    verification:
      - kind: unit
        ref: "relay/tests/protocol.test.ts#Phase 27 autosell.cmd · user.settings.set 인바운드 스키마"
        status: pass
    human_judgment: false
  - id: D3
    description: "브라우저 → 게이트웨이 41/42 — 계좌 · 세션 가드 0바이트 · FIFO 무오염 · 84 비합성 · 43 시드 응답 팬아웃 · 54 새 src 3종 원문 통과"
    verification:
      - kind: integration
        ref: "relay/tests/ws-autosell.test.ts#Phase 27 autosell.cmd · user.settings.set"
        status: pass
    human_judgment: false
  - id: D4
    description: "Ready 마다 43 이 34 바로 뒤 1건 · Ready 아니면 0건"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#Phase 27 #onReady 43"
        status: pass
    human_judgment: false
  - id: D5
    description: "인증 직후 user.settings — 모르면 0프레임 · 캐시가 있으면 queued.window 바로 뒤 1프레임 · 기존 인증 직후 단언 무변경"
    verification:
      - kind: integration
        ref: "relay/tests/fanout.test.ts#Phase 27 인증 직후 user.settings"
        status: pass
      - kind: other
        ref: "git diff 9b8092e2..HEAD -- relay/tests/fanout.test.ts 의 삭제 줄 0 · relay 전체 36 files / 985 tests green"
        status: pass
    human_judgment: false

duration: 11min
completed: 2026-10-05
---

# Phase 27 Plan 02: relay 41 · 42 · 43 중계와 84 재생 Summary

**브라우저 `autosell.cmd`(start/stop)가 세션 · 계좌 화이트리스트를 거쳐 게이트웨이 41 `AutoSellCommandReq` action 1/2 로, `user.settings.set` 11값이 42 `UserSettings`(present 미적재)로 나간다. Ready 때마다 34 뒤에 43 을 보내고, 새로 인증한 탭은 84 캐시가 있을 때만 `queued.window` 바로 뒤에 `user.settings` 1프레임을 받는다. 서버가 보내는 84 · 60 · 54 를 relay 가 지어내지 않는다.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-10-05T05:31:26Z
- **Completed:** 2026-10-05T05:42:30Z
- **Tasks:** 2/2
- **Files modified:** 13 (신규 1 · 수정 12)

## Accomplishments

- shared 에 인바운드 계약 2종과 `USER_SETTINGS_RANGES` 를 두었다. 범위는 fbs 주석 원문이고, relay zod 와 27-06 의 `/me` 시트가 이 상수 하나를 읽는다.
- relay 조립기 3개를 만들었다. 41 은 `buildSetLimitChaserReq` 와 같은 폭으로 자르고 같은 가드를 쓴다. 문자열은 테이블을 열기 전에 만든다. 42 는 `present` 슬롯을 싣지 않는다. 43 은 `buildBareRequest` 를 그대로 쓴다.
- wss 분기 2개를 `lc.arm` 바로 뒤에 두었다. 41 은 `#accountAllowed`(IDOR)를 거치고, 둘 다 pending FIFO 에 넣지 않으며 재전송 경로도 없다.
- `requestStrategySnapshot` 이 34 다음에 43 을 보낸다. 인증 직후 재생은 캐시가 있을 때만 `user.settings` 를 보낸다(`queued.window` 와 같은 3상태 규율).
- 가짜 게이트웨이와 e2e 픽스처에 41/42 리더와 84 주입구를 더했다. 43 자동응답은 기본이 무응답이다.

## Task Commits

1. **Task 1: 조립기 41 · 42 · 43 + shared 계약 · USER_SETTINGS_RANGES** — `9b8092e2` (feat)
2. **Task 2: 프레임 중계 · #onReady 43 · 인증 직후 재생 · 가짜 게이트웨이 · e2e 픽스처** — `ccfb13c9` (feat)

## TDD 기록

- Task 1 RED: 새 describe 9건이 실패했다(빌더 · 상수 미정의). GREEN 은 9 passed.
- Task 2 RED: 커밋 전 production 3파일(fanout · protocol · hub)만 Task 1 상태로 되돌려 「Phase 27」 필터로 돌렸다. **16 failed** 가 나왔고, 원본을 복원하니 35 passed 였다. 옛 코드에서도 통과한 것은 ④ 54 통과 3건 · zod close 2건 · 27-01 기존 케이스다. ④ 는 의도된 잠금 테스트로, relay 제품 코드에 54 src 허용목록이 없다는 현행 동작을 고정한다.

## ws-autosell 케이스 목록 (`relay/tests/ws-autosell.test.ts`)

- ①-1 start → 41 · action 1 · isin/계좌/KRX 그대로(`strategyRequests()` 41 1건)
- ①-2 stop → action 2 · NXT 그대로
- ①-3 성공은 기존 `lc`(60 에코)로만 온다 — 새 `t` 가 생기지 않는다
- ①-4 action 「pause」 → close(4400) · 41 0건
- ②-1 화이트리스트 밖 계좌 → 거부 프레임(같은 문구 · src Relay) · 41 0건 · 로그 계좌 마스킹 · 소켓 유지
- ②-2 전략 세션 없음(dma_credentials 미등록) → 41 · 42 모두 0바이트
- ②-3 세션 미준비 → 거부 상태 프레임 · 41 · 42 0건
- ②-4 41 3연타 뒤 빈 61 → 어느 칸도 건드리지 않는다(FIFO 무오염 · 재전송 없음)
- ③-1 user.settings.set → 42 1건 · 11값 일치 · `presentSlotEmpty`(실어 보낸 `present` 는 strip)
- ③-2 42 뒤 relay 는 84 를 내지 않는다 — 게이트웨이가 84 를 밀 때만 `user.settings`
- ③-3 매도 주기 61 → close(4400) · 42 0건
- ③-4 `seedUserSettings` → Ready 의 43 1건 → 84 → 탭에 `user.settings` 1프레임 · hub 캐시
- ④ `it.each` 「Phase 27 54 새 src 통과」 3행 — ERROR AutoSellCommand · ERROR SetUserSettings(isin '') · INFO AutoSell. `src · lv · i · a · m` 동등

## 인증 직후 프레임 단언 무변경 확인

- `git diff 9b8092e2..HEAD -- relay/tests/fanout.test.ts` 에서 삭제된 줄(`^-`)은 **0**이다. 추가만 있었다(「Phase 27 인증 직후 user.settings」 1케이스).
- ⑭ · ⑭-2 · ⑭-4 · ⑭-5(nxt.snap 스냅샷 묶음 끝) 등 기존 인증 직후 단언은 수정 없이 green 이다. 가짜 게이트웨이 43 자동응답이 기본 null 이라 기존 테스트에는 `user.settings` 프레임이 생기지 않는다(Pitfall 10).

## Decisions Made

frontmatter key-decisions 를 따른다. 실행 브랜치는 master 다(오케스트레이터 지시 · 저장소 규약). 커밋할 때는 경로를 하나씩 지정해 스테이징했고, 동시 세션의 `28-CONTEXT.md` 변경은 건드리지 않았다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] shared `index.ts` 재수출 추가**
- **Found during:** Task 1
- **Issue:** 플랜 files 에 `packages/shared/src/index.ts` 가 없다. 그대로 두면 `RelayAutoSellCmdMsg` · `RelayUserSettingsSetMsg` · `USER_SETTINGS_RANGES` 를 relay 가 `@gh-radar/shared` 에서 import 할 수 없다(27-01 과 같은 결손).
- **Fix:** index.ts 의 Phase 27 묶음 옆에 세 심볼을 재수출했다.
- **Committed in:** `9b8092e2`

**2. [Rule 1 - Bug] `protocol.ts` 주석의 `.strict()` 문자열이 수용 기준 grep 을 흔듦**
- **Found during:** Task 2 수용 기준 확인
- **Issue:** 새 스키마 JSDoc 의 「`.strict()` 금지」 문구 때문에 `grep -c "strict()"` 가 3에서 4로 늘었다. 기준은 「전후 같다」이다.
- **Fix:** 문구를 「엄격 모드 금지」로 바꿨다. 결과는 3 = 3이다.
- **Committed in:** `ccfb13c9`

**3. [계획 보정] fake-gateway 에 `reset()` 이 없다**
- 플랜은 「`reset()` 이 null 로 되돌린다」고 했지만, 가짜 게이트웨이에는 그런 메서드가 없다. 그래서 `seedUserSettings(null)` 을 끄는 경로로 쓰고, e2e `LocalRelay.reset()` 이 그것을 부르게 했다. 새 메서드는 만들지 않았다.

---

**Total deviations:** 2 auto-fixed (Rule 3 ×1 · Rule 1 ×1) + 계획 보정 1
**Impact on plan:** 범위는 넓어지지 않았다. 계약 노출 1건, 기준 문자열 1건, 존재하지 않는 메서드 1건을 플랜에 맞춰 보정했다.

## Issues Encountered

- 테스트 생성 스크립트의 따옴표가 bash heredoc 에서 이스케이프를 잃어 TS 구문 오류가 났다. 테스트 이름을 「pause」 표기로 바꿔 고쳤다.

## Verification

- shared build → relay typecheck · typecheck:tests → webapp typecheck(e2e 픽스처 포함) — 모두 exit 0, `error TS` 0
- `envelope.test.ts -t "Phase 27 요청 조립기"` 9 passed · 파일 전체 181 passed
- `ws-autosell · protocol · fanout · hub -t "Phase 27"` 35 passed
- relay 전체 **36 files / 985 tests green** · webapp 전체 140 files / 3213 passed(1 skipped)로 회귀 확인
- 금지 항목: `relay/src/generated/**` · `relay/src/dma/msg-type.ts` diff 0줄 · `strict()` 개수 3 = 3 · 42 에 대한 84 합성 없음(③-2) · 54 본문 해석 없음(④)

## Known Stubs

없음.

## User Setup Required

없음. 배포는 executor 범위 밖이다(27-09). 배포 순서는 relay 먼저다 — 옛 relay 는 `autosell.cmd` · `user.settings.set` 을 모르는 `t` 로 보고 close(4400) 한다(Pitfall 11).

## Next Phase Readiness

- 27-03(shared 조립기 · 라벨)은 이 플랜과 독립이라 바로 진행할 수 있다.
- 27-05 · 27-06 · 27-07 이 쓸 프레임(`autosell.cmd` · `user.settings.set` · `user.settings` 재생)과 e2e 주입구(`pushUserSettings` · `seedUserSettings` · `readAutoSellCommandRequest` · `readSetUserSettingsRequest` · 기존 `pushServerMessage`)가 모두 준비됐다.

## Self-Check: PASSED

---
*Phase: 27-auto-sell-integration*
*Completed: 2026-10-05*
