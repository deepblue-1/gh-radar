---
phase: 11
slug: co-movement-candidates-top-k
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-11
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> 출처: 11-RESEARCH.md §Validation Architecture (5개 성공기준 → 검증 신호 매핑).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (server·worker 워크스페이스 공통 — candle-sync/themes 선례) |
| **Config file** | 각 워크스페이스 vitest 설정 (`passWithNoTests: true` 패턴) |
| **Quick run command** | `pnpm -F @gh-radar/server test` |
| **Full suite command** | `pnpm -r test` |
| **Estimated runtime** | ~30 seconds (server 단위 + 워커 스캐폴드) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm -F @gh-radar/server test` (computeComovement·읽기 라우트 단위)
- **After every plan wave:** Run `pnpm -r test` + typecheck/build
- **Before `/gsd-verify-work`:** 마이그레이션 push → fixture SQL 대조 → 워커 smoke → prod curl(5/5) green
- **Max feedback latency:** ~30 seconds (단위), SQL/prod 검증은 Wave 0/배포 게이트

---

## Success Criteria → Validation Signal Map

> 플래너가 Per-Task Verification Map(아래)을 채우기 전 단계의 상위 검증 계약. 5개 산출물 각각의 관찰 가능한 신호.

| # | 성공기준 | 검증 유형 | 명령/쿼리/신호 |
|---|----------|-----------|----------------|
| 1 | `theme_comovement` + `cosurge_edges` + 부분인덱스 production 존재. change_rate>31 제외 | 마이그레이션·인덱스 | `supabase db push --yes` exit 0 + `\d theme_comovement` + `\d cosurge_edges` + `\di idx_ohlcv_surge_bar`. EXPLAIN 으로 self-join 이 부분인덱스 사용 |
| 2 | SQL 함수가 발화일 도출 + conf_d0/lift/avg_ret/conf_d1 계산 → 적재 | SQL 출력 정확성 (fixture 대조) | `SELECT rebuild_comovement(24)` → 반환 jsonb 행수 > 0. **fixture 단언:** `SELECT co_count FROM cosurge_edges WHERE code_a='004090' AND code_b='024060'` ≈ 실측 9. `theme_comovement` conf_d0 ∈ [0,1] |
| 3 | 얇은 `co-movement-sync` 워커 + Job + Scheduler EOD 이후 야간 1회 | 워커 실행·적재 행수 | `smoke-comovement-sync.sh`: Job execute → Cloud Logging `{theme_comovement_rows, cosurge_edge_rows}` > 0. `gcloud scheduler jobs describe` cron 확인 |
| 4 | `GET /api/stocks/:code/co-movement?k=K` TOP-K(conf_d0 desc) + stock_quotes 조인 | 응답 계약·정렬 | **prod curl** `GET /api/stocks/004090/co-movement?k=8` → 200 + `{candidates:[...]}` 객체(배열 아님) + 흥구석유 상위 + strength desc + liveChangeRate. 단위: computeComovement 결합점수·dedup·후행 |
| 5 | 종목상세 ThemeChips 다음 "동조 후보" 섹션 + 빈 상태 | UI 렌더·빈 상태 | `/stocks/004090` 동조 후보 섹션(StockThemeChips 다음). 후보 0 종목 → "동조 데이터 부족". 후보 >3 → 더보기 |

---

## Per-Task Verification Map

> 플래너가 PLAN.md 태스크 생성 시 채운다 (Task ID 는 플랜 확정 후 부여).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-XX-XX | XX | N | COMV-01 | T-11-XX / — | (플래너 확정) | unit | `pnpm -F @gh-radar/server test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/src/lib/computeComovement.test.ts` — 결합점수/타이트니스/dedup/후행 판정 (fixture 3쌍 박제: 한국석유↔흥구석유, 광전자↔이노, 휴림에이텍↔휴림로봇) — COMV-01
- [ ] `server/src/routes/__tests__/co-movement.test.ts` — 읽기 라우트(청크 IN + db-max-rows 1000 mock + 빈 상태)
- [ ] `workers/co-movement-sync/` vitest 스캐폴드 (`passWithNoTests` + RPC 호출 mock)
- [ ] supabase-mock 이 db-max-rows 1000 + 청크 시뮬레이션 유지 (lessons 2026-06-10 — 회귀 가드 확인)
- [ ] **[BLOCKING] 마이그레이션 push → `EXPLAIN ANALYZE` 실측 → fixture co_count 대조** (SQL 정확성 1차 게이트 — 노드 mock 이 못 잡는 self-join 로직)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SQL self-join 정확성 (fixture co_count) | COMV-01 | DB connection string 부재 — push 후에만 실측 가능 | 마이그레이션 push 후 Supabase SQL Editor 에서 `SELECT co_count FROM cosurge_edges WHERE code_a='004090' AND code_b='024060'` ≈ 9 |
| prod 라우트 200 응답 | COMV-01 | 로컬 green ≠ prod (server 재배포 필요 — lessons) | `deploy-server.sh` 후 `curl prod/api/stocks/004090/co-movement?k=8` → 200 + candidates |
| 종목상세 섹션 시각 렌더 + 빈 상태 | COMV-01 | UI 시각 확인 (UI-SPEC 계약 대조) | Vercel 배포 후 `/stocks/004090`(후보 有) + 테마없는 종목(빈 상태) 육안 확인 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (computeComovement·라우트·워커 스캐폴드)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (단위)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
