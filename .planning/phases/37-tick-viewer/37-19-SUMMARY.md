---
phase: 37-tick-viewer
plan: 19
subsystem: webapp
tags: [tick-viewer, live, polling, fzstd, visibility, playwright, rtl]
status: complete

requires:
  - phase: 37-tick-viewer (37-15)
    provides: "GET /api/ticks/live 중계 · TICK_LIVE_HEADERS · 409 {epoch} · 503 미결선 · 502 재시도 · CORS expose"
  - phase: 37-tick-viewer (37-08)
    provides: "TickStateCard live-loading(대기 k건 · 진행 · 취소) · live-unavailable(「당일 자료 준비 중」)"
  - phase: 37-tick-viewer (37-10 · 37-13 · 37-14)
    provides: "buildTickSession · TickViewer · useTickCursor · 슬라이더 showEnd · 전문 목록 · 차트 · 팀 패널"
provides:
  - "webapp fetchTickLive(tick-api.ts) — 같은 Bearer · 바이트 + X-Tick-* 6종 · throw 없이 status(409 = meta.epoch)"
  - "webapp appendTickBytes(tick-session.ts) — fzstd 해제 → 이어붙임 → 세션 전체 재생성 · TickSession.rebuildMs"
  - "webapp useTickLive(use-tick-live.ts) — 하루치(2초 이어 받기) → 증분(보일 때 ∧ 끝일 때 5초) · newCount · goEnd · generation · errors · stop"
  - "useTickCursor live 옵션 — t 없으면 끝 틱 · 끝이면 증분 세션을 따라감 · atEnd · goEnd · 끝 틱이면 URL t 제거"
  - "TickViewer live — 슬라이더 「끝으로」 · 전문 목록 끝 「새 틱 n건 · 끝으로」 배지 · onAtEnd"
  - "TickHeader live — 「당일 자료 지연 · n초 전 마지막 수신」 · 「당일 자료를 받지 못하고 있어요」"
  - "e2e 픽스처 mockTickLive · tickLiveChunks · e2e 절 「당일」 · 「미결선」"
affects: [37-17]

actuals:
  tokens: 21000
  tasks: 3
  commits: 5
plan_head_before: 26d6049d19f32efa0fbb602c44afe303fb616eaa
plan_head_after: ab3328e4

tech-stack:
  added: []
  patterns:
    - "폴링 훅 = 효과 하나 안의 제어 객체(Ctl) + setTimeout 체인 — 진행 중 요청과 타이머가 겹치지 않게 running · timer 를 함께 본다 · 가시성/끝 복귀/goEnd 는 resume(now) 한 입구"
    - "세션 교체 시 커서 추종 = 렌더 중 이전 세션 비교(useState 로 본 세션 기억 · React 권장 꼴) — 이전 끝이었을 때만 새 끝"
    - "epoch 교체 = 이전 세션을 보인 채 하루치를 다시 받고, 다 오면 generation 을 올려 뷰어 key 로 재마운트"
    - "e2e 순간 상태 = 픽스처가 붙잡고(queued) 테스트가 release() — 사라지는 카드 문구를 경쟁 없이 단언"

key-files:
  created:
    - webapp/src/lib/ticks/use-tick-live.ts
    - webapp/src/lib/ticks/__tests__/use-tick-live.test.tsx
    - webapp/src/components/ticks/__tests__/tick-viewer-live.test.tsx
  modified:
    - webapp/src/lib/ticks/tick-api.ts
    - webapp/src/lib/ticks/tick-session.ts
    - webapp/src/lib/ticks/use-tick-cursor.ts
    - webapp/src/components/ticks/tick-viewer-page.tsx
    - webapp/src/components/ticks/tick-viewer.tsx
    - webapp/src/components/ticks/tick-header.tsx
    - webapp/e2e/fixtures/ticks.ts
    - webapp/e2e/specs/ticks-viewer.spec.ts

key-decisions:
  - "하루치 받는 동안(loading · queued)은 바이트를 모아 두었다가 상태가 바뀌면 한 번에 세션을 만든다 — 2초마다 수 MB 세션을 다시 만들지 않는다. 이어 받기는 같은 offset 0 이 아니라 X-Tick-Offset-End 부터(받은 바이트를 다시 받지 않음)"
  - "「새 틱 n건」 = 커서가 끝을 떠난 뒤 붙은 레코드 수(멈추기 직전 떠 있던 요청이 가져온 것). 멈춘 동안은 요청 0 이라 대개 0 — 그때 배지는 「새 틱 받기 멈춤 · 끝으로」(배지는 과거 틱을 보는 동안 늘 보인다 · 클릭 = 즉시 1회 + 끝)"
  - "409 는 0ms 뒤 즉시 offset 0 재요청(연속 409 면 5초) — 새 하루치를 받는 동안 이전 세션을 그대로 보이고, 다 오면 generation +1 로 뷰어를 새로 열어 끝 틱"
  - "오류(502 · 500 · 0)는 5초 간격 그대로(줄이지 않음) · 연속 3회부터 머리 줄 · 503 은 멈추고 「당일 자료 준비 중」 · 401/403 은 DmaGate"
  - "하루치 진행 바 = (마지막 수신 − 08:00)/(지금 − 08:00) — 헤더에 전체 크기가 없어 시각으로 잰다 · 수신 전이면 불확정"
  - "당일 끝 틱이면 URL t 를 지운다(t 없음 = 당일 끝 틱 · 새로고침하면 그때의 끝) · 이미 없으면 replaceState 하지 않는다(증분마다 쓰지 않게)"
  - "지연 배지는 h1 밖 머리 flex 항목 — 폰 폭에서 h1 안에 두면 가로로 넘친다(줄바꿈되게)"

requirements-completed: [D-05, D-06, D-18, D-22]

duration: 약 20분
completed: 2026-11-02
---

# Phase 37 Plan 19: 당일 경로 웹 — 하루치 → 증분 폴링 Summary

**오늘 종목을 열면 `/api/ticks/live` 를 같은 Bearer 로 offset 0 부터 받는다. 받는 동안은 「하루치 받는 중 · 대기 k건」 카드를 보이고, 다 받으면 fzstd 로 풀어 과거와 같은 `TickViewer` 를 끝 틱에서 연다. 그 뒤로는 탭이 보이고 커서가 끝일 때만 5초마다 증분을 이어붙이고 세션을 처음부터 다시 만든다(열린 주문 재분류). 과거 틱을 보는 동안은 요청 0 이고 「새 틱 · 끝으로」 배지를 띄운다. 409 가 오면 새 epoch 로 다시 받는다. 지연이나 연속 오류는 머리에 표시한다. today live=false 이면 요청 없이 「당일 자료 준비 중」 으로 선다.**

## Performance

- **Duration:** 약 20분
- **Completed:** 2026-11-02T13:06Z
- **Tasks:** 3 (트레이서 1 · TDD 1 · e2e 1)
- **Files modified:** 11 (생성 3 · 수정 8)

## 폴링 상태표 (`useTickLive`)

| 단계 · 조건 | 요청 | 간격 | 화면 |
|---|---|---|---|
| `enabled` false (today live=false · 오늘 아님) | 0 | — | 「당일 자료 준비 중」(37-08) |
| 하루치 · X-Tick-State loading/queued | `offsetEnd` 부터 이어 받기(바이트 모음) | 2초 | 「하루치 받는 중 · 대기 k건」 · 진행 = 마지막 수신/지금 |
| 하루치 → 그 밖 상태 | 모은 바이트로 세션 1회 | — | `TickViewer` live · `t` 없으면 끝 틱 |
| 증분 · 보임 ∧ 커서 끝 | `offsetEnd` · 바이트 있으면 `appendTickBytes` | 5초 | 커서가 새 끝을 따라감 |
| 증분 · 커서 과거 틱 | **0**(타이머를 걷는다) | — | 전문 목록 끝 「새 틱 n건 · 끝으로」/「새 틱 받기 멈춤 · 끝으로」 |
| 「끝으로」(배지 · 슬라이더) | 즉시 1회 | 뒤로 5초 | 커서 끝 · newCount 0 |
| 탭 숨김 | **0** | — | — |
| 탭 다시 보임 | 즉시 1회(끝일 때) | 뒤로 5초 | — |
| 409 `{epoch}` | 새 epoch · offset 0 즉시(연속이면 5초) | 하루치 규칙 | 이전 세션을 유지하다가 교체(generation +1 · 끝 틱) |
| delayed · blocked | 그대로 | 5초(바꾸지 않음) | 머리 「당일 자료 지연 · n초 전 마지막 수신」 |
| 502 · 500 · 0(네트워크) | 다음 주기 | 5초(줄이지 않음) | 연속 3회부터 「당일 자료를 받지 못하고 있어요」 |
| 503 | 멈춤 | — | 「당일 자료 준비 중」 |
| 401 · 403 | 멈춤 | — | DmaGate |
| 카드 「취소」 | 멈춤(`stop`) | — | 목록으로 |

## 세션 재생성 ms (37-17 UAT 비교값)

컷 13시 KRX 픽스처(에코앤드림 10/16 13:00~13:48 · 11,990 레코드 · 해제 6.0MB) · jsdom · vitest:

| 경우 | 소요 |
|---|---|
| `appendTickBytes(null, 6,000 레코드 덩이)` — 해제 + 세션 | **30.4ms** |
| `appendTickBytes(그것, 5,990 레코드 덩이)` — 해제 + 이어붙임 + 전체 재생성(11,990) | **21.6ms** |
| 참고: `buildTickSession`(37-10 · 11,990 · 해제 제외) | 26.9ms |

전체를 다시 만들어도 5초 주기에 비해 무시할 만하다. 실제 하루치(극단 종목 zstd ≈ 7MB)는 37-17 UAT 에서 `session.rebuildMs` 로 잰다.

## Task Commits

1. **Task 1 (tracer): 당일 경로 웹 트레이서** — `afc6786e` (feat)
2. **Task 2 RED: 폴링 규율 실패 시험** — `3f25eb65` (test)
3. **Task 2 GREEN: 폴링 규율 · 배지 · 끝으로 · 지연 표시** — `8dc5fb21` (feat)
4. **Task 3: e2e 당일 흐름 · 미결선 카드** — `7c5efdb3` (test)
5. **재생성 ms 출력(37-17 비교값)** — `ab3328e4` (test)

## 테스트

- Task 1 verify: `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && vitest run use-tick-live.test.tsx tick-session.test.ts` → exit 0 · 10/10. 트레이서 게이트: 커밋 전에 같은 명령과 ticks 전체 회귀를 다시 돌려 통과를 확인했다.
- Task 2 RED: 폴링 시험 6건과 뷰어 시험 3건 실패를 확인한 뒤 커밋했다(`3f25eb65`). GREEN: `use-tick-live.test.tsx` 12/12 · `tick-viewer-live.test.tsx` 8/8.
- 플랜 verification: `vitest run src/lib/ticks src/components/ticks --maxWorkers=2` → **22 파일 206 테스트 통과**(회귀 0).
- `typecheck`(tsc · tsc e2e) exit 0 · 바뀐 파일 eslint 경고 0.
- **e2e 미실행 — 오케스트레이터가 메인 트리에서 실행해야 한다.** worktree 에 webapp env 가 없다. `typecheck:e2e` 만 통과했다.
  - `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/ticks-viewer.spec.ts --workers=1`
  - 새 절: `틱 전문 뷰어 당일 — 하루치 → 증분 · 새 틱 배지 · 끝으로 · 미결선` 의 두 테스트(「당일 — …」 · 「미결선 — …」). 기존 37-08 · 37-10 · 37-13 · 37-14 절과 같은 spec 이다.
  - 실제로 기다리는 시간: 하루치 2초 · 증분 5초 · 멈춤 확인 7초. 당일 절에는 `test.setTimeout(90_000)` 을 걸었다.
  - 미리 확인한 것(Node 스크립트): `tickLiveChunks(['13:30:00'])` 는 레코드 8,348 + 3,642 로 나뉜다(13:00:00.013~13:29:5x | 13:30~13:48:32.565). zstd 크기는 275KB + 110KB 다.

## Files Created/Modified

- `webapp/src/lib/ticks/tick-api.ts` — `fetchTickLive` · `tickLiveMetaOf` · `TickLiveResult` · `TICK_LIVE_TIMEOUT_MS`(30초 · AbortSignal.timeout)
- `webapp/src/lib/ticks/tick-session.ts` — `appendTickBytes` · `TickSession.rebuildMs`(격자는 null)
- `webapp/src/lib/ticks/use-tick-live.ts` — 훅 · `liveProgressOf` · 상수 `TICK_LIVE_POLL_MS`(5초) · `TICK_LIVE_LOADING_MS`(2초) · `TICK_LIVE_FAILING_AFTER`(3)
- `webapp/src/lib/ticks/use-tick-cursor.ts` — `live` 옵션 · `endRecOf` · `atEnd` · `goEnd` · 세션 교체 추종 · 끝 틱 URL t 제거
- `webapp/src/components/ticks/tick-viewer-page.tsx` — view `live` · 훅 결선 · 카드(대기 · 진행 · 취소=stop) · 뷰어 key generation · 머리 live · 게이트 연결
- `webapp/src/components/ticks/tick-viewer.tsx` — `live: TickViewerLive` · 배지 · `showEnd`/`onEnd` · `onAtEnd`
- `webapp/src/components/ticks/tick-header.tsx` — `live: TickHeaderLive` · `liveDelayTextOf` · 지연 배지 · 연속 오류 줄
- `webapp/e2e/fixtures/ticks.ts` — `mockTickLive`(publish · release · calls) · `tickLiveChunks`
- `webapp/e2e/specs/ticks-viewer.spec.ts` — 당일 · 미결선 절
- 시험: `use-tick-live.test.tsx`(append 2 · 하루치 3 · 규율 7) · `tick-viewer-live.test.tsx`(뷰어 3 · 머리 2 · 페이지 3)

## Decisions Made

frontmatter key-decisions 참조.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `use-tick-cursor.ts` 수정(플랜 files 목록 밖)**
- **Found during:** Task 1 · 2
- **Issue:** 이 플랜의 요구는 셋이다. t 없이 열면 당일 끝 틱(D-18), 커서가 끝이면 증분을 따라가기, 끝 여부를 훅에 넘기기. 셋 다 커서 훅에 있어야 할 동작이다. 뷰어에서 바깥으로 흉내 내면 커서 상태가 두 군데로 갈린다.
- **Fix:** `live` 옵션 · `endRecOf` · `atEnd` · `goEnd` · 렌더 중 세션 비교로 추종 · 끝 틱이면 URL `t` 제거. 과거 경로는 동작이 같다(37-10 · 37-13 시험 회귀 0).
- **Commits:** `afc6786e` · `8dc5fb21`

**2. [Rule 1 - Bug 예방] 하루치 이어 받기 offset**
- **Found during:** Task 1
- **Issue:** 플랜 문구는 「2초 뒤 같은 offset 재요청」 이다. 그런데 tickgw 는 loading 중에도 이미 받은 프레임을 offset 이후로 준다(37-09 이어받기). offset 0 을 계속 다시 부르면 같은 수 MB 를 2초마다 다시 받는다.
- **Fix:** 매번 `X-Tick-Offset-End` 부터 받고, 받은 바이트는 모아 둔다. 세션은 상태가 loading/queued 를 벗어날 때 한 번만 만든다.
- **Commit:** `afc6786e`

**3. [Rule 2 - 화면 결함] 지연 배지 위치**
- **Found during:** Task 2
- **Issue:** 배지를 h1 안 공급 배지 옆에 두면, 폰 폭에서 종목명 · 공급 배지 · 지연 배지가 한 줄로 묶여 가로로 넘친다.
- **Fix:** 머리 flex-wrap 항목으로 빼서 공급 배지 바로 뒤에 둔다(`-ml-2`). 줄이 모자라면 줄바꿈된다.
- **Commit:** `8dc5fb21`

**4. 시험 기법(동작 변경 없음)** — 409 본문 `Response.json()` 은 Node 의 진짜 이벤트 루프가 돌아야 풀린다. 그래서 409 시험만 `vi.waitFor`(진짜 타이머)로 기다리면서 0ms 가짜 타이머를 민다. 가짜 시계는 0ms 만 움직이므로 간격 단언은 그대로다.

## Issues Encountered

- 이 실행 환경은 `git` 이 들어간 복합 셸 명령 · heredoc 을 막는다. 그래서 커밋 원장 파일(`gsd-plan-head-before-37-19`)은 만들지 않았다. 기준점은 지시된 base `26d6049d` 를 그대로 쓰고, `git rev-list --count 26d6049d..HEAD` = 5 로 직접 쟀다(이 SUMMARY 커밋 전).

## Known Stubs

없음. live-loading 카드는 37-08 에서 `queued={0}` · `progress={null}` 고정값이던 자리인데, 이제 훅의 `meta.queue` 와 `liveProgressOf` 가 채운다.

## User Setup Required

없음. 실제로 켜는 일은 37-17 이 한다(119 인덱서 배포 → tickgw → `TICKGW_URL` 로 server 배포 → today live=true).

## Next Phase Readiness

- **37-17(UAT):** 당일 종목을 열고 다음을 본다. 카드(대기 k건 · 진행), 끝 틱, 5초 증분, 과거 틱에서 멈춤과 배지, 「끝으로」 즉시 1회, tickgw 재기동 뒤 409 재수신이다. 콘솔이나 React DevTools 에서 `session.rebuildMs` 를 읽어 위 표(컷 픽스처 21~30ms)와 비교한다.
- **레이트 리밋:** `/api` 는 IP 당 분당 200회다(37-15). 탭 하나는 5초 주기라 분당 12회다. 하루치 받는 중에는 2초 주기라 분당 30회다.

## Self-Check: PASSED

- FOUND: webapp/src/lib/ticks/use-tick-live.ts · webapp/src/lib/ticks/__tests__/use-tick-live.test.tsx · webapp/src/components/ticks/__tests__/tick-viewer-live.test.tsx
- FOUND: afc6786e · 3f25eb65 · 8dc5fb21 · 7c5efdb3 · ab3328e4 (HEAD 조상)
- acceptance grep: `export async function fetchTickLive` · `TICK_LIVE_HEADERS`(tick-api.ts) · `export function appendTickBytes` · `rebuildMs`(tick-session.ts) · `visibilityState`(use-tick-live.ts) · `새 틱`(tick-viewer.tsx) · `당일 자료 지연`(tick-header.tsx) · `mockTickLive`(e2e/fixtures/ticks.ts) 모두 있음
