---
phase: 16-trading-limit-chaser-vi-my-page
plan: 17
subsystem: testing
tags: [a11y, axe, wcag, playwright, e2e, typecheck, tsconfig, keyboard, hydration]

# Dependency graph
requires:
  - phase: 16-11
    provides: 사이드바 트리 · 라우트 셸 · `strategy-badge`/`dma-gate` (a11y 검사 대상 표면의 뼈대)
  - phase: 16-13
    provides: 상따 화면 + 상따 변형 호가 사다리 (`orderbook-ladder` `data-variant="chaser"`)
  - phase: 16-14
    provides: VI 화면 + 데드라인 진행바 · `confirm_locked` 잠금
  - phase: 16-15
    provides: My page (전략 현황 카드 · 계좌별 세로 반복)
  - phase: 16-16
    provides: REST 주문 경로 제거 (배포 시 리비전 env 정리 인계)
provides:
  - "신규 3표면(상따·VI·My page) axe 위반 0 + axe 로는 못 잡는 UI-SPEC 접근성 계약 7종의 명시 단언"
  - "모바일 호가 스크롤 영역의 키보드 접근성 (WCAG 2.1.1) — 없으면 매수 10단에 키보드로 못 닿았다"
  - "일봉 차트 스켈레톤 `role=\"status\"` — role 없는 div 의 aria-label 은 낭독되지 않는다"
  - "선행 E2E 실패 3건 + 불안정 1건 제거 — 전부 스펙의 경주였고 계약 회귀가 아니었다"
  - "`webapp/tsconfig.e2e.json` — `e2e/**` 를 처음으로 tsc 아래에 넣고 루트 typecheck 에 편입"
  - "16-VALIDATION.md 전량 실측 갱신 (`nyquist_compliant: true` · Task ID/Status 전 칸)"
  - "배포 3종 실행 (relay `4b6d792` / server `00042-p78` / Vercel `mwxn21lpz`) + smoke 실측"
  - "T-16-08 종결 — server 리비전에서 relay 결선 env·secret 3종 제거를 `describe` 로 실측 확인"
  - "`smoke-server.sh` 를 16-16 이후 계약으로 정정 — 스모크가 우리가 지우려는 것의 존재를 요구하고 있었다"
  - "relay `/healthz` 503(degraded)의 원인 사슬 규명 + 회귀 아님을 uptime 3일 이력으로 실증"
affects: [phase-17, 운영-알림]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "axe 위반 0 은 접근성의 **하한**이지 계약이 아니다. 「묶음에만 라벨 1개」·「탭 순서에서 빠진다」류는 전부 규격상 합법이라 명시 단언으로 따로 잠근다"
    - "「포커스 대상이 아니다」는 `toBeDisabled()` 나 `tabIndex` 단독으로 못 잡는다 — `disabled`·음수 tabindex·`hidden` 서브트리·`display:none` 을 함께 거른 목록으로 단언한다"
    - "E2E 기술자에 textContent 를 섞지 않는다. 값이 흐르는 요소(스크롤 박스)가 자식 텍스트를 통째로 물고 있어 기대값이 흔들린다 — `data-slot` + `aria-label` 로만 만든다"
    - "`await expect(X).toBeVisible()` 는 **동기화 지점이 아닐 수 있다**. 로딩 중에도 참인 요소를 기다린 뒤 재시도 없는 `count()`/`getAttribute()` 를 쓰면 그 자리가 곧 flake 다"
    - "effect 안에서 서는 리스너(단축키 등)는 하이드레이션 전에 쏜 이벤트를 삼킨다 — `toPass` 로 리스너가 설 때까지 재발사한다"
    - "테스트 디렉터리가 tsc 밖에 있으면 그 실패는 가장 비싼 경로(E2E 전량 2.4분)에서만 드러난다. relay `typecheck:tests` 와 같은 규율을 webapp e2e 에도 세웠다"

key-files:
  created:
    - webapp/tsconfig.e2e.json
  modified:
    - scripts/smoke-server.sh
    - webapp/e2e/specs/a11y.spec.ts
    - webapp/e2e/specs/news.spec.ts
    - webapp/e2e/specs/search.spec.ts
    - webapp/package.json
    - webapp/src/components/orderbook/orderbook-ladder.tsx
    - webapp/src/components/orderbook/__tests__/orderbook-ladder-chaser.test.tsx
    - webapp/src/components/stock/stock-daily-chart-skeleton.tsx
    - .planning/phases/16-trading-limit-chaser-vi-my-page/16-VALIDATION.md
    - .planning/phases/16-trading-limit-chaser-vi-my-page/deferred-items.md

key-decisions:
  - "「호가 사다리는 포커스 대상이 아니다」(UI-SPEC §키보드 접근성)를 **문자 그대로** 지키면 WCAG 2.1.1 위반이 된다. 그 규칙이 금지한 것은 호가 **셀**의 roving tabindex 이고, 400px 안에서 20행을 스크롤하는 **박스 자신**은 tab stop 이어야 한다 — 안에 포커스 가능한 자식이 0 이라 박스가 빠지면 키보드 사용자는 매수 10단을 영원히 볼 수 없다. RTL ⑦ 의 계약을 「tabindex 0개」에서 「스크롤 박스 정확히 1개 + 행 0개」로 정정했다"
  - "선행 실패 3건을 **증상이 아니라 원인으로** 분류했다. 16-11/16-15 는 「뉴스 목록 상한 계약 회귀」·「⌘K 단축키 회귀」로 기록했지만 둘 다 제품은 멀쩡했다 — 잘못된 라벨을 남겨 두면 다음 사람이 없는 회귀를 찾는다"
  - "`webapp` 의 `typecheck` 에 e2e 검사를 **직접 이어 붙였다.** 별도 스크립트로만 두면 relay `typecheck:tests` 처럼 아무도 안 돌린다 — 사각지대를 만든 원인이 정확히 그것이다"
  - "`surface-placeholder.tsx`(사용처 0건, 16-14 가 16-17 로 넘김)를 **지우지 않았다.** 위험이 아니라 권한 문제다 — plan 의 `files_modified` 밖이고 이 plan 은 `autonomous: false` 로 체크포인트에서 멈춘다. 계획 밖 파일 삭제를 실행자가 단독으로 결정하지 않는다"
  - "STATE.md · ROADMAP.md 를 건드리지 않았다(오케스트레이터 소관). 배포 결과는 16-VALIDATION.md §Deployment Verification 에 남겼다"
  - "`smoke-server.sh` 를 고치는 것이 배포의 **선행 조건**이었다. 16-16 이 deploy 스크립트만 정리해 스모크는 여전히 `RELAY_INTERNAL_URL` 의 존재와 `POST /api/orders` 401 을 요구했다 — 그대로 두면 배포의 마지막 단계가 반드시 빨간불이고, 그 빨간불이 「제거가 성공했다」의 증거와 구별되지 않는다"
  - "relay `/healthz` 503 을 **고치지 않았다.** 판정 로직(15-05)은 Phase 16 이 손대지 않았고 uptime 3일 이력에 같은 구간이 이미 있다 — 회귀가 아니라 「접속자 있음 + 게이트웨이 없음」의 상시 조건이다. 해법 4개가 전부 결정 사항이라 Rule 4 로 사용자에게 넘긴다"
  - "실서버·실계좌 검증을 하지 않았다. 사용자가 명시로 배제했고 `DMA_HOST` 는 기본값(로컬 mock)으로 뒀다 — 배포 로그가 실제 컨테이너에서 되읽은 값이 `127.0.0.1` 임을 확인해 준다"

patterns-established:
  - "a11y 확장은 **첫 실행 red 를 기대하고** 짠다. 이번에도 2건(serious)을 잡았고, 통과만 하는 a11y 스펙은 검사 대상 DOM 이 서기 전에 돌고 있었을 가능성을 먼저 의심한다"
  - "relay 를 쓰는 새 spec 은 `fixtures/relay.ts` ⑥ 의 4줄 규약(serial · `withLocalRelay` 1회 · `stop()` · `reset()`)을 그대로 지킨다. a11y.spec.ts 도 이제 그 목록에 든다"

requirements-completed: []

# Metrics
duration: 45min + 35min(배포)
completed: 2026-09-09
---

# Phase 16 Plan 17: Phase 종결 — a11y 확장 · 전체 테스트 · 배포 3종 Summary

**신규 3표면을 axe 검사에 넣자 첫 실행에서 serious 위반 2건이 나왔다 — 그중 하나는 모바일에서 키보드만 쓰는 사용자가 매수 10단에 영원히 닿을 수 없던 결함이다. 둘을 고치고, 선행 실패로 3개 plan에 걸쳐 「계약 회귀」로 기록돼 있던 3건이 사실은 전부 스펙의 경주였음을 밝혀 제거했다. 전체 테스트(typecheck·단위 1,909·E2E 126)가 green 이다. 사용자 승인 후 relay → server → webapp 을 배포했고, `--update-secrets` 병합 때문에 재배포만으로는 사라지지 않는 `RELAY_ORDER_SECRET` 바인딩을 명시 제거해 T-16-08 을 닫았다 — 그 확인 수단인 `smoke-server.sh` 자체가 16-16 정리에서 빠져 우리가 지우려는 것의 존재를 요구하고 있었다.**

## Performance

- **Duration:** 45 min (Task 1) + 35 min (Task 2·3 배포)
- **Started:** 2026-09-08T17:16Z (2026-09-09 02:16 KST)
- **Completed:** 2026-09-08T21:50Z (2026-09-09 06:50 KST)
- **Tasks:** 3/3 — Task 1 완료 · Task 2 배포 3종 완료(smoke 1건 열림) · Task 3 실행자 소관분 완료
- **Files modified:** 9 modified, 1 created

## Accomplishments

### 1. a11y 확장이 **실제로 결함을 잡았다** (통과만 하는 검사가 아니다)

첫 실행에서 axe `scrollable-region-focusable`(serious)이 터졌다. 모바일(<1280) 호가
사다리는 400px 박스 안에서 20행을 스크롤하는데, 이 변형은 설계상 **가격 클릭이 없어서**
안에 포커스 가능한 자식이 하나도 없다. 박스 자신이 tab stop 이 아니면 키보드만 쓰는
사용자에게는 **매수 10단이 존재하지 않는 정보**가 된다 — 마우스 휠·터치로만 닿는다.

UI-SPEC §키보드 접근성의 「호가 사다리는 포커스 대상이 아니다」와 모순되지 않는다.
그 규칙이 금지한 것은 호가 **셀**의 roving tabindex 이고, 여기서 포커스를 받는 것은
셀이 아니라 스크롤 영역 하나다. 계약을 그 모양으로 정정했다:

| 자리 | 이전 | 지금 |
|------|------|------|
| `orderbook-ladder-chaser.test.tsx` ⑦ | `[tabindex]` 0개 | 스크롤 박스 **정확히 1개** + `ladder-row-mobile[tabindex]` 0개 |
| `a11y.spec.ts` 데스크톱 | — | 사다리 안 탭 가능 요소 0 (스크롤이 없으므로) |
| `a11y.spec.ts` 모바일 | — | `['div[ladder-scroll]']` — 0 도 아니고 20 도 아니다 |

두 번째는 `aria-prohibited-attr`(serious) — `stock-daily-chart-skeleton` 이 role 없는
`div`(`Skeleton`)에 `aria-label` 을 달고 있었다. 규격상 금지이고, 무엇보다 **붙여도
스크린리더가 읽지 않는다** — 라벨이 조용히 사라진다. `themes`/`watchlist`/`scanner`
스켈레톤 3종은 이미 `role="status"` 였으므로 같은 계열의 누락이었다.

### 2. axe 로는 못 잡는 계약 7종을 명시로 잠갔다

개별 원마다 `aria-label` 을 달아도 axe 는 통과하고 스크린리더만 같은 문장을 두 번 읽는다.
아래는 전부 **규격상 합법**이라 위반 0 과 별개로 단언해야 한다.

| # | 계약 | 어떻게 잡는가 |
|---|------|---------------|
| ① | 사이드바 `nav[aria-label="주 메뉴"]` 1개 + 활성 항목 1개만 `aria-current="page"` | 개수로 단언 (2개가 되면 실패) |
| ② | 원 아이콘 묶음 `role="img"` 라벨 **1개**, 개별 원 `aria-hidden` | 항목 안 `[aria-label]` 총 1개 + 두 번째 항목은 조합 반대(`매수 꺼짐 · 매도 켜짐`)로 값에서 온다는 증거 |
| ③ | 스위치 3종 `aria-label` (시각 라벨이 없어 유일한 이름) | `getByRole('switch', { name, exact })` |
| ④ | 모바일 `role="tablist"` + `aria-selected` + 비활성 pane `hidden` | 탭 전환 후 `hidden` 이 **반대로** 가는지까지 |
| ⑤ | 데드라인 `role="progressbar"` + `aria-valuenow/min/max` | 값 범위까지 |
| ⑥ | 상태줄 `aria-live="polite"` · 더티 액션 바 `role="status"` · 반영 실패 `role="alert"` | 실패 표시가 뜬 **뒤에도** 위반 0 인지 재스캔 |
| ⑦ | `confirm_locked`·접수 전 행의 확인 체크는 탭 순서 밖 | 3행 중 열리는 것 1행 — 셋 다 잠그면 단언이 공허해지고 셋 다 열면 규칙을 지워도 통과한다 |

⑦ 을 위해 「탭으로 닿는 요소」를 `disabled` · 음수 `tabindex` · `hidden` 서브트리 ·
`display:none` · `visibility:hidden` 을 모두 걸러 계산한다. `toBeDisabled()` 만 보면
`tabindex="-1"` 로 뺀 경우를, `tabIndex` 만 보면 `disabled` 로 뺀 경우를 놓친다.

### 3. 선행 실패 3건은 **계약 회귀가 아니었다**

16-11 이 기록하고 16-15 가 재현한 3건을 원인까지 내려가 분류했다. 잘못된 라벨을 남겨
두면 다음 사람이 **없는 회귀**를 찾는다.

| 기록된 이름 | 진짜 원인 | 조치 |
|-------------|-----------|------|
| 「a11y 일봉 스켈레톤」 | 맞다 — 진짜 접근성 결함이었다 | `role="status"` |
| 「뉴스 목록 상한 계약 회귀」 | h1 이 `stock?.name ?? code` 라 **로딩 중에도 보인다.** 그걸 동기화 지점으로 쓴 뒤 재시도 없는 `count()` 가 0 을 읽었다(50건은 늘 통과한 이유) | 목록 컨테이너 대기 + 재시도 단언 |
| 「⌘K 단축키 회귀」 | `document.addEventListener` 가 **effect** 안이라 하이드레이션 전 dispatch 가 리스너 없는 document 에 떨어져 사라졌다. 단축키도 그 단위 테스트도 멀쩡하다 | `toPass` 로 재발사 (실측 4.9s 만에 성공 — 첫 발이 실제로 유실됨을 확인) |

덤으로, 「실행에 따라 갈린다」로만 적혀 있던 `news` 「refresh cooldown」도 같은 종류였다:
`disabled = isRefreshing || isCooldown` 이라 **429 도착 전에도 이미 disabled** 이고,
거기서 `data-remaining-seconds` 를 읽으면 `null` 이다. 기다려야 하는 것은 disabled 가
아니라 쿨다운 진입이고 그 유일한 증거가 그 속성이다.

### 4. 검사 사각지대 하나를 닫았다

`webapp/tsconfig.json` 의 `include` 는 `src/**/*` 뿐이라 **`e2e/` 를 어떤 tsc 도 보지
않고 있었다.** `pnpm typecheck` 가 green 이어도 spec 의 타입 오류는 Playwright 런타임까지
드러나지 않고, 그 피드백 경로가 이 저장소에서 가장 비싸다(E2E 전량 2.4분).

`tsconfig.e2e.json` 을 relay 의 `tsconfig.tests.json` 과 같은 규율로 만들고, **별도
스크립트로 두지 않고** `webapp` 의 `typecheck` 에 직접 이어 붙였다 — 사각지대를 만든
원인이 정확히 「따로 있으면 아무도 안 돌린다」이기 때문이다. 현행 22개 spec 전량 통과.

### 5. 배포 3종 — 그리고 그것을 검증할 스모크가 먼저 틀려 있었다

사용자 응답: **「배포 승인 — Claude가 배포 3종 실행」**, 실서버·실계좌 검증은 **미실시**.
순서는 의존 방향대로 relay → server → webapp.

배포에 착수하기 전 `scripts/smoke-server.sh` 를 읽고 **그대로 돌리면 반드시 실패한다**는
것을 알았다. 16-16 이 `deploy-server.sh` 는 정리했지만 스모크는 손대지 않아서,
우리가 지금 지우려는 것의 **존재**를 요구하고 있었다:

| 검사 | 16-16 이전 계약 | 실제 지금 | 조치 |
|------|----------------|-----------|------|
| INV-10 | `POST /api/orders` 미인증 → **401** (라우트 살아 있음) | 라우트가 없다 → 404 | 정답을 404 로. **401 이 오면 그것이 회귀**다 |
| INV-12a | `RELAY_INTERNAL_URL` **존재** | 지워야 한다 | 「잔존 없음」으로 반전 |
| INV-12b | `RELAY_ORDER_SECRET` **존재** | 지워야 한다 | 「잔존 없음」으로 반전 + `ORDER_TIMEOUT_MS` 신설 |

이걸 안 고치면 배포 마지막 단계가 빨간불인데, 그 빨간불이 **「제거가 성공했다」의
증거와 구별되지 않는다.** 스모크가 거짓을 말하는 상태로 배포를 진행할 수는 없다.

**relay** (`relay:4b6d792` → VM `radar-gw`): 기동 직후 VM 로컬 `/healthz` 200
(`{"status":"ok","vpn":true,"dma":true,"sessionCount":0}`), 메모리 54MiB/384MiB.
배포 스크립트가 **돌고 있는 컨테이너에서 되읽은** `DMA_HOST` 는 `127.0.0.1` —
로컬 mock 이며 실서버가 아님을 로그가 스스로 확인해 준다(2026-09-06 실장애 대책).

**server**: `server:99fdf15` → `00041-nsc`. 그 다음이 이 plan 의 핵심 한 줄이다 —
`--set-env-vars` 는 전량 치환이라 `RELAY_INTERNAL_URL`·`ORDER_TIMEOUT_MS` 는 **배포만으로
사라졌지만**, `--update-secrets` 는 **병합**이라 `RELAY_ORDER_SECRET` 바인딩은 그대로
남았다. 배포 내부 스모크가 정확히 그 1건만 FAIL(14/1) 로 잡아냈고, 명시 제거를 적용해
`00042-p78` 을 만든 뒤 재실행에서 **15/15 green** 이 됐다.

```
RELAY_INTERNAL_URL   있음(http://10.10.0.5:8091) → 없음
ORDER_TIMEOUT_MS     있음(5000)                  → 없음
RELAY_ORDER_SECRET   있음(secret 바인딩)          → 없음      ← T-16-08 닫힘
gh-radar-relay-order-secret (Secret Manager)      → ENABLED 유지  ← 지우면 relay 부팅 실패
```

**webapp**: `vercel pull → build → deploy --prebuilt` (ignoreCommand 우회).
`dpl_5Zw2zNAv5HQ9EHJsaC31fJ3WZtRw` 가 alias `gh-radar-webapp.vercel.app` 에 결선됐다.

### 6. 프로덕션 3라우트의 정답은 200 이 아니라 307 이었다

plan 의 acceptance 는 「프로덕션 3라우트가 200」이라고 적었지만, 미인증으로 `/me` 가 200 이면
그것은 **성공이 아니라 T-16-04 위반**이다 — 16-11 T3 의 auth-guard 계약이 비로그인에
트레이딩·My page 를 렌더하지 않기를 요구한다. 실측은 셋 다
`307 → /login?next=<원경로>` 이고 따라가면 200 이다. 그것이 계약을 만족하는 정답이라
acceptance 표현을 「인증 게이트를 통과해 도달 가능」으로 정정해 VALIDATION 에 기록했다.
`/` 에서 `nav[aria-label="주 메뉴"]` + `data-nav-item` 이 렌더되는 것으로 사이드바 트리가
프로덕션에 올라간 것도 확인했다.

## Task Commits

1. **Task 1-a: E2E 타입검사 배선** — `5d48852` (chore)
2. **Task 1-b: a11y 신규 3표면 확장 + 위반 2건 수정** — `8c5bcaa` (test)
3. **Task 1-c: 선행 E2E 실패 3건 제거** — `d2acd17` (fix)
4. **Task 3(부분): VALIDATION · deferred-items 갱신 + SUMMARY** — `a27d0f6` (docs)
5. **Task 2 선행: `smoke-server.sh` 계약 정정** — `99fdf15` (fix)
6. **Task 2·3: 배포 결과 반영 (VALIDATION · deferred-items · SUMMARY)** — 이 커밋 (docs)

Task 1 을 3개로 나눈 이유: 배선(도구) · 접근성(제품 결함) · 스펙 경주(테스트 결함)는
되돌리는 이유가 서로 다르다. 한 커밋에 묶으면 「a11y 확장을 되돌리면 typecheck 배선도
같이 사라진다」가 된다.

**Task 2 의 배포 자체는 커밋을 만들지 않는다**(프로덕션 상태 변경). `99fdf15` 는 배포를
가능하게 만든 코드 수정이고, 그 SHA 가 그대로 `server:99fdf15` 이미지 태그이자 리비전
`00042-p78` 의 `APP_VERSION` 이다 — 커밋과 돌고 있는 것이 한 값으로 이어진다.

## Files Created/Modified

**created (1)**
- `webapp/tsconfig.e2e.json` — `e2e/**` + `playwright.config.ts` 를 tsc 아래로. `jsx: react-jsx`(Next 빌드 대상이 아니다) + `types: ["node"]`

**modified — 테스트**
- `webapp/e2e/specs/a11y.spec.ts` (117 → 594줄) — 파일 상단 `mode: 'serial'`(relay 8090 고정), 신규 describe 4케이스, `tabbablesIn` 헬퍼
- `webapp/e2e/specs/news.spec.ts` — 경주 2곳 제거
- `webapp/e2e/specs/search.spec.ts` — ⌘K 하이드레이션 경주 제거
- `webapp/src/components/orderbook/__tests__/orderbook-ladder-chaser.test.tsx` — ⑦ 계약 정정

**modified — 제품**
- `webapp/src/components/orderbook/orderbook-ladder.tsx` — `ladder-scroll` 에 `tabIndex={0}` (WCAG 2.1.1)
- `webapp/src/components/stock/stock-daily-chart-skeleton.tsx` — `role="status"`

**modified — 도구**
- `webapp/package.json` — `typecheck` 에 e2e 검사 편입 + `typecheck:e2e` 개별 실행구
- `scripts/smoke-server.sh` — INV-10 을 404(라우트 부재)로, INV-12 를 relay 결선 3종의 **잔존 없음**으로 반전. 두 검사(POST/GET)의 정답이 서로 다르다는 점과 Secret 자체는 삭제 금지임을 주석에 명시

**modified — 문서**
- `.planning/phases/16-.../16-VALIDATION.md` — Task ID/Status 전 칸(`TBD` 0건), `nyquist_compliant: true`, `wave_0_complete: true`, 전량 실측 표, 선행 실패 원인 표, Manual-Only 미실시 명시
- `.planning/phases/16-.../deferred-items.md` — 16-17 절 추가

## 전체 테스트 결과 (실측)

| 명령 | 결과 |
|------|------|
| `pnpm typecheck` (e2e 포함) | ✅ 13 워크스페이스 Done |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | ✅ exit 0 |
| `pnpm -r test` | ✅ **1,909 passed** / 1 skipped / 6 todo · 189 파일 |
| `pnpm --filter gh-radar-webapp test:e2e` | ✅ **126 passed** / 9 skipped / **0 failed** (2.4분) |

9 skipped 는 `user-themes`·`watchlist` 로, `SUPABASE_SERVICE_ROLE_KEY` 를 E2E env
허용목록에서 **의도적으로 뺀** 결과다(서비스롤 키가 Next dev 런타임에 주입되는 것을
막는 SETUP.md §3 금지 규약). 실패가 아니다.

## 배포 결과 (실측)

| 대상 | 산출물 | smoke |
|------|--------|-------|
| relay | `relay:4b6d792` · VM `radar-gw` / `gh-radar-relay` | `smoke-relay.sh` **PASS 11 · FAIL 1 · SKIP 1** — FAIL 은 INV-5a(아래 열린 항목), SKIP 은 INV-9(토큰 없음) |
| server | `server:99fdf15` → `gh-radar-server-00042-p78` (100% 트래픽) | `smoke-server.sh` 제거 전 14/1 → 제거 후 **15 PASS · 0 FAIL · 0 SKIP** |
| webapp | `dpl_5Zw2zNAv5HQ9EHJsaC31fJ3WZtRw` → alias `gh-radar-webapp.vercel.app` | `/me`·`/trading/vi`·`/trading/limit-chaser/new` 307→login→200 · `/` 200 + 사이드바 트리 |

`GET /api/orders?date=2026-09-09` 는 미인증에서 `401 UNAUTHENTICATED` 다(라우트 생존 +
관문 확인, smoke INV-11). **200 확인은 하지 않았다** — 로그인 토큰이 필요한데 실행자에게
없고 자격증명을 새로 만들지 않았다. 이 사실을 「확인했다」로 적지 않는다.

## 열린 항목 — relay 공개 `/healthz` 가 503 이다

배포 후 유일하게 빨간 채로 남은 것이다. **이번 배포가 만든 회귀가 아니다.**

```
GET https://dma.jx1.io/healthz → 503
{"status":"degraded","vpn":true,"dma":false,"version":"4b6d792","sessionCount":1}
```

원인 사슬은 전부 실측으로 확인했다. `dma_credentials` 가 **2행**이라(플랜이 전제한 0행이
아니다) 로그인 사용자가 붙으면 relay 가 DMA 세션을 만드는데, `DMA_HOST` 는 D-27 상
로컬 mock(`127.0.0.1:9100`)이고 그 mock 이 VM 에 떠 있지 않다 — `ECONNREFUSED` 무한
재접속. `/healthz` 판정이 `sessionCount === 0 || readyCount > 0` 이므로(15-05) 세션 1 ·
Ready 0 은 `degraded` → 503 → uptime 적색 → `gh-radar-relay-down` 발화다.

**회귀가 아닌 근거 2가지:**

1. 판정 로직이 Phase 16 에서 한 줄도 안 바뀌었다 — `git diff 4734986..HEAD` 의
   `healthy`/`sessionsOk` 증감 0.
2. 같은 구간이 **이미 있었다.** uptime 3일 이력에서 100% 미만은
   `2026-09-06 10:30~13:30 KST`(첫 `dma_credentials` 행 생성 직후 장중)와 이번뿐이다.

**다만 이번 webapp 배포가 트리거 표면을 넓혔다.** Phase 16 이 `RelayProvider` 를 루트
레이아웃으로 올려 `enabled: user != null` 로 연결한다 — 이전에는 호가주문 탭에서만
세션이 열렸지만 이제 **로그인만 하면 어느 페이지에서든** 열린다.

**고치지 않은 이유:** 해법 후보가 전부 결정이다 — ① VM 에 mock 게이트웨이 상주,
② 실서버 결선(D-27 금지 · 이번 지시로도 명시 배제), ③ degraded 판정에서 「한 번도
Ready 인 적 없는 세션」 제외(15-05 계약 변경), ④ 알림 정책 조정. 실행자가 단독으로 고를
문제가 아니다(Rule 4).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 접근성 결손] 모바일 호가 스크롤 영역이 키보드로 닿지 않았다**
- **Found during:** Task 1 (a11y spec 첫 실행 red)
- **Issue:** `[data-slot="ladder-scroll"]` 이 `overflow-y:auto` + 400px 인데 tab stop 이 아니고 내부에 포커스 가능한 자식이 0. axe `scrollable-region-focusable`, impact serious, WCAG 2.1.1(Level A)
- **Fix:** `tabIndex={0}` 추가. UI-SPEC 의 「사다리 비포커스」는 셀 한정임을 주석과 테스트 양쪽에 못박음
- **Files modified:** `webapp/src/components/orderbook/orderbook-ladder.tsx`, `.../__tests__/orderbook-ladder-chaser.test.tsx`
- **Commit:** `8c5bcaa`

**2. [Rule 1 - 버그] 일봉 차트 스켈레톤의 라벨이 낭독되지 않았다**
- **Found during:** Task 1 (선행 실패 재현)
- **Issue:** role 없는 `div` 에 `aria-label` — axe `aria-prohibited-attr`, serious. 형제 스켈레톤 3종은 이미 `role="status"`
- **Fix:** `role="status"` 추가
- **Files modified:** `webapp/src/components/stock/stock-daily-chart-skeleton.tsx`
- **Commit:** `8c5bcaa`

**3. [Rule 1 - 버그] E2E 3건이 재시도 없는 시점에 값을 읽고 있었다**
- **Found during:** Task 1 (전량 실행)
- **Issue:** `news` 2건 + `search` 1건. plan 의 `files_modified` 밖이지만 Task 1 의 acceptance 가 「E2E 전량 exit 0」이라 스코프 안이다
- **Fix:** 동기화 지점을 실제 신호로 교체 (목록 컨테이너 · `data-remaining-seconds` · `toPass` 재발사)
- **Files modified:** `webapp/e2e/specs/news.spec.ts`, `webapp/e2e/specs/search.spec.ts`
- **Commit:** `d2acd17`

**4. [Rule 3 - 차단 해소] `webapp/e2e/**` 가 tsc 밖이라 신규 spec 의 타입을 검증할 수 없었다**
- **Found during:** Task 1 시작 직후
- **Issue:** 새 spec 을 쓰면서 타입 오류를 E2E 런타임(2.4분)에서만 알 수 있는 상태
- **Fix:** `tsconfig.e2e.json` + `typecheck` 편입
- **Files modified:** `webapp/tsconfig.e2e.json`(신규), `webapp/package.json`
- **Commit:** `5d48852`

**5. [Rule 3 - 차단 해소] `smoke-server.sh` 가 배포로 제거할 대상의 존재를 요구하고 있었다**
- **Found during:** Task 2 착수 직전 (배포 스크립트 정독 중)
- **Issue:** 16-16 이 `deploy-server.sh` 만 정리하고 스모크를 놓쳤다. INV-10 은
  `POST /api/orders` **401**(= 라우트 생존)을 요구했고 INV-12a/b 는 `RELAY_INTERNAL_URL`·
  `RELAY_ORDER_SECRET` 의 **존재**를 요구했다. `deploy-server.sh` 는 Section 6 에서 이
  스모크를 부르므로 **배포 마지막 단계가 반드시 실패**하고, 더 나쁜 것은 그 실패가
  「제거가 성공했다」의 증거와 구별되지 않는다는 점이다
- **Fix:** INV-10 → 404(부재), INV-12 → 3종 「잔존 없음」으로 반전(`ORDER_TIMEOUT_MS` 신설).
  POST/GET 의 정답이 다른 이유와 Secret Manager 삭제 금지를 주석에 명시
- **Files modified:** `scripts/smoke-server.sh`
- **Verification:** `bash -n` 통과 · 제거 적용 후 재실행 15 PASS / 0 FAIL
- **Commit:** `99fdf15`

**6. [Rule 4 - 사용자 결정 필요] relay 공개 `/healthz` 503 을 고치지 않았다**
- **Found during:** Task 2 (`smoke-relay.sh` INV-5a FAIL)
- **Issue:** 위 §열린 항목. 회귀가 아니라 「접속자 있음 + 게이트웨이 없음」의 상시 조건이며
  Phase 16 이 판정 로직을 손대지 않았다
- **조치:** 고치지 않고 원인 사슬·회귀 아님의 근거·해법 후보 4개를 `16-VALIDATION.md`
  §Deployment Verification 열린 항목 1 과 `deferred-items.md` 에 기록. 해법이 전부
  운영/계약 결정이라 실행자가 단독으로 고르지 않는다
- **Files modified:** 없음 (문서만)

### 계획과 다르게 한 것

**1. STATE.md · ROADMAP.md 를 수정하지 않았다.** plan 의 `files_modified` 와 Task 3 이
둘을 지정하지만 **오케스트레이터가 중앙에서 쓴다**. (Task 1 은 worktree 격리 실행이었고
worktree 에서 고치면 병합이 두 파일을 되감는 사고가 기록돼 있다 — 자동 메모리
`project_gsd_roadmap_append_worktree_restore`. 배포 실행은 그 이유로 **메인 체크아웃에서**
했다: 사라질 브랜치에서 빌드한 리비전이 프로덕션에 남는 상황을 피하기 위해서다.)

**2. Task 3 을 배포 전에 부분 수행했다.** `16-VALIDATION.md` 는 자동 검증 결과만으로
확정 가능해서 지금 채웠다. 반면 「배포 리비전 ID · 이미지 태그 · Vercel URL · smoke 결과」는
배포가 일어나야 존재하는 값이라 **비워 두지 않고 「미승인」으로 명시**했다 — 빈 칸은
「아직 안 적었다」와 「할 수 없었다」를 구분하지 못한다.

**3. Task 1 을 3커밋으로 나눴다.** 되돌리는 이유가 다른 세 종류다(도구 배선 · 제품
접근성 결함 · 테스트 경주).

**4. 배포 순서 안에서 `deploy-server.sh` 를 한 번 빨간불로 끝냈다.** 제거 명령을 배포
**뒤**에 적용하라는 plan 대로 하면 `deploy-server.sh` 내부 스모크는 아직 남아 있는
`RELAY_ORDER_SECRET` 때문에 반드시 1건 FAIL 이다. 제거를 먼저 하면 초록으로 끝낼 수
있었지만 그러지 않았다 — 그 빨간불이 **「병합 시맨틱 때문에 재배포만으로는 안 사라진다」는
16-16 의 인계를 실측으로 증명하는 유일한 순간**이기 때문이다. 제거 후 재실행 15/15 가
같은 사실의 반대편 증거다.

**5. plan 의 「프로덕션 3라우트 200」을 그대로 적용하지 않았다.** 미인증 200 은 T-16-04
위반이다. 실측 307→login→200 을 정답으로 기록하고 acceptance 표현을 정정했다(위 §6).

## Known Stubs

없다. 이 plan 은 표면을 만들지 않았고, 신규 코드는 테스트와 설정뿐이다.

`surface-placeholder.tsx`(사용처 0건)는 **의도적으로 남겼다** — 위험이 아니라 권한
문제다(위 key-decisions). 참조 4건은 전부 「없어야 한다」 단언이라 파일이 사라져도 무해하며,
다음 quick 에서 한 줄로 끝난다.

## Threat Flags

없다. 이 plan 은 네트워크 엔드포인트·인증 경로·스키마를 추가하지 않았다.
`tabIndex={0}` 은 키보드 도달성을 **늘리는** 변경이며 새 조작 경로를 만들지 않는다
(호가 셀은 여전히 클릭 핸들러도 포커스도 없다).

**T-16-08 은 닫혔다.** `gcloud run services describe gh-radar-server` 로 되읽은
`00042-p78` 의 env 이름 17종에 `RELAY_INTERNAL_URL`·`ORDER_TIMEOUT_MS`·`RELAY_ORDER_SECRET`
이 **0건**이다. Secret Manager 의 `gh-radar-relay-order-secret` 은 `ENABLED` 버전 1개로
살아 있다 — relay 가 계속 쓰므로 지우면 부팅이 깨진다.

**T-16-12(배포 순서)** 도 지켰다: relay → server → webapp. **T-16-13(실서버·실계좌)** 은
`accept` 그대로이며 이번에도 접속하지 않았다 — 배포 스크립트가 돌고 있는 컨테이너에서
되읽은 `DMA_HOST` 가 `127.0.0.1`(mock)임을 로그가 확인해 준다. **T-16-09(배포 로그 노출)**:
비밀 값은 출력되지 않았고 relay 원격 스크립트는 「비밀 3종 획득(값은 기록하지 않음)」만
남긴다. 이 SUMMARY·VALIDATION 에도 계좌번호·토큰·키 값은 없다.

## 남은 것

- **relay `/healthz` 503** — 위 §열린 항목. 사용자 결정 필요(Rule 4).
- **실서버·실계좌 검증** — Manual-Only 그대로. 사용자 명시 지시가 있을 때만(D-27).
- **`GET /api/orders` 200 경로** — 로그인 토큰이 필요해 미확인. 미인증 401 까지만 확인.
- **STATE.md · ROADMAP.md** — 오케스트레이터 소관(이 실행에서 손대지 않음).

## Self-Check: PASSED

- `webapp/tsconfig.e2e.json` — FOUND
- `webapp/e2e/specs/a11y.spec.ts` — FOUND (Phase 16 describe 포함)
- `scripts/smoke-server.sh` — FOUND (`bash -n` 통과 · INV-10 404 · INV-12 4항)
- `.planning/phases/16-.../16-VALIDATION.md` — FOUND (`TBD` 0건 · `nyquist_compliant: true` ·
  `## Deployment Verification` 1건)
- 커밋 `5d48852` · `8c5bcaa` · `d2acd17` · `a27d0f6` · `99fdf15` — 전부 `git log` 에 존재
- 전체 테스트 green — 위 실측 표
- 배포 실측 — `gh-radar-server-00042-p78` 서빙 중 · `relay:4b6d792` 컨테이너 Up ·
  Vercel alias `gh-radar-webapp.vercel.app` 결선 · `smoke-server.sh` 15/15
