---
sketch: 017
name: accum-pos-net-line
question: "매집감지 상세 누적 판에 포지션 순매수(이월 포함 · accum_flow payload.pos_net) 선을 더할 때 — A 같은 축 호박 실선 / B 같은 축 포지션 주인공(그날 누적은 회색 보조) / C 축 분리 중 어느 모양?"
winner: "B"
tags: [analytics, accum, report, chart, carry, gh-trade]
---

# Sketch 017: 매집감지 누적 판 · 포지션 순매수(이월 포함) 선

## Design Question
사용자 결정(2026-10-25, gh-trade-18 경유): 지금 「순매수 누적」(payload.day_cum_net — 그날 0부터 · 등록 무관 전체 팀 주문)은 그대로 두고, 포지션 순매수(등록 후 사이클 누적 · 이월 포함 · 우리 체결 제외 — WinForms 상세 차트와 같은 뜻)를 한 선 더 그린다. gh-trade 가 payload 에 `pos_net: { t_ms[], net_krw[], cycle[] }` 를 append(06:00 첫 스냅샷부터 · 사이클 바뀌면 끊김 · 숨김 구간 공백). 남은 질문은 색 · 축 · 주인공.

## How to View
open .planning/sketches/017-accum-pos-net-line/index.html

## Variants
- **A: 같은 축 · 호박 실선** — 보라 계단 그대로 + 이월 색(--accum-carry) 실선. 축 하나.
- **B: 같은 축 · 포지션 주인공** — 포지션 = 굵은 보라 실선, 그날 누적 = 얇은 회색 계단(보조).
- **C: 축 분리** — 포지션 왼쪽 축(호박) · 그날 누적 오른쪽 축(보라).

## What to Look For
- 흥구석유(이월 12.4억에서 시작 · 숨김 구간 공백 · 재등장): A/B 에서 보라 계단이 납작해지는지
- 금호전기(매집 종료 → 새 사이클): 사이클 끊김이 읽히는지
- 툴팁 문구 · 범례 문구

## Decision (2026-10-25)
- **B 같은 축 · 포지션 주인공** 채택 — 누적 판 = 포지션 순매수(payload.pos_net · 이월 포함) 굵은 `--team` 실선 계단(주인공) + 그날 누적(day_cum_net) 얇은 `--muted-fg` 계단(보조). 축 하나(억, 두 선 합친 범위). cycle 이 바뀌면 끊고, 숨김(청산) 구간은 공백 — gh-trade 에 `pos_net.end[]` 표식 요청(없으면 cycle 로만 끊음). 판 제목 「포지션 순매수 · 그날 누적」, 범례 「포지션 순매수(이월 포함)」 · 「그날 순매수 누적(0부터)」, 툴팁 「HH:MM · 순매수 누적 ±X.XX억 · 포지션 순매수 ±Y.YY억(이월 포함)」(숨김 · 등록 전 = 「포지션 —」). pos_net 키 없는 옛 행은 지금 모양 그대로.
