---
phase: 27-auto-sell-integration
fixed_at: 2026-10-05T09:16:44Z
review_path: .planning/phases/27-auto-sell-integration/27-REVIEW.md
iteration: 2
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 27: 코드 리뷰 수정 보고서 (2차 — Info)

**수정 시각:** 2026-10-05T09:16:44Z
**원본 리뷰:** .planning/phases/27-auto-sell-integration/27-REVIEW.md
**반복:** 2

**요약:**
- 범위 안 지적: 6건 (Info IN-01 ~ IN-06 · 사용자가 6건 모두 고치라고 요청함)
- 수정: 6건
- 건너뜀: 0건

WR-01 ~ WR-05 는 1차(`27-REVIEW-FIX.md`)에서 이미 고쳤으므로 다시 손대지 않았다. 리뷰 뒤에 들어온 1차 수정과 Phase 28 커밋 때문에 줄 번호는 많이 밀려 있었다. 그래서 지적 대상 코드를 모두 다시 읽고 고쳤다. 지적한 구조 자체는 리뷰 때와 같았다.

수정은 격리 worktree(`gsd-reviewfix/27-94878`)에서 했다. 작업하는 동안 다른 세션이 master 에 Phase 28 커밋 4건을 올렸다: `1f66340d`, `33e4b408`, `a8e30281`, `31edcbc5`(28-04 · 28-05). 이 중 `relay/src/ws/fanout.ts` 와 `webapp/.../strategy-card.test.tsx` 가 이번 수정과 겹쳤다.
- `fanout.ts` 는 자동 병합됐다. 28-05 가 `rejectFrame` 호출을 새로 만들지 않았으므로 호출처 10곳 모두 출처 태그를 싣는다.
- `strategy-card.test.tsx` 는 import 줄 하나가 충돌했다. 양쪽 import 를 모두 남기는 식으로 해결했다.

그다음 rebase 한 상태에서 게이트를 다시 돌렸고, master 를 fast-forward 했다. 아래 커밋 해시는 최종 master 기준이다. worktree 와 임시 브랜치는 지웠다. push 와 배포는 하지 않았다.

## Fixed Issues

### IN-01: 41 거부 판정의 `Relay` 갈래가 상관없는 relay 거부까지 41의 답으로 읽는다

**Files modified:** `relay/src/ws/fanout.ts`, `packages/shared/src/relay.ts`, `webapp/src/lib/limit-chaser.ts`, `webapp/src/lib/__tests__/limit-chaser.test.ts`, `relay/tests/ws-autosell.test.ts`, `relay/tests/ws-latch.test.ts`
**Commit:** cf6323ed
**Status:** fixed: requires human verification (판정 조건 변경)
**Applied fix:** 주석으로 한계를 적는 대신 실제로 고쳤다.

- **relay:** `rejectFrame(reason, accountNo, isin, origin)` 은 이제 거부된 인바운드의 `t` 를 기존 `kind` 필드에 싣는다. `origin` 은 필수 인자라서 새 호출처가 태그를 빠뜨리면 컴파일이 실패한다.
  - 호출처 10곳 모두 자기 요청의 `t` 를 넘긴다: `lc.set`, `lc.arm`, `autosell.cmd`, `user.settings.set` 의 계좌 대조 · 키 형식 · 시장 해석 · 무장 가드 · 조립 실패 · 송신 실패 · 구 탭 거부.
  - 41 경로(`autosell.cmd`)의 거부는 `kind: "autosell.cmd"` 로 나간다.
  - 새 필드를 만들지 않았다. 이미 와이어에 있는 `RelayServerMsg.kind` 를 썼다. 게이트웨이 54 의 `kind`(SessionJoin · Restore · Purge)와는 `src` 로 갈린다. shared 타입 주석에 이 어휘를 적어 두었다.
- **webapp:** `isAutoSellCommandRejection` 의 `Relay` 갈래는 이제 `kind` 를 본다.
  - `kind === "autosell.cmd"` → 41 의 답이다. 기존 모양 조건(i 빈 · a 빈 또는 이 계좌)도 계속 본다.
  - `kind` 가 다른 값(`lc.set`, `lc.arm`, `user.settings.set` …) → 41 의 답이 아니다. 예를 들어 다른 카드 lc.set 의 조립 실패가 41 대기 창 안에 와도 41 대기를 풀지 않는다.
  - `kind === ""` → **배포 순서 호환 폴백**이다. 아래에 따로 설명한다.

**폴백 정의(옛 relay 호환):** 지금 배포된 relay 는 모든 거부를 `kind: ""` 로 보낸다. webapp 은 빈 태그를 「출처 모름」으로 보고 **종전 모양 규칙**(i 빈 · a 빈 또는 이 계좌)으로 받는다.
- 그래서 새 webapp 을 옛 relay 에 붙여도 동작은 이번 수정 전과 같다.
- 이때 생길 수 있는 오판은 종전과 같은 방향이다. 41 「미반영」이 일찍 거둬질 수는 있지만, 거짓 「미반영」은 생기지 않는다.
- 새 relay 는 relay 발 거부 전부에 태그를 싣는다. 따라서 relay 를 배포한 뒤에는 빈 태그 갈래에 닿는 relay 거부가 없다.

**테스트:**
- webapp 판정 단위 테스트 1건 추가: autosell.cmd 는 참 / 다른 태그 3종은 거짓 / 빈 태그는 폴백으로 참 / 태그는 Relay 갈래에서만 의미가 있음.
- relay 테스트: 41 계좌 거부 프레임이 `kind: "autosell.cmd"` 인지, 구 탭 `lc.arm buy` 거부가 `kind: "lc.arm"` 인지 단언을 더했다.

**범위 밖으로 남긴 것:** `isLimitChaserArmRejection`(lc.arm 판정)도 같은 모양의 `Relay` 갈래를 쓴다. relay 를 배포하면 같은 태그 규칙으로 좁힐 수 있지만, 이번 지적 범위(41)를 넘어서 건드리지 않았다.

### IN-02: `/me` 42 조립이 바꾼 1칸만 검증한다

**Files modified:** `webapp/src/components/me/limit-chaser-defaults.tsx`, `webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx`
**Commit:** 22312908
**Status:** fixed: requires human verification (검증 · 대기열 흐름 변경)
**Applied fix:**
- `userSettingsValuesIssue(s, changed)` 를 새로 두었다. 42 본문 11칸 전부를 `userSettingsRangeIssue` 로 보고, 처음 걸리는 칸의 문장을 돌려준다.
  - 위반 칸이 바꾼 칸이면 범위 문장만 낸다.
  - 위반 칸이 다른 칸이면 그 칸 이름을 앞에 붙인다(예: 「방법 기본값 1~3 사이여야 해요」). 실패 말풍선은 바꾼 행에 서기 때문이다.
- `dispatchOne` 이 이 함수로 먼저 검사한다. 위반이면 **보내지 않고**, 바꾼 행을 실패로 둔다(시도한 값 포함이라 WR-05 늦은 84 판정과 같이 동작한다). 이때 `"invalid"` 를 돌려준다.
- 대기열 `drain` 은 `"invalid"` 건을 플래시하지 않는다. 그 행만 실패로 접고 다음 건을 계속 본다. 칸마다 판정이 다를 수 있기 때문이다.

**테스트 2건:**
- 84 캐시의 다른 칸이 범위 밖이면 전송 0건 · 행 실패. 바꾼 칸이 그 위반 칸을 고치면 정상 전송.
- 함수 단위 테스트.

### IN-03: 다른 탭의 42 거부가 이 탭의 진행 중 행에 귀속된다

**Files modified:** `webapp/src/components/me/limit-chaser-defaults.tsx`
**Commit:** 2d21c033
**Status:** fixed (리뷰가 허용한 주석 명시)
**Applied fix:** 54 이펙트 위에 한계를 주석으로 적었다.
- 54 `SetUserSettings` 에는 isin · 계좌 · 요청 상관값이 없다. 그래서 3초 창 안에 온 다른 탭의 거부를 가를 근거가 와이어에 없다.
- 영향은 표시뿐이다. 재전송은 없고, 실제로 저장됐다면 늦은 84 가 행 실패를 거둔다. 섹션 아래 거부 원문 줄은 다음 전송까지 남는다.
- 근본 수정 경로도 적었다: 42 에 요청 id 를 싣고 서버가 54 에 되돌려 주는 방식이다. gh-trade 계약을 바꿔야 한다.

간단하고 안전한 수정은 없었다. 그래서 동작은 바꾸지 않았다.

### IN-04: 기준 낱말 판정이 세 벌이고 서로 갈린다

**Files modified:** `webapp/src/components/trading/latch-led.tsx`, `webapp/src/components/trading/__tests__/latch-led.test.tsx`
**Commit:** 6d54e068
**Status:** fixed: requires human verification (표시 규칙 변경)
**Applied fix:**
- LED 툴팁의 「기준 …」 꼬리를 카드 「기준」 행과 **같은 함수**인 `lcAutoSellBasisText` 로 짓는다. 이 함수는 shared `autoSellBasisLabel` 낱말을 쓰고, 상태 0 · 기준 0 이면 「—」 를 낸다. 결과가 「—」 이면 꼬리를 뺀다.
- LED 전용 `basis === 2 ? "매수가" : "상한가"` 분기와 중복 `KRW` 포매터를 지웠다.

**동작 변경 1건:** 기준 0(미정)인데 기준가격이 0보다 큰 에코에서, LED 는 예전에 「기준 상한가 N원」을 보였다. 이제 카드처럼 꼬리를 달지 않는다. 기존 툴팁 단언 3건(기준 1 · 2, 기준가격 0)은 그대로 통과한다. 새 테스트는 세 경우에서 LED 꼬리와 카드 문구가 같은지 확인한다.

### IN-05: 계층 역전 — `lib/limit-chaser.ts` 가 `components/.../lc-fields` 를 런타임 import 한다

**Files modified:** `webapp/src/lib/lc-ranges.ts`(신규), `webapp/src/components/trading/card/constants.ts`(신규), `webapp/src/components/trading/lc/lc-fields.ts`, `webapp/src/lib/limit-chaser.ts`, `webapp/src/components/trading/card/strategy-card.tsx`, `webapp/src/components/me/limit-chaser-defaults.tsx`, 테스트 3파일(`strategy-card.test.tsx` · `strategy-card-flow.test.tsx` · `lc-tracer.test.tsx` — import 경로만)
**Commit:** 44d2c28e
**Status:** fixed (순수 이동 · 값 · 동작 변화 없음)
**Applied fix:**
- **범위 표:** `lib/lc-ranges.ts` 로 내렸다.
  - 이 모듈은 런타임 import 가 없고, 타입만 lib 에서 가져온다.
  - 범위 9칸(`LC_FIELD_RANGES`)과 `lcFieldRangeOf` 를 두고, 리뷰 원문인 relay 스키마 대조 주석도 함께 옮겼다.
  - `lc-fields.ts` 행은 `...LC_FIELD_RANGES.{필드}` 로 펼쳐 쓴다. `LcRange` 타입은 기존 import 경로를 위해 lc-fields 에서 다시 내보낸다.
- **lib/limit-chaser:** `lcRowOfField` import 를 지웠다.
  - `fitsLcRange` 는 이제 `lcFieldRangeOf` 를 쓰고, 3택(방법)은 shared `AUTO_SELL_METHOD_ORDER` 를 쓴다. 3택 값은 lc-fields `choice` 행 옵션과 같은 원천이다.
  - 시딩 9칸의 판정 결과는 이전과 같다.
- **카드 공용 상수:** `ACK_TIMEOUT_MS` · `LC_CONTAINER_CLASS` 를 `card/constants.ts` 로 옮겼다. `strategy-card.tsx` 와 `/me` 모두 여기서 읽는다. 재수출은 두지 않았다. 그래서 테스트 3파일의 import 경로도 바꿨다.

이제 `webapp/src/lib` 에서 `@/components` 를 런타임 import 하는 곳은 없다. 남은 것은 `trading-alerts.ts` 의 `import type` 하나뿐이고, 이번 범위 밖이다.

### IN-06: 자동매도 요청 범위(0~9 · 1~50 · 1~3)가 세 곳에 리터럴로 흩어져 있다

**Files modified:** `packages/shared/src/relay.ts`, `packages/shared/src/index.ts`, `packages/shared/src/__tests__/strategy-event-labels.test.ts`, `relay/src/ws/protocol.ts`, `webapp/src/lib/lc-ranges.ts`
**Commit:** a652152b
**Status:** fixed (상수 추출 · 값 변화 없음)
**Applied fix:**
- shared 에 `LC_AUTO_SELL_RANGES` 를 두고 index 에서 내보낸다. 값은 `autoSellStartCond 0~9`, `autoSellRatioPct 1~50`, `autoSellMethod 1~3` 이다.
- **relay:** zod `autoSellStartCond` 의 min/max 와 superRefine 의 비율 · 방법 경계 · 메시지가 이 상수를 읽는다. 메시지 문자열은 이전과 같다.
- **webapp:** `lc-ranges.ts` 의 시작조건 `range` 와 비율 `inputRange` 가 이 상수를 읽는다.
  - 비율의 꺼진 cfg 범위는 relay `UByteSchema` 와 같은 `UBYTE`(0~255) 상수로 두었다.
  - 방법 3택은 화면 순서가 있는 `AUTO_SELL_METHOD_ORDER` 옵션을 그대로 쓴다. 그 값 집합이 `LC_AUTO_SELL_RANGES.autoSellMethod`(1~3)와 같다는 것은 shared 테스트가 잠근다.

## 배포 영향 · 순서

| 커밋 | relay 배포 필요 | 설명 |
|------|----------------|------|
| cf6323ed (IN-01) | **필요**(효과를 내려면) | relay 가 거부 프레임에 `kind` 태그를 실어야 webapp 의 정확 판정이 동작한다 |
| a652152b (IN-06) | 다음 relay 배포에 포함 | relay 코드는 바뀌었지만 값 · 메시지가 같아 동작 차이는 없다 |
| 22312908 · 2d21c033 · 6d54e068 · 44d2c28e | 불필요 | webapp 전용 |

**순서 제약 없음.** 두 방향 모두 안전하다.
- 새 webapp + 옛 relay: 빈 태그 폴백 때문에 이번 수정 전과 같다.
- 새 relay + 옛 webapp(지금 배포본): 옛 webapp 은 `Relay` 출처의 `kind` 를 읽지 않는다. `kind` 를 비교하는 곳은 `src === "System" ∧ kind === "Purge"` 하나뿐이고, VI 판정은 `Relay` 출처를 제외한다. 그래서 동작이 같다.

다만 IN-01 효과는 relay 배포 뒤에야 생긴다. 프로젝트 관례(「relay 먼저 · push 나중」)대로 relay 를 먼저 배포하는 것을 권한다.

## 검증

**실행 위치:**
- 수정마다 하는 검증과 rebase 전 전체 게이트: **격리 worktree**(`pnpm install --frozen-lockfile --offline` 뒤 shared 빌드).
- 최종 fast-forward 뒤 전체 게이트 · 전체 스위트: **main checkout**(master `a652152b`). 아래 최종 숫자는 이 tree 에서 다시 만들 수 있다.

- **수정마다:**
  - webapp `tsc --noEmit -p .` 통과, 관련 vitest 파일 통과.
  - relay 를 바꾼 IN-01 · IN-06 은 relay `typecheck` · `typecheck:tests` 와 관련 테스트(`ws-autosell` · `ws-latch` · `fanout` · `protocol`)도 통과.
  - 바꾼 파일 eslint 0건.
- **rebase 전 worktree:**
  - config `build_command` 통과.
  - relay 36파일 1000건 통과.
  - webapp 141파일 3345 통과 · 1 skip.
  - shared 15파일 321건 통과.
- **rebase 뒤 worktree:** `build_command` 통과. 충돌이 났던 `strategy-card.test.tsx` 와 relay `fanout` · `ws-autosell` · `ws-latch` 통과.
- **최종 master(main checkout):**
  - `build_command`(shared build → relay typecheck · typecheck:tests → webapp typecheck + e2e tsconfig) 통과.
  - `pnpm --filter @gh-radar/relay run test`: 36파일 · **1007건 통과 · 실패 0**.
  - `pnpm --filter @gh-radar/webapp run test`: 141파일 · **3352 통과 · 1 skip · 실패 0**. 로그의 스택 트레이스는 기존 테스트가 일부러 내는 에러 로그이고, 실패가 아니다.
  - shared vitest: 15파일 · 321건 통과.

main checkout 에 `workers/limitup-sync/tests/helpers/fake-supabase.ts` 수정이 남아 있다. 다른 세션(Phase 28)의 미커밋 편집이고, 이번 수정과 관계없어 건드리지 않았다.

## 사람 확인 권장

- **IN-01:** relay 배포 뒤 확인할 것:
  - 바로시작 대기 중에 다른 카드의 lc.set 이 relay 단계에서 거부되면, 41 「전송…」 칩이 풀리지 않고 3초 뒤 「미반영」으로 가는지.
  - 41 자체의 relay 거부(남의 계좌 등)는 즉시 풀리는지.
- **IN-02:** 범위 밖 캐시에서 실패 말풍선 문구(「{칸 이름} {범위} 사이여야 해요」)가 적절한지.
- **IN-04:** 기준 0 · 기준가격 있음 상태에서 LED 꼬리가 사라지는 변경이 WinForms 동형 원칙과 맞는지. WinForms 는 「기준 낱말은 basis 만 본다」이다. 이번 변경은 리뷰 지시대로 카드 규칙에 맞춘 것이다.

---

_Fixed: 2026-10-05T09:16:44Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_

## 후속 — IN-04 재판정 (WinForms 동형)

6d54e068 은 LED 툴팁을 카드 「기준」 행 규칙(기준 0 → 「—」)에 맞췄으나, WinForms `ledAutoSell` 툴팁(`gh-trade/client/Forms/Trading/LimitChaserForm.cs` 「기준 낱말 = 서버 auto_sell_basis」)은 기준가격 > 0 이면 꼬리를 달고 기준 0 도 「상한가」로 읽는다. 원래 웹 LED 가 이미 그 동형이었고, 두 표면 차이는 의도(카드 행 = D-02, LED = WinForms 툴팁)였다. 두 클라가 갈리면 WinForms 가 기본이므로 LED 동작을 되돌리고, 낱말만 shared `autoSellBasisLabel` 로 일원화했다(중복 낱말 판정 제거). 검증: latch-led vitest 34 통과 · webapp tsc · eslint 통과.
