---
quick_id: 261101-owf
type: quick
autonomous: true
files_modified:
  - relay/src/dma/envelope.ts
  - relay/src/dma/__tests__/envelope.test.ts
  - relay/tests/fanout.test.ts
  - relay/tests/helpers/frames.ts
  - packages/shared/src/relay.ts
  - packages/shared/src/limit-feature.ts
  - packages/shared/src/__tests__/limit-feature.test.ts
  - webapp/src/components/trading/__tests__/limit-feature-table.test.tsx
  - webapp/src/components/trading/__tests__/card-tabs.test.tsx
  - webapp/e2e/specs/trading-workbench.spec.ts
---

# 상따 카드 85 창구행 셋째 칸 「최대체결 X.X억」 — gh-trade nbu(bac82294) WinForms 동형

목업: `reference/mockup-max-fill.html` (사용자 검토 완료 — ①~③ WinForms 원문, ④ 폰 밴드는 B 「최대 X.X억」 채택).

## Task 1 — relay 디코드 + shared 타입 (선례 7ab653ba)

- `parseLimitFeature` 에 `upperMaxFillKrw: toNum(lf.upperMaxFillKrw(), …)` · `upperMaxFillDate: lf.upperMaxFillDate()`.
- `RelayLimitFeatureMsg` 에 두 optional 필드(키 없음 = 구 relay · kind 15 다리).
- frames.ts 입력 2개(기본 미기록 = 구 서버) · envelope.test · fanout.test 1건씩.

## Task 2 — shared 표시 + webapp 테스트

- 창구 셋째 칸(WinForms `BuildLimitFeatureCells` [11] 동형):
  - krw 키 없음 또는 0 → 「최대체결 —」 muted
  - date == 오늘(gwTimeMs KST yyyymmdd, 0 이면 현재 시각 KST — WinForms `TodayKstYmd`) → 「최대체결 {formatEok}」 fg
  - 그 밖 → 같은 문구 muted
  - narrow(폰 밴드) = 「최대 {formatEok}」 (값이 있을 때만, 사용자 결정 B)
- 툴팁: 「HH:mm:ss 기준」 의 깨짐확률 꼬리 제거, krw > 0 ∧ date ≠ 0 ∧ date ≠ 오늘이면 줄 「최대체결 M/d 기록」 추가.
- kind 15 `limitFeatureLogParts` 는 손대지 않는다(확률 문구 유지 — kind 15 슬롯 그대로).
- 테스트: shared limit-feature.test · limit-feature-table.test · card-tabs.test · e2e 툴팁 단언 문구.

## 검증

relay typecheck · typecheck:tests · relay vitest(envelope · fanout) · shared vitest · webapp 관련 vitest (--maxWorkers=2).
