---
phase: 27-auto-sell-integration
plan: 01
subsystem: relay+shared+webapp (상따 자동매도 와이어)
tags: [flatbuffers, gh-trade-sync, relay, zod, latch-led, playwright, tracer]
status: complete

requires:
  - phase: 24-limitchaser-buy3
    provides: buy3_schema 파생(1·2·3) · LC_BUY3_ECHO_DEFAULTS · 매수 LED 「보유중」 · P24-1 트레이서
  - phase: 25-order-log-progress
    provides: 77/83 사용자별 캐시 · Ready 게이트 패턴 · PC-12 화이트리스트 = hub 명시 case 규율
  - phase: 26-shared-quote-feed
    provides: quote 연결(#onFeedFrame) 명시 warn case 경계
provides:
  - gh-trade 2404509b 생성물(SYNC MARKER 2404509b · blob 68679e9a) — MsgType 41/42/43/84/85 · SetLimitChaser 자동매도 8필드 · UserSettings
  - relay schema 4 파생(LC_AUTO_SELL_BUY3_SCHEMA) · 자동매도 요청 4필드 적재 · 버스트 해제 schema ≥ 3 적재
  - relay 84 수신(parseUserSettings · hub #userSettings 캐시 · Ready 게이트 팬아웃 · getUserSettings)
  - shared RelayLimitChaser 8필드 · LIMIT_CHASER_SERVER_AUTO_SELL_FIELDS · RelayUserSettingsValues/Msg
  - 자동매도만 켠 등록 = 등록(웹 isDeleteIntent ↔ relay #isTeardown 여섯 항 · isActiveStrategy)
  - 카드 헤더 4번째 LED 「자동」(칩 · 접힌 점)
affects: [27-02 relay 41/42/43 중계 · 인증 재생, 27-03 조립기, 27-04 카드 자동매도 그룹, 27-05 바로시작/중지, 27-06 /me 기본설정, 27-07 84 시딩, 27-09 배포]

actuals:
  tokens: 83500     # chars/4 over git diff 465e7372..HEAD (생성물 포함 · 334,132 chars)
  tasks: 3
  commits: 4        # MEASURED rev-list 465e7372..HEAD — 이 플랜 3 + 동시 세션 1(aef4d0d1 docs(28), 이 플랜 아님)
plan_head_before: 465e737247a3567fdca8e8a74d043f9b273f91ea

tech-stack:
  added: []
  patterns:
    - "buy3_schema 는 필드 존재 단조 파생 — 4 = postBuyAuto + extraBuyBurstRelease + 자동매도 4필드 모두"
    - "에코 전용 필드는 shared SERVER_*_FIELDS 그룹 상수로 묶어 Omit · 로그 skip 이 같은 const 에서 파생"
    - "84 사용자별 최신 1건 캐시 — 77 동형 3상태(undefined = 모름)"

key-files:
  created:
    - relay/src/generated/stock-dma/auto-sell-command-req.ts
    - relay/src/generated/stock-dma/user-settings.ts
    - relay/src/generated/stock-dma/limit-feature.ts
    - relay/src/generated/stock-dma/member-delta.ts
    - relay/src/generated/stock-dma/team-sim.ts
  modified:
    - relay/src/generated/StockDMA.fbs
    - relay/src/dma/msg-type.ts
    - relay/src/dma/envelope.ts
    - relay/src/hub/subscription-hub.ts
    - relay/src/ws/protocol.ts
    - relay/src/ws/fanout.ts
    - packages/shared/src/relay.ts
    - packages/shared/src/index.ts
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/components/trading/latch-led.tsx
    - webapp/src/components/trading/card/card-header.tsx
    - webapp/src/components/trading/strategy-log.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts

key-decisions:
  - "schema 4 는 자동매도 4필드 존재로만 파생하고, 4필드가 일부라도 있는데 schema 가 4 가 아니면 미적재 + 값 없는 warn 1줄(isin · buy3Schema 만)"
  - "자동 LED 툴팁: 상태 OFF(0 · 범위 밖)는 「자동매도 꺼짐」, 전략 없음(server null)은 툴팁 없음 — C# D-02 「전략 없음 = 툴팁 없음」 규약 유지"
  - "사이드바 LED 점은 3개 그대로(D-04 범위는 카드 헤더 · 접힌 카드 점) — a11y.spec [data-led] 3 단언 유지"
  - "fake-gateway readSetLimitChaserRequest 에 autoSellReqSlots(140~146 존재 슬롯)도 노출 — schema ≤ 3 요청에 4슬롯 없음을 슬롯으로 잠그기 위해"

requirements-completed: []

coverage:
  - id: D1
    description: "gh-trade 2404509b 생성물 동기화(13 경로) + 수기 사본 3곳 + 깨지는 단언 3개가 한 커밋"
    verification:
      - kind: other
        ref: "RELAY=… sync-relay-schema.sh --check → 신규/변경 예정 0 개 · .fbs 사본 최신 · rev-parse blob 68679e9a · SYNC MARKER 2404509b"
        status: pass
      - kind: unit
        ref: "relay/src/dma/__tests__/codec.test.ts#Phase 27 재동기화로 더한 4종이 생성 enum 과 이름·값 모두 일치한다"
        status: pass
    human_judgment: false
  - id: D2
    description: "relay 트레이서 — lc.set 4필드 → 게이트웨이 10 buy3_schema 4 · 버스트 동반 · 에코 슬롯 없음 → 60 에코 → ws lc 8필드"
    verification:
      - kind: integration
        ref: "relay/tests/fanout.test.ts#⑰-autosell"
        status: pass
    human_judgment: false
  - id: D3
    description: "웹 트레이서 — 값 확정 1회의 lc.set cfg 에 요청 4필드 = 에코 값 · 에코 전용 4키 없음"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx#Phase 27 자동매도 요청 4필드"
        status: pass
    human_judgment: false
  - id: D4
    description: "브라우저 끝 — 값 확정 → schema 4 → 60 에코 매도중/대기/OFF → 카드 헤더 「자동」 LED armed/latent/off · 390 · 1280 헤더 한 줄"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P27-1"
        status: pass
    human_judgment: false
  - id: D5
    description: "84 수신 — Ready 전 캐시만 · Ready 뒤 팬아웃 · 세션 교체/closeAll 폐기 · quote 84 warn · 85 debug 드롭"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#Phase 27 사용자 설정 84"
        status: pass
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#Phase 27 자동매도 와이어"
        status: pass
    human_judgment: false
  - id: D6
    description: "자동매도만 켠 등록 = 등록(웹 crudOf C · relay 철거 아님) · isActiveStrategy · 전략 로그 skip"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/limit-chaser.test.ts#Phase 27 자동매도"
        status: pass
      - kind: integration
        ref: "relay/tests/fanout.test.ts#Phase 27 자동매도만 켠 등록"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/strategy-log.test.tsx#Phase 27 자동매도 에코"
        status: pass
    human_judgment: false
  - id: D7
    description: "LED 4번째 「자동」 5상태 판정 · 클릭 불가 · 툴팁 · 접힌 점 4개"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/latch-led.test.tsx#Phase 27 자동 LED"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/card-header.test.tsx#Phase 27 카드 헤더 「자동」 LED"
        status: pass
    human_judgment: false

duration: 33min
completed: 2026-10-05
---

# Phase 27 Plan 01: 자동매도 와이어 트레이서 Summary

**gh-trade 2404509b 스키마를 relay 생성물로 받고, 값 확정 한 번이 buy3_schema 4 로 게이트웨이 10 에 닿아 60 에코 자동매도 상태가 카드 헤더 「자동」 LED(매도중 초록 · 대기/완료 주황 · OFF 회색)로 서는 한 경로를 Playwright P27-1 로 증명했다.**

## Performance

- **Duration:** 33 min
- **Started:** 2026-10-05T04:56:44Z
- **Completed:** 2026-10-05T05:29:30Z
- **Tasks:** 3/3
- **Files modified:** 40 (이 플랜 커밋 3개 기준 · 생성물 13 포함)

## 동기화 기록

- gh-trade master HEAD: `6766a064` (fbs 를 마지막으로 고친 커밋 `2404509b`)
- 정본 blob: `68679e9adf7b3cfe8719d86289a333ff1bbea21f` · SYNC MARKER `server-repo-commit: 2404509b` · flatc 25.12.19
- `--check` 재실행: 신규/변경 예정 0 개 · .fbs 사본 최신
- 생성물 13 경로: 변경 7(`stock-dma.ts` · `stock-dma/{cancel-reason,envelope,msg-type,order-group,set-limit-chaser,strategy-event-kind}.ts`) · 신규 5(`stock-dma/{auto-sell-command-req,user-settings,limit-feature,member-delta,team-sim}.ts`) · `.fbs` 사본 1 — 손편집 0
- TASK_BASE(Task 1 시작 직전 HEAD): `465e737247a3567fdca8e8a74d043f9b273f91ea`

## Accomplishments

- 생성물 + 수기 사본 3곳(`msg-type.ts` MSG 41/42/43/84 · INBOUND 27종 · OUT_OF_SCOPE +85 / `envelope.ts` schema 4 · readLimitChaser +8 · parseUserSettings / `subscription-hub.ts` 84 명시 case 2곳) + 깨지는 단언 3개가 한 커밋(PC-12)
- schema 4 에서 ☐버스트 시 해제가 와이어에서 빠지던 결손(`=== 3`)을 `>=` 로 막음(RESEARCH Pitfall 1)
- 자동매도만 켠 등록이 웹 · relay 어디서도 삭제 · 철거로 나가지 않음(여섯 항 · 같은 커밋)
- 카드 헤더 LED 4칩(칩 · 접힌 점) — WinForms `ledAutoSell` 동형 색, 새 tone · 새 토큰 없음, 늘 `<span>`
- 경계 잠금 21 케이스(relay 20 · webapp 21 — 아래 목록)와 전체 e2e 255 passed

## Task Commits

1. **Task 1: 트레이서(원자 와이어)** — `478541c9` (feat)
2. **Task 2: 브라우저 끝 · LED · 자동만 등록 · P27-1** — `daf68f89` (feat)
3. **Task 3: 트레이서 경계 잠금** — `8f59064d` (test)

(`aef4d0d1` docs(28) 는 이 플랜 실행 중 동시 세션이 master 에 올린 Phase 28 커밋이다 — 이 플랜 소관 아님.)

## typecheck · 단위 테스트가 짚은 테스트 파일

- Task 1(shared 계약 · 폼 값 · 키 수가 끌고 온 것): `relay/src/dma/__tests__/codec.test.ts`(INBOUND 27 · 대역 50~84 · 4종 대조) · `envelope.test.ts`(OUT_OF_SCOPE 85 · 키 수 60→68 ×8) · `relay/tests/fanout.test.ts`(키 수 60→68 ×4 · ⑰-autosell) · `webapp/.../limit-chaser-form.test.tsx`(cfg 45→49 ×4 · FORBIDDEN/EXPECTED 키) · `strategy-log.test.tsx`(SERVER_ONLY 12→16) · `lc/__tests__/lc-tracer.test.tsx`(cfg 49 · Phase 27 케이스) · `webapp/src/test-fixtures/limit-chaser.ts`(17개 인라인 팩토리가 이 픽스처로 컴파일 통과)
- Task 2: `webapp/src/lib/__tests__/limit-chaser.test.ts`(LimitChaserGates · isActiveStrategy 리터럴) · `card-header.test.tsx`(3칩→4칩) · `strategy-card-flow.test.tsx`(⑲-1 · ⑲-3 3→4) · e2e `trading-workbench.spec.ts`(buy3Schema 3→4 ×4 · 테스트 11 LED 4개)
- Task 3: 위 8개 파일 각각 `describe("Phase 27 …")`

## Decisions Made

- frontmatter key-decisions 참조. 실행 브랜치는 master(오케스트레이터 지시 · 메모리 「작업은 master 에서」) — 보호 브랜치 가드는 이 저장소 규약상 master 직접 커밋이라 지시대로 진행했다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] shared `index.ts` 재수출 누락**
- **Found during:** Task 1
- **Issue:** `RelayUserSettingsMsg` · `LIMIT_CHASER_SERVER_AUTO_SELL_FIELDS` 가 `@gh-radar/shared` 에서 export 되지 않아 relay typecheck 실패(플랜 files 에 `packages/shared/src/index.ts` 없음)
- **Fix:** index.ts 에 `RelayUserSettingsValues` · `RelayUserSettingsMsg` · `LIMIT_CHASER_SERVER_AUTO_SELL_FIELDS` 재수출
- **Committed in:** `478541c9`

**2. [Rule 1 - Bug] 기존 e2e buy3Schema 3 단언 4건이 schema 4 로 바뀜**
- **Found during:** Task 2
- **Issue:** Task 1 부터 새 웹이 자동매도 4필드를 늘 실어 relay 가 4 를 파생 — P24-1 · vzy-1 · P24-3 · P24-12 의 `buy3Schema).toBe(3)` 가 깨짐
- **Fix:** 4 로 고치고 주석에 파생 규칙 갱신 · 테스트 11 의 LED 개수 3→4
- **Committed in:** `daf68f89`

**3. [Rule 3 - Blocking] `strategy-card-flow.test.tsx` LED 3개 단언**
- **Found during:** Task 2(전체 단위 테스트)
- **Issue:** 플랜 목록 밖 파일의 ⑲-1 · ⑲-3 이 헤더 LED 3개를 못박음
- **Fix:** 4개(…· 자동)로 갱신
- **Committed in:** `daf68f89`

**4. [Rule 1 - Bug] schema 4 요청마다 버스트 해제 거짓 경고**
- **Found during:** Task 3(경계 테스트가 warn 0 을 단언하다 발견)
- **Issue:** `envelope.ts` 하위 결손 경고가 `buy3Schema !== 3` 이라 schema 4 정상 요청에도 「extraBuyBurstRelease 가 postBuyAuto 없이 왔다」 warn 이 남음
- **Fix:** `buy3Schema < LC_BURST_RELEASE_BUY3_SCHEMA` 로(Task 1 파일 · 같은 커밋)
- **Committed in:** `8f59064d`

---

**Total deviations:** 4 auto-fixed (Rule 1 ×2 · Rule 3 ×2)
**Impact on plan:** 전부 계약 확장이 직접 끌고 온 정합성 수정 — 범위 확장 없음.

## Issues Encountered

- Playwright 가 샌드박스에서 Supabase 인증 호출(socket hang up)로 막혀 샌드박스 밖에서 재실행 — 코드 문제 아님(메모리 「샌드박스는 raw TCP 차단」).
- 실행 도중 다른 세션이 master 에 `aef4d0d1`(Phase 28 docs)을 올림 — 경로 지정 커밋이라 교차 없음.

## Verification

- `sync-relay-schema.sh --check` 0 개 · 최신 · blob/마커 일치
- shared build → relay typecheck · typecheck:tests → webapp typecheck(e2e 포함) 오류 0
- relay 35 files / 952 tests green · webapp 140 files / 3213 passed(1 skipped) green
- P27-1 green · 전체 e2e 255 passed / 9 skipped(exit 0, Task 2 커밋 상태에서 실행)

## Known Stubs

없음.

## User Setup Required

None — 배포 없음(executor 범위 밖 · 27-09 체크포인트).

## Next Phase Readiness

- 27-02(relay 41/42/43 중계 · 인증 직후 84 재생 · 43 송신)가 `getUserSettings` · `parseUserSettings` · `RelayUserSettingsMsg` 위에 바로 선다.
- 배포 전 주의: 새 webapp 은 schema 4 를 싣는다 — relay 먼저 배포(옛 relay zod 는 4필드를 strip 해 schema 3 으로 낮출 뿐 끊기지는 않는다).

## Self-Check: PASSED

---
*Phase: 27-auto-sell-integration*
*Completed: 2026-10-05*
