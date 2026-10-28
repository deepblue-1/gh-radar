---
phase: quick-261028-ggj
plan: 01
subsystem: webapp/analytics 매집감지 상세 차트
status: complete
tags: [accum-chart, tooltip, touch, gh-trade-inbox]
requires: []
provides:
  - "orderGroupOf · orderGroupTipOf · orderHoverOf · ChartHover.group?"
  - "createTouchInspect · touchTipTopOf · TOUCH_HOLD_MS · TOUCH_SLOP_PX · TOUCH_TIP_GAP"
  - "useChartGestures 넷째 인자 inspectingRef"
affects:
  - webapp/src/components/analytics/accum-chart.tsx
tech-stack:
  added: []
  patterns:
    - "판 판정 공용 함수 pickAt — 마우스 · 터치가 같은 판정"
    - "프레임워크 무관 순수 상태기(createTouchInspect) + 컴포넌트 배선"
    - "비수동 네이티브 touchmove { passive: false } 로 살펴보기 중 스크롤 억제"
key-files:
  created:
    - webapp/src/lib/touch-inspect.ts
    - webapp/src/lib/__tests__/touch-inspect.test.ts
  modified:
    - webapp/src/lib/accum-chart.ts
    - webapp/src/lib/__tests__/accum-chart.test.ts
    - webapp/src/components/analytics/accum-chart.tsx
    - webapp/src/components/analytics/__tests__/accum-detail.test.tsx
    - webapp/src/hooks/use-chart-view.ts
    - webapp/src/hooks/__tests__/use-chart-view.test.tsx
    - webapp/e2e/specs/accum-report.spec.ts
    - docs/inbox/from-gh-trade/261028-accum-chart-hover-group.md
decisions:
  - "묶음 1줄 = 웹 한 원 툴팁 2줄(title + 맥락)을 ' · ' 로 이은 한 줄"
  - "굵은 고리 = var(--fg) 2.5px · 고른 원은 얇은 고리 대신 굵은 고리만"
  - "씨앗이 보기 창 밖이거나 가격 0 이면 묶음 = [씨앗](지금 한 원 툴팁 유지)"
  - "마우스 툴팁 whitespace-nowrap 제거 → break-keep + 줄마다 내어쓰기(pl-3 -indent-3)"
  - "터치 살펴보기는 마우스와 같은 pickAt — 누적 판 · 10분 판 툴팁도 터치로 본다"
metrics:
  duration: "약 9분(03:09Z ~ 03:18Z)"
  completed: 2026-10-28
actuals:
  tokens: 14000
  tasks: 3
  commits: 7
plan_head_before: 902bbe032ede99c1586745609f0140ec2e7b7416
plan_head_after: b1f7a10f650f89a03d1eb3579c77c15b8183e779
---

# Quick 261028-ggj: 매집 차트 닿는 원 묶음 툴팁 + 모바일 길게 누르기 살펴보기 Summary

gh-trade 261028 인계 규칙 1~6을 웹에 옮겼다. 마우스로 원을 고르면, 고른 원과 화면에서 직접 닿는 원만 한 묶음이 된다(사슬로 이어 붙이지 않는다). 묶음이면 툴팁이 3줄(고른 원 · 묶음 요약 · 큰 주문)이고, 묶음 원에는 1.5px 고리, 고른 원에는 2.5px 굵은 고리가 붙는다. 폰에서는 300ms 동안 8px 안에서 길게 누르면 같은 툴팁과 고리가 손가락 위에 뜬다. 손가락으로 훑으면 대상이 바뀌고, 떼면 사라진다.

## 커밋

| Task | 종류 | SHA | 내용 |
| ---- | ---- | --- | ---- |
| 1 | test | 68c17fda | 묶음 툴팁 · 묶음 고리 실패 테스트 |
| 1 | feat | fbd0839d | 묶음 판정 · 3줄 · 묶음 고리 · 굵은 고리 · e2e 기대값 |
| 2 | test | 6c6a002f | 길게 누르기 상태기 · pan 억제 실패 테스트 |
| 2 | feat | 1bfe4fde | touch-inspect 상태기 · touchTipTopOf · inspectingRef |
| 3 | test | 599e21f4 | 터치 살펴보기 실패 테스트 |
| 3 | feat | 4675670c | 차트 터치 살펴보기 배선 |
| 3 | docs | b1f7a10f | 인박스 노트 done(done_commit 4675670c) |

push · 배포는 하지 않았다.

## 검증

- vitest 4파일 (`--maxWorkers=2`): accum-detail 64 · accum-chart 99 · touch-inspect 13 · use-chart-view 14 = **190 passed / 0 failed**.
- `pnpm --filter @gh-radar/webapp run typecheck` (tsc + tsconfig.e2e.json): 오류 0.
- eslint (바꾼 소스 4개): 오류 0 · 경고 0. 테스트 파일 accum-detail.test.tsx 의 `_pn` 미사용 경고 1건은 이번 변경 전부터 있던 것이다.
- **e2e 는 실행하지 않았다.** 사용자 제약으로 Playwright 를 돌리지 않았다. P34-AC1b 는 기대값만 고쳤고 타입 검사만 통과시켰다.
- 범위 밖 무변경: `git diff --name-only 902bbe03..HEAD` 의 10개 파일이 plan files_modified 와 정확히 같다. relay · server · supabase · shared 는 바꾸지 않았다.

## 재량 결정 (plan <discretion>)

1. **1줄 = 웹 한 원 툴팁 2줄을 ' · ' 로 이은 한 줄.** 노트는 「묶음이면 3줄 · 1줄 = 지금 한 원 툴팁 줄」 이라고 한다. 그런데 gh-trade 의 한 원 툴팁은 1줄이고, 웹은 title + 맥락 2줄이다. 3줄 구조와 「같은 내용」 을 둘 다 지키려고 두 줄을 이었다.
2. **굵은 고리 색 = `var(--fg)`.** 라이트에서는 검정에 가깝고(#191f28) 다크에서도 보인다. gh-trade 의 「2.5px 검정」 을 테마에 맞게 옮긴 것이다. 고른 원에는 얇은 고리 대신 굵은 고리만 그린다(gh-trade 의 seedRim 이 hoverRim 을 대신하는 방식).
3. **씨앗이 보기 창 밖이거나 가격이 0 이면 묶음 = [씨앗].** 이때는 지금 한 원 툴팁 그대로다. 웹 nearestOrderOf 는 창 ±30분 원도 고를 수 있어서, 지금 동작을 유지하려고 이렇게 정했다.
4. **마우스 툴팁의 `whitespace-nowrap` 을 빼고 `break-keep` 과 줄마다 내어쓰기(`pl-3 -indent-3`)를 달았다.** 길어진 1줄(약 100자)이 차트 밖으로 나가지 않고 래퍼 안에서 접힌다.
5. **터치 살펴보기는 마우스와 같은 pickAt 을 쓴다.** 그래서 누적 판 · 10분 판 툴팁도 터치로 볼 수 있다.

## NXT 데이터 사실

` (NXT 포함)` 접미 규칙은 `orderGroupTipOf` 의 `isNxt` 술어 옵션으로 구현했고, 테스트로 잠갔다. 하지만 웹 `payload.orders` 는 `{t_ms, side, qty, val, px, pieces, first}` 이고 거래소 칸이 없다. accum_flow export 원천이 KRX 전용이기 때문이다(인박스 261022-accum-nxt-team-burst). 그래서 컴포넌트는 술어를 넘기지 않고, **실제 화면에는 이 접미가 나오지 않는다.** 인박스 노트 답에도 같은 내용을 적었다. export 에 원별 거래소가 실리면 술어만 이으면 된다.

## e2e P34-AC1b 기대값 변경 (타입 검사만 · 미실행)

한선의 원 501개 중 494개가 묶음이라, 「가장 큰 원 = 2줄 + 고리 1」 단언은 새 규칙에서 깨진다. 그래서 두 모양을 모두 받게 고쳤다.

- 줄 수가 2 이면: 「순매수 누적」 · hover 고리 1 · seed 고리 0.
- 줄 수가 3 이면: `^묶음 (\d+)건 ` · `^큰 주문 ` · seed 고리 1 · hover 고리 N − 1.

제목에는 「묶음이면 3줄 + 굵은 고리」 를 더했다. 실행 확인은 하지 않았다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Lint] 터치 툴팁 높이 useLayoutEffect 에 의존성 추가**
- **Found during:** Task 3
- **Issue:** plan 은 의존성 없는 useLayoutEffect 를 지시했다. 그러면 react-hooks/exhaustive-deps 경고(무한 갱신 위험)가 새로 생긴다.
- **Fix:** 의존성을 `[touchPt, tipH]` 로 두었다. 터치 툴팁 내용은 key 가 바뀔 때 setTouchPt 로만 바뀌므로 다시 재는 시점은 같다. jsdom 테스트도 그대로 통과한다.
- **Files modified:** webapp/src/components/analytics/accum-chart.tsx
- **Commit:** 4675670c

**2. [작은 구조 차이] 고리 렌더를 렌더 스코프 변수 `rims` · `seedRim` 으로 뽑음**
- JSX 안의 중첩 삼항 대신 변수 두 개를 map 으로 그린다. 속성 · data-slot · 순서는 plan 그대로다.

**3. [테스트 방향] (i1) 훅 테스트는 `last2h` 프리셋에서 +60 · +120px 로 했다**
- plan 문법 그대로다. `reg` 는 T0 경계에서 앞 시각 pan 이 막히므로 쓰지 않았다.

다른 점은 plan 대로 실행했다. 이 프로젝트에는 prettier 가 없어 서식은 손으로 맞췄다.

## Known Stubs

없음. ` (NXT 포함)` 은 stub 이 아니다. 데이터에 거래소 칸이 없어 화면에 나오지 않는 것이고, 위 「NXT 데이터 사실」 에 적었다.

## Self-Check: PASSED

- 만든 파일: webapp/src/lib/touch-inspect.ts · webapp/src/lib/__tests__/touch-inspect.test.ts — 있음.
- 커밋 7개(68c17fda · fbd0839d · 6c6a002f · 1bfe4fde · 599e21f4 · 4675670c · b1f7a10f) 모두 HEAD 의 조상이다. `git rev-list --count 902bbe03..HEAD` = 7. 커밋에 Co-Authored-By 없음.
- 인박스 노트: `status: done` · `done_commit: 4675670c` · git 추적 중.
