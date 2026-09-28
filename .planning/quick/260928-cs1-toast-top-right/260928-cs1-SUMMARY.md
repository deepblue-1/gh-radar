---
phase: quick-260928-cs1
plan: 01
subsystem: webapp/trading-workbench
tags: [toast, trading, layout, ipad]
status: complete
requires: []
provides:
  - 작업대 알림 토스트 상단 앵커(헤더 아래) · 최신 우선 스택 · 위에서 내려오는 등장
affects:
  - webapp/src/components/trading/workbench/alert-toasts.tsx
  - webapp/src/styles/globals.css
tech-stack:
  added: []
  patterns:
    - "헤더 높이 인라인 식 3.5rem + --app-safe-top (app-shell aside 선례와 같은 모양)"
    - "렌더에서만 역순([...alerts].reverse()) — 키 유지로 재정렬 시 재마운트·TTL 재시작 없음"
key-files:
  created: []
  modified:
    - webapp/src/components/trading/workbench/alert-toasts.tsx
    - webapp/src/styles/globals.css
    - webapp/src/components/trading/__tests__/alert-toasts.test.tsx
    - webapp/src/lib/trading-alerts.ts
    - webapp/e2e/specs/trading-workbench.spec.ts
decisions:
  - "작업대 토스트는 모든 뷰포트 상단 · 앱 헤더 바로 아래(56 + safe-top + 8) — ≥700 우측 340px · <700 좌우 12px 전폭 (iPad 사용자 요청 「오른쪽 상단이 좋아」)"
  - "최신 알림이 스택 맨 위 — mergeAlert 는 그대로, 렌더에서만 역순 (flex-col-reverse 금지: DOM·탭 순서 어긋남)"
  - "앱(html.native-app) ≥700 토스트 탭바 비킴 bottom 규칙 삭제 — 상단 앵커라 불필요"
metrics:
  duration: "~5min"
  completed: 2026-09-28
actuals:
  tokens: 9000
  tasks: 2
  commits: 2
plan_head_before: 00496dde76e208e6cc926f562b3fb5cd83a6e8c0
---

# Quick 260928-cs1: 작업대 알림 토스트 우상단(헤더 아래) 이동 Summary

작업대 이벤트 알림 토스트 스택을 모든 뷰포트에서 앱 헤더 바로 아래(`top: 3.5rem + --app-safe-top + 8px`)로 옮겼다. 폭이 700 이상이면 우측 340px, 폰(<700)은 좌우 12px 전폭이다. 가장 최근 알림이 맨 위에 오고, 토스트는 위에서 6px 내려오며 나타난다.

## 커밋

| Task | 커밋 | 내용 |
|------|------|------|
| 1 | `44cb29d1` | fix(quick-260928-cs1): 작업대 알림 토스트를 헤더 아래 상단 앵커로 — 최신 우선 · 아래로 내려오는 등장 |
| 2 | `ed2cbd64` | test(quick-260928-cs1): GC8 우상단(헤더 아래) 위치 단언 · 토스트 위치 문구 정정 |

push 는 하지 않았다. push 하면 webapp 이 곧바로 프로덕션에 배포되므로 push 는 사용자나 메인 세션이 한다.

## 변경 내용

- `alert-toasts.tsx`: 컨테이너 클래스를 `pointer-events-none fixed top-[calc(3.5rem+8px+var(--app-safe-top))] right-3 z-50 flex w-[min(340px,calc(100%-24px))] flex-col gap-2 max-[699px]:left-3 max-[699px]:w-auto` 로 바꿨다. bottom 앵커와 `max-[699px]:` 의 top·right·bottom 변형은 모두 뺐다. 렌더는 `[...alerts].reverse().map` 로 돌리고 키는 `a.id` 를 그대로 쓴다. 헤더 주석 ②(위치 · 스택 순서 · z 층 · 결정 출처)도 새 배치에 맞게 다시 썼다.
- `globals.css`: `wb-toast-in` 시작 프레임을 `translateY(-6px)` 로 바꿨다. 앱 ≥700 에서 토스트를 탭바 위로 올리던 bottom 규칙과 그 주석은 지웠다. §21 주석의 하단 고정 요소 목록에서 토스트를 빼고, 토스트는 상단 앵커라는 한 줄을 넣었다.
- `alert-toasts.test.tsx`: 새 describe 「배치」에 케이스 3개를 넣었다. A 는 최신이 DOM 첫째인지, B 는 bottom 클래스가 없고 상단 식이 들어 있는지, C 는 재정렬해도 TTL 이 다시 시작되지 않는지 본다. 기존 「항목마다」 케이스는 구조분해만 `[reject, fill]` 로 바꿨다.
- `trading-alerts.ts`: 헤더 ① 의 위치 서술을 「작업대 우상단(앱 헤더 아래 · 폰은 상단 전폭)」으로 고쳤다.
- `trading-workbench.spec.ts` GC8: 제목과 주석을 새 위치로 고쳤다. 아래끝 단언을 지우고 `box.y ≥ 56` 과 `box.y < 120` 단언을 넣었다.
- 남은 문구를 grep 으로 확인했다. `app-header.tsx` z 순서 주석은 여전히 맞다. `manual-order-form.tsx` 와 `vi-settings-rows.tsx` 는 인라인 status 이야기이고, `chat-fab.tsx` 는 FAB 이야기다. 셋 다 고칠 대상이 아니다.

## 실행한 테스트

- TDD RED(Task 1): 테스트를 추가한 뒤 `alert-toasts.test.tsx` 가 **4 failed | 6 passed (10)** 였다. 실패한 것은 A · B · C 와 구조분해를 바꾼 케이스로, 예상대로다.
- GREEN(Task 1 이후, Task 2 이후 두 번 실행): `npx vitest run src/components/trading/__tests__/alert-toasts.test.tsx src/lib/__tests__/trading-alerts.test.ts src/components/trading/__tests__/trading-workbench.test.tsx` 결과 **3 files passed · 174 tests passed (174)**. alert-toasts 10 · trading-workbench 130 · trading-alerts 34.
- `pnpm run typecheck`(tsc --noEmit + tsconfig.e2e.json) 통과. 수정한 파일 5개 모두 eslint 통과.
- 플랜의 grep 검증(상단 식 · reverse · -6px · 앱 토스트 규칙 0 · bottom 식 0 · 우하단 문구 0 · GC8 제목 · y≥56 단언 · 임시 spec 없음)은 모두 OK.

## e2e GC8

`npx playwright test e2e/specs/trading-workbench.spec.ts -g "GC8" --project=chromium` 결과 **2 passed** 다(setup auth 와 GC8 · 3.1s / 재실행 3.5s). webServer 는 PORT=3100 으로 떴고 로컬 relay 도 올라왔다. 환경 오류는 없었다.

## 스크린샷 (눈으로 확인함)

일회용 `webapp/e2e/specs/zz-cs1-shots.spec.ts` 로 찍었다. **4 passed**(setup + 3). 찍은 뒤 파일을 지웠고 커밋하지 않았다. 각 뷰포트에서 미체결 2건(881 · 98,000원 / 882 · 99,000원)을 색인하고, 881 → 882 순서로 체결 통보를 넣었다.

| 파일 | 측정값 | 눈으로 본 것 |
|------|--------|--------------|
| `/Users/alex/repos/gh-radar/.planning/quick/260928-cs1-toast-top-right/shots/cs1-ipad-portrait-1024x1366.png` | toast x672 y64 w340 · header h56 | 헤더(검색창 포함) 바로 아래 오른쪽에 토스트 2장이 있다. 위는 99,000원(882 · 최신), 아래는 98,000원. 헤더를 덮지 않는다. 가려지는 것은 DMA 상태줄 오른쪽 끝의 빈 영역과 VI 행 끝뿐이다 |
| `/Users/alex/repos/gh-radar/.planning/quick/260928-cs1-toast-top-right/shots/cs1-ipad-landscape-1366x1024.png` | toast x1014 y64 w340 · header h56 | 세로와 같다. 헤더 아래 우측 340px 에 최신이 위로 쌓였다. 잘림·줄바꿈 없음 |
| `/Users/alex/repos/gh-radar/.planning/quick/260928-cs1-toast-top-right/shots/cs1-phone-390x844.png` | toast x12 y64 w366 · header h56 | 헤더(메뉴 · GH Trade · 검색 아이콘) 아래 좌우 12px 전폭이다. 최신(99,000원)이 위다. 헤더는 가리지 않고, 제목줄과 VI 행 위를 덮는다(의도한 오버레이) |

잘림·겹침·줄바꿈 같은 시각 결함은 없었다. 폰 샷 왼쪽 아래의 「N」 원은 Next dev 인디케이터라 이 표면과 관계없다.

## Deviations from Plan

없음. 플랜대로 실행했다. 스크린샷 spec 은 플랜의 「882 가 첫째」 단언을 텍스트로 확인하려고 두 주문의 가격을 다르게 줬다(98,000 · 99,000). 임시 파일이라 커밋에는 영향이 없다.

## TDD Gate Compliance

RED(4 failed) 를 확인한 뒤 GREEN(10/10) 을 확인했다. 오케스트레이터 제약(코드 변경을 태스크당 한 커밋으로)에 따라 RED 와 GREEN 은 Task 1 커밋 `44cb29d1` 하나에 함께 들어갔다.

## Known Stubs

없음.

## Self-Check: PASSED

- FOUND: 수정 파일 5개와 shots/*.png 3장
- FOUND: 44cb29d1 · ed2cbd64 (`git rev-list --count 00496dde..HEAD` = 2)
- 임시 spec `webapp/e2e/specs/zz-cs1-shots.spec.ts` 없음
