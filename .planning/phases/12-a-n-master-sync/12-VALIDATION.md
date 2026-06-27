---
phase: 12
slug: a-n-master-sync
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-27
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> 본 phase의 핵심 검증 대상은 **상한가 가격 산출 규칙 + 이벤트 판별 SQL**이다.
> RESEARCH.md "Validation Architecture"의 황금 케이스 fixture(000390 4회, 000440 4회/점상1)를
> 기준으로 RPC 백테스트 결과의 정확성을 증명한다.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | SQL fixture 검증(psql/Supabase) + prod curl(server 라우트) + 수동 시각 확인(webapp) |
| **Config file** | none — RPC는 마이그레이션으로 배포, 검증은 황금 케이스 쿼리로 |
| **Quick run command** | `psql "$SUPABASE_DB_URL" -f .planning/phases/12-a-n-master-sync/fixtures/limit_up_golden.sql` (planner가 fixture 작성) |
| **Full suite command** | RPC rebuild 후 황금 케이스 종목(000390/000440) 결과 대조 + prod `curl /api/stocks/000440/limit-up-history` |
| **Estimated runtime** | RPC rebuild ~수십초(1.4M행), 검증 쿼리 ~초 단위 |

---

## Sampling Rate

- **After every task commit:** 해당 task가 SQL/RPC면 황금 케이스 쿼리 재실행, webapp이면 빌드 통과
- **After every plan wave:** 마이그레이션 push 후 `rebuild_*` RPC 실행 → 황금 케이스 대조
- **Before `/gsd-verify-work`:** RPC 결과가 RESEARCH 황금 케이스(000390 4회·000440 4회/점상1·다음날 시초가 수익률)와 일치 + server 라우트 prod curl 200
- **Max feedback latency:** RPC rebuild 포함 ~60초

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-XX-XX | XX | 1 | LIMIT-01 | T-12-01 / — | RPC는 SECURITY DEFINER + search_path 격리, REVOKE anon/authenticated | sql-fixture | `psql -f fixtures/limit_up_golden.sql` | ❌ W0 | ⬜ pending |
| 12-XX-XX | XX | 1 | LIMIT-01 | — | 상한가가격 = floor(전일종가×1.3/tick)×tick, change_rate<=31 게이트 | sql-assert | 황금 케이스 이벤트 카운트 대조 | ❌ W0 | ⬜ pending |
| 12-XX-XX | XX | 2 | LIMIT-01 | — | server 라우트 `{...}` 객체 반환, 읽기전용(on-demand 재계산 금지) | prod-curl | `curl /api/stocks/:code/limit-up-history` | ❌ W0 | ⬜ pending |
| 12-XX-XX | XX | 2 | LIMIT-01 | — | N≥3 게이팅(표본<3이면 큰 % 숨김), 회전율 listing_shares NULL→"—" | manual-visual | 종목상세 카드 시각 확인 | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task ID는 planner가 PLAN.md 작성 시 확정(XX→실제 plan/task 번호).*

---

## Wave 0 Requirements

- [ ] `fixtures/limit_up_golden.sql` — RESEARCH 황금 케이스(000390 4회, 000440 4회/점상1) 기대 이벤트·다음날 수익률을 박제한 검증 쿼리
- [ ] 상한가가격 plpgsql 표현식 단위 검증 — 가격대별 tick 구간(10-tier)이 RESEARCH 표와 일치하는지 샘플 가격으로 확인

*기존 자동화 인프라 없음 — SQL 황금 케이스 fixture가 본 phase의 핵심 검증 자산.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 히어로 카드 익절률%/분포 히스토그램/이벤트 리스트/테마 카드 시각 표시 | LIMIT-01 | 시각 레이아웃·색상(수익=빨강 --up/손실=파랑 --down)은 자동 검증 불가 | 종목상세 `/stocks/000440` 진입, 목업 C안과 대조 |
| N≥3 게이팅·빈 상태(이벤트 0회) 카피 | LIMIT-01 | 표본 분기별 UX는 실데이터 종목으로 시각 확인 | 표본<3 종목·이벤트 0회 종목(대형주)·N≥3 종목 각각 확인 |

---

## Validation Sign-Off

- [ ] 모든 SQL/RPC task가 황금 케이스 fixture로 검증되거나 Wave 0 의존
- [ ] Sampling continuity: SQL 검증 없는 task 3연속 금지
- [ ] Wave 0이 황금 케이스 fixture + tick 표현식 검증 커버
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
