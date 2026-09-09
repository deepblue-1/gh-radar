---
phase: 16-trading-limit-chaser-vi-my-page
plan: 36
subsystem: relay
tags: [dma, limit-chaser, teardown, spoofing, arming-guard, vitest, gap-closure-r3]

requires:
  - phase: 16
    provides: "16-29 의 `#isTeardown` · `#teardownMarket` · UI 동형 `#strategyArmable`"
  - phase: 16
    provides: "16-25 가 relay 로 옮긴 `lc.set` 의 `market` 소유권 (`#strategyMarket`)"
provides:
  - "`#isTeardown` — **게이트 4종 단독** 순수 판정. 클라이언트의 `crud` 를 근거로 쓰지 않는다"
  - "`crud:\"D\"` ↔ 게이트 상태 불일치 `logger.error` (`lc.set` 진입점 1곳, 계좌번호 미포함)"
  - "fanout 회귀 3케이스 (⑰-e3 · ⑰-e4 · ⑰-e5) + 전제가 거짓이던 기존 2건(⑰-e · ⑰-e2) 정정"
affects: [relay lc.set 관문, 상따 폼의 서버측 최후 관문, 16-42 의 UI 측 대칭 수정(R2-WR-02)]

tech-stack:
  added: []
  patterns:
    - "**클라이언트가 정하는 값을 서버 가드의 면제 조건으로 쓰지 않는다** — 자칭으로 면제되는 가드는 가드가 아니다"
    - "가드 면제의 판정은 **부수효과 없는 순수 함수**로 두고, 사고 로그는 프레임이 들어오는 지점 한 곳에서만 남긴다 (한 사고 = 한 줄)"
    - "기존 테스트가 초록이라고 전제가 참인 것은 아니다 — 헬퍼 기본값이 케이스의 전제를 오염시킨다"

key-files:
  created: []
  modified:
    - relay/src/ws/fanout.ts
    - relay/tests/fanout.test.ts

key-decisions:
  - "철거 판정의 정본을 `crud` 에서 **게이트 4종**으로 옮겼다. 계약 원문(`packages/shared/src/relay.ts:136-141`)이 「게이트가 전부 꺼지면 **서버가** `\"D\"` 로 정규화한다」고 못박은 대로다 — `crud` 는 정규화의 **결과**를 말하는 힌트이지 근거가 아니다"
  - "`crud` 불일치 로그를 `#isTeardown` 안이 아니라 **`lc.set` 진입점**에 뒀다. `#isTeardown` 은 한 프레임당 최대 두 번(`lc.set` · `#strategyArmable`) 호출되므로 함수 안에 두면 사고 1건이 두 줄로 새어 운영 신호가 부풀려진다. 부수효과 없는 순수 판정을 유지하는 쪽이 acceptance criteria 의 `if (this.#isTeardown(cfg)) return true;` 원형 유지와도 맞는다"
  - "`#strategyArmable` 첫 줄의 철거 면제를 **지우지 않았다.** 게이트 4종이 전부 꺼져 있어도 `sweepEnabled: true` ∧ (`sweepWatchPrice === 0` ∨ `buyOrderPrice === 0` ∨ `buyOrderQty === 0`) 이면 `reason === \"sweep\"` 이 되어 철거가 거부된다 — `sweepEnabled` 가 삭제 판정 4종에 없기 때문이다. 이 면제가 없으면 「한방만 켜 둔 전략을 영원히 못 지우는」 상태가 생긴다"
  - "⑰-e·⑰-e2 를 **수정을 약화시켜 통과시키지 않았다.** 두 케이스는 `lcInput()` 기본값 `buyEnabled: true` 때문에 「진짜 철거」가 아니라 이 갭이 지목한 스푸핑 조합을 태우면서 초록이었다 — 테스트를 진실로 바꿨다"
  - "⑰-e3 과 ⑰-e4 의 **실패 원인을 갈랐다**(시장 해석 실패 vs 무장 가드). 같은 원인으로 둘 다 죽으면 두 가드 중 하나만 살아 있어도 초록이 된다"

patterns-established:
  - "회귀 잠금 실증: 수정을 무력화해 새 테스트가 실제로 실패하는지 확인 후 복원 (16-27·16-28·16-29·16-33·16-34 승계)"

requirements-completed: []

duration: 11min
completed: 2026-09-09
---

# Phase 16 Plan 36: 철거 판정의 정본을 게이트로 (R2-CR-01) Summary

**마지막 관문이 「클라이언트가 D 라고 말했다」를 근거로 자기 자신을 면제하던 것을 없앴다 — 이제 한 프레임이 시장 해석 엄격성과 무장 가드를 동시에 우회할 수 없고, 진짜 철거는 여전히 막히지 않는다.**

## Performance

- **Duration:** 약 11분
- **Tasks:** 2/2
- **Files modified:** 2 (신규 파일 0 · 마이그레이션 0)
- **relay 테스트:** **373 → 376**(+3, 17 files). fanout 만 32 → 35

## Accomplishments

### Task 1 — 철거 판정의 근거를 게이트 4종으로 (R2-CR-01) · commit `eeb4539`

`#isTeardown` 첫 줄이 `if (cfg.crud === "D") return true;` 였다. `crud` 는 **인바운드 필드**다 — `relay/src/ws/protocol.ts` 가 `crud: z.enum(["C","D"])` 로 받고 `RelayLimitChaserInput` 이 그것을 Omit 하지 않으므로 브라우저·옛 탭·임의의 wss 클라이언트가 값을 정한다. **클라이언트의 자칭을 서버 가드의 면제 조건으로 쓰면 그것은 가드가 아니다.**

계약 원문은 정반대를 못박고 있었다 (`packages/shared/src/relay.ts:136-141`):

> 등록 구분. 매수·매도·취소 게이트가 **전부** 꺼지면 서버가 `"D"` 로 정규화한다.

즉 삭제의 정본은 **게이트 상태**이고 `crud` 는 그 정규화의 결과를 말하는 힌트다 — `webapp/src/lib/limit-chaser.ts` 의 `crudOf()` 도 자기 docstring 에 「전송용 힌트일 뿐이다」라고 적어 두었고, 그 값은 `isDeleteIntent(gates)` 의 파생값이다.

**새 본문 (`relay/src/ws/fanout.ts:825-829`, 소스 그대로):**

```ts
  #isTeardown(cfg: RelayLimitChaserInput): boolean {
    return (
      !cfg.buyEnabled && !cfg.sellEnabled && !cfg.cancelQtyEnabled && !cfg.cancelTradeEnabled
    );
  }
```

- 주석 제외 `return true` **0건** (`sed -n '825,829p' … | grep -vE '^\s*(\*|//|/\*)' | grep -c 'return true'` → `0`)
- 반환식에 `cancelTradeEnabled` **포함** (위 인용)

**불일치는 조용히 지나가지 않는다** (`fanout.ts:611-620`, 소스 그대로):

```ts
      const teardown = this.#isTeardown(cfg);
      // `crud:"D"` 인데 게이트가 켜져 있는 프레임은 계약과 어긋난다 — 정상 브라우저는 `crud` 를
      // `crudOf(gates)` 로 파생시키므로 이 조합을 만들 수 없다. 조용히 통과시키지 않고 운영
      // 신호를 남긴다(S-5). 계좌번호는 싣지 않는다 (T-16-45) — `isin`·`crud` 와 사유만.
      if (!teardown && cfg.crud === "D") {
        logger.error(
          { userId, t: msg.t, isin: cfg.isin, crud: cfg.crud },
          '[WS] crud:"D" 인데 게이트가 켜져 있다 — 철거로 보지 않고 등록 경로 가드를 적용한다',
        );
      }
```

로그 객체는 `{ userId, t, isin, crud }` 뿐이다 — `accountNo` **0건**(같은 범위 `grep -c 'accountNo'` → `0`, T-16-45).

**★ `#strategyArmable` 의 철거 면제는 남겼다** (`fanout.ts:936-941`):

```ts
    // ★ 이 줄을 지우면 안 된다 — 무용지물이 아니다. 게이트 4종이 **전부 꺼져 있어도**
    //   `sweepEnabled: true` ∧ (`sweepWatchPrice === 0` ∨ `buyOrderPrice === 0` ∨
    //   `buyOrderQty === 0`) 이면 아래에서 `reason === "sweep"` 이 되어 **철거가 거부된다.**
    //   `sweepEnabled` 는 삭제 판정 4종(`#isTeardown`)에 들어 있지 않기 때문이다. 이 면제가
    //   없으면 「한방만 켜 둔 전략을 영원히 못 지우는」 상태가 만들어진다 (T-16-55 / T-16-44).
    if (this.#isTeardown(cfg)) return true;
```

**정책은 한 줄도 바꾸지 않았다** — `#teardownMarket`(에코 → SymbolMap → `"K"` + `logger.error`)과 `#strategyMarket`(못 풀면 거부)은 그대로다. 바뀐 것은 **어느 쪽으로 갈지 정하는 판정**뿐이다. `lc.set` ②-1 주석의 「시장 해석은 **`crud` 로 갈린다**」는 이제 거짓이라 「**게이트 상태로 갈린다**」로 정정했고, 등록·수정은 `crud` 가 무엇으로 오든 `#strategyMarket` 이라는 것을 다시 못박았다.

### Task 2 — 회귀를 잠근다 (기존 2건의 전제가 거짓이었다) · commit `51408ee`

**계획이 예고한 그대로였다.** Task 1 커밋 직후 `pnpm --filter @gh-radar/relay test` 는 **2 failed | 371 passed (373)** 였고, 깨진 것은 ⑰-e·⑰-e2 다. 두 케이스는 `lcInput({ isin: UNKNOWN_ISIN, crud: "D" })` 를 보내는데 `lcInput()` **기본값이 `buyEnabled: true`** 라 — 「진짜 철거」가 아니라 **정확히 R2-CR-01 이 지목한 스푸핑 조합**을 태우면서, 그 위험(무장 상태로 나갔다)을 단언하지 않고 초록이었다. **전제가 거짓이었던 것이지 수정이 틀린 것이 아니다.** 수정을 약화시키지 않고 테스트를 진실로 바꿨다.

**정정 2건** — 게이트 4종을 **명시적으로 전부** 적었다(헬퍼 기본값에 기대면 같은 함정이 재발한다):

```ts
      cfg: lcInput({
        isin: UNKNOWN_ISIN,
        crud: "D",
        buyEnabled: false,
        sellEnabled: false,
        cancelQtyEnabled: false,
        cancelTradeEnabled: false,
      }),
```

- `⑰-e SymbolMap 이 모르는 ISIN 이어도 **게이트 4종이 전부 꺼진** 철거는 거부 없이 게이트웨이로 나간다 (GC-WR-04)` — 제목에 전제를 박았다. 단언 4종(거부 0건 · `market:"K"` 폴백 · 「시장 미해석 상태의 전략 삭제」 로그 · 계좌번호 미포함)은 **그대로**
- `⑰-e2 삭제의 시장은 **에코 캐시가 1순위**다 — 종목맵이 못 풀어도 폴백까지 가지 않는다` — 단언 그대로

**신규 3케이스 (제목 그대로 인용):**

| 케이스 | 입력 | 결과 | 가르는 것 |
|---|---|---|---|
| `⑰-e3 crud:"D" 라고 자칭해도 게이트가 켜져 있으면 시장 해석 엄격성이 그대로 걸린다 (R2-CR-01 / T-16-42)` | `crud:"D"` + `buyEnabled:true` + `UNKNOWN_ISIN` | **거부** | 게이트웨이 **미송신** · 거부 프레임 1건 · `crud` 불일치 로그(`{isin, crud:"D"}`, 계좌번호 미포함) · 삭제 폴백 로그 **없음** |
| `⑰-e4 시장이 풀려도 crud:"D" 자칭은 무장 가드를 면제받지 못한다 (R2-CR-01 / T-16-43)` | `crud:"D"` + `buyEnabled:true` + `buyOrderQty:0` + **알려진 ISIN** | **거부** | 시장은 풀리고 **무장 가드**가 잡는다 — `gate:"buy"` |
| `⑰-e5 반대 방향의 대칭 — crud:"C" 라도 게이트 4종이 전부 꺼졌으면 철거로 통과한다 (기존 ② 갈래 회귀)` | `crud:"C"` + 게이트 4종 OFF + `UNKNOWN_ISIN` | **통과** | 거부 0건 · `SetLimitChaserReq` **송신**(ISIN 대조) |

⑰-e3 과 ⑰-e4 는 **실패 원인이 다르다** — 같은 원인으로 둘 다 죽으면 두 가드 중 하나만 살아 있어도 초록이 된다. ⑰-e3(미송신)과 ⑰-e5(송신)는 서로 **반대 방향**을 단언한다.

**⑰-f 는 손대지 않았다** — 통과 확인만 했다.

### 회귀 잠금 실증 (16-27~16-34 승계)

`#isTeardown` 첫 줄에 `if (cfg.crud === "D") return true;` 를 되돌려 무력화:

- **2건 실패** — `⑰-e3` · `⑰-e4` (나머지 **33 통과**, `Tests 2 failed | 33 passed (35)`)
- 복원 후 `grep -c 'MUTATION' relay/src/ws/fanout.ts` = **0**, `git diff --stat eeb4539 -- relay/src/ws/fanout.ts` **출력 0줄**(커밋 상태와 바이트 동일)

즉 새 테스트는 「그냥 통과하는 테스트」가 아니다. ⑰-e·⑰-e2·⑰-e5 는 무력화 상태에서도 통과하는데(그 조합에서 두 판정이 같은 답을 낸다) 그것이 곧 **GC-WR-04 를 잃지 않았다는 증거**다.

## Verification

| 항목 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/relay run typecheck` | exit **0** |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | exit **0** (루트 typecheck 밖이라 따로 실행) |
| `test -f relay/tests/fanout.test.ts` | 참 (검증 대상 실재 확인 후 실행) |
| `pnpm --filter @gh-radar/relay exec vitest run tests/fanout.test.ts` | **35 passed** (32 → +3) |
| `pnpm --filter @gh-radar/relay test` | **376 passed / 17 files** — 변경 전 **373** → **+3** |
| `pnpm -r typecheck` | exit **0** (기준선 유지) |
| `pnpm -r test` | exit **0** — **2,015 passed**(기준선 2,012 → +3, relay 373→376 외 변동 없음: shared 99 · server 252 · webapp 672) |
| `sed -n '825,829p' fanout.ts \| grep -vE '^\s*(\*\|//\|/\*)' \| grep -c 'return true'` | **0** |
| 같은 범위 `grep -c 'cancelTradeEnabled'` | **1** |
| 불일치 로그 범위 `grep -c 'accountNo'` | **0** |
| `grep -c 'MUTATION' relay/src/ws/fanout.ts` (복원 후) | **0** |
| 포매터 | **돌리지 않았다** (이 저장소에 prettier 설정이 없다 — 16-30 사고) |

### 접속 경로 0건 (D-27)

`grep -rn '10\.41\.1\.120' relay/` **2건** — `relay/README.md`(경고 문장) · `relay/src/dma/link-health.ts`(주석). 둘 다 이 plan 이전부터 있던 **산문**이고 접속 대상 설정이 아니다. 이 plan 은 `relay/src/ws/fanout.ts` · `relay/tests/fanout.test.ts` 두 파일만 손댔고 새 IP 참조를 만들지 않았다. **실서버·실계좌 접속 0회 — FakeGateway 만 사용**(D-27). 정본 계약인 「접속 경로 0건」은 충족이다(16-35 가 정정한 기준: 리터럴 0건 조건은 실측 33건이라 만족 불가능하다).

## Deviations from Plan

**계획대로 실행했다. 계획 문구와 acceptance criteria 가 충돌한 지점 1건을 후자에 맞췄다.**

**1. [계획 문구 vs acceptance criteria 충돌] `crud` 불일치 로그의 위치 — `#isTeardown` 안이 아니라 `lc.set` 진입점**

- 계획 action ②: 「`#isTeardown` 이 `userId`/`t` 를 인자로 받지 않는다면 **시그니처를 넓히고** 호출부 2곳을 함께 고친다」
- 계획 acceptance criteria: 「`#strategyArmable` 의 `if (this.#isTeardown(cfg)) return true;` 가 **남아 있고**」 — 시그니처를 넓히면 이 줄이 문자 그대로 남을 수 없다
- 또한 시그니처를 넓혀 함수 안에서 로그를 남기면 **한 사고가 두 줄로 샌다** — `#isTeardown` 은 한 프레임당 최대 두 번(`lc.set` 분기 · `#strategyArmable`) 호출되고, ⑰-e4 처럼 시장이 풀리는 경로에서는 실제로 두 번 다 호출된다
- **채택:** `#isTeardown(cfg)` 를 **부수효과 없는 순수 판정**으로 유지하고, 불일치 로그는 프레임이 들어오는 지점(`lc.set` 분기, `fanout.ts:615-620`) 한 곳에서만 남긴다. acceptance criteria 는 로그의 **존재**와 **계좌번호 미포함**만 요구하고 위치를 못박지 않는다 — 두 criteria 를 모두 만족하면서 운영 신호가 부풀려지지 않는 유일한 배치다. 그 근거를 `#isTeardown` docstring 의 ★ 항에 남겼다

**2. [계획이 예고한 대로] 기존 테스트 2건 정정 — 수정을 약화시키지 않았다**
- 계획이 「깨지는 기존 테스트가 곧 회귀 신호는 아니다」로 미리 지목한 그대로였다. 실측 실패 2건(⑰-e·⑰-e2)이 정확히 그 둘이다. 게이트 4종을 명시 OFF 로 바꿔 테스트를 진실로 만들었다

**자동 수정(Rule 1~3) 0건.** 사전 존재 경고·무관 실패를 건드리지 않았고, `deferred-items.md` 에 새로 적을 항목도 없다.

## Requirements

**`requirements.mark-complete` 를 돌리지 않았다.**

- **TRADE-03 — Pending 유지가 정본이다.** 프로덕션 `/healthz` 의 `everReadyCount: 0` · `stalledCount: 2`(16-35 실측)가 「Ready 에 도달한 DMA 세션이 한 건도 없었음」을 말하고, 그 판정은 이 plan 으로 바뀌지 않았다. mock·단위 검증만으로 Complete 로 올리지 않는다(RELAY-02 와 같은 기준)

## Threat Model 처리

| Threat ID | Disposition | 이 plan 의 처리 |
|---|---|---|
| T-16-42 | mitigate | ✅ 철거 판정이 게이트 4종으로 좁혀져 등록·수정은 `#strategyMarket`(못 풀면 거부)로만 간다. **⑰-e3 이 잠근다** |
| T-16-43 | mitigate | ✅ 무장 가드 면제 조건이 **게이트 상태**가 됐다. `crud:"D"` 자칭으로 면제되지 않는다. **⑰-e4 가 잠근다** |
| T-16-55 | mitigate | ✅ **잃지 않았다.** 게이트 4종 OFF 는 시장을 못 풀어도 폴백 시장으로 통과. `#strategyArmable` 의 sweep 면제도 남겼다. **⑰-e·⑰-e2·⑰-e5 가 잠근다** |
| T-16-45 | mitigate | ✅ 신규 `logger.error` 는 `{ userId, t, isin, crud }` 뿐 — `accountNo` 0건. ⑰-e3 이 계좌번호 미포함을 단언 |
| T-16-13 | accept | ✅ FakeGateway 만 사용. 실서버·실계좌 접속 0회 (D-27) |

## 배포

**미실시.** relay 재배포는 3라운드 종결 plan **16-46** 몫이다(2라운드의 16-35 와 같은 규율). 이 plan 의 변경은 **아직 프로덕션에 없다** — 즉 실 게이트웨이(`10.41.1.120:9100`)에 결선된 프로덕션에는 R2-CR-01 이 **여전히 살아 있다.** 16-46 배포 전까지는 그 사실이 정본이다.

## Known Stubs

없음. 이 plan 은 표시 표면을 만들지 않는다.

## Threat Flags

없음. 새 네트워크 엔드포인트·인증 경로·파일 접근·스키마 변경이 없다 — 기존 관문의 판정 근거만 바꿨다.

## Next

- 3라운드 남은 갭 클로징 plan (16-37~16-45)
- **16-42 의 R2-WR-02** — 이 plan 의 `#strategyArmable` sweep 면제 주석을 근거로 삼는 UI 측 대칭 수정
- **16-46(종결)** — relay 재배포. 이 수정이 실계좌 경로에 실제로 올라가는 지점

## Self-Check: PASSED

- 파일 3종 실재 확인 (`16-36-SUMMARY.md` · `relay/src/ws/fanout.ts` · `relay/tests/fanout.test.ts`)
- 커밋 2건 실재 확인 (`eeb4539` · `51408ee`)
