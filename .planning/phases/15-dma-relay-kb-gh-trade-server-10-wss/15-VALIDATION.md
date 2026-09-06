---
phase: 15
slug: dma-relay-kb-gh-trade-server-10-wss
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-05
updated: 2026-09-06
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> 초안은 `15-RESEARCH.md` §Validation Architecture 에서 옮겼고, **Per-Task Verification Map 은 plan 단계(gsd-planner)가 20개 PLAN.md 의 실제 task ID 기준으로 채웠다.**
> 요구사항 RELAY-01 / RELAY-02 / RELAY-03 은 `REQUIREMENTS.md` §DMA Relay 에 등록 완료.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (relay)** | vitest `^4.1.4` (server 와 동일 버전 고정) — `relay/vitest.config.ts` **없음 → Wave 0 (15-01-01)** |
| **Framework (server)** | vitest `^4.1.4` — `server/vitest.config.ts` (존재) |
| **Framework (webapp)** | vitest + @testing-library/react + Playwright (E2E, baseURL `http://localhost:3100`) (존재) |
| **Quick run (relay)** | `pnpm --filter @gh-radar/relay test` |
| **Quick run (server)** | `pnpm --filter @gh-radar/server test` |
| **Quick run (webapp)** | `pnpm --filter webapp test` |
| **Full suite command** | 위 3종 + `pnpm --filter webapp exec playwright test orderbook stock-detail-tabs` + `pnpm typecheck` |
| **인프라 검증** | `bash scripts/smoke-relay.sh` (INV-1~10) · `bash scripts/smoke-server.sh` |
| **스키마 정합** | `/Users/alex/repos/gh-trade/server/scripts/sync-relay-schema.sh --check` 무변경 |
| **DB 정합** | `supabase db lint --schema public` · `supabase db push --yes` 멱등 재실행 |
| **Estimated runtime** | relay/server 유닛 ~20s · webapp 유닛 ~15s · E2E ~60s · smoke ~90s |

**중요 — `test` 스크립트는 watch 모드가 아니라 `vitest run` 이어야 한다**(15-01-01 acceptance). watch 모드면 모든 검증이 hang 한다.

---

## Sampling Rate

- **After every task commit:** 해당 패키지 quick run (`pnpm --filter <pkg> test`) + `pnpm typecheck`
- **After every plan wave:** relay+server+webapp 단위 테스트 전부 + `sync-relay-schema.sh --check` 무변경
- **인프라 wave(3):** `smoke-relay.sh` 전 INV green (배포 직후 1회 + **다음 날 1회** — 인증서 갱신·VPN 지속성)
- **Before `/gsd:verify-work`:** 전 단위 테스트 green + Playwright `orderbook`·`stock-detail-tabs` green + `smoke-relay.sh` INV green + `15-MOCK-ORDER-EVIDENCE.md` 존재
- **실서버 검증:** D-27 — 사용자 지시 시에만, `15-20` 의 `checkpoint:decision` 뒤에서만
- **Max feedback latency:** ~90초 (quick run 기준 ~20초)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 15-01 | 1 | RELAY-01 | T-15-04 | pino redact 에 비밀번호·토큰·relay secret 경로 포함, relay 가 루트 typecheck 에 포함 | config | `pnpm --filter @gh-radar/relay run typecheck` | ❌ W0 | ✅ |
| 15-01-02 | 15-01 | 1 | RELAY-01 | T-15-16 | 생성물 수기 편집 금지 — `--check` 무변경이 게이트 | 정합 | `bash /Users/alex/repos/gh-trade/server/scripts/sync-relay-schema.sh --check` | ✅ | ✅ |
| 15-01-03 | 15-01 | 1 | RELAY-01 | — | 와이어 계약에 bigint 부재(직렬화 폭발 방지) | unit | `pnpm --filter @gh-radar/shared build && pnpm typecheck` | ✅ | ✅ |
| 15-02-01 | 15-02 | 1 | RELAY-01 | T-15-07, T-15-07b | 1MB 상한 우선 검사 · 8B 최소 크기 · desync 시 연결 재수립 · 드롭 카운터 | unit | `pnpm --filter @gh-radar/relay test codec` | ❌ W0 | ✅ |
| 15-02-02 | 15-02 | 1 | RELAY-01 | T-15-07, T-15-17, T-15-18 | msg_type 화이트리스트 · takeCount 클램프(10/200/256/500/1000) · ISIN·exchange 형식 가드 · bigint 안전범위 | unit | `pnpm --filter @gh-radar/relay test envelope` | ❌ W0 | ✅ |
| 15-02-03 | 15-02 | 1 | RELAY-01 | T-15-07 | 쓰레기 프레임·강제 종료·청크 경계를 테스트가 주입할 수 있음 | fixture | `pnpm --filter @gh-radar/relay test fake-gateway` | ❌ W0 | ✅ |
| 15-03-01 | 15-03 | 2 | RELAY-01 | T-15-10, T-15-09, T-15-07 | 재접속 상한 10 · 30초 LivePing · 수신 경로 await 0건 · desync 재수립 | unit (가짜 net 서버) | `pnpm --filter @gh-radar/relay test dma-client` | ❌ W0 | ✅ |
| 15-03-02 | 15-03 | 2 | RELAY-01 | T-15-10, T-15-19 | 로그인 거부 시 재시도 중단(FailNoRetry) · 5초 타임아웃 · 비밀번호 상태 프레임 미포함 | unit | `pnpm --filter @gh-radar/relay test session` | ❌ W0 | ✅ |
| 15-03-03 | 15-03 | 2 | RELAY-01 | T-15-20 | 세션 키가 gh-radar userId — 사용자 간 세션 공유 경로 없음 · 5분 유예 | unit | `pnpm --filter @gh-radar/relay test session-manager` | ❌ W0 | ✅ |
| 15-04-01 | 15-04 | 2 | RELAY-01 | T-15-02 | 구독 키에 userId 포함 — 타 사용자 구독 해제 불가 · Ready 재구독 단일 경로 | unit | `pnpm --filter @gh-radar/relay test hub` | ❌ W0 | ✅ |
| 15-04-02 | 15-04 | 2 | RELAY-01 | T-15-05 | AES-256-GCM AAD=user_id · 키/AAD/변조 3종 실패 확정 · jose 미사용 | unit | `pnpm --filter @gh-radar/relay test credentials` | ❌ W0 | ✅ |
| 15-04-03 | 15-04 | 2 | RELAY-01 | T-15-03, T-15-02, T-15-08, T-15-21 | 5초 미인증 close(4401) · 인증 전 sub close(4400) · 매핑 없음 unauthorized · 전역 브로드캐스트 부재 · bufferedAmount terminate | unit (ws 클라) | `pnpm --filter @gh-radar/relay test fanout` | ❌ W0 | ✅ |
| 15-05-01 | 15-05 | 2 | RELAY-01 | T-15-24 | 종료 시 wss close(1001) + DMA 세션 정리 (고아 세션 방지) | build | `pnpm --filter @gh-radar/relay run build` | ❌ W0 | ✅ |
| 15-05-02 | 15-05 | 2 | RELAY-01, RELAY-03 | T-15-06, T-15-22 | `crypto.timingSafeEqual` 상수시간 비교 · `/healthz` 에 계좌·userId 미포함 | unit (supertest) | `pnpm --filter @gh-radar/relay test order-api` | ❌ W0 | ✅ |
| 15-05-03 | 15-05 | 2 | RELAY-03 | T-15-23, T-15-25, T-15-05 | non-root 컨테이너 · 기본 DMA_HOST 가 실서버 아님 · 등록 스크립트 비밀 미출력 | build/config | `bash -n dev.sh && docker build --platform=linux/amd64 -f relay/Dockerfile -t gh-radar-relay:planbuild .` | ❌ W0 | ✅ (15-05 실측) |
| 15-06-01 | 15-06 | 3 | RELAY-03 | T-15-12, T-15-27 | 방화벽 3규칙(443/IAP 22/서브넷 8091) · `--can-ip-forward` 미부여 · Secret 단위 IAM | config (문법) | `bash -n scripts/setup-relay-iam.sh` | ❌ W0 | ✅ |
| 15-06-02 | 15-06 | 3 | RELAY-03 | T-15-11, T-15-10, T-15-26 | `CISCO_SPLIT_INC` split-tunnel 강제 · `StartLimitBurst=5/1h` · tmpfs cred 0600 · 비밀 값 0건 | config (문법+grep) | `bash -n infra/relay/kbvpn-fetch-secret.sh && bash -n infra/relay/kbvpn-connect.sh && bash -n infra/relay/kbvpn-vpnc-wrapper.sh` | ❌ W0 | ✅ |
| 15-06-03 | 15-06 | 3 | RELAY-03 | T-15-13, T-15-11 | Caddy·VPN 자동 기동 금지(DNS 확인 후 수동) · 3분 자동 중지 안전장치 | config (문법+grep) | `bash -n infra/relay/startup.sh` | ❌ W0 | ✅ |
| 15-07-01 | 15-07 | 3 | RELAY-03 | T-15-12, T-15-27 | VM RUNNING · 방화벽 정확히 3규칙 · canIpForward=False · IAP SSH 도달 | infra INV | `gcloud compute instances describe radar-gw --zone=asia-northeast3-a --format='value(status)'` | ❌ W0 | ✅ |
| 15-07-02 | 15-07 | 3 | RELAY-03 | T-15-10, T-15-11, T-15-28, T-15-26 | 수동 ≤3회 · 자동 재시도 금지 · split-tunnel 유지 · 게이트웨이 도달성만(로그인 금지) · 비밀 미기록 | **manual** + 산출물 검증 | `test -f .planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/15-VPN-PREFLIGHT.md` | ❌ W0 | ✅ |
| 15-07-03 | 15-07 | 3 | RELAY-03 | T-15-13, T-15-12 | DNS 확인 **후** Caddy 기동(rate limit 방어) · 임시 80 규칙 잔존 0 | **manual** + INV | `echo \| openssl s_client -connect dma.jx1.io:443 -servername dma.jx1.io 2>/dev/null \| openssl x509 -noout -issuer` | ❌ W0 | ✅ |
| 15-08-01 | 15-08 | 3 | RELAY-03 | T-15-29, T-15-30, T-15-08 | 비밀 명령줄 미노출(tmpfs env-file) · 실서버 지정 시 경고 · `--memory=384m` 유계 | config (문법) | `bash -n scripts/deploy-relay.sh` | ❌ W0 | ✅ |
| 15-08-02 | 15-08 | 3 | RELAY-03 | T-15-12, T-15-13 | INV-7 부정 검증(`! nc -z`) · uptime 기반 알림 · 채널 ID 플레이스홀더 | config (문법+YAML) | `bash -n scripts/smoke-relay.sh && python3 -c "import yaml; yaml.safe_load(open('ops/alert-relay-down.yaml'))"` | ❌ W0 | ⚠️ (`bash -n` PASS · YAML 로컬 파싱은 파서 부재로 미재실행 — 배포 정책 `enabled=True` 로 대체 확인) |
| 15-08-03 | 15-08 | 3 | RELAY-03 | T-15-12, T-15-30, T-15-22 | 8091·9100 공인 차단 능동 검증 · 컨테이너 env 에 실서버 주소 부재 · `/healthz` PII 부재 | infra INV | `bash scripts/smoke-relay.sh` | ❌ W0 | ✅ |
| 15-09-01 | 15-09 | 4 | RELAY-01, RELAY-02 | T-15-05, T-15-01, T-15-31 | RLS 활성 + 정책 0 + `REVOKE FROM anon, authenticated` 명시 · isin 12자 CHECK | schema lint | `supabase db lint --schema public` | ✅ | ✅ (15-09 실측 · supabase CLI 미가용으로 15-20 재실행 없음) |
| 15-09-02 | 15-09 | 4 | RELAY-01, RELAY-02 | T-15-05, T-15-01 | production 적용 + 멱등 재실행 · pg_policies 0행 · anon/authenticated grant 0행 | **[BLOCKING]** 정합 | `supabase db push --yes 2>&1 \| grep -qi "up to date"` | ✅ | ✅ (15-09 실측 · 동) |
| 15-10-01 | 15-10 | 4 | RELAY-02 | T-15-31, T-15-33, T-15-34 | ISU_CD 12자 정규식 가드 · ETP null 이 기존 isin 미삭제 · 산술 유도 코드 부재 | unit | `pnpm --filter @gh-radar/master-sync test` | ❌ W0 | ✅ |
| 15-10-02 | 15-10 | 4 | RELAY-02 | T-15-35 | 활성 주식 isin NULL 0 게이트 · ETP 제외 필터 · 형식 무결성 | infra INV (문법) | `bash -n scripts/smoke-relay.sh` | ❌ W0 | ✅ |
| 15-10-03 | 15-10 | 4 | RELAY-02 | T-15-34, T-15-35 | 백필 후 커버리지 0 NULL · 우선주 isin ≠ 보통주 isin | integration | `bash scripts/smoke-relay.sh --check-isin` | ❌ W0 | ❌ ISIN-2 FAIL — 활성 주식 2,749 중 isin NULL **42종목**. ISIN-1·3a·3b 는 PASS |
| 15-11-01 | 15-11 | 4 | RELAY-01 | T-15-37, T-15-SC | `?tab=` 화이트리스트 폴백 · shadcn 공식 registry만 · 신규 npm 의존성 0 | component | `pnpm --filter webapp run typecheck` | ✅ | ✅ |
| 15-11-02 | 15-11 | 4 | RELAY-01 | T-15-38, T-15-39 | 기존 섹션 파일 무변경 · setStockContext/notFound 승격 보존 | unit + build | `pnpm --filter webapp test` | ✅ | ✅ |
| 15-11-03 | 15-11 | 4 | RELAY-01 | T-15-38 | 4탭 진입·딥링크·뒤로가기·기존 섹션 렌더 회귀 | e2e | `pnpm --filter webapp exec playwright test stock-detail-tabs stock-detail-chart` | ❌ W0 | ✅ (15-11 실행 · worktree 에 `.env.local` 부재로 15-20 재실행 없음) |
| 15-12-01 | 15-12 | 4 | RELAY-01 | T-15-04, T-15-42, T-15-10 | 토큰 URL 미노출 · `.trim()` env · 4401 재시도 금지 · 재접속 상한 | unit | `pnpm --filter webapp run typecheck` | ✅ | ✅ |
| 15-12-02 | 15-12 | 4 | RELAY-01 | T-15-40, T-15-41, T-15-10 | 종목·거래소 전환 시 unsub + 리셋 · 깨진 프레임 스킵 · 4401 재연결 0 | unit | `pnpm --filter webapp test relay-socket` | ❌ W0 | ✅ |
| 15-12-03 | 15-12 | 4 | RELAY-01 | T-15-43 | 상태 라벨 단일 정본 · 상태 표면에 방향색 금지 · aria-live | component | `pnpm --filter webapp test relay-status-bar` | ❌ W0 | ✅ |
| 15-13-01 | 15-13 | 4 | RELAY-01 | T-15-44, T-15-45, T-15-14 | `--primary` 미사용(토큰 충돌) · sr-only 단계 라벨 · 바 폭 transition 금지 · reduced-motion | component | `pnpm --filter webapp run typecheck` | ✅ | ✅ |
| 15-13-02 | 15-13 | 4 | RELAY-01 | T-15-44, T-15-45 | `▲매수`/`▼매도` 부호 병기 · 링버퍼 200 · 배치 단위 1회 플래시 | component | `pnpm --filter webapp run typecheck` | ✅ | ✅ |
| 15-13-03 | 15-13 | 4 | RELAY-01 | T-15-21, T-15-40, T-15-43 | 게이트 카드로 본문 교체(섹션 숨김 금지) · 종목 전환 리셋 · 출처 라벨 | component | `pnpm --filter webapp test` | ✅ | ✅ |
| 15-14-01 | 15-14 | 4 | RELAY-01 | T-15-21, T-15-44 | 권한 없음 게이트 · stale 유지 · 색 비의존 라벨 | component | `pnpm --filter webapp test orderbook` | ❌ W0 | ✅ |
| 15-14-02 | 15-14 | 4 | RELAY-01 | T-15-28, T-15-21, T-15-46 | 로컬 스텁만 사용(실서버 문자열 0) · 매핑 없음/비로그인 게이트 · 픽스처 누수 0 | e2e | `pnpm --filter webapp exec playwright test orderbook` | ❌ W0 | ✅ (15-14 실행 · 동) |
| 15-14-03 | 15-14 | 4 | RELAY-01 | T-15-42, T-15-04 | Vercel env trailing newline 부재 · wss URL 쿼리에 토큰 없음 | **manual** + e2e | `pnpm --filter webapp exec playwright test orderbook stock-detail-tabs` | ❌ W0 | ✅ (15-14 실행 + 15-20 에서 `vercel env ls` Production·Preview 재확인) |
| 15-15-01 | 15-15 | 5 | RELAY-01 | T-15-16 | append-only 규약 검토 후 재커밋 · `--check` 무변경 · 기존 테스트 회귀 0 | **[BLOCKING]** 정합 | `bash /Users/alex/repos/gh-trade/server/scripts/sync-relay-schema.sh --check && pnpm --filter @gh-radar/relay test` | ✅ | ✅ |
| 15-15-02 | 15-15 | 5 | RELAY-01 | T-15-07 | 계좌 벡터 256 클램프 · account_no 길이 1~12 · mode "2" 미사용 | unit | `pnpm --filter @gh-radar/relay test envelope` | ❌ W0 | ✅ |
| 15-15-03 | 15-15 | 5 | RELAY-01 | T-15-01, T-15-10, T-15-15 | 선언 목록 대조 후에만 Ready · 계좌 0건 재시도 0 · 로그 계좌 마스킹 | unit | `pnpm --filter @gh-radar/relay test account-declare` | ❌ W0 | ✅ |
| 15-16-01 | 15-16 | 5 | RELAY-01 | T-15-02, T-15-07 | 계좌 데이터가 그 userId 소켓에만 · holdings/unfilled 상한 클램프 | unit | `pnpm --filter @gh-radar/relay test account-state` | ❌ W0 | ✅ |
| 15-16-02 | 15-16 | 5 | RELAY-02 | T-15-14, T-15-09, T-15-49 | 단일 문자 변환 함수 1곳 · 수량 0 조립 차단 · 수신 콜백 DB await 0 · sideTrusted | unit | `pnpm --filter @gh-radar/relay test envelope` | ❌ W0 | ✅ |
| 15-16-03 | 15-16 | 5 | RELAY-02 | T-15-01, T-15-02, T-15-48 | `account_no ∈ 세션 계좌 목록` 403 · 세션 없음 409 · 체결 통보 주문자 전용 · timeout 미단정 | unit | `pnpm --filter @gh-radar/relay test order-api` | ❌ W0 | ✅ |
| 15-17-01 | 15-17 | 5 | RELAY-02 | T-15-06, T-15-48 | `X-Relay-Secret` 주입 · 사설 대역 가드 · ORDER_TIMEOUT 문구에 "실패" 금지 | unit | `pnpm --filter @gh-radar/server run typecheck` | ✅ | ✅ |
| 15-17-02 | 15-17 | 5 | RELAY-02 | T-15-01, T-15-05, T-15-50 | `WHERE user_id` 명시 필터 · `dma_password_enc` 미조회 · isin 서버 조회(브라우저 미신뢰) | unit | `pnpm --filter @gh-radar/server run build` | ✅ | ✅ |
| 15-17-03 | 15-17 | 5 | RELAY-02 | T-15-03, T-15-01, T-15-14, T-15-07 | 401/403/409/422/502/503 구분 · 한도 없음 회귀 케이스 · relay 원문 미노출 | unit (supertest) | `pnpm --filter @gh-radar/server test orders` | ❌ W0 | ✅ |
| 15-18-01 | 15-18 | 5 | RELAY-02 | T-15-14, T-15-52, T-15-53, T-15-48 | 단일 제출 버튼 · 매매 구분 자동 전환 금지 · 취소 채움 금지 · timeout 미단정 | component | `pnpm --filter webapp run typecheck` | ✅ | ✅ |
| 15-18-02 | 15-18 | 5 | RELAY-02 | T-15-54, T-15-53, T-15-15 | 미체결 잔량 0 취소 버튼 미렌더 · 취소 테두리 · 계좌번호 화면 전체 표시(D2) | component | `pnpm --filter webapp test` | ✅ | ✅ |
| 15-18-03 | 15-18 | 5 | RELAY-02 | T-15-14, T-15-14b, T-15-48 | 확인 다이얼로그 기본 포커스 취소 · 한도 없음 고지 · 중복 제출 1회 | component | `pnpm --filter webapp test order-panel account-panel` | ❌ W0 | ✅ |
| 15-19-01 | 15-19 | 5 | RELAY-02, RELAY-03 | T-15-55, T-15-06 | env 전량 치환 함정 경고 + 대조 단계 · 비밀 값 하드코딩 0 | config (문법) | `bash -n scripts/deploy-server.sh && bash -n scripts/smoke-relay.sh` | ❌ W0 | ✅ |
| 15-19-02 | 15-19 | 5 | RELAY-02, RELAY-03 | T-15-12, T-15-55, T-15-01 | `/api/orders` 409(503 아님) · 기존 env 소실 0 · INV-7 재확인 · INV-10 RLS 회귀 감지 | infra INV | `bash scripts/smoke-server.sh && bash scripts/smoke-relay.sh` | ❌ W0 | ✅ |
| 15-19-03 | 15-19 | 5 | RELAY-02 | T-15-28, T-15-14, T-15-04 | mock 전용(실서버 문자열 0) · 가격 0 거부 층 기록 · 로그 평문 비밀 0 | **manual** + 산출물 검증 | `test -f .planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/15-MOCK-ORDER-EVIDENCE.md` | ❌ W0 | ✅ |
| 15-20-01 | 15-20 | 6 | RELAY-01, RELAY-02, RELAY-03 | T-15-28 | 실서버 접속은 사용자 결정으로만 — 기본 경로는 미수행 | **manual** (decision) | `test -f .planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/15-LIVE-VERIFICATION.md` | ❌ W0 | ✅ |
| 15-20-02 | 15-20 | 6 | RELAY-01, RELAY-02 | T-15-14, T-15-47, T-15-11, T-15-15 | (조건부) 체결 0건 · WinForms 와 다른 user_id · split-tunnel 유지 · 계좌 뒤 4자리만 | **manual** + 산출물 검증 | `grep -riE 'kbs124\|passwd=\|password:' .../15-LIVE-VERIFICATION.md \| wc -l` == 0 | ❌ W0 | ✅ |
| 15-20-03 | 15-20 | 6 | RELAY-01, RELAY-02, RELAY-03 | T-15-56, T-15-15 | 증거 없는 ✅ 금지 · STATE/README 비밀 값 0건 | 집계 | `grep -c 'SC-8' .planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/15-LIVE-VERIFICATION.md` | ❌ W0 | ✅ |

*Status: ⬜ pending · ✅ green · ❌ red(미충족) · ⚠️ 부분 충족 또는 재실행 불가*

**Status 열 출처 (15-20 갱신, 2026-09-06).** 괄호 없는 `✅` 는 **15-20 이 그 명령을 직접 재실행해** green 을 확인한 것이다. 괄호가 붙은 행은 15-20 에서 재실행하지 못했고 원 plan 의 실행 결과를 인용한 것이며, 재실행하지 못한 이유를 함께 적었다(Playwright 는 이 worktree 에 `webapp/.env.local`·`.env.test.local` 이 없어서, supabase CLI·docker build 는 도구/권한 미가용). `15-10-03` 은 실제로 **실패**한다 — 억지로 초록으로 만들지 않았다. 집계와 해소 조건은 `15-LIVE-VERIFICATION.md` 가 정본이다.
*File Exists 열: `❌ W0` = Wave 0 에서 그 plan 의 태스크가 테스트/스크립트를 함께 만든다 · `✅` = 기존 인프라로 즉시 실행 가능*
*요구사항→테스트 매핑 원천: `15-RESEARCH.md` §Validation Architecture "Phase Requirements → Test Map" (RELAY-01 14행 · RELAY-02 8행 · RELAY-03 7행).*
*위협 ID 원천: 각 PLAN.md 의 `<threat_model>` STRIDE 등록부 (T-15-01 ~ T-15-56, T-15-SC).*

**Nyquist 연속성:** 59개 태스크 전부에 `<automated>` 명령이 있다. `manual` 표기 태스크(15-07-02/03, 15-14-03, 15-19-03, 15-20-01/02)도 **사후 산출물 검증을 자동화**해 3연속 무검증 구간이 발생하지 않는다.

---

## Wave 0 Requirements

테스트 인프라는 각 plan 의 첫 태스크가 함께 만든다(별도 Wave 0 plan 없음). 아래 산출물이 생성되면 완료:

- [x] `relay/vitest.config.ts` (15-01-01) — server 설정 복제, `test` = `vitest run`
- [x] `relay/tests/setup.ts` (15-01-01) — 필수 env 더미 주입
- [x] `relay/tests/helpers/fake-gateway.ts` (15-02-03) — `net.createServer` 스텁(로그인 응답·시세 푸시·강제 종료·쓰레기 프레임 주입·핑 카운트)
- [x] `relay/tests/helpers/ws-client.ts` (15-02-03) — 인증 왕복 + close 코드 단언 헬퍼
- [x] `relay/src/dma/__tests__/codec.test.ts` (15-02-01)
- [x] `relay/src/dma/__tests__/envelope.test.ts` (15-02-02)
- [x] `relay/tests/dma-client.test.ts` (15-03-01) · `relay/tests/session.test.ts` (15-03-02) · `relay/tests/session-manager.test.ts` (15-03-03)
- [x] `relay/tests/hub.test.ts` (15-04-01) · `relay/tests/credentials.test.ts` (15-04-02) · `relay/tests/fanout.test.ts` (15-04-03)
- [x] `relay/tests/order-api.test.ts` (15-05-02, 15-16-03 확장)
- [x] `relay/tests/account-state.test.ts` (15-16-01) · `relay/tests/account-declare.test.ts` (15-15-03)
- [x] `server/tests/routes/orders.test.ts` (15-17-03)
- [x] `webapp/src/lib/__tests__/relay-socket.test.ts` (15-12-02) — **co-located 경로 필수**
- [x] `webapp/src/components/orderbook/__tests__/relay-status-bar.test.tsx` (15-12-03)
- [x] `webapp/src/components/stock/__tests__/orderbook.test.tsx` (15-14-01)
- [x] `webapp/src/components/orderbook/__tests__/order-panel.test.tsx` · `account-panel.test.tsx` (15-18-03)
- [x] `webapp/e2e/fixtures/relay.ts` + `webapp/e2e/specs/orderbook.spec.ts` (15-14-02) — 로컬 relay + 스텁 게이트웨이 기동 픽스처
- [x] `webapp/e2e/specs/stock-detail-tabs.spec.ts` (15-11-03)
- [x] `scripts/smoke-relay.sh` (15-08-02, 15-10-02·15-19-01 확장) — INV-1~10 + `--check-isin`
- [x] 프레임워크 설치: **불요** — vitest/Playwright 기설치. relay 워크스페이스에 vitest devDependency 추가만(15-01-01)

---

## Manual-Only Verifications

| Behavior | Requirement | Task | Why Manual | Test Instructions |
|----------|-------------|------|------------|-------------------|
| kbs124 VPN 선검증(연결·split-tunnel 라우팅·출발지 IP 제한·Mac 동시 세션) | RELAY-03 | 15-07-02 | KB 계정 잠금 위험 — 수동 ≤3회, 실패 시 자동 재시도 없이 중단(D-03) | `infra/relay/README.md` §D-03 선검증 체크리스트 7항목. 직렬 콘솔을 별도 터미널에 미리 열어 둔다. 결과를 `15-VPN-PREFLIGHT.md` + STATE 에 기록. 게이트웨이는 `nc -zv 10.41.1.120 9100` 도달성만(D-27) |
| 사용자 DNS `dma.jx1.io` A 레코드 + Let's Encrypt 발급 | RELAY-03 | 15-07-03 | 사용자 보유 도메인, 외부 좌표(D-06) | 고정 IP 전달 → 사용자 A 레코드 추가 → `dig` 확인 **후** Caddy 기동 → INV-5. 실패 시 반복 금지(rate limit), staging CA 우회 |
| Vercel `NEXT_PUBLIC_RELAY_WS_URL` 등록 | RELAY-01 | 15-14-03 | Vercel 대시보드 = 외부 좌표 | 등록 후 `vercel env pull` 로 trailing newline 검증(`tail -c1 \| xxd -p` 가 `0a` 아님). `vercel pull → build → deploy --prebuilt` 수동 배포 |
| mock 브로커 가격 0 주문 거부 경로 | RELAY-02 | 15-19-03 | 로컬 mock gh-trade-server 기동 필요(D-40) | `run-mac.sh` mock + `inject_b6.py --send` + 정상 접수/가격 0 거부/취소/목록 복원 4케이스. **어느 층에서 거부됐는지** 기록. `15-MOCK-ORDER-EVIDENCE.md` |
| 실서버(10.41.1.120)·실계좌 접속 | RELAY-01/02 | 15-20-01, 15-20-02 | D-27 — 사용자 지시 전 금지 | `checkpoint:decision` 으로 A/B/C 선택. C안은 체결되지 않을 지정가 1주 → 즉시 취소, **체결 0건**. 기본 경로는 미수행 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (59/59)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags (`relay` `test` 스크립트가 `vitest run` 임을 15-01-01 acceptance 가 강제)
- [x] Feedback latency < 90s (quick run ~20s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready — 실행 시작 시 Status 열을 갱신하고, Wave 0 산출물이 전부 생성되면 `wave_0_complete: true` 로 바꾼다.

### 종결 판정 (15-20, 2026-09-06)

- [x] **Wave 0 산출물 25종 전부 존재** → `wave_0_complete: true` 로 전환. 파일 존재를 하나씩 `test -f` 로 확인했다(25/25 OK).
- [x] Status 열 59행 갱신 완료 — `✅` **57** (그중 6행은 15-20 재실행 불가로 원 plan 결과 인용) · `⚠️` **1** (15-08-02) · `❌` **1** (15-10-03)
- [x] **Manual-Only Verifications 5종 처리:** VPN 선검증(15-07-02) 통과 · DNS/인증서(15-07-03) 통과 · Vercel env(15-14-03) 등록 확인 · mock 가격 0 거부(15-19-03) 기록 · **실서버 접속(15-20-01/02) = A안 `skip-live` 로 미수행**
- [x] `15-LIVE-VERIFICATION.md` 에 SC-1~SC-8 집계 완료 — ✅ 3 / ⚠ 5 / ❌ 0

**남은 red 1건:** `15-10-03` (`smoke-relay.sh --check-isin` ISIN-2). 활성 주식 2,749 중 isin NULL 42종목. 근본 원인은 `gh-radar-master-sync` 의 `basDd` 선재 결함이며 phase 15 범위 밖이다 — `deferred-items.md` 와 `15-LIVE-VERIFICATION.md` §4-C·§5-4 에 이관했다.
