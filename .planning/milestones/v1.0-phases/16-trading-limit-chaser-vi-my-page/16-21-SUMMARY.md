---
phase: 16-trading-limit-chaser-vi-my-page
plan: 21
subsystem: infra
tags: [healthz, uptime, observability, dma, relay, smoke, websocket, vitest]

requires:
  - phase: 16-17
    provides: relay 배포와 그 뒤 실측된 공개 `/healthz` 503(degraded) 상시 구간 — 이 plan 이 닫는 gap 4 의 원인 사슬
provides:
  - "`DmaSession.hasBeenReady` — 「한 번이라도 Ready 였는가」 래치의 공개 접근자"
  - "`SessionStats.everReadyCount` — 필수 필드. `readyCount`(지금 Ready) 와 다른 축"
  - "`/healthz` 판정 `everReadyCount === 0 || readyCount > 0` — 15-05 의 `sessionCount` 기준 계약을 대체"
  - "`HealthPayload.everReadyCount` — 게이트웨이 「부재」와 「장애」를 응답에서 구분"
  - "`scripts/smoke-relay.sh` `ws_order_probe()` — INV-9 를 relay wss 주문 왕복 도달성으로 재작성"
affects: [16-26 배포·요구사항 재판정, uptime check `gh-radar-relay-healthz`, 알림 정책 `gh-radar-relay-down`]

tech-stack:
  added: []
  patterns:
    - "「없음」과 「죽음」을 가르는 신호는 래치로 만든다 — 되돌리는 경로를 두지 않는 것이 그 신호의 유일한 보증이다"
    - "대체된 계약은 지우지 않고 「이 문단이 대체한다」를 붙여 유래를 남긴다"
    - "도달성 프로브는 성공이 아니라 **거부 응답**을 기대값으로 삼는다 — 부작용 0 으로 살아 있음을 증명한다"
    - "프로브가 위험한 부작용을 못 내는 근거는 코드가 아니라 프로브 주석에 적는다 (다음 사람이 다시 묻지 않게)"

key-files:
  created: []
  modified:
    - relay/src/dma/session.ts
    - relay/src/dma/session-manager.ts
    - relay/src/order/order-api.ts
    - relay/tests/session-manager.test.ts
    - relay/tests/order-api.test.ts
    - scripts/smoke-relay.sh
    - relay/README.md

key-decisions:
  - "gap 4 를 사용자 확정 해법 ③(degraded 판정에서 never-Ready 세션 제외)으로 닫았다. 게이트웨이를 살리는 것도, DMA 게이트 표시를 없애는 것도 아니다 — **알림의 의미만** 바로잡는다"
  - "`everReadyCount` 를 optional 이 아닌 **필수 필드**로 뒀다. 소비자·테스트가 컴파일 단계에서 전부 갱신을 강제받게 하려는 것이고, 실제로 기존 stats 단언 4곳이 즉시 드러났다"
  - "판정축이 `sessionCount` → `everReadyCount` 로 옮겨갔고 `sessionCount` 는 페이로드에만 남는다(진단용)"
  - "`hasBeenReady` 를 `false` 로 되돌리는 경로를 만들지 않는다 — 되돌리는 순간 「게이트웨이 장애」 탐지가 함께 죽는다 (T-16-26)"
  - "INV-9 프로브의 기대값은 `order.result(status=rejected)` 다. 화이트리스트 밖 계좌 + 미해석 ISIN 조합이라 게이트 ①·②·③-1 중 무엇이 먼저 걸리든 `dma_orders` insert·게이트웨이 송신 이전에 끝난다 (T-16-28)"
  - "소비자가 사라진 `server_url()` 은 남기지 않고 삭제했다 — 플랜은 「INV-10 이 쓰니 지우지 말라」고 했으나 실측상 `load_anon_key()` 만 INV-10b 가 쓴다"

patterns-established:
  - "「확인하지 않았다」(SKIP)와 「틀렸다」(FAIL)를 섞지 않는 3갈래 판정을 프로브 교체 후에도 그대로 승계한다"
  - "판정 완화는 반드시 **반대편 케이스**를 같은 커밋에서 테스트로 잠근다 (완화 1건 : 잠금 2건)"

requirements-completed: []  # TRADE-03 은 16-26 소관 — 아래 「요구사항 판정」 참조

duration: 8min
completed: 2026-09-09
---

# Phase 16 Plan 21: /healthz gap 4 종결 + smoke INV-9 교체 Summary

**`/healthz` 가 「게이트웨이가 애초에 없는 환경」(never-Ready 세션)을 더 이상 relay 장애로 보고하지 않고, 「Ready 였다가 죽은 세션」만 503 으로 남는다 — 그 구분의 유일한 근거인 `hasBeenReady` 래치가 공개되고 테스트 3케이스로 잠겼으며, 측정 대상이 사라졌던 smoke INV-9 는 relay wss 주문 왕복 도달성으로 재작성됐다.**

## Performance

- **Duration:** 약 8분
- **Started:** 2026-09-09T01:23Z (10:23 KST)
- **Completed:** 2026-09-09T01:31Z (10:31 KST)
- **Tasks:** 3 / 3
- **Files modified:** 7

## Accomplishments

- **판정축 이동.** `sessionCount === 0 || readyCount > 0`(15-05) → `everReadyCount === 0 || readyCount > 0`. `DMA_HOST` 가 뜨지 않은 환경에서 로그인 사용자가 붙어 만들어지는 「영원히 Ready 가 되지 않는 세션」이 더 이상 503 을 만들지 않는다.
- **진짜 장애 탐지는 살아 있다.** Ready 였다가 죽은 세션은 여전히 degraded 503 이고, 그 케이스가 이름부터 「Ready 였다가 죽은」인 테스트로 잠겼다.
- **회선 신호 독립성 유지.** never-Ready 세션이 있어도 VPN 이 죽으면 503 이라는 케이스를 새로 추가했다 — 세션 판정 완화가 2026-09-06 회귀 방지 장치를 가리지 않는다는 것을 잠근다.
- **응답에 판정 근거가 실린다.** `everReadyCount` 를 `HealthPayload` 에 추가해 `sessionCount:1, everReadyCount:0`(부재)과 `sessionCount:1, everReadyCount:1`(장애)이 curl 한 번으로 구분된다. 식별자는 여전히 0 — 케이스 ② 의 금지 문자열 검사가 그대로 통과한다.
- **INV-9 가 실재하는 경로를 잰다.** 16-16 이 없앤 server 주문 라우트 대신 relay wss 주문 핸들러의 도달성을 재고, 프로브 입력이 실주문을 만들 수 없는 근거 3겹이 프로브 주석에 박혔다.

## Task Commits

1. **Task 1: hasBeenReady 공개 + SessionStats.everReadyCount** — `08598a6` (feat)
2. **Task 2: /healthz degraded 판정에서 never-Ready 세션 제외 + 15-05 계약 갱신** — `506dfc0` (fix)
3. **Task 3: smoke-relay.sh INV-9 를 relay wss 주문 왕복으로 교체** — `f0a815a` (test)

## Files Created/Modified

- `relay/src/dma/session.ts` — `get hasBeenReady()` 추가. JSDoc 에 「부재 vs 장애」를 가르는 근거이며 래치라 되돌리지 않는다는 규율을 명시
- `relay/src/dma/session-manager.ts` — `SessionStats.everReadyCount`(필수) + `stats()` 가 같은 루프에서 `isReady`·`hasBeenReady` 를 각각 집계
- `relay/src/order/order-api.ts` — 판정 한 줄 교체 · `HealthPayload.everReadyCount` · 라우트 근거 주석에 2026-09-09 문단 추가(15-05 계약 대체 명시, 15-05 원문 문단은 유래로 보존)
- `relay/tests/session-manager.test.ts` — 케이스 ⑨ 신설(never-Ready 0 / Ready 후 단절 1) + 기존 stats 단언 3곳 갱신
- `relay/tests/order-api.test.ts` — ⑧ 의미 명확화(Ready 였다가 죽은 세션 2건 → 503) · ⑧-b 신설(한 번도 Ready 아닌 세션 1건 → 200) · ⑧-c 신설(never-Ready + VPN 죽음 → 503) · 키 화이트리스트에 `everReadyCount` 추가
- `scripts/smoke-relay.sh` — `order_path_probe()` 삭제 · `ws_order_probe()` 신설 · INV-9 호출부 라벨·가드·문구 교체 · 파일 상단 특이사항 ③ 추가 · 죽은 `server_url()` 삭제
- `relay/README.md` — 로컬 `/healthz` 예시 응답에 `everReadyCount` 반영

## Decisions Made

위 frontmatter `key-decisions` 참조. 특히 두 가지를 기록에 남긴다.

**① 이 plan 이 바꾸지 않는 것.** 게이트웨이는 살아나지 않았고, 로그인 사용자가 트레이딩 3표면에서 DMA 게이트를 보는 상태도 그대로다. 바뀐 것은 「게이트웨이가 애초에 없는 환경」이 더 이상 relay 장애로 **보고되지 않는다**는 것뿐이다. 프로덕션 실측(`https://dma.jx1.io/healthz` 가 실제로 200 이 되는지)은 **이 plan 이 하지 않는다** — 배포는 16-26 소관이며, 현재 배포본은 여전히 옛 판정으로 도는 `4b6d792` 다.

**② 완화 1건에 잠금 2건.** 판정을 느슨하게 만드는 변경은 그 자체가 탐지 실패의 씨앗이라(T-16-26), 반대편 두 케이스(Ready 였다가 죽음 / VPN 죽음)를 같은 커밋에서 테스트로 잠갔다. 이 규율을 patterns 에 남긴다.

## 요구사항 판정

**TRADE-03 은 Pending 유지.** 이 plan 은 판정 로직과 그 테스트까지만 바꿨고, 「uptime 이 실제로 초록으로 돌아왔다」는 프로덕션 실측 없이는 성립하지 않는다. 재판정은 16-26(배포·검증) 소관이다. `REQUIREMENTS.md` 를 건드리지 않았다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 플랜이 지목한 테스트 케이스 번호가 실제 파일과 달랐다**
- **Found during:** Task 2
- **Issue:** 플랜은 `order-api.test.ts` 의 「케이스 ④(sessionCount 0)·⑤(readyCount 0 → degraded)·⑥(readyCount 1)」을 고치라고 했으나, 실제 파일에서 그 번호는 각각 ⑦·⑧·⑨ 다(④~⑥ 은 공유 비밀 관문 케이스다). 번호대로 고쳤다면 무관한 인증 케이스를 훼손했다.
- **Fix:** 번호가 아니라 **의도**로 매핑해 ⑦(sessionCount 0) · ⑧(degraded) · ⑨(readyCount 1) 를 갱신하고, 새 케이스는 ⑧-b·⑧-c 로 붙여 기존 번호 체계를 깨지 않았다.
- **Files modified:** relay/tests/order-api.test.ts
- **Verification:** `vitest run tests/order-api.test.ts` 17 passed
- **Committed in:** `506dfc0`

**2. [Rule 1 - Bug] 「15-05 계약을 대체한다」 문장이 acceptance grep 과 충돌했다**
- **Found during:** Task 2
- **Issue:** 플랜 action ③ 은 대체 사실을 명시하라 하고, acceptance 는 `grep -c "sessionCount === 0" == 0`(옛 계약이 남아 있지 않을 것)을 요구한다. 옛 식을 그대로 인용하면 두 요구가 충돌한다.
- **Fix:** 옛 식을 코드 문자열이 아닌 **뜻**으로 적었다 — 「세션이 0건이거나 Ready 가 1건 이상이면 ok」. 대체 사실·15-05 참조는 그대로 남는다.
- **Files modified:** relay/src/order/order-api.ts
- **Verification:** `grep -c "sessionCount === 0"` = 0 · `grep -c "15-05"` = 2 · `grep -c "everReadyCount === 0"` = 1
- **Committed in:** `506dfc0`

**3. [Rule 1 - Bug] 플랜의 「`server_url()` 은 INV-10 이 쓰니 지우지 말라」가 사실과 달랐다**
- **Found during:** Task 3
- **Issue:** 플랜 action ④ 의 지시대로 `grep -n "server_url\|load_anon_key" scripts/smoke-relay.sh` 로 확인한 결과, INV-9 옛 프로브를 지우고 나면 `server_url()` 의 소비자가 **0건**이 된다. INV-10b 가 쓰는 것은 `load_anon_key()` 뿐이다(현재 669행). 남겨 두면 「주문 경로가 아직 server 를 지난다」는 오독을 만든다 — 16-20(WR-04)이 방금 지운 것과 같은 종류의 거짓말이다.
- **Fix:** `server_url()` 삭제. 자리에 삭제 사유와 「`load_anon_key()` 는 INV-10b 가 여전히 쓰므로 그대로 둔다」를 주석으로 남겼다. `load_anon_key()` 는 손대지 않았다.
- **Files modified:** scripts/smoke-relay.sh
- **Verification:** `grep -n "server_url\|load_anon_key"` → 정의 1건(`load_anon_key` 308행) + 사용 1건(INV-10b 669행). `bash -n` exit 0
- **Committed in:** `f0a815a`

**4. [Rule 1 - Bug] 새 INV-9 설명문의 `POST /api/orders` 리터럴이 acceptance grep 과 충돌했다**
- **Found during:** Task 3
- **Issue:** 플랜 action ③ 은 「`POST /api/orders` 는 16-16 에서 제거됐다」를 명시하라 하고, acceptance 는 `grep -c "POST /api/orders" == 0`(사라진 라우트를 가리키는 문장 없음)을 요구한다.
- **Fix:** 「server 의 주문 라우트 → relay 내부 HTTP 주문 경로는 16-16 에서 제거됐다(D-02)」로 경로 리터럴 없이 같은 사실을 적었다.
- **Files modified:** scripts/smoke-relay.sh
- **Verification:** `grep -c "POST /api/orders"` = 0
- **Committed in:** `f0a815a`

**5. [Rule 2 - Missing Critical] `relay/README.md` 의 `/healthz` 예시 응답이 계약과 어긋났다**
- **Found during:** Task 2
- **Issue:** 응답 필드를 늘렸는데 README 의 로컬 확인 예시(`curl .../healthz` 주석)는 옛 형태 그대로였다. 필드 화이트리스트 테스트는 코드만 지키므로 문서 쪽 거짓은 잡히지 않는다.
- **Fix:** 예시 응답에 `"everReadyCount":0` 추가. `infra/relay/README.md` 의 **과거 실측 기록**은 손대지 않았다 — 그것은 계약 설명이 아니라 그날의 관측이다.
- **Files modified:** relay/README.md
- **Verification:** 코드 `HealthPayload` 필드 6종과 예시 키 6종 일치
- **Committed in:** `506dfc0`

---

**Total deviations:** 5 auto-fixed (Rule 1 ×3, Rule 2 ×1, Rule 3 ×1)
**Impact on plan:** 전부 플랜 서술과 저장소 실제 상태의 불일치를 메운 것이고, 목표(gap 4 종결 · INV-9 교체)와 must_haves 는 그대로 달성됐다. 스코프 확장 없음.

## Issues Encountered

**프로덕션 배포본은 아직 옛 판정이다.** `https://dma.jx1.io/healthz` 는 이 커밋들이 배포되기 전까지 계속 503 이다(현재 배포 버전 `4b6d792`). 이 plan 의 verification 이 명시적으로 「프로덕션 실측은 하지 않는다 — 16-26 소관」이라 미실행으로 남긴다.

**INV-9 는 이번에도 실행하지 않았다(설계대로).** `smoke-relay.sh` 전체 실행은 gcloud 자원(IAP SSH·monitoring)을 건드리는 검사가 섞여 있어 배포 plan 에서 함께 돈다. 대신 프로브 JS 를 스크립트에서 추출해 **4갈래 판정 경로를 로컬 가짜 wss 서버로 실측**했다:

| 시나리오 | 기대 | 실측 |
|---|---|---|
| `order.result(status=rejected)` 응답 | reachable | **reachable** (거부 사유 문자열까지 stderr 표기) |
| `state s=unauthorized` | inconclusive | **inconclusive** |
| 연결 거부(ECONNREFUSED) | unreachable | **unreachable** |
| `order.new` 무응답 15초 | unreachable | **unreachable** (경과 15초 실측, 문구 `order.result 미수신`) |

## Verification

| 검사 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/relay test` | **17 files / 326 tests passed** |
| `pnpm --filter @gh-radar/relay run typecheck` | exit 0 |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | exit 0 |
| `bash -n scripts/smoke-relay.sh` | exit 0 |
| `node --check` (추출한 프로브 113줄) | exit 0 |
| `grep -c "get hasBeenReady" relay/src/dma/session.ts` | 1 |
| `grep -c "#hasBeenReady = false" relay/src/dma/session.ts` | 1 (선언 1곳 — 되돌리는 경로 없음) |
| `grep -c "everReadyCount" relay/src/dma/session-manager.ts` | 4 (≥3) |
| `grep -c "sessionCount === 0" relay/src/order/order-api.ts` | **0** (옛 계약 잔존 없음) |
| `grep -c "everReadyCount === 0" relay/src/order/order-api.ts` | 1 |
| `grep -c "15-05" relay/src/order/order-api.ts` | 2 |
| `grep -c "한 번도 Ready\|Ready 였다가" relay/tests/order-api.test.ts` | 2 (≥2) |
| `grep -c "order_path_probe" scripts/smoke-relay.sh` | 0 |
| `grep -c "ws_order_probe" scripts/smoke-relay.sh` | 3 (≥2) |
| `grep -c "POST /api/orders" scripts/smoke-relay.sh` | 0 |
| `grep -c "0000000000" scripts/smoke-relay.sh` | 4 (≥1) |
| `grep -rn "10\.41\.1\.120" scripts/smoke-relay.sh` | **0건** |

**D-27 grep 게이트에 대한 정직한 기록:** `grep -rn "10\.41\.1\.120" relay/` 는 **2건**이다 — `relay/README.md:17`(실서버 접속 금지 경고문, 15-05 `653b9de`)과 `relay/src/dma/link-health.ts:20`(회선 판정 근거 주석, `a2c5238`). 둘 다 이 plan 이전부터 있던 것이고 이 plan 이 만든 코드에는 0건이다. 스코프 밖이라 손대지 않았다(스코프 경계 규율).

## User Setup Required

None — 외부 서비스 설정 변경 없음. 다만 **배포는 필요하다**: 이 판정 변경은 relay 컨테이너를 재배포해야 프로덕션에 반영된다 (16-26).

## Next Phase Readiness

- **16-26(배포·재검증) 준비 완료.** 배포 후 확인할 것: ① `curl -s https://dma.jx1.io/healthz` 가 **200** 이고 본문에 `everReadyCount:0` 이 실릴 것(게이트웨이 부재 상태의 정상 응답) ② uptime check `gh-radar-relay-healthz` 초록 전환 ③ `SMOKE_AUTH_TOKEN` 을 넣고 `bash scripts/smoke-relay.sh` 로 INV-9 를 **처음으로 실제 실행**할 것 — 기대값은 `reachable`(주문 핸들러가 거부로 답함)이며 `inconclusive` 면 매핑·토큰을 먼저 의심한다.
- **주의:** 배포 후에도 `everReadyCount` 가 1 이상으로 올라가는 순간(즉 게이트웨이가 한 번 붙었다가 죽는 순간)부터는 다시 503 이 정상 동작이다. 그때의 적색은 무시하면 안 되는 신호다.

---
*Phase: 16-trading-limit-chaser-vi-my-page*
*Completed: 2026-09-09*

## Self-Check: PASSED

- 파일 8건 전부 존재 (수정 7 + SUMMARY 1)
- 커밋 3건 전부 git log 에 존재 (`08598a6` · `506dfc0` · `f0a815a`)
