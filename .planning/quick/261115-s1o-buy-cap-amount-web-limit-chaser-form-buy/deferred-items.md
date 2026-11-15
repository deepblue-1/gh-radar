# quick-261115-s1o — 범위 밖 발견

- `pnpm --filter @gh-radar/relay run typecheck:tests` 가 이 작업과 무관한 4건으로 빨갛다(HEAD 1f9e4d60 부터 있던 것 — 이 작업이 건드린 파일 아님).
  - `relay/tests/admin-api.test.ts` 1823 · 1918 · 1957행 — `LaunchPlanService` 목에 `setTailProbe` · `tailProbeSettable` 없음.
  - `relay/tests/admin-dispatcher.test.ts` 179행 — `AdminCommandRequest` 에 `launchProfile` · `launchTailProbeCount` · `launchTailProbeStepUs` 없음.
  - 뒤탐침(quick-261107-l7w 계열) 변경 뒤 테스트 목이 따라오지 않은 것으로 보인다. 이 quick 에서는 고치지 않았다.
