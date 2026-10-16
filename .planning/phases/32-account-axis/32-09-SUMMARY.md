---
phase: 32-account-axis
plan: 09
subsystem: webapp
tags: [webapp, me, user-settings, server-axis, account-chips, pitfall-12, vitest, playwright]

requires:
  - phase: 32-account-axis
    provides: "32-08 — userSettingsByServer · userSettingsForServer · LimitChaserDefaultsSection({ serverKey }) · 42 에 serverKey 송신"
  - phase: 32-account-axis
    provides: "32-07 — relay 지정 서버 없음 거부 rejectFrame(src Relay · kind user.settings.set · USER_SETTINGS_SERVER_GONE_TEXT)"
  - phase: 32-account-axis
    provides: "32-01~03 — MeAccountChips(locked · lockedTitle) · choices · meAccountNo"
provides:
  - "LimitChaserDefaultsSection({ serverKey?, sameServerAccountNos?, onBusyChange? })"
  - "상태 missing 「아직 못 받음」(absent 톤 재사용 · loading 과 같은 잠금 · 안내 줄 생략)"
  - "data-slot me-lc-defaults-server(서버키 칩) · me-lc-defaults-server-note(서버 캡션)"
  - "isSetUserSettingsRejection 이 relay 거부(src Relay · kind user.settings.set)도 잡는다"
  - "/me 설정 탭 저장 비행 · 대기열 → 계좌 칩 줄 잠금(aria-disabled · opacity .45 · title 「저장 중에는 계좌를 바꿀 수 없어요」)"
  - "E2E P32-settings-ui · P32-settings-lock"
affects: [32-10]

actuals:
  tokens: 11936
  tasks: 2
  commits: 4
plan_head_before: 12eaf8b71a46caef877dbcc8b604a0adb7dd1f6e
plan_head_after: a18c78d991a448269ceb73ff96f2aed62244a342

tech-stack:
  added: []
  patterns:
    - "비행 유무 보고 훅(useBusyReport) — 마지막으로 알린 값과 다를 때만 콜백 · 비행 중 언마운트면 false 한 번 · 콜백은 ref 로 읽어 인라인 함수여도 재호출 없음"
    - "E2E 에서 aria-disabled 조상 아래 요소를 누를 때는 click({ force: true }) — Playwright 가 활성화를 기다려 잠금 해제 뒤에 누르는 함정"

key-files:
  created: []
  modified:
    - webapp/src/components/me/limit-chaser-defaults.tsx
    - webapp/src/components/trading/me-client.tsx
    - webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx
    - webapp/src/components/trading/__tests__/me-client.test.tsx
    - webapp/src/components/me/__tests__/account-chips.test.tsx
    - webapp/e2e/specs/me.spec.ts

key-decisions:
  - "「아직 못 받음」 판정 = 고른 서버 84 원값 없음 ∧ serverKey 있음 ∧ Map 비지 않음. 금액 키 없는 84(구 relay)는 종전대로 「불러오는 중」"
  - "구 relay(\"\" 칸만) · 첫 서버가 아닌 계좌 = 「아직 못 받음」(\"\" 칸 = primary 84 가 이미 왔으므로 플랜 규칙 그대로 · 32-08 단위 기대값을 바꿈)"
  - "상태 칩은 serverKey 유무와 무관하게 ml-auto(오른쪽 끝) — 제목 줄 레이아웃을 한 벌로"
  - "제목 줄 pb 6→4px · 안내 pt 2→4px — 캡션이 없을 때 제목 → 안내 8px 는 종전 그대로, 캡션이 있으면 제목 → 캡션 4px(S8′)"
  - "onBusyChange 는 마운트 때 false 를 부르지 않는다(부모 초기값 false) — 「바뀔 때만」"
  - "목록 밖 계좌(서버키 없음)를 고른 설정 탭은 「불러오는 중」 잠금 fail-safe 유지 — UI-SPEC 에 그 경우 문구가 없어 새 문구를 만들지 않음(아래 Observations)"

patterns-established:
  - "제품 문구는 코드 한 곳에만 — JSDoc 이 원문을 되풀이하지 않는다(수락 grep 1줄 기준)"

requirements-completed: [AXIS-05, AXIS-04]

coverage:
  - id: D1
    description: "(트레이서) 계좌 칩 → serverKey → 설정 탭 서버키 칩 · 「서버 저장값」 · 캡션 「이 계좌의 서버 KB 에 저장돼요.」 · 같은 서버의 다른 계좌 안내 · B 칩 전환 시 같은 서버 값"
    requirement: AXIS-05
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/me.spec.ts#P32-settings-ui 설정 탭 — 서버키 칩 · 「서버 저장값」 · 캡션 … (D-24)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx#P32 설정 탭 = 고른 계좌의 서버 (D-24 · S8′)"
        status: pass
    human_judgment: false
  - id: D2
    description: "다른 서버 84 는 왔고 고른 서버만 미수신 = 「아직 못 받음」 · 캡션 · 12행 흐림 · aria-busy · 송신 0 · 도착 즉시 해제 / 첫 로딩 = 「불러오는 중」 / 서버키 없음 = 칩 · 캡션 없음"
    requirement: AXIS-05
    verification:
      - kind: unit
        ref: "webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx#P32 설정 탭 = 고른 계좌의 서버 (D-24 · S8′)"
        status: pass
    human_judgment: false
  - id: D3
    description: "저장 비행 · 대기열 중 칩 줄 잠금(aria-disabled · title · 클릭 무시) · 84 · 3초 상한 · 언마운트로 해제 · 끄기 대기는 비잠금"
    requirement: AXIS-04
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/me.spec.ts#P32-settings-lock 저장 중 칩 잠금 … (Pitfall 12)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/me-client.test.tsx#P32 칩 줄 잠금 (Pitfall 12 · S13)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx#P32 저장 비행 · 거부 (Pitfall 12 · S8′)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/me/__tests__/account-chips.test.tsx#locked — Space 0회 · 화살표 포커스 이동은 허용 …"
        status: pass
    human_judgment: false
  - id: D4
    description: "relay 거부 「고른 서버 세션이 없어 저장하지 않았어요 — 계좌를 다시 골라 주세요」 → me-lc-defaults-reject 원문 · 그 행 실패 · 비행 해제 · 다른 kind 무시"
    requirement: AXIS-05
    verification:
      - kind: unit
        ref: "webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx#P32 저장 비행 · 거부 (Pitfall 12 · S8′)"
        status: pass
    human_judgment: false
  - id: D5
    description: "실서버 두 게이트웨이에서 교보 계좌 칩 → 「KYOBO119」 칩 · 「아직 못 받음」 → 84 도착 해제, 지정 서버 없음 거부 원문"
    verification: []
    human_judgment: true
    rationale: "E2E 스텁은 세션 1개(서버키 KB)라 다른 서버 화면 · relay 지정 서버 없음 거부는 단위 테스트(컨텍스트 목)로만 증명 — 실서버 2대는 32-10 라이브 UAT 몫"

duration: 18min
completed: 2026-10-16
status: complete
---

# Phase 32 Plan 09: /me 설정 탭 = 고른 계좌의 서버(서버키 칩 · 「아직 못 받음」 · 칩 줄 잠금) Summary

**/me 설정 탭 제목 줄이 고른 계좌의 서버키를 보인다. 그 서버 84 를 못 받았으면 「아직 못 받음」 으로 잠근 채 그 사실을 캡션으로 말한다. 저장 비행 중에는 계좌 칩 줄이 잠기고, relay 의 「지정 서버 없음」 거부는 원문 그대로 보인다.**

## Performance

- **Duration:** 약 18분
- **Started:** 2026-10-16T07:20:47Z
- **Completed:** 2026-10-16T07:39Z
- **Tasks:** 2 (tracer 1 · tdd 1)
- **Files modified:** 6

## Accomplishments

- **트레이서(Task 1):** 계좌 칩에서 serverKey 를 읽어 제목 줄과 캡션까지 한 경로로 이었다.
  - 제목 줄: 「상따 기본설정」 + 서버키 칩(`me-lc-defaults-server` · S11 칩 문법) + 오른쪽 끝 상태 칩.
  - 서버 캡션(`me-lc-defaults-server-note`):
    - 받음 = 「이 계좌의 서버 **KB** 에 저장돼요.」 + 「 같은 서버의 {번호} 계좌도 이 설정을 함께 써요.」
    - 미수신 = 「{서버키} 서버 설정(84)을 아직 받지 못했어요 · 그 서버 세션이 준비되면 불러와요」
  - E2E `P32-settings-ui` 가 실서버 relay 경로로 증명한다. 두 계좌가 같은 서버라 B 칩으로 바꿔도 값이 같고, 캡션의 「다른 계좌」 만 A 로 바뀐다.
- **상태 `missing`:** 다른 서버 84 는 왔고 고른 서버만 미수신이면 「아직 못 받음」 이다.
  - 톤은 absent 와 같고 새 톤은 없다. 잠금은 `loading` 과 같다(행 흐림 · `aria-busy` · 편집 · 저장 무시).
  - 기존 안내 줄은 그리지 않는다. 캡션이 그 사실을 말하기 때문이다.
- **칩 줄 잠금(Task 2 · Pitfall 12):** 섹션은 비행 · 대기열 유무가 바뀔 때만 `onBusyChange` 를 부른다. `MeTabs` 가 그 값을 `MeAccountChips locked` 로 넘긴다.
  - 잠금은 84 도착 · 3초 상한 · 언마운트 때 풀린다.
  - 「이 계좌 끄기」 대기 중에는 잠그지 않는다.
- **relay 거부 원문:** `isSetUserSettingsRejection` 가 `src "Relay"` ∧ `kind "user.settings.set"` 도 잡는다. 기존 비행 창 · `me-lc-defaults-reject` 기계를 그대로 탄다.

## Task Commits

1. **Task 1 (tracer): 설정 탭 = 고른 계좌의 서버** — `4a7c3c1a` (feat)
2. **Task 2 RED: 칩 줄 잠금 · relay 거부 실패 테스트** — `acd04690` (test)
3. **Task 2 GREEN: onBusyChange · 칩 줄 잠금 · relay 거부 판정 · E2E** — `51368255` (feat)
4. **Task 2 REFACTOR: 문구 정본 한 곳(JSDoc 중복 제거)** — `a18c78d9` (refactor)

**커밋 수 측정:** ledger 범위 `12eaf8b7..a18c78d9` 의 `rev-list --count` 는 8 이다. 이 중 4건(`37c66e94` · `6bc8b6e9` · `e44cf64f` · `a870dbf7`, quick-261016-miy)은 같은 master 에 동시 세션이 넣은 커밋이다. 이 플랜 몫은 `--grep '(32-09)'` 로 잰 4건이라 `actuals.commits: 4` 로 적었다. 토큰 추정(11,936)도 이 4건의 diff 만 chars/4 로 쟀다.

## TDD Gate Compliance (Task 2)

- **RED (`acd04690`):** 새 테스트 7건이 실패했다(대상 3파일 98건 중).
  - target: `me-client.test.tsx` 「P32 칩 줄 잠금 (Pitfall 12 · S13) > 설정 탭 저장 비행 중 → 칩 줄 aria-disabled · …」
  - 실패 단언: `toHaveAttribute("aria-disabled", "true")` · Received `null`
  - 분류기 `check tdd-red-evidence`(junit): **RED_EVIDENCE_OK** (`target_test_failed`)
  - 의미 판정: target 은 계획한 Pitfall 12 단언에서 실패했다. 셋업 · import · 수집 오류가 아니다.
  - 섹션 테스트 6건은 `onBusyChange` 호출 `[]` 와 거부 줄 부재로 실패했다. 계획한 행동 단언이다.
  - account-chips 보강 1건과 끄기 비잠금 1건은 RED 에서 통과했다. 두 건은 이미 있던 동작(32-01 `locked` · 끄기 무잠금)의 회귀 가드다.
- **GREEN (`51368255`):** 3파일 98/98 통과.
- **REFACTOR (`a18c78d9`):** 주석만 바꿨다. 같은 파일 59/59 통과.

## Files Created/Modified

- `webapp/src/components/me/limit-chaser-defaults.tsx`: 아래를 바꿨다.
  - 상태 `missing` 추가와 `userSettingsStatusOf(usable, selectedMissing)` 판정.
  - 서버키 칩 · 서버 캡션 · 상태 칩 `ml-auto`. 빈 안내는 그리지 않는다.
  - `LimitChaserDefaultsSectionProps`(serverKey · sameServerAccountNos · onBusyChange)와 `useBusyReport`.
  - `isSetUserSettingsRejection` 이 relay 거부도 잡는다.
- `webapp/src/components/trading/me-client.tsx`: 아래를 추가했다.
  - `settingsServerKey` 와 `sameServerAccountNos`(useMemo · `accounts[]` 순 · 고른 계좌 제외).
  - `settingsBusy` 상태를 `MeAccountChips locked` · `lockedTitle` 로 넘긴다.
- 단위 테스트:
  - `limit-chaser-defaults.test.tsx`: P32 S8′ 6건 · 비행 · 거부 6건. 32-08 의 2건은 기대값을 「아직 못 받음」 으로 바꿨다.
  - `me-client.test.tsx`: 칩 줄 잠금 2건.
  - `account-chips.test.tsx`: 잠금 보강 1건.
- `webapp/e2e/specs/me.spec.ts`: `P32-settings-ui` · `P32-settings-lock` 를 추가했다.

## Decisions Made

frontmatter `key-decisions` 참고.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 기대값 갱신] 32-08 단위 케이스 2건의 기대값을 「불러오는 중」 → 「아직 못 받음」 으로**
- **Found during:** Task 1
- **Issue:** 32-08 의 「KYOBO119 · Map 에 KB120 만」 과 「구 relay \"\" 칸만 · 첫 서버 아님」 은 「불러오는 중」 을 단언했다. 이 플랜 S8′ 규칙에서는 둘 다 `missing` 이다.
- **Fix:** 테스트 이름과 단언을 S8′ 로 바꿨다(data-tone `warn`).
- **Commit:** `4a7c3c1a`

**2. [Rule 1 - 테스트 하네스] E2E 잠금 중 클릭에 `force: true`**
- **Found during:** Task 2 E2E
- **Issue:** Playwright 는 `aria-disabled="true"` 조상 아래 요소를 비활성으로 보고 클릭을 미룬다. 그래서 3초 상한으로 잠금이 풀린 뒤에 B 를 눌렀고, 「클릭 무시」 단언이 실패했다. 제품 결함이 아니다. 사용자 클릭은 기다리지 않고 바로 들어온다.
- **Fix:** 잠금 중 클릭만 `click({ force: true })` 로 바꾸고 주석을 달았다. 상한 뒤에 누르면 계좌가 바뀌어 실패하므로, 이 단언은 통과로 숨지 않는다.
- **Commit:** `51368255`

**3. [Rule 3 - 수락 기준] 「계좌도 이 설정을 함께 써요.」 grep 이 2줄**
- **Found during:** 수락 grep
- **Fix:** prop JSDoc 이 원문을 되풀이하지 않게 고쳐 1줄로 맞췄다.
- **Commit:** `a18c78d9`

---

**Total deviations:** 3건 자동 수정(Rule 1 2건 · Rule 3 1건). **Impact:** 테스트 기대값 · 하네스 · 주석만 바뀌었다. 제품 동작은 플랜 그대로다.

## Issues Encountered

- **플랜 검증 결과(모두 통과):**
  - typecheck: `error TS` 0
  - vitest `src/components/me src/components/trading src/lib`: 104 파일 · 3255 통과 · 1 skip
  - playwright `me.spec` + `a11y.spec`: 46 passed · 0 failed
- **포트:** :3100 · :8090 은 실행 때마다 비어 있었다. phase-33 worktree 서버와 겹치지 않았다.
- eslint(바뀐 파일): 오류 0. 경고 4건은 기존 테스트 파일의 `_t` · `_p` · `_sk` · `_drop` 미사용 변수이며 범위 밖이다.

## Observations (Flagged assumptions · 32-08 인계)

- **목록 밖 계좌(행에만 있는 계좌)를 고른 설정 탭:** 서버키가 없어 이렇게 된다.
  - 서버키 칩 · 서버 캡션이 없다.
  - 새 relay 에는 `""` 칸이 없어 「불러오는 중」 + 기존 안내 「DMA 세션이 준비되면 서버 설정(84)을 불러와요」 잠금이다.
  - 저장이 막히는 fail-safe 다. 「아직 못 받음」 은 serverKey 가 있어야 성립한다.
  - UI-SPEC S8′ · S13 에 이 경우 문구가 없어 새 문구를 만들지 않았다.
  - **문구 공백(gap):** 「불러오는 중」 은 영영 오지 않을 84 를 기다리는 것처럼 읽힌다. 사용자에게 「이 계좌는 서버를 몰라 설정을 저장할 수 없어요」 류의 안내가 필요한지는 UI-SPEC 갱신이 정한다(제품 문구 결정).
- **구 relay(\"\" 칸만) · 첫 서버가 아닌 계좌:** 「아직 못 받음」 + 「그 서버 세션이 준비되면 불러와요」 다. 구 relay 는 그 서버 84 를 내리지 않으므로 이 안내는 배포 창에서만 부정확하다. 32-10 순서(relay 먼저 · push 나중)를 지키면 이 조합은 생기지 않는다.
- **S9 「이 기기」 캡션**(「이 브라우저(기기)에만 저장돼요. 계좌와 무관해요.」)은 이미 `device-settings-card.tsx` 에 반영돼 있다. 이 플랜에서 할 일이 없었다.

## Known Stubs

없음.

## User Setup Required

None. relay 배포 · push 는 32-10(메인 세션)이 맡는다.

## Next Phase Readiness

- 32-10 라이브 UAT 확인 항목:
  - 실서버 KB120 · KYOBO119 에서 교보 계좌 칩을 고르면 「KYOBO119」 칩과 「아직 못 받음」 이 보이고, 84 가 오면 풀리는지.
  - 세션이 닫힌 서버 계좌로 저장하면 거부 원문 「고른 서버 세션이 없어 저장하지 않았어요 — 계좌를 다시 골라 주세요」 이 보이는지.
  - 폰 334 제목 줄 폭 백스톱(「상따 기본설정」 + 「KYOBO127」 + 「아직 못 받음」 한 줄 · 넘치면 상태 칩만 다음 줄 오른쪽 끝)은 자동 단언이 없다. 사람 확인 몫이다.

---
*Phase: 32-account-axis*
*Completed: 2026-10-16*

## Self-Check: PASSED

- 커밋 4a7c3c1a · acd04690 · 51368255 · a18c78d9 이 HEAD 조상에 있음
- 수정 파일 · SUMMARY 존재
- 수락 grep: 「"아직 못 받음"」 1 · me-lc-defaults-server 1 · me-lc-defaults-server-note 1 · 미수신 캡션 1 · 「계좌도 이 설정을 함께 써요.」 1 · kind === "user.settings.set" 1 · onBusyChange 6 · lockedTitle 1
- typecheck error TS 0 · vitest 3파일 98/98 · 넓은 vitest 3255 통과 · me.spec + a11y.spec 46 passed
