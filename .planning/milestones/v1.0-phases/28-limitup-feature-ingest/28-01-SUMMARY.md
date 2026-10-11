---
phase: 28-limitup-feature-ingest
plan: 01
subsystem: relay · shared · webapp (작업대 상따 카드)
tags: [relay, flatbuffers, limit-feature, msgtype-85, websocket, react, card-tabs, tracer, playwright]
status: complete

requires:
  - phase: 27-auto-sell-integration
    provides: "생성물 2404509b(85 LimitFeature · MemberDelta 접근자) · INBOUND 27종 · 85 debug 드롭 상태 · 카드 탭 3개"
provides:
  - "relay 85 수신: MSG.LimitFeature · INBOUND 28종 · parseLimitFeature · hub #limitFeatures 키 캐시 · getLimitFeature · FULL 소켓 전용 limit.feature 팬아웃"
  - "shared 계약 RelayLimitFeatureMember · RelayLimitFeatureMsg(t: limit.feature) · RelayOutbound +1"
  - "shared 숫자 함수 formatEok · formatDuration · formatRatePct · formatGroup · limitFeatureCells(지금 행) · limitFeatureTabSuffix"
  - "웹 스토어 limitFeatures(시장 배치) · useRelaySubscription.limitFeature · 카드 level full 게이트 · 카드 탭 「상한가」 · LimitFeatureTable"
  - "테스트 헬퍼 buildLimitFeatureFrame · FakeGateway.sendLimitFeature · e2e pushLimitFeatureFixture · P28-1"
affects: [28-05, 28-07, 28-09, 28-11, 28-14]

plan_head_before: 78486f1b2915b85dd0b9861b7b1961b60c3f34fa
actuals:
  tokens: 17500   # chars/4 over 28-01 의 추가 줄(packages · relay · webapp diff)
  tasks: 3
  commits: 8      # MEASURED rev-list 78486f1b..HEAD — 그중 28-01 자기 커밋 4개 · 나머지 4개는 동시 세션(27-09 마감 · 27 코드 리뷰) 커밋

tech-stack:
  added: []
  patterns:
    - "공개 시세 파생값은 HubMarketEvent 유니온으로 · FULL 전용은 #deliverMarket 의 tape 와 같은 줄"
    - ".NET 0 에서 먼 쪽 반올림을 정수 십분위 산술로 재현(formatEok · formatRatePct)"
    - "카드 소비값의 level 게이트 — 구독 level 이 full 일 때만 85 를 쓴다(얼린 값 방지)"

key-files:
  created:
    - packages/shared/src/limit-feature.ts
    - packages/shared/src/__tests__/limit-feature.test.ts
    - webapp/src/components/trading/card/limit-feature-table.tsx
  modified:
    - packages/shared/src/relay.ts
    - packages/shared/src/index.ts
    - relay/src/dma/msg-type.ts
    - relay/src/dma/envelope.ts
    - relay/src/hub/subscription-hub.ts
    - relay/src/ws/fanout.ts
    - relay/src/dma/__tests__/codec.test.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - relay/tests/hub.test.ts
    - relay/tests/fanout.test.ts
    - relay/tests/helpers/frames.ts
    - relay/tests/helpers/fake-gateway.ts
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/relay-provider.tsx
    - webapp/src/lib/__tests__/relay-socket.test.ts
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/components/trading/card/card-tabs.tsx
    - webapp/src/components/trading/__tests__/card-tabs.test.tsx
    - webapp/src/components/trading/__tests__/card-body.test.tsx
    - webapp/e2e/fixtures/relay.ts
    - webapp/e2e/specs/trading-workbench.spec.ts
    - webapp/e2e/specs/order-log.spec.ts

key-decisions:
  - "85 는 공개 시세 파생값이라 HubMarketEvent.msg 유니온을 RelayQuote | RelayTape | RelayLimitFeatureMsg 로 넓혔다(T-26-01 규칙 안) — 사용자 데이터 타입은 여전히 못 싣는다"
  - "useStrategyCardState 의 limitFeature 는 subscription.limitFeature ?? null — 소켓 상태를 부분만 흉내 내는 테스트 스텁에서도 「85 없음」 으로 수렴"
  - "탭 트리거 접미의 앞 공백은 span 밖 텍스트 노드로 둔다 — span 첫 글자 공백은 접근 이름 계산에서 잘려 「상한가· 잠김」 이 된다"
  - "list_shares · team_sim 은 브라우저 프레임에 싣지 않는다(표시 자리 없음)"

patterns-established:
  - "85 단언은 생성 enum(MsgType.LimitFeature)으로 프레임을 만들어 화이트리스트 단언이 헬퍼에 기대지 않게 한다(buildQueueProgressFrame 규율)"

requirements-completed: [D-01, D-02, D-03, D-04, D-05, D-23]

coverage:
  - id: D1
    description: "relay 가 quote 연결의 85 를 파싱 · 키별 캐시하고 그 키를 FULL 로 잡은 브라우저 소켓에만 limit.feature 로 내린다(price 소켓 0)"
    requirement: D-01
    verification:
      - kind: unit
        ref: "relay/tests/fanout.test.ts#LF1 같은 키를 full 소켓 하나 · price 소켓 하나가 잡은 상태에서 quote 연결 85 → full 소켓 1프레임 · price 소켓 0"
        status: pass
      - kind: unit
        ref: "relay/tests/hub.test.ts#Phase 28 85 LimitFeature (6건)"
        status: pass
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#Phase 28 parseLimitFeature (6건)"
        status: pass
    human_judgment: false
  - id: D2
    description: "PC-12 — 85 INBOUND 28종 승격 · OUT_OF_SCOPE 68·70·74·75·81·82 · hub 명시 case 2곳 · 단언 뒤집기가 한 커밋(86cc9148)"
    requirement: D-01
    verification:
      - kind: unit
        ref: "relay/src/dma/__tests__/codec.test.ts#Phase 28 INBOUND_MSG_TYPES 는 응답 대역(50~85)만 담는다 — 28종"
        status: pass
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#Phase 28 ⑤-a4 강등 집합은 응답 대역 6종뿐"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-03 지금 행 · D-04 탭 제목 접미 — WinForms BuildLimitFeatureCells 와 같은 글자(1.2억 · 0.0% · 1분 3초 · 단일가 접두)"
    requirement: D-03
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/limit-feature.test.ts (20건)"
        status: pass
    human_judgment: false
  - id: D4
    description: "카드 네 번째 탭 「상한가」 · 자동 전환 없음 · 카드 높이 불변 · 탭 본문 스크롤 없음 · lock 2 「상한가 · 깨짐」"
    requirement: D-02
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/card-tabs.test.tsx#Phase 28 상한가 탭 (5건)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P28-1 상한가 특징 한 경로"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-05 — 접힌 카드(price 구독)는 85 를 받지도 쓰지도 않는다(fanout full 전용 + 카드 level 게이트)"
    requirement: D-05
    verification:
      - kind: unit
        ref: "relay/tests/fanout.test.ts#LF1 (price 소켓 0프레임)"
        status: pass
    human_judgment: true
    rationale: "카드 쪽 level 게이트(subLevel === full)는 단위 테스트로 직접 잡지 않았다 — 접었다 펼친 카드의 「—」 · 스냅샷 복원은 28-05 e2e 가 잠근다"
  - id: D6
    description: "D-23 캐시 절반 — hub 키별 마지막 1프레임 · 구독 없는 키 버림 · #releaseKey · closeAll 정리 / 웹 스토어 시장 배치 · 교체 · reset"
    requirement: D-23
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#linger 0 해제 뒤 캐시 없음 · closeAll 뒤 캐시 없음"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/relay-socket.test.ts#Phase 28 limit.feature (4건)"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-10-05
---

# Phase 28 Plan 01: 85 상한가 특징 트레이서 Summary

**스텁 게이트웨이 85 한 프레임이 relay `parseLimitFeature` → hub 키 캐시 → FULL 소켓 전용 `{t:"limit.feature"}` → 웹 100ms 시장 배치 스토어 → 펼친 작업대 카드의 네 번째 탭 「상한가 · 잠김 43초」 · 지금 행 「잠김 43초째 | 대기 17.3억 | 소진 —」 까지 한 줄로 선다(Playwright P28-1 green)**

## Performance

- **Duration:** 약 25분
- **Started:** 2026-10-05T08:04:39Z
- **Completed:** 2026-10-05T08:29:21Z
- **Tasks:** 3/3 (트레이서 1 · auto 2)
- **Files modified:** 25 (신규 3 · 수정 22)

## Accomplishments

- relay 85 수신 와이어 — `MSG.LimitFeature = 85`, INBOUND **27 → 28종**, OUT_OF_SCOPE `68, 70, 74, 75, 81, 82`(Phase 27 의 85 debug 드롭 되돌림), `parseLimitFeature`(bigint 전부 `toNum` · 창구 `takeCount(3)` · 슬롯/isin/거래소 드롭), hub `#limitFeatures` 키 캐시 + `getLimitFeature`, `#onFeedFrame` 명시 case · 사용자 세션 `#onFrame` warn case, fanout 은 tape 와 같은 줄에서 full 소켓만.
- shared 계약 `RelayLimitFeatureMsg`(30필드 camelCase · `list_shares`/`team_sim` 제외)와 WinForms 동형 숫자 함수 — `formatEok(115_000_000)` 이 「1.2억」(JS `toFixed` 는 1.1), `formatRatePct(-4)` 가 「0.0%」.
- 웹 — `RelayData.limitFeatures` 를 기존 `applyMarketFrames` copy-on-write 배치로 갱신(별도 리듀서 없음), `useRelaySubscription.limitFeature`, 카드는 level `"full"` 일 때만 사용, `CardTab` +`"limit"`, `LimitFeatureTable`(3행 · 공통 고정 높이를 정확히 채움 · 스크롤 0).
- e2e P28-1 — 진짜 브라우저 → 진짜 relay → 스텁 게이트웨이 85: 탭 이름 · 자동 전환 없음 · 지금 행 3칸 · 카드 높이 전후 동일 · 탭 본문 `scrollHeight == clientHeight` · lock 2 「상한가 · 깨짐」 「매도벽 0.9억+」.

## Task Commits

1. **Task 1: 트레이서(relay 원자 와이어)** — `86cc9148` (feat) — PC-12 한 커밋: msg-type · envelope · hub · fanout · shared 계약 · 단언 뒤집기 · 헬퍼 · 테스트
2. **Task 2: 웹 끝** — `7e9fdbe0` (feat) — shared 숫자 함수 · 스토어 · level 게이트 · 카드 탭 · 테이블
3. **Task 3: Playwright P28-1** — `1e85f4f6` (test)
4. **Task 3 후속(Rule 1): 주문로그 e2e 카드 탭 4개 단언** — `8a1b6c11` (test)

**Plan metadata:** 이 SUMMARY 커밋(docs)

같은 구간에 동시 세션 커밋 4개가 끼어 있다(`2cdefdc9` · `e4edc7e7` · `9c700f44` 27-09 배포 마감, `3048cc54` 27 코드 리뷰) — `actuals.commits: 8` 은 측정값 그대로다.

## INBOUND 계수 · 뒤집은 단언

| 자리 | 전 | 후 |
|---|---|---|
| `INBOUND_MSG_TYPES.size` | 27 | **28** (`MSG.LimitFeature` 끝에 추가) |
| `OUT_OF_SCOPE_INBOUND_MSG_TYPES` | `68, 70, 74, 75, 81, 82, 85` | `68, 70, 74, 75, 81, 82` |
| `codec.test.ts` 「Phase 27 재동기화 4종」 | 85 는 INBOUND 아님 · `MSG` 에 `LimitFeature` 없음 | 85 단언 제거 → 새 테스트 「Phase 28 85 LimitFeature 는 수신 대역이다」(`MSG.LimitFeature === MsgType.LimitFeature === 85` · `INBOUND.has(85)`) |
| `codec.test.ts` INBOUND 크기 | `toBe(27)` · 상한 `≤ 84` · 이름 「(50~84)」 | `toBe(28)` · `≤ 85` · 「Phase 28 … (50~85)만 담는다 — 28종」 |
| `envelope.test.ts` ⑤-a85 | 「85 는 범위 밖 — debug 드롭」 | 「Phase 28 ⑤-a85 85 는 파싱된다 — 드롭 0」 |
| `envelope.test.ts` ⑤-a4 | `[68, 70, 74, 75, 81, 82, 85]` · 「7종」 | `[68, 70, 74, 75, 81, 82]` · 「6종」 |
| `hub.test.ts` Phase 27 describe | 「85 LimitFeature 는 화이트리스트 밖」 테스트 · describe 이름 「· 85 강등」 | 테스트 삭제 · 이름에서 「85 강등」 삭제 → 새 describe 「Phase 28 85 LimitFeature」 6건 |

## Files Created/Modified

- `packages/shared/src/limit-feature.ts` — 숫자 함수 · 9칸 · 탭 접미(신규)
- `packages/shared/src/relay.ts` · `index.ts` — 85 계약 · export
- `relay/src/dma/msg-type.ts` · `envelope.ts` — 화이트리스트 · 파서
- `relay/src/hub/subscription-hub.ts` · `relay/src/ws/fanout.ts` — 캐시 · 명시 case · full 전용 팬아웃
- `relay/tests/helpers/frames.ts` · `fake-gateway.ts` — `buildLimitFeatureFrame` · `sendLimitFeature`
- `webapp/src/lib/use-relay-socket.ts` · `relay-provider.tsx` — 스토어 · 구독 훅
- `webapp/src/components/trading/card/{strategy-card,card-tabs,limit-feature-table}.tsx` — level 게이트 · 탭 · 표
- `webapp/e2e/fixtures/relay.ts` · `specs/trading-workbench.spec.ts` · `specs/order-log.spec.ts` — P28-1 · 탭 4개 단언

## TDD (Task 2 — tdd="true")

- **RED:** `limit-feature.test.ts` 20건을 빈 스텁 모듈(모든 함수가 `""`/`[]` 반환)에 대고 실행 → 20건 전부 `AssertionError`(예: `expected '' to be '1.2억'`, `expected [] to have a length of 9`) — 대상 테스트가 행동 단언에서 실패한 유효 RED.
- **GREEN:** 정수 십분위 반올림 구현 → 20 passed.
- **REFACTOR:** 없음.
- 플랜이 Task 2 를 한 커밋으로 지정해(「커밋 3개」) RED 를 별도 `test(...)` 커밋으로 남기지 않았다 — plan `type: execute` 라 tdd 게이트 강제 대상은 아니다.

## Decisions Made

- 85 를 `HubMarketEvent` 유니온에 넣었다 — 공개 시세 파생값(계좌 · 주문자 없음)이라 T-26-01 규칙 안이다. 「넓히지 말 것」 주석 아래에 이유를 적었다.
- 탭 트리거 접미 앞 공백은 span 밖 텍스트 노드로 둔다 — 첫 시도(span 안 `" · "`)는 접근 이름이 「상한가· 잠김 43초」 가 됐다.
- `strategy-card` 의 `limitFeature` 는 `subscription.limitFeature ?? null` — 부분 스텁을 쓰는 기존 카드 테스트 95건이 `undefined.lockState` 로 깨지는 것을 제품 쪽에서 수렴시켰다(테스트 파일 수십 곳을 고치는 대신).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 카드 상태 테스트 스텁 타입 · 부분 스텁 수렴**
- **Found during:** Task 2
- **Issue:** `StrategyCardState.limitFeature` 필수 필드 추가로 `card-body.test.tsx` 의 `cardState()` 가 타입 오류, 그리고 `useRelaySubscription` 을 부분 흉내 내는 카드 흐름 테스트들이 `limitFeature: undefined` → `limitFeatureTabSuffix` 에서 `TypeError`(95건 실패).
- **Fix:** `card-body.test.tsx` 스텁에 `limitFeature: null`, `strategy-card.tsx` 에서 `subscription.limitFeature ?? null`.
- **Files modified:** `webapp/src/components/trading/__tests__/card-body.test.tsx`, `webapp/src/components/trading/card/strategy-card.tsx`
- **Verification:** webapp 전체 단위 141 files · 3334 passed
- **Committed in:** `7e9fdbe0`

**2. [Rule 1 - Bug] 탭 접미 접근 이름 공백 소실**
- **Found during:** Task 2 (card-tabs 단위 테스트)
- **Issue:** span 첫 글자 공백이 접근 이름 계산에서 잘려 「상한가· 잠김 43초」.
- **Fix:** 공백을 span 밖 텍스트 노드로 이동(플렉스 컨테이너에서 공백 전용 텍스트 노드는 그려지지 않아 시각 변화 없음 — 스크린샷 확인).
- **Committed in:** `7e9fdbe0`

**3. [Rule 1 - Bug] 기존 e2e 의 카드 탭 3개 단언**
- **Found during:** Task 3 후 회귀 확인
- **Issue:** `order-log.spec.ts` P25-7(탭 id 3개) · P25-9(폰 390 탭 줄 원소 6개)가 탭 4개에서 깨진다.
- **Fix:** `['info','unfilled','holdings','limit']` · 7개로 갱신(폰 390 에서도 탭 줄 한 줄 · 가로 넘침 0 은 그대로 통과 — 로그 `cardBar centers spread=0.0 over=0`).
- **Files modified:** `webapp/e2e/specs/order-log.spec.ts`
- **Verification:** order-log · unfilled-progress 18 passed
- **Committed in:** `8a1b6c11`

**4. [문서] msg-type.ts 대역 주석** — 「요청 1~38 · 응답 50~83」 을 「1~43 · 50~85」 로(41~43 · 84 · 85 가 이미 있었다). `86cc9148`.

---

**Total deviations:** 3 auto-fixed (Rule 3 1 · Rule 1 2) + 주석 정정 1
**Impact on plan:** 모두 이 플랜의 변경이 직접 만든 깨짐을 닫은 것 — 범위 확장 없음.

## Issues Encountered

- 첫 e2e 묶음 실행에서 webServer 가 `NextFontGoogleFontFileReplacer` 반복으로 타임아웃 — 메모리대로 `rm -rf webapp/.next` 후 재실행해 통과(코드 문제 아님).
- 실행 전제 「Phase 27 배포 뒤」: 시작 시점 27-09 SUMMARY 는 초안(Task 2 대기)이었으나 오케스트레이터가 디스패치했고, 실행 도중 동시 세션이 27-09 를 마감했다(`e4edc7e7` — relay 78486f1b 배포 · push). 이 플랜의 relay 변경은 아직 배포되지 않았다(배포는 28-14/15 메인 세션).
- pre-commit 의 보호 브랜치 단언(`git.base-branch --is-protected master` = true)은 프로젝트 규칙(「작업은 master 에서」 · 디스패치 「branch master · normal commits」 · `branching_strategy: none`)을 따라 적용하지 않았다.

## Verification

- relay: shared build → `typecheck` · `typecheck:tests` 0 오류 → `-t "Phase 28"` 17 passed → 전체 **36 files · 998 passed**(직전 985).
- shared: `limit-feature.test.ts` 20 passed · 전체 15 files · 320 passed.
- webapp: `typecheck`(e2e tsconfig 포함) 0 오류 · 전체 단위 **141 files · 3334 passed · 1 skipped**.
- e2e: P28-1 passed · `trading-workbench.spec.ts` + `a11y.spec.ts` **86 passed** · `order-log.spec.ts` + `unfilled-progress.spec.ts` **18 passed**.
- 시각 확인: 1280 · 390 카드 탭 줄 한 줄 · 3행 표 잘림 없음(스크린샷 — 커밋하지 않음).
- `git status --porcelain -- relay/src/generated` 0줄(생성물 무변경).

## Known Stubs

- `packages/shared/src/limit-feature.ts` `limitFeatureCells` — 10초 · 창구 행 6칸이 늘 「—」(faint). **의도된 스텁**: 플랜이 이 칸을 28-07(우세 % 짝수 반올림 · 잔량 신규/취소 · 회원사명 · 깨짐확률 · 폰 축약)로 미뤘다.
- `webapp/src/components/trading/card/card-tabs.tsx` `isStale` prop — 전달만 하고 아직 쓰지 않는다(접속 끊김 표기는 28-07).
- FULL 구독 직후 캐시 스냅샷 송신(`#sendLimitFeatureSnapshot`) · 접힘 시 웹 키 삭제는 28-05.

## User Setup Required

None - 외부 서비스 설정 없음.

## Next Phase Readiness

- 28-05(스냅샷 · 접힘 해제)는 `hub.getLimitFeature` 와 웹 `limitFeatures` 위에 바로 선다. 28-07 은 `limitFeatureCells` 의 칸 4~9 와 `LimitFeatureCell.narrow` 를 채운다.
- 실 85 는 gh-trade 서버 Phase 27 배포 뒤에만 온다(RESEARCH Pitfall 14) — 장중 실데이터 확인은 배포 뒤 수동 항목.

---
*Phase: 28-limitup-feature-ingest*
*Completed: 2026-10-05*

## Self-Check: PASSED
