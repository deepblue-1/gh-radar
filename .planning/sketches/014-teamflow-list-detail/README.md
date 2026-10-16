---
sketch: 014
name: teamflow-list-detail
question: "팀 매집(teamflow) 보고서 — 하루 탐지 종목 목록과 종목 상세(요약 → 구간표 → 10분 흐름 → 거래원 → 판정 기준)를 어떻게 엮어야 폰·데스크톱에서 읽히나?"
winner: "A"
tags: [analytics, teamflow, report, list, accordion, comparison, cards, gh-trade]
---

# Sketch 014: 팀 매집 보고서 · 목록↔상세 구조

## Design Question
gh-trade 가 만든 teamflow 일일 보고서(종목 상세 · 세 종목 비교 아티팩트)를 「분석」 하위 `/analytics/teamflow` 로 옮길 때, 하루 종목 목록과 종목 상세를 어떤 구조로 엮나. 상세 안 내용(표 vs 차트)은 015 에서 따로 고른다 — 여기서는 세 변형 모두 gh-trade 샘플의 표를 그대로 쓴다.
사이드바 · 날짜 알약 · KPI 띠는 상한가 보고서(011 A)와 같은 틀.

## How to View
open .planning/sketches/014-teamflow-list-detail/index.html

## Variants
- **A: 보고서 동형** — 011 채택 A 문법. KPI 4칸 → 종목 행(결과 · 팀 순매수 · 20% 아래/위 · 매수 중 팀 · 구간별 순매수 미니막대) → 그 자리 아코디언(한 번에 하나 · 첫 행 기본 펼침). 폰 = 2줄 카드형 행.
- **B: 비교표 고정 + 상세 전환** — gh-trade 「세 종목 비교」 표를 위에 그대로(첫 열 고정 · 폰 가로 스크롤), 행 선택 → 아래 상세 카드 교체(데스크톱은 세그먼트로도 전환). 비교가 먼저, 상세는 하나만.
- **C: 판정 카드 피드** — 종목 카드(한 문장 판정 headline + 핵심 3수치 + 미니막대). 데스크톱 = 카드 열 400 + 오른쪽 고정 상세 패널 · 폰 = 카드 피드 → 바텀시트 상세.

## What to Look For
- 하루 10~30 종목일 때 어느 구조가 「오늘 누가 모았나」를 먼저 답하나(A 행 수치 / B 비교표 / C 판정 문장)
- 폰 390 에서 상세의 7열 표(10분 흐름)가 어느 틀에서 덜 답답한가 — 펼침(A) · 카드(B) · 바텀시트(C)
- 구간별 순매수 미니막대(9칸 · 20% 점선)가 행 안에서 읽히는지
- 상한가 도달 종목 태그(「상한가 14:17」)와 미도달(「+25.5%」) 구분

## Data
에스엠벡셀 · 한선엔지니어링 · 동양고속 = gh-trade teamflow 10/14 실측(아티팩트 PPvQgzFokm7aig7LnEob7N 에서 추출 → data.js). 나머지 4행(잉글우드랩 · 두산테스나 · 에프에스티 · 한국전력)은 목록 밀도용 **합성**(`real:false` · 상세 없음).

## Data contract this sketch needs (gh-trade 평평한 열 · payload)

| 필드 | A | B | C | 비고 |
|---|---|---|---|---|
| date · isin · short_code · name · market · base · upper · status · first_limit_ms · last_px · last_rate · volume · value | ● | ● | ● | 머리 · 태그 |
| team_buy_val · team_sell_val · team_net_val · team_buy_share | ● | ● | ● | 행/카드 핵심 수치 · KPI 합 |
| below20_net_val · above20_net_val | ● | ● | ● | 20% 아래/위 |
| limit_team_buy_val · limit_team_sell_val (null 가능) | | ● | | 비교표 「상한가 가격」 열 |
| high_px · high_rate · high_ms | ○ | ● | ○ | 비교표 「현재」 보조줄 · 상세 머리 |
| reach_team_share · reach_team_val (null 가능) | ○ | ○ | ○ | 요약 문장 5 (상한가 종목만) |
| **headline** (한 문장 판정) | | | ● | **새 필드** — gh-trade 가 규칙으로 생성 |
| payload.bands[] (label · vol · team_buy/sell qty·val · team_net_val/qty · team_buy_share) | ● | ● | ● | 구간표 + 미니막대(9칸 고정 라벨) |
| payload.buckets[] (t · rate_lo · rate_hi · vol · team_buy/sell_qty · team_net_val · team_buy_share · in_window) | ● | ● | ● | 10분 흐름 · 보라 줄 |
| payload.window (start · end · net_val · share_lo · share_hi) | ● | ● | ● | 10분 흐름 머리 문구 |
| payload.members[] (name · buy · sell · net) + members_missing[] | ● | ● | ● | 거래원 카드 · 「상위 5 밖」 |
| payload.summary_lines[] | ● | ● | ● | 요약 번호 문장 |

● 필수 · ○ 있으면 표시

## Decision (2026-10-16)
- **A 보고서 동형** 채택 — 상한가 보고서(011 A)와 같은 틀: 날짜 알약 → KPI 4칸(탐지 · 팀 순매수 종목 · 상한가 도달 · 팀 순매수 합) → 종목 행(결과 · 팀 순매수 · 20% 아래/위 · 매수 중 팀 · 구간별 순매수 미니막대) → 행 클릭 시 그 자리 아코디언(한 번에 하나).
- **기본은 전부 접힘** — 상한가 보고서의 「첫 행 기본 펼침」 과 다르다. 목록이 먼저 보이고, 읽을 종목을 골라 연다.
- 계약 영향: C 전용이던 `headline` 은 불필요. B 전용 `limit_team_buy/sell_val` 은 상세 요약 문장에만 쓰이므로 payload 안에 있으면 충분(평평한 열 아님).
- 상세 안 표 vs 차트는 015 에서 결정.
