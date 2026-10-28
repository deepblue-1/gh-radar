---
status: done
from: gh-trade
from_commit: 99e5980f
from_branch: master
date: 2026-10-28
fbs_sync_marker: f156cb6f
done_commit: 1ff084ff
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-28 · 매집 차트 묶음 기준을 「가로 ± 5px」 로

## 바뀐 것

와이어 무변경 — 웹 화면 동작만. 앞 노트 `261028-accum-chart-hover-group.md`(done)의 **규칙 2 만 바꾼다**. 나머지(씨앗 고르기·정렬·고리·3줄 툴팁·폰 길게 누르기)는 그대로.

사용자 결정(10/28): 가격이 튀는 순간 위아래로 떨어진 원이 묶음에서 빠지지 않게 **세로는 보지 않고 같은 시간대로 본다**.

- 이전 규칙 2: 중심 거리²(가로+세로) ≤ (r씨앗 + r)²
- **새 규칙 2: |cx씨앗 − cx| ≤ 5px**(화면 px, 고른 원 중심 기준 −5 ~ +5px 창 안에 중심이 있는 원). 세로(가격)·반지름은 보지 않는다. 사슬 없음(씨앗 기준만), 매수/매도·KRX/NXT 구분 없음, 보이는 원만 — 그대로.

gh-trade 클라: `client/Controls/AccumChartPanel.cs` `OverlapGroup`·상수 `GROUP_HALF_WIDTH = 5f`.

판정기가 걸린 파일:

- (판정기 0건 — 수동 인계)

## gh-radar 가 할 일

웹만 — `accum-chart.tsx`(또는 묶음 계산을 둔 곳)의 닿음 판정을 가로 ± 5px 로 바꾸고 테스트 갱신(세로로 멀리 떨어졌지만 가로 3px 인 원은 들어가고, 가로 6px 인 원은 크기가 커도 빠지는지). relay·DB·스키마 동기화 불필요.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 무관(와이어·서버 무변경, 웹 단독 배포)

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

가격이 급등한 구간에서 아래쪽 원에 마우스를 대면 → 같은 세로줄 근처(± 5px) 위쪽 원까지 고리·건수에 들어간다. 옆으로 6px 이상 떨어진 원은 크기와 상관없이 빠진다.

## 질문

없음

## gh-radar 반영

- 1ff084ff — `webapp/src/lib/accum-chart.ts` `orderGroupOf` 를 `|cx씨앗 − cx| ≤ ORDER_GROUP_HALF_WIDTH(5)` 로(세로·반지름 무시 · 사슬 없음 · 보이는 원만). 툴팁 3줄 · 고리 · 폰 길게 누르기는 그대로.
- 테스트: 세로로 멀어도 가로 3px 든다 · 가로 6px 면 원이 커도 빠진다 · 경계 5 든다 / 5.1 빠진다. 관련 vitest 4파일 190 통과 · typecheck 0.
