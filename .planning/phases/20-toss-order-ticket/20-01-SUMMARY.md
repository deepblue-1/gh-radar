---
phase: 20-toss-order-ticket
plan: 01
subsystem: ui
tags: [react, nextjs, radix-popover, vitest, playwright, state-machine, limit-chaser]

requires:
  - phase: 18
    provides: "카드 상태 훅(useStrategyCardState) — answerSeq · unacked · handleSent · acceptAnswer"
  - phase: 16
    provides: "lc.set 전략 전체(32필드) 전송 · buildCfg · 무장 판정(WR-06) · 철거 면제(R2-WR-02)"
provides:
  - "useLcFieldCommit — 필드 1회 확정 = lc.set 1회 상태 기계 (성공·거부·타임아웃·끊김·무장 불가·대기·늦은 에코·토글 되돌림)"
  - "SettingRow(「라벨 ─ 값 ›」 44px 값 행) · FailureBubble(흐름 밖 실패 말풍선)"
  - "InlineValueEditor(행 안 인라인 입력 · 전체 선택 · Enter/blur 저장 · Esc 취소)"
  - "limit-chaser-form 모듈 수준 canArmOf · armBlockOf (무장 판정 단일 원천)"
  - "LimitChaserForm props unacked · currentPrice (CardBody 가 전달)"
  - "e2e P20-1 · lc-tracer 통합 테스트 · use-lc-field-commit 단위 테스트"
affects: [20-03, 20-04, 20-05, 20-07]

actuals:
  tokens: 18600
  tasks: 2
  commits: 4
plan_head_before: a8a48ad24fd2f52fe1739ac04007ce8bb21d0004

tech-stack:
  added: []
  patterns:
    - "필드 확정 상태 기계: ref 가 판정 정본 · state 는 렌더 미러 · 판정은 [server, serverAnswerSeq, unacked] 이펙트에서만"
    - "성공 = 에코의 그 필드 값 === 보낸 값 (답 신호만으로는 성공 아님)"
    - "대기 건은 성공 뒤 serverAnswerSeq 가 바뀐 렌더에서만 꺼낸다(카드 acceptAnswer 가 한 렌더 늦게 보임)"
    - "편집기는 자기 버퍼를 든다 — 편집 중 에코가 입력을 덮지 않음"
    - "FailureBubble 은 open 만 토글하는 고정 트리 — 감싸기 교체로 입력이 재마운트돼 포커스를 잃지 않게"

key-files:
  created:
    - webapp/src/components/trading/lc/use-lc-field-commit.ts
    - webapp/src/components/trading/lc/setting-group.tsx
    - webapp/src/components/trading/lc/inline-value-editor.tsx
    - webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx
    - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
  modified:
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/card/card-body.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts

key-decisions:
  - "필드 확정 cfg 기준값은 formFromServer(server, formRef) + 바꾼 필드 1개 — 폼 로컬의 오래된 값이 실리지 않는다(T-20-03)"
  - "대기 건 꺼내기: 성공이 서버 값 변화로 판정된 렌더면 다음 serverAnswerSeq 변화 렌더까지 기다리고, 답 신호가 먼저 와 있던 경우(buyOrderAmount 0 특례)는 즉시 꺼낸다 — 영구 대기 방지"
  - "성공 뒤 답 신호 대기 중(popAfterSeq)의 새 확정도 대기열에 선다 — 뒤따르는 증가가 새 건을 거부로 오판하지 않게"
  - "끄는 방향 게이트(LC_GATE_FIELDS 를 false 로)는 armBlockOf 를 건너뛴다(T-16-44) — 다른 게이트가 무장 불가여도 끄기는 나간다"
  - "handleSubmit 의 무장 차단도 armBlockOf 하나를 읽도록 합쳤다 — 산출식·조립 규칙 중복 0"
  - "인라인 편집기: 이미 저장한 버퍼에서 포커스가 빠지면 재전송 없이 편집만 끝낸다(onDismiss) — 실패 뒤 blur 가 자동 재시도가 되지 않게(T-16-10)"
  - "실패 뒤 편집을 닫으면 행이 --destructive 링 + 말풍선으로 실패를 계속 말하고, 다시 열면 보존값(failures.value)으로 연다"

patterns-established:
  - "lc/ 디렉터리: 토스식 상따 설정 조각(20-03~20-05 가 이 이름으로 확장)"
  - "vitest TAP(tap-flat) + 요약줄 이식으로 RED 증거를 gsd-tools check tdd-red-evidence 로 검증"

requirements-completed: []

coverage:
  - id: D1
    description: "「호가변경」 한 행이 토스식 44px 값 행으로 서고, 인라인 편집 → Enter 한 번으로 lc.set 1회 → 에코로만 행 값이 바뀌며 900ms 강조"
    verification:
      - kind: integration
        ref: "webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx#①~④ · ⑦ · ⑨"
        status: pass
      - kind: e2e
        ref: "pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g P20-1"
        status: pass
    human_judgment: false
  - id: D2
    description: "거부(답만 증가)·타임아웃(카드 unacked)·끊김은 실패 말풍선 + 입력 보존 + 재전송 0, 늦은 에코는 성공으로 전이"
    verification:
      - kind: integration
        ref: "webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx#⑤ · ⑥ · ⑩"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx (거부 · Pitfall 4 · 끊김 · 타임아웃)"
        status: pass
    human_judgment: false
  - id: D3
    description: "직렬화(in-flight 1 + 필드당 대기 1) · 앞 건 실패 시 대기 폐기+실패 표시 · 무장 가드 · 토글 낙관/되돌림 · 미등록 로컬 반영 · buyOrderAmount 0 특례"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx (23 케이스)"
        status: pass
    human_judgment: false
  - id: D4
    description: "CardBody 가 unacked · 현재가(quote.p, 없으면 0)를 폼에 전달"
    verification:
      - kind: integration
        ref: "webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx#⑩ (unacked 가 폼까지 내려와 타임아웃 실패)"
        status: pass
      - kind: other
        ref: "grep -c 'currentPrice=' webapp/src/components/trading/card/card-body.tsx == 1"
        status: pass
    human_judgment: false
  - id: D5
    description: "데스크톱 인라인 편집의 시각 품질(입력칸·링·말풍선 위치·900ms 강조가 목업 002 와 같은 느낌인지)"
    verification: []
    human_judgment: true
    rationale: "jsdom 은 레이아웃·색을 평가하지 않고 P20-1 은 높이(44px)·동작만 잰다 — 시각 일치는 사람이 본다. 이웃 행은 아직 옛 격자라 정렬이 다른 것은 의도(20-04 가 전환)"

duration: 18min
completed: 2026-09-25
status: complete
---

# Phase 20 Plan 01: 「호가변경」 인라인 편집 트레이서 + 필드 확정 상태 기계 Summary

**상따 「호가변경」 한 행을 토스식 44px 값 행으로 바꾸고, 인라인 Enter 한 번 = `lc.set` 1회(서버 동기값 + 그 필드) → 에코 값 비교로만 성공 판정하는 `useLcFieldCommit` 상태 기계를 실 relay·스텁 게이트웨이 왕복(P20-1)까지 증명했다 — 거부·타임아웃·끊김·무장 불가·직렬화·토글 되돌림 포함.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-09-25T03:30:35Z
- **Completed:** 2026-09-25T03:48:47Z
- **Tasks:** 2 (tracer 1 + auto 1, 둘 다 TDD RED→GREEN)
- **Files modified:** 8 (신규 5 · 수정 3)

## Accomplishments

- **트레이서(D-04 · D-14 · D-14a · D-14c · D-20):** 「호가변경」 행 클릭 → 그 44px 행 안 값 자리만 `#lc-sweep-tick` 입력(전체 선택) → Enter → `lc.set` 1회 → 게이트웨이 `SetLimitChaserReq` +1 → 60 에코 → 행 「5건」 + 900ms `--primary`. 안내 문구·「저장」 버튼 0, 행 높이 44 유지(Playwright 실측).
- **상태 기계 `useLcFieldCommit`:** 성공 = 에코의 그 필드 값 === 보낸 값(Pitfall 1). 답만 오면 거부, 카드 `unacked` 면 타임아웃, `send` false 면 끊김 — 각각 UI-SPEC 문구. 늦은 에코는 실패를 성공으로 바꾼다(Pitfall 4). 자동 재전송 0(T-16-10).
- **직렬화:** in-flight 1건 + 필드당 대기 1건(같은 필드 재확정은 값만 교체·자리 유지). 대기 건은 성공 뒤 `serverAnswerSeq` 가 바뀐 렌더에서만 새 서버 값 기준으로 꺼내 no-op·무장 판정을 다시 한다. 앞 건이 실패하면 대기 건은 보내지 않고 전부 거부 실패로 표시한다.
- **무장 가드:** `canArmOf` 로 무장 산출식을 모듈 수준 한 곳에 모으고 `armBlockOf`(철거 면제 · 켜진 게이트만 · `{게이트} · {사유}` 조립)를 `handleSubmit` 과 훅이 공유한다.
- **CardBody → 폼:** `unacked`(상태줄 「미반영」과 같은 신호, UI-SPEC A10)와 `currentPrice`(20-03 시트 칩 원천)를 내린다.

## Task Commits

1. **Task 1 (tracer) RED:** `0e050fd` — test(20-01): 「호가변경」 인라인 편집 트레이서 실패 테스트 추가
2. **Task 1 (tracer) GREEN:** `6f6ba6a` — feat(20-01): 「호가변경」 한 행 인라인 편집 → 즉시 반영 트레이서
3. **Task 2 RED:** `0979d3d` — test(20-01): 필드 확정 상태 기계 단위 테스트 + 무응답 트레이서 실패 테스트 추가
4. **Task 2 GREEN:** `d60436c` — feat(20-01): 필드 확정 상태 기계 완성 — 타임아웃·직렬화·무장 가드·토글 되돌림 + 카드가 unacked·현재가 전달

REFACTOR 커밋 없음(정리할 것이 없었다).

## TDD Gate Compliance

| 태스크 | RED 커밋 | RED 증거(`gsd-tools check tdd-red-evidence`) | GREEN 커밋 |
|---|---|---|---|
| Task 1 | `0e050fd` | `RED_EVIDENCE_OK` — 대상 「① 토스식 44px 값 행이다」, 9/9 실패 전부 행 부재 단언 | `6f6ba6a` |
| Task 2 | `0979d3d` | `RED_EVIDENCE_OK` — 대상 「in-flight 중 카드 `unacked` … 타임아웃 실패」, 23 중 12 실패(Task 2 행동) + 트레이서 ⑩ | `d60436c` |

vitest `tap-flat` 리포터는 node 식 `# tests/# pass/# fail` 요약줄을 내지 않아, vitest 자체 집계를 그 형식으로 옮겨 붙여 검증했다(실패 이름·단언은 원문 그대로).

## Files Created/Modified

- `webapp/src/components/trading/lc/use-lc-field-commit.ts` — 필드 1회 확정 상태 기계(내보내기: `useLcFieldCommit` · `LC_FLASH_MS` · `LC_COMMIT_TEXT` · `LC_GATE_FIELDS` · 타입 6종)
- `webapp/src/components/trading/lc/setting-group.tsx` — `SettingRow`(44px 값 행 · 편집 중 div 전환 · 실패 링/말풍선 · 편집 종료 시 포커스 복귀) · `FailureBubble`(Radix Popover · 포커스 비탈취) · `formatSettingValue`
- `webapp/src/components/trading/lc/inline-value-editor.tsx` — `InlineValueEditor`(자기 버퍼 · 9자리 상한 · Enter/blur/Esc · 반영 중 readOnly)
- `webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx` — StrategyCard + CardBody 통합 10케이스
- `webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx` — renderHook 23케이스
- `webapp/src/components/trading/limit-chaser-form.tsx` — 「호가변경」 한 행 SettingRow 전환 · 훅 배선 · `canArmOf`/`armBlockOf` · props `unacked`/`currentPrice`
- `webapp/src/components/trading/card/card-body.tsx` — `unacked` · `currentPrice` 전달
- `webapp/e2e/specs/trading-workbench.spec.ts` — `P20-1`

## Decisions Made

frontmatter `key-decisions` 참조. 핵심 둘: (1) 대기 건 꺼내기 타이밍 — 서버 값 변화로 성공한 렌더에서는 꺼내지 않고 다음 답 신호 변화 렌더에서 꺼낸다(카드의 `acceptAnswer` 1~2회가 한 렌더 늦게 보이므로). 답 신호가 먼저 와 있던 금액 특례는 즉시 꺼내 영구 대기를 막는다. (2) 끄는 방향 게이트는 무장 가드를 건너뛴다(T-16-44).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 트레이서 픽스처가 무장 불가 전략이었다**
- **Found during:** Task 2 GREEN
- **Issue:** `lc-tracer.test.tsx` 의 에코 픽스처(`strategy-card-flow.test.tsx` 에서 복제)가 `buyEnabled: true` · 주문금액 10만원 · 매수가 130,000원 = 0주였다. relay `#strategyArmable` 이 통째로 거부할 상태라, Task 2 의 전송 직전 무장 가드가 정확히 막아 트레이서 6건이 실패했다.
- **Fix:** 픽스처 `buyOrderAmount` 를 200(만원, 15주)으로 — 가드는 그대로 두고 테스트 입력을 실제로 보낼 수 있는 전략으로 고쳤다. e2e 기본 픽스처(100만원 / 71,000원 = 14주)는 원래 무장 가능이라 무변경.
- **Files modified:** `webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx`
- **Commit:** `d60436c`

**2. [Rule 2 - Missing critical] 끄는 방향 게이트의 무장 가드 면제 (T-16-44)**
- **Found during:** Task 2 설계
- **Issue:** 플랜의 「전송 직전 `armBlockOf({...기준값, [field]: value})`」를 그대로 쓰면, 다른 켜진 게이트가 무장 불가일 때 **매도주문 끄기** 같은 무장 해제 토글까지 막힌다 — 옛 `toggleGate` 는 자기 게이트만 봐서 끄기를 항상 허용했다.
- **Fix:** `LC_GATE_FIELDS` 를 `false` 로 확정하는 경우 무장 판정을 건너뛴다. 단위 테스트 「끄는 방향 게이트는 무장 판정과 무관하게 나간다」로 잠갔다.
- **Files modified:** `webapp/src/components/trading/lc/use-lc-field-commit.ts`
- **Commit:** `d60436c`

**3. [Rule 2 - Missing critical] 실패 뒤 포커스 이탈이 자동 재시도가 되지 않게**
- **Found during:** Task 1
- **Issue:** 「포커스 이탈 = 저장」을 그대로 두면, 실패 말풍선을 본 사용자가 다른 곳을 누르는 것만으로 같은 값이 다시 나간다(사용자가 누르지 않은 재전송 · T-16-10).
- **Fix:** 편집기가 「이미 저장한 버퍼인가」를 기억해, 버퍼를 고치지 않은 채 포커스가 빠지면 `onDismiss`(편집만 종료)만 부른다. Enter 는 언제나 재시도다. `InlineValueEditor` 에 선택 prop `onDismiss` 와 `onSave` 의 두 번째 인자 `via: 'enter' | 'blur'` 를 더했다(플랜 인터페이스의 상위 호환 확장).
- **Files modified:** `webapp/src/components/trading/lc/inline-value-editor.tsx`, `webapp/src/components/trading/limit-chaser-form.tsx`
- **Commit:** `6f6ba6a`

**4. [Rule 3 - Blocking] 트레이서 behavior 「에코 전 행 텍스트는 여전히 3건」의 관측 방법**
- **Found during:** Task 1 RED 작성
- **Issue:** Enter 뒤에는 편집기가 반영 중(readOnly)으로 남아 행 버튼이 DOM 에 없다(UI-SPEC §6 「반영 중」). 그대로는 「행 3건」을 볼 수 없다.
- **Fix:** 테스트 ③ 에서 Enter 뒤 포커스를 빼 편집을 끝낸 다음 행이 「3건」 + `aria-busy="true"` 임을 단언했다(값 낙관 반영 없음 D-06 을 행 자체로 증명).
- **Files modified:** `webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx`
- **Commit:** `0e050fd`

**5. [Rule 3 - Blocking] CardBody 가 `unacked` 를 넘기는지의 관측 위치**
- **Found during:** Task 2
- **Issue:** behavior 는 「card-body 테스트가 폼 props 로 확인」이지만 `card-body.test.tsx` 는 이 태스크 파일 목록 밖이고 폼을 모킹하지 않는다.
- **Fix:** 카드 상태 훅을 실제로 돌리는 `lc-tracer.test.tsx` 에 ⑩ 을 더해 「3초 무응답 → 카드 「미반영」 + 폼 인라인 실패 말풍선」으로 배선 전체를 증명했다. `currentPrice` 는 이 플랜에 소비처가 없어 grep 수용 기준으로 확인했다.
- **Files modified:** `webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx`
- **Commit:** `0979d3d`

**Total deviations:** 5 auto-fixed (Rule 1 ×1 · Rule 2 ×2 · Rule 3 ×2). **Impact:** 전부 플랜의 금지 항목(재전송 금지·끄기 허용·거부≠성공)을 강화하거나 관측 방법을 바꾼 것이다. 프로토콜·범위 확장 없음.

## Issues Encountered

- Playwright `P20-1` 수용 기준은 「1 passed」였지만 실행 출력은 인증 셋업 프로젝트 포함 「2 passed」(-g 조합 실행 시 「5 passed」)다. P20-1 자체는 통과했고 실패 0이다.

## Verification Results

- `pnpm --filter @gh-radar/webapp exec vitest --run` (lc-tracer · use-lc-field-commit · card-body · limit-chaser-form · strategy-card-flow): **Test Files 5 passed (5) · Tests 164 passed (164)**
- `pnpm --filter @gh-radar/webapp run typecheck`: 종료 0 (`tsc --noEmit && tsc -p tsconfig.e2e.json`, `error TS` 0)
- `pnpm --filter @gh-radar/webapp run test`: **Test Files 101 passed (101) · Tests 1781 passed | 1 skipped** (기준선 1731 이상 · 실패 0)
- Playwright `-g "P20-1|10\. 스위치 즉시 전송|12\. 값 변경|14\. 매수·매도 OFF"`: **5 passed** (셋업 1 + 4) — 포트 3100 이 비어 있어 이 worktree 의 dev 서버로 실행(Pitfall 8 확인)
- ESLint(`src/components/trading/lc` · 폼 · card-body): 경고 0 · 오류 0
- 프로토콜 무변경: `git diff --stat a8a48ad -- packages/shared/src/relay.ts relay supabase` 출력 0줄
- `webapp/e2e/specs/zz-theme-gallery.spec.ts` 는 `??` 그대로(열지도·스테이징하지도 않음)

## Known Stubs

- `limit-chaser-form.tsx` `currentPrice` prop — 받기만 하고 아직 소비하지 않는다(플랜 명시: 「이 태스크에서는 구조분해하지 않아도 된다」). 20-03 키패드 시트의 「현재가」 칩이 소비한다. 목표 달성을 막지 않는다.

## Threat Flags

없음 — 새 네트워크 엔드포인트·인증 경로·스키마 변경 없음. 기존 `lc.set` 경로의 호출 시점만 바뀌었고 위협 레지스터 T-20-01~04 · T-20-08 의 완화가 전부 구현·테스트됐다.

## Next Phase Readiness

- 20-03(키패드 시트)·20-04(리스트 전면 전환)·20-05(인라인 탐색)가 `useLcFieldCommit` · `SettingRow` · `FailureBubble` · `InlineValueEditor` · `LC_COMMIT_TEXT` 를 이 이름으로 소비할 준비가 됐다.
- 20-04 가 옛 입력·더티 바를 걷을 때 `handleSubmit` 은 이미 `armBlockOf` 를 공유하므로 무장 규칙을 옮길 필요가 없다.
- 플래너 가정 A-P1(미등록 전략의 값 확정은 로컬 반영만)은 그대로 구현됐다 — 사용자 확인이 필요하면 이 동작을 기준으로 묻는다.

## Self-Check: PASSED

- FOUND: webapp/src/components/trading/lc/use-lc-field-commit.ts
- FOUND: webapp/src/components/trading/lc/setting-group.tsx
- FOUND: webapp/src/components/trading/lc/inline-value-editor.tsx
- FOUND: webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx
- FOUND: webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
- FOUND commits: 0e050fd · 6f6ba6a · 0979d3d · d60436c
