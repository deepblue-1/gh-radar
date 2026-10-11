---
phase: quick-260923-nvr
plan: 01
subsystem: relay-webapp-vi
status: complete
tags: [vi, relay, gh-trade-sync]
affects:
  - relay/src/generated/StockDMA.fbs
  - relay/src/generated/stock-dma/viorder-item.ts
  - relay/src/dma/envelope.ts
  - packages/shared/src/relay.ts
  - webapp/src/components/trading/workbench/trading-workbench.tsx
metrics:
  completed: "2026-09-23"
---

# quick-260923-nvr — VI 해제된 발동을 작업대 VI 목록에서 숨김

## 배경

사용자: VI 발동 목록에서 해제된 종목은 보이지 말자. 클라는 해제를 알 수 없었다(`vi_end_time` 은 예정시각). gh-trade 에 요청
(`tasks/gh-trade-vi-released-flag-request.md`) → gh-trade quick-260923-jsv 가 `VIOrderItem.vi_released`(슬롯 36) 추가(회신 `…-reply.md`).

## 수정

- relay 생성 코드 2파일 — gh-trade 가 동기화해 둔 것을 그대로 커밋.
- `envelope.ts` — `viReleased: it.viReleased()` 디코드(구 서버 = false). 테스트 빌더 `viReleased?` 옵션.
- shared `RelayViOrderItem.viReleased?: boolean` — 옵셔널(옛 relay 호환, 없으면 false).
- 작업대 — `activeViOrders = viOrders.filter(o => o.viReleased !== true)` 를 VI 칩·표·「미확인 n」 에. VI 설정 중지 요약은 전체.

## 검증

- relay tsc 0 · vitest 605 (신규 ⑦-r). webapp tsc 0 · vitest 1094 (신규 해제 숨김). Playwright 작업대+a11y+me 54 passed.

## 배포 순서

- 웹은 먼저 나가도 안전하다(필드 없으면 숨기지 않음). 기능은 gh-trade 실서버 + relay 배포가 모두 끝나야 켜진다.
- 한계(gh-trade 회신): VI 도중 서버 재기동 시 이미 끝난 항목은 해제를 놓칠 수 있다 → 다음 재기동 보정·20:00 퍼지까지 보인다.
