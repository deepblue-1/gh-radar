---
phase: quick-261109-kzk
plan: 01
status: complete
subsystem: analytics/teamflow
tags: [teamflow, tick-viewer, rpc, supabase, webapp]
requires:
  - tick_grids 팀 칸(20261103230000 — team_fills · team_day_net_krw)
  - teamflow_report_for_user(20261102200200)
provides:
  - teamflow_report_for_user rows[] tick_team_fills · tick_team_day_net_krw · 유효값 정렬
  - webapp teamNetOf(row) → { val, src: 'tick' | 'none' | 'export' }
affects:
  - /analytics/teamflow 목록 · KPI · 행 sr 설명 · 상세 표 이름 · 판정 기준
tech-stack:
  added: []
  patterns:
    - "목록 값 한 함수(teamNetOf)가 칸 · 정렬 · KPI · sr 을 정한다 — RPC ORDER BY 와 같은 CASE 규칙"
key-files:
  created:
    - supabase/migrations/20261109400000_teamflow_report_tick_team_net.sql
  modified:
    - supabase/tests/teamflow_report.test.sql
    - packages/shared/src/teamflow-report.ts
    - webapp/src/lib/teamflow-report.ts
    - webapp/src/lib/__tests__/teamflow-report.test.ts
    - webapp/src/components/analytics/teamflow-day-grid.tsx
    - webapp/src/components/analytics/teamflow-report.tsx
    - webapp/src/components/analytics/__tests__/teamflow-report.test.tsx
    - webapp/src/components/analytics/teamflow-band-table.tsx
    - webapp/src/components/analytics/teamflow-member-matrix.tsx
    - webapp/src/components/analytics/teamflow-detail.tsx
    - webapp/src/components/analytics/__tests__/teamflow-detail.test.tsx
decisions:
  - "팀 매집 목록 「팀 순매수」 = 틱뷰어 「당일순매수」(tick_grids KRX team_day_net_krw) — team_fills 0 은 「—」 · 미계산/격자 없음/옛 RPC 만 export team_net_val 폴백 + 「*」"
  - "RPC 키 이름에 tick_ 접두사(tick_team_fills · tick_team_day_net_krw) — export 열과 출처를 섞지 않는다"
metrics:
  duration: "약 25분"
  completed: 2026-11-09
estimate:
  tokens: 85000
  tasks: 3
actuals:
  tokens: 12900
  tasks: 3
  commits: 3
plan_head_before: b25b916aaf2e8f84258c1d3bcf59440a416a3aa1
plan_head_after: c096d2052d372cf23200e5687d4baea46c1895e6
---

# Phase quick-261109-kzk Plan 01: 팀 매집 팀 순매수 = 틱뷰어 당일순매수 Summary

팀 매집 보고서 RPC 가 tick_grids KRX 행 팀 칸을 PK LEFT JOIN 으로 싣고, 웹 `teamNetOf` 한 함수가 목록 칸 · 정렬 · KPI · sr 설명을 틱뷰어 「당일순매수」 값으로 통일한다(미계산 행만 export 값 + 「*」 · 팀 체결 없음 「—」). 상세 표 「하루 합계」 는 「(상한가 가격 제외)」 로 이름이 구별되고 판정 기준 문구가 새 정의를 말한다.

## 완료한 태스크

| Task | 이름 | 커밋 | 주요 파일 |
| ---- | ---- | ---- | --------- |
| 1 (tracer) | RPC tick_grids KRX 조인 · 타입 · teamNetOf(정렬 · KPI fallback · sr) | 390087b1 | 마이그레이션 20261109400000 · pgTAP J 절 · shared TeamflowRow · lib teamflow-report |
| 2 | 목록 팀 순매수 칸 · 폴백 「*」 · KPI 아래 설명 줄 | 93150db8 | teamflow-day-grid.tsx · teamflow-report.tsx · 컴포넌트 테스트 (r)·(r2) |
| 3 | 상세 「하루 합계(상한가 가격 제외)」 · 판정 기준 8항목 | c096d205 | teamflow-band-table · teamflow-member-matrix · teamflow-detail · 상세 테스트 |

## 검증

- pgTAP `supabase/tests/teamflow_report.test.sql` — 38/38 ok(RESULT: PASS · 기존 30 + J 절 8). 마이그레이션 적용 전 RED 6건 실패 확인(J1 정렬 have 233·232·231·234) → 적용 후 GREEN. docker 일회용 컨테이너(124 마이그레이션 재생) — 원격 DB 접촉 0.
- vitest(--maxWorkers=2):
  - lib teamflow-report 60/60(RED 14건 → GREEN)
  - 컴포넌트 teamflow-report RED 3건 → GREEN 20/20
  - 최종 `src/components/analytics` 전체 + lib teamflow-report · teamflow-chart: 11 파일 313/313 통과
  - server `tests/routes/teamflow-report.test.ts` 12/12(패스스루 회귀 — server 코드 변경 없음)
- `pnpm --filter @gh-radar/webapp typecheck`(tsc + e2e tsconfig) 통과.
- 마이그레이션 게이트(주석 제외): `g.exchange = 'KRX'` 1 · REVOKE PUBLIC/anon,authenticated 2 · `TO service_role` 1 · `SECURITY INVOKER` 1.
- Task 2 게이트: `fmtEok(r.team_net_val` 0 · `teamNetOf` 3 · `teamflow-net-note` 1 · 최소치 캡션 문장 1(글자 그대로 — e2e P33-TF1 보존).
- Task 3 게이트: 「순매수와 하루 합계에서 뺀다」 0 · band-table 「상한가 가격 제외)」 2 · member-matrix 2 · 「틱뷰어 「당일순매수」 와 같은 값」 1.
- e2e 확인만(grep): teamflow-report.spec.ts 에 「하루 합계」 표시 글자 · 판정 기준 li 수 · teamflow-net 글자를 exact 로 잡는 단언 없음 → e2e 수정 없음. e2e 는 실행하지 않았다(계획상 필수 게이트 아님 · 동시 세션 메모리).

## 메인 세션 배포 순서 (executor 는 커밋까지만 — 원격 DB · push 미실행)

1. `supabase db push --linked --yes` — 새 마이그레이션 `20261109400000_teamflow_report_tick_team_net.sql` 원격 적용(먼저. 웹은 옛 RPC 의 키 없음을 export 폴백 「*」 로 보여 깨지지는 않지만, DB 가 먼저 가야 처음부터 새 값이 보인다).
2. 그다음 `git push`(= webapp 프로덕션 배포). server · 워커 배포 없음(server 는 패스스루 무변경).
3. 확인: 운영 /analytics/teamflow?d=20261103 에서 래블업 +12.9억 · 한싹 −3.9억 · 한진 −0.0억 · 한울앤제주 −1.7억(틱뷰어 같은 날 당일순매수와 대조).

## Deviations from Plan

None - plan executed exactly as written.

참고(편차 아님):
- 커밋은 master 에 직접 했다. 실행기 기본 가드는 master 를 보호 브랜치로 보지만, 이 프로젝트는 master 에서 작업하는 것이 사용자 규칙이고 오케스트레이터가 메인 트리 순차 실행으로 배정했다. 경로 지정 `git add` 만 사용 · `git stash` 미사용.
- xl 팀 순매수 열(80px)은 넓히지 않았다. 「*」 는 truncate 칸 바깥 shrink-0 형제라 겹침 · 줄바꿈이 구조적으로 없다. 글자 폭 추정(Pretendard tnum 14px)으로 ±999.9억 + 「*」 는 80px 안에 들어가고, ±1,000억 이상 폴백 값만 1px 안팎 말줄임 가능(원래 truncate + title 동작과 같음). 브라우저 실측은 하지 않았다.
- 거래원 행렬 첫 열은 「(상한가 가격 제외)」 둘째 줄(12px)만큼 약 18px 넓어진다(추정 · 래퍼 overflow-x-auto 라 폰에서도 페이지 가로 스크롤 없음). 브라우저 실측은 하지 않았다.

## Known Stubs

없음.

## Self-Check: PASSED

- FOUND: supabase/migrations/20261109400000_teamflow_report_tick_team_net.sql
- FOUND: 390087b1 · 93150db8 · c096d205 (HEAD 조상)
