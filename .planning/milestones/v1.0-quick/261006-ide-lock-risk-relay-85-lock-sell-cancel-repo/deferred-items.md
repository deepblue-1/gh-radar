# quick-261006-ide — 범위 밖 발견(고치지 않음)

## e2e P28-1b 실패 — 기준 HEAD(bf038087)에서도 같은 자리 실패

- 위치: `webapp/e2e/specs/trading-workbench.spec.ts` P28-1b ③ — 접었다 펼친 직후 `toHaveAccessibleName('상한가 · 잠김 43초', { timeout: 5_000 })` 가 「상한가」(접미 없음)를 받는다.
- 실측: 이 quick 변경을 모두 되돌린 기준 트리(`git apply -R` → shared build → 단건 실행)에서도 1/1 실패, 변경 적용 상태에서 3/3 실패.
- 추정 원인(실측 아님): ef2ec49c(WR-A01 — relay 85 캐시를 FULL→PRICE 강등 때 지움) 이 P28-1b 의 전제(「게이트웨이가 새 85 를 보내지 않아도 relay 스냅샷이 즉시 다시 세운다」)와 어긋난다. 강등이 캐시를 지우면 다시 펼쳤을 때 스냅샷으로 줄 85 가 없다.
- 결정 필요: 테스트 전제를 WR-A01 쪽으로 고칠지(재펼침 뒤 게이트웨이가 새 85 를 밀어야 보임), 아니면 linger 중 캐시를 남길지. relay hub 동작이라 이 quick 범위 밖이다.

## 해결 (오케스트레이터, 2026-10-06) — da422542
- 원인 확정: gh-trade MarketPublisher::EmitLimitFeature 가 `Fanout(subIt->second.full, b)` — 85 는 FULL 구독자에게만 간다. FULL→PRICE 강등 뒤에는 실서버가 85 를 보내지 않으므로 강등 때 캐시를 지우는 WR-A01 이 맞고, P28-1b 의 「접힌 동안 hub 가 85 를 캐시」 전제가 실서버와 어긋났다.
- 테스트를 WR-A01 의미로 고침: 다시 펼친 직후 새 85 전까지 「상한가」(얼린 값 없음) → 새 85 로 「잠김 52초」. P28 4건 통과.
