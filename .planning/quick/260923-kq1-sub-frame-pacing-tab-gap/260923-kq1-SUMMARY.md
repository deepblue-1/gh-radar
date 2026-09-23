---
phase: quick-260923-kq1
plan: 01
subsystem: webapp-relay-socket
status: complete
tags: [trading, relay, subscription, rate-limit]
affects:
  - webapp/src/lib/use-relay-socket.ts
  - webapp/src/components/trading/card/manual-order-form.tsx
metrics:
  completed: "2026-09-23"
---

# quick-260923-kq1 — 카드 호가·체결이 비는 문제 (구독 프레임 속도) + 폰 탭 아래 여백

## 원인

relay 는 연결당 인바운드를 초당 10건·버스트 10 토큰 버킷으로 막고, 넘친 프레임은 응답 없이 버린다.
웹은 인증 ACK·재접속 때 참조계수 전부(돌파 칩 ≤40 + 카드)를 한 번에 `sub` 했다 → 앞 10건(칩 price)만
살고 카드 full 구독이 버려져 `wireSubs` 에는 「보냄」으로 남아 재시도도 없었다. 13:39 relay 로그:
연결마다 PRICE 신규 구독 10건 + 「인바운드 상한 초과」 1회, FULL 구독 0건.

## 수정

- `use-relay-socket.ts` — 구독 제어(`sub`/`unsub`) 전용 클라 토큰 버킷 초당 6·버스트 6. 우선순위 full → 해제 → price.
  모자라면 타이머로 이어서 흘린다. 해제는 대기열(`pendingUnsubs`)을 타고, 보내기 전 재구독되면 와이어로 되돌린다.
  남는 초당 4건은 전략·주문 몫. 소켓 교체 시 버킷·대기열 초기화.
- `manual-order-form.tsx` — 폰 탭 줄 아래 여백: 매수·매도 탭 16px(방향색 그림자 8px 위로 8px 흰 여백), 수동 탭 8px 유지.

## 검증

- tsc 0 · vitest lib+trading 1051 + 신규 P1/P2 (relay-socket 62).
- Playwright 작업대+a11y+호가 57 passed.

## 남은 것

- relay 쪽은 무변경 — 드롭이 여전히 무응답이라 다른 클라가 폭주하면 같은 증상. relay 가 `sub` 드롭을 알리거나 sub 전용 버킷을 두는 건 별도(relay 배포 필요).
