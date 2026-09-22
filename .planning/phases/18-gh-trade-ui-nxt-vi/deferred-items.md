# Phase 18 — Deferred Items

## 18-22 발견 (범위 밖 · 수정 안 함)

### relay 인증 직후 `lc.snap` 이 콜드 세션에서 「모름」 을 「전략 없음」 으로 내린다

- **어디:** `relay/src/ws/fanout.ts` 인증 경로(`this.#send(conn, { t: "lc.snap", items: this.#hub.getLimitChasers(userId) })`) · `relay/src/hub/subscription-hub.ts` `getLimitChasers` / `#onLimitChaserList`
- **무엇:** 세션을 막 만든 연결(콜드)은 게이트웨이 64 가 오기 전이라 hub 캐시가 비어 있는데, 인증 직후 그 빈 캐시를 `lc.snap []` 으로 보낸다. 곧 64 팬아웃이 진짜 목록을 한 번 더 내린다. 주석은 「빈 배열은 「전략 없음」의 확정 정보」 라고 말하지만 콜드 세션에서는 사실이 아니다. VI 설정(`getViTrigger` 3상태 · `undefined` 면 안 보냄)과 규율이 다르다.
- **영향:** 18-22 WR-07 포커스 보류 판정이 첫 `lc.snap` 을 확정으로 읽을 수 없다. 작업대는 빈 목록을 모호하게 다루는 것(`knowsRegistered`)으로 우회했다. 남는 틈은 「등록 전략 0건 사용자의 오래된 포커스 키」 뿐이다.
- **근본 수정 제안:** hub 가 사용자별로 「64 를 받았는가」 를 기록하고(`#limitChaserKnown`), 인증 경로는 알 때만 `lc.snap` 을 보낸다(모르면 64 팬아웃이 첫 프레임이 된다). relay 배포가 필요하므로 별도 플랜/quick 으로 다룬다. 그 뒤에는 작업대 `knowsRegistered` 를 `snapSeq > 0` 하나로 줄일 수 있다.
