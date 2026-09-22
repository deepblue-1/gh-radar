# Phase 18 — Deferred Items

## 18-22 발견 (범위 밖 · 수정 안 함)

### relay 인증 직후 `lc.snap` 이 콜드 세션에서 「모름」 을 「전략 없음」 으로 내린다

- **어디:** `relay/src/ws/fanout.ts` 인증 경로(`this.#send(conn, { t: "lc.snap", items: this.#hub.getLimitChasers(userId) })`) · `relay/src/hub/subscription-hub.ts` `getLimitChasers` / `#onLimitChaserList`
- **무엇:** 세션을 막 만든 연결(콜드)은 게이트웨이 64 가 오기 전이라 hub 캐시가 비어 있는데, 인증 직후 그 빈 캐시를 `lc.snap []` 으로 보낸다. 곧 64 팬아웃이 진짜 목록을 한 번 더 내린다. 주석은 「빈 배열은 「전략 없음」의 확정 정보」 라고 말하지만 콜드 세션에서는 사실이 아니다. VI 설정(`getViTrigger` 3상태 · `undefined` 면 안 보냄)과 규율이 다르다.
- **영향:** 18-22 WR-07 포커스 보류 판정이 첫 `lc.snap` 을 확정으로 읽을 수 없다. 작업대는 빈 목록을 모호하게 다루는 것(`knowsRegistered`)으로 우회했다. 남는 틈은 「등록 전략 0건 사용자의 오래된 포커스 키」 뿐이다.
- **근본 수정 제안:** hub 가 사용자별로 「64 를 받았는가」 를 기록하고(`#limitChaserKnown`), 인증 경로는 알 때만 `lc.snap` 을 보낸다(모르면 64 팬아웃이 첫 프레임이 된다). relay 배포가 필요하므로 별도 플랜/quick 으로 다룬다. 그 뒤에는 작업대 `knowsRegistered` 를 `snapSeq > 0` 하나로 줄일 수 있다.

- **해소 (R3 · 18-26, 2026-09-22):** hub `#limitChaserKnown` · 인증 경로 조건부 `lc.snap` · 작업대 `knowsRegistered = snapSeq > 0`. relay 배포 전까지 운영 효과 없음

## 18-35 발견 (R4 · 범위 밖 · 수정 안 함)

### 가격 0 · `board` 빈 미체결 행의 중립 표기

- **어디:** `webapp/src/components/orderbook/order-confirm-dialog.tsx` `isOffhoursOrder` (호출처: 수동주문 폼 선택 칩 · `modifyLockReason` · 확인 다이얼로그 원주문 줄 / 옛 취소 요약)
- **무엇:** 「가격 0 ⇒ 시간외종가」 는 relay 가 만든 주문(DB CHECK · zod 불변식)에만 성립한다. 미체결 목록은 게이트웨이 계좌 상태라 같은 계좌의 다른 단말(세션 합류 · WinForms) 주문도 싣는데, 그 단말의 시장가 미체결(단일가 · VI 구간에서 잔존 가능)도 가격 0 으로 온다. `board` 가 빈 그 행은 칩 · 확인 요약이 「시간외종가」 로 표기되고, 정정 잠금 사유가 시간외종가 문구로 틀리게 뜬다 (18-REVIEW-R3 R3-IN-04).
- **영향:** 표기 오류뿐이다. 잠금은 정정을 막는 보수적 방향이고 취소는 열려 있어 주문 위험은 없다. 판정식 · `OFFHOURS_PRICE_LABEL` · 정정 잠금 문구는 바꾸지 않았고, 18-35 는 근거 주석의 범위만 좁혔다.
- **근본 수정 제안:** gh-trade 미체결 스키마에 주문유형 필드를 요청한다(서버 변경 — Phase 18 범위 밖, CONTEXT 「서버 변경 범위 밖」). 그 필드를 relay · shared 경유로 내리면, `board` 가 빈 가격 0 행 중 시간외종가가 아닌 것을 「가격 없음」 으로 중립 표기하고 정정 잠금 사유도 그에 맞춘다.
