---
status: complete
phase: 27-auto-sell-integration
source: [27-VERIFICATION.md]
started: 2026-10-05T08:34:55Z
updated: 2026-10-06T12:08:12.509Z
---

## Current Test

[testing complete]

## Tests

### 1. 운영 화면 시각 확인 (/me 칩 · 자동매도 카드 · LED 4칩 · 주문로그 칩)
expected: 새로고침 뒤 네 표면이 모두 보이고 /me 칩이 「불러오는 중」 에 멈추지 않는다
result: pass
evidence: 2026-10-06 첫 거래일 사용자 실사용 보고 「오늘 자동매도 잘 동작했어」. 주문로그 「자동매도」 칩 대상 저널 924행 실재(#3).

### 2. 첫 거래일(2026-10-06) — WinForms LED · 칩 색 일치
expected: WinForms 에서 자동매도를 켠 종목의 웹 카드 칩 · LED 가 WinForms 와 같다(대기·완료 주황 · 감시·매도중 초록)
result: pass
evidence: 실서버 k13 에 상태 0~4 전부 출현(계좌 3 · 키 41 · 전이 227건 — 0→1 76 · 2→3 25 · 3→4 21 · 1→3 19 …). 색 매핑 코드 대조 = WinForms `UpdateAutoSellState`(1·4 DarkOrange · 2·3 LimeGreen) ↔ 웹 `AUTO_SELL_LED`(1·4 latent · 2·3 armed) · 카드 칩 `groupStatusClassOf` 동형. 툴팁 문구만 웹이 「자동매도 … · 기준 …」 접두 추가(색 · 상태 판정 무관).

### 3. 첫 거래일 — 실제 저널 kind 6 g9 / 11~14 문장
expected: 주문로그 「자동매도」 칩에 120 저널의 kind 6 g9 · 11~14 줄이 문장으로 선다(원문 숫자 없음)
result: pass
evidence: 2026-10-06 dma_strategy_events group 9 + kind 11~14 전수 924행(KB 830 · KYOBO 94; k6 g9 598 · k7 g9 2 · k11 22 · k12 75 · k13 230 · k14 0)을 shared 조립기에 통과 — 924/924 문장, 폴백 0. group 9 밖 자동매도 토큰 · CR 10/11 혼입 0. seq 연속(누락 0). 실데이터 미발생 경로: k14 멈춤/재개 · AutoSellTriggerN(N>0) · CR 10 · k12 새 번호/접수 지연(서버가 message 빈 값 · latency 0 으로 냄) — 발생 시 관찰.

### 4. 첫 거래일 — 54 자동매도 사유 [상따] 배지 · 카드 간 혼입(리뷰 WR-04)
expected: 54 자동매도 사유 줄이 [상따] 배지로 해당 카드 로그에 선다. 다른 종목 카드에도 보이면 WR-04 로 기록
result: pass
evidence: WR-04 수정(5d51b609, relay b581af31 이후 배포본)으로 카드 54 표시가 isin · 계좌 축 필터. gh-trade 9261fe52 코드상 AutoSell INFO(`FlushLimitChaserNotices`) · AutoSellCommand ERROR(`ProcessAutoSellCommandReq`) 모두 i · a 를 채움 → 자기 카드만 통과. relay 는 54 내용을 기록하지 않아 런타임 건수는 없음. 사용자 실사용 중 혼입 보고 없음. 알려진 한계: 같은 종목 · 계좌의 KRX/NXT 두 카드는 54 에 거래소가 없어 둘 다 표시.

### 5. 첫 거래일 — /me 값 = WinForms 기본설정창 값 · 41 은 실사용 중에만 관찰
expected: /me 11값이 WinForms 기본설정창과 같다. 바로시작 · 중지는 실사용 중 관찰만(시험 클릭 금지)
result: pass
evidence: 41 부분 — k13 1→3 직행(바로시작 계약) 19건 · 3→0 반복 관찰, relay 41/42 실패 경로 로그(세션 없음 · 미준비 · 계좌 불허 · 송신 실패) 0 · close 4400 0 · 프레임 드롭 0 (14:48 이후 구간 — 08:00~14:48 relay 로그는 재배포로 소실). 웹 발인지 WinForms 발인지는 구분 불가. /me 11값 ↔ WinForms 기본설정창 — 2026-10-06 사용자 눈 비교 일치(pass).

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
