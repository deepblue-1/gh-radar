---
phase: 27-auto-sell-integration
plan: 06
subsystem: webapp (/me 상따 기본설정 — 42/84 UserSettings)
tags: [react, relay-store, user-settings, numpad, playwright, tdd]
status: complete

requires:
  - phase: 27-02
    provides: "user.settings 인증 직후 재생 · user.settings.set → 42 중계 · shared USER_SETTINGS_RANGES · e2e pushUserSettings · readSetUserSettingsRequest · pushServerMessage"
  - phase: 27-04
    provides: "ChoiceRow(export) · LcSheetShell · SettingRow 44px 행"
provides:
  - "RelayData.userSettings(84 3상태 — undefined = 모름) · applyFrame 'user.settings' · 컨텍스트 userSettings · Provider 폴백 undefined"
  - "PadUnit '초' + 초 단위 칩 줄 · SettingUnit = PadUnit 별칭(단위 목록 한 벌)"
  - "LimitChaserDefaultsSection(`components/me/limit-chaser-defaults.tsx`) — 3상태 칩 · 안내 · 4묶음 11행 · 42 즉시 저장 기계 · 84 플래시 · SetUserSettings 거부 줄"
  - "USER_SETTINGS_ROWS · USER_SETTINGS_GROUPS · USER_SETTINGS_STATUS_TEXT · USER_SETTINGS_SAVE_TEXT · rangeSentence · rangeLabel · userSettingsRangeIssue · userSettingsValuesOf · isSetUserSettingsRejection"
  - "ChoiceRow segmentAlways prop(폭 여유 표면은 인라인 모드에서 늘 세그먼트)"
  - "/me 본문 순서 AccountCard → MeStatusBar → 상따 기본설정 → StrategyStatusCard"
  - "e2e P27-M1(1280 인라인 · 390 터치 시트)"
affects: [27-07 84 시딩(useRelayContext().userSettings 를 그대로 읽는다), 27-09 배포(relay 먼저 — 옛 relay 는 user.settings.set 을 close 4400)]

actuals:
  tokens: 16500     # chars/4 over git diff e54fc655..HEAD (65,925 chars)
  tasks: 3
  commits: 3        # MEASURED rev-list e54fc655..HEAD
plan_head_before: e54fc655f196748c5b272f192787437c24bd582b

tech-stack:
  added: []
  patterns:
    - "전체 교체 요청(42)의 연속 편집은 1건 비행 + 행당 1건 대기열 — 앞 건의 성공 신호(84) 뒤 새 캐시로 다시 조립(Pitfall 8)"
    - "카드 행 부품을 카드 밖에서 쓸 때는 행 목록에 같은 컨테이너 선언(LC_CONTAINER_CLASS)을 달아 폭 규칙을 그대로 받는다"
    - "성공 플래시는 행 래퍼 data-flash + 자손 값 글자 important 색 — SettingRow 의 확정 강조(--primary)와 분리"

key-files:
  created:
    - webapp/src/components/me/limit-chaser-defaults.tsx
    - webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx
  modified:
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/relay-provider.tsx
    - webapp/src/lib/__tests__/relay-socket.test.ts
    - webapp/src/lib/numpad.ts
    - webapp/src/lib/__tests__/numpad.test.ts
    - webapp/src/components/trading/lc/setting-group.tsx
    - webapp/src/components/trading/me-client.tsx
    - webapp/src/components/trading/__tests__/me-client.test.tsx
    - webapp/e2e/specs/me.spec.ts

key-decisions:
  - "D-12 재량 「큐 또는 마지막 승」 = 큐 — 42 는 1건 비행, 비행 중 확정은 행당 1건 대기열(같은 행 재확정은 값만 교체), 84 수신 뒤 새 캐시로 조립 · 이미 그 값이면 성공으로 접고 다음 건"
  - "섹션은 MeStatusBar 뒤 · StrategyStatusCard 앞(목업에서 상태 줄이 계정 카드 바로 아래라 상태줄을 사이에 두지 않음 — 플랜 truth 그대로)"
  - "범위 문구는 NumberPadSheet/InlineValueEditor 의 validate 로만 건다(ctx.min/max 는 넘기지 않음) — padIssue 의 「N초 이상 입력해 주세요」 대신 목업 「{min}~{max}{단위} 사이여야 해요」가 서게"
  - "방법 기본값은 ChoiceRow 에 segmentAlways 를 더해 /me 데스크톱에서 세그먼트로 — 카드의 992 컨테이너 규칙은 /me 섹션(≤900)에서 늘 시트 행이 되므로"
  - "거부(54 SetUserSettings)는 비행 중인 행에 링만(말풍선 없음) — 원문은 섹션 아래 한 줄이 말한다. 3초 무응답 · 대기 건 접힘은 「반영되지 않았어요」 말풍선, send false 는 상따 카드와 같은 「연결이 끊겨 보내지 못했어요」"
  - "SettingUnit 을 PadUnit 별칭으로 바꿨다 — '초' 를 두 목록에 따로 적으면 갈라진다"

patterns-established:
  - "84 캐시 3상태: undefined 면 칩 「불러오는 중」 · 행 흐림 · 모든 확정 무시. present=false 여도 확정 때만 42"

requirements-completed: []

coverage:
  - id: D1
    description: "84 스토어 3상태 — 초기 undefined · 프레임 → 값 · 두 번째 → 교체 · reset → undefined / 키패드 「초」 범위 문구 · 칩"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/relay-socket.test.ts#Phase 27 user.settings — 84 사용자 설정 3상태"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/numpad.test.ts#Phase 27 키패드 단위 「초」"
        status: pass
    human_judgment: false
  - id: D2
    description: "섹션 표시 — 칩 3 · 안내 원문 3 · 4묶음 11행 순서 · 값 표기 · 미수신 흐림/비활성 · present=false 자동 42 없음 · /me 배치 순서 · DMA 게이트 분기 없음"
    verification:
      - kind: unit
        ref: "webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx#Phase 27 상따 기본설정 표시"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/me-client.test.tsx#Phase 27 /me 상따 기본설정 배치 (D-10)"
        status: pass
    human_judgment: false
  - id: D3
    description: "즉시 저장 기계 — 42 = 84 캐시 + 1칸 · 시트 범위 잠금(61초 · 0% 허용 · 금액 쉼표) · 비행 중 두 번째 확정은 84 뒤 새 캐시 · 플래시(내 42 · 다른 탭) · 3초 실패 재전송 0 · 거부 원문/창 밖 무시 · 방법 선택 1회 · no-op/끊김 · 미수신 무시"
    verification:
      - kind: unit
        ref: "webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx#Phase 27 상따 기본설정 즉시 저장(42)"
        status: pass
    human_judgment: false
  - id: D4
    description: "종단 — /me 불러오는 중 → 84 서버 저장값 · 3초 → 1280 인라인 5 Enter → 게이트웨이 42 11값(내장값 + 5 · present 미적재) → 84 5초 플래시 → 9 확정 + 54 거부 원문 · 재전송 0 · 잘림 0 / 390 터치 시트 61 잠금 · 전송 0 · 잘림 0"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/me.spec.ts#P27-M1"
        status: pass
    human_judgment: false
  - id: D5
    description: "섹션 시각 결(칩 초록/주황 · 플래시 초록 · 거부 빨간 줄 · 세그먼트) — 다크 1280 · 390 목업 대비"
    verification: []
    human_judgment: true
    rationale: "실행 중 1280 플래시 · 거부, 390 섹션 · 시트 스크린샷 4장으로 줄바꿈 · 잘림 · 겹침 없음을 확인했지만 색 결과 목업 동형은 사람 눈 판정이다(라이트 테마 미확인)"

duration: 16min
completed: 2026-10-05
---

# Phase 27 Plan 06: /me 상따 기본설정(42/84) Summary

**`/me` 계정 카드 · 상태줄 아래에 「상따 기본설정」 섹션이 선다. 84 를 받기 전에는 「불러오는 중」 칩과 함께 행이 흐리고, 받으면 「서버 저장값」(초록) 또는 「서버 저장값 없음 · 내장 기본값」(주황) 칩과 함께 11값이 4묶음으로 보인다. 행을 확정하면 그 즉시 42(84 캐시 11값 + 바뀐 1칸)가 나간다. 한 번에 1건만 비행하고, 성공은 84 가 그 값을 실어 오는 것으로 확인해 행이 초록으로 0.7초 반짝인다. 서버 거부는 원문 그대로 섹션 아래 빨간 한 줄로 보인다.**

## Performance

- **Duration:** 약 16 min
- **Started:** 2026-10-05T06:54Z
- **Completed:** 2026-10-05T07:10Z
- **Tasks:** 3/3
- **Files modified:** 11 (신규 2 · 수정 9)

## Accomplishments

- **스토어:** `RelayData.userSettings` 는 `queuedWindow` 와 같은 다섯 자리를 복제했다. `undefined` 는 「84 를 모른다」는 뜻이다. 재접속해도 값을 지우지 않고(relay 가 인증 직후 다시 내린다), `reset` 만 `undefined` 로 되돌린다. Provider 밖 폴백 값에도 넣었다.
- **섹션 표시:** 행은 `SettingRow`, 방법 기본값은 27-04 `ChoiceRow` 를 그대로 쓴다. 새 입력 컴포넌트는 없다. 행 목록에 `LC_CONTAINER_CLASS` 를 달아 카드와 같은 폭 규칙(≥685 쉐브런 · 폰 밴드 L2)을 받는다.
- **저장 기계(`useUserSettingsSave`):** 1건 비행, 행당 1건 대기열, 3초 실패 처리를 한다. 재전송은 없다. 84 효과는 바뀐 행을 플래시하고, 비행 중인 칸의 값이 맞으면 성공으로 처리한 뒤 대기열을 새 캐시로 보낸다. 54 효과는 비행 중일 때만 `ERROR · SetUserSettings` 를 그 행에 귀속한다.
- **범위:** shared `USER_SETTINGS_RANGES` 하나만 읽는다. 시트와 인라인 모두 「1~60초 사이여야 해요」 로 적용을 막는다. 잔량추적 0 · 반등 0 은 서버 범위대로 허용한다.
- **e2e P27-M1:** 1280 인라인과 390 터치 시트 두 시나리오가 실제 relay 와 가짜 게이트웨이 바이트(`readSetUserSettingsRequest`)까지 확인한다.

## Task Commits

1. **Task 1: 84 스토어 슬라이스 3상태 + PadUnit 「초」** — `c4d0f193` (feat)
2. **Task 2: 상따 기본설정 섹션 — 3상태 칩 · 안내 · 4묶음 11행 표시 · /me 배치** — `4530d1f9` (feat)
3. **Task 3: 행 확정마다 즉시 42 — 1건 비행 큐 · 84 플래시 · 3초 실패 · 거부 줄 + e2e P27-M1** — `01f17a02` (feat)

## TDD 기록

- Task 1 RED: `-t "Phase 27"` 실행 결과 2 failed(스토어 `userSettings` undefined · `PAD_CHIPS['초']` 없음). 「초」 문장 자체는 `rangeIssueText` 가 단위를 그대로 붙여 처음부터 통과했다(타입 수준 변경). GREEN: 214 passed.
- Task 2 RED: 컴포넌트 모듈이 없어 수집 단계에서 실패했다(파일 신규). GREEN: 표시 4건 + me-client 배치 2건 통과.
- Task 3 RED: 저장 describe **9 failed**(미수신 무시 1건은 Task 2 의 비활성으로 이미 통과). GREEN: 14 passed. 테스트 오류 2건(키패드 「1」 이 초 칩 「1」 과 겹침 · 54 픽스처 객체를 새로 만들어 「이미 본 메시지」 판정이 깨짐)은 테스트 쪽을 고쳤다.
- 테스트와 구현은 태스크 커밋 하나에 함께 넣었다(플랜의 커밋 3개 계약).

## 행 컴포넌트 재사용 방식

- 값 행 10개는 `SettingRow`(`editing` · `editor` 에 `InlineValueEditor`, 터치 기기면 섹션 하나뿐인 `NumberPadSheet`)를 그대로 쓴다. 편집 판정은 카드와 같은 `useEditMode()` 이다.
- 방법 기본값은 `ChoiceRow` 를 쓴다(옵션 = `AUTO_SELL_METHOD_ORDER` × `AUTO_SELL_METHOD_LABELS`). 카드 규칙은 「컨테이너 992 미만이면 시트 행」 인데, `/me` 섹션은 최대 900 이라 데스크톱에서도 세그먼트가 보이지 않았다. 그래서 `segmentAlways` prop 을 더했다(기본 false — 카드 동작 불변).
- 플래시는 SettingRow 의 `flash`(확정 강조 `--primary` 파랑)를 쓰지 않는다. 행 래퍼의 `data-flash="ok"` 와 자손 값 글자 important 색(`--led-armed`)으로 목업의 초록을 낸다. 색만 바뀌고 움직임은 없다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `SettingUnit` 이 `PadUnit` 과 따로 적혀 「초」 추가가 typecheck 를 깸**
- **Found during:** Task 1 typecheck
- **Issue:** `setting-group.tsx` 의 `SettingUnit` 이 `PadUnit` 과 같은 목록을 따로 들고 있었다. 그래서 `limit-chaser-form.tsx` 에서 TS2322 4건이 났다.
- **Fix:** `SettingUnit = PadUnit` 별칭으로 바꿨다(목록 한 벌). 플랜 files 밖 파일 1개다.
- **Committed in:** `c4d0f193`

**2. [Rule 3 - Blocking] Provider 폴백 값 `EMPTY_RELAY_VALUE` 에 `userSettings` 누락**
- **Found during:** Task 1 typecheck
- **Fix:** `relay-provider.tsx` 에 `userSettings: undefined` 를 넣었다(플랜 files 밖).
- **Committed in:** `c4d0f193`

**3. [Rule 1 - 시각 결함] /me 섹션에서 방법 기본값 세그먼트가 데스크톱에서도 숨음**
- **Found during:** Task 2 구현
- **Issue:** ChoiceRow 의 `@min-[992px]/lc` 규칙 때문에 900 폭 섹션에서는 늘 시트 행이 됐다. 목업 데스크톱은 세그먼트다.
- **Fix:** `ChoiceRow` 에 `segmentAlways` 를 더했다. `setting-group.tsx` 는 플랜 files 밖이다.
- **Committed in:** `4530d1f9`

---

**Total deviations:** 3 auto-fixed (Rule 3 ×2 · Rule 1 ×1)
**Impact on plan:** 범위는 넓어지지 않았다. 타입 한 벌화 1건, 폴백 1건, 기존 부품의 선택 prop 1건이다.

## Issues Encountered

- 시각 확인용 스크린샷은 spec 을 잠깐 고쳐 찍었다. 찍은 뒤 백업으로 되돌려 커밋에는 캡처 코드가 없다.
- 실행 브랜치는 master 다(오케스트레이터 지시 · `branching_strategy: none` · 사용자 규칙). 동시 세션의 Phase 28 파일(`28-*` · `milestone.lock` · `28-CONTEXT.md` 변경)은 건드리지 않고, 경로를 하나씩 지정해 스테이징했다.

## Verification

- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck`(e2e tsconfig 포함): `error TS` 0
- `relay-socket.test.ts` · `numpad.test.ts -t "Phase 27"`: 6 ✓
- `limit-chaser-defaults.test.tsx`: 14 passed(「Phase 27 상따 기본설정 표시」 4 · 「Phase 27 상따 기본설정 즉시 저장(42)」 10)
- `me-client.test.tsx`: 21 passed(「Phase 27 /me 상따 기본설정 배치」 2 포함)
- webapp 전체 단위: **141 files / 3316 passed (1 skipped)**
- e2e `me.spec.ts -g "P27-M1"`: **2 passed**(+ setup). 회귀 확인으로 `me.spec.ts` 전체와 `a11y.spec.ts` 전체를 돌렸다: **33 passed**(`/me` axe 위반 0 포함)
- 시각: 1280 플래시 · 거부 줄, 390 섹션(present=false 칩 · 안내 두 줄) · 시트(61 잠금) 스크린샷 4장 — 줄바꿈 · 잘림 · 겹침 없음

## Known Stubs

없음.

## User Setup Required

없음. 배포는 executor 범위 밖이다(27-09). relay 를 먼저 배포해야 한다 — 옛 relay 는 `user.settings.set` 을 모르는 `t` 로 보고 close(4400) 한다.

## Next Phase Readiness

- 27-07(새 전략 폼 84 시딩): `useRelayContext().userSettings` 를 읽으면 된다. `undefined` 면 D-04 상수로 폴백하고, lc 범위 밖 값(잔량추적 0 · 반등 0)이면 칸별로 폴백한다(Pitfall 9).
- 실서버 확인 거리: 42 성공 뒤 서버가 84 를 같은 세션에도 브로드캐스트하는지 확인해야 한다. 이 섹션은 그 84 를 유일한 성공 신호로 쓴다. 오지 않으면 3초 뒤 「반영되지 않았어요」 가 표시된다.

## Self-Check: PASSED

---
*Phase: 27-auto-sell-integration*
*Completed: 2026-10-05*
