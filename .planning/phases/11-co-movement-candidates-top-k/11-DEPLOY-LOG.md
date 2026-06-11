# Phase 11 — DEPLOY LOG (Plan 03: 동조 후보 읽기 라우트)

server 재배포 + prod curl 검증 기록. 새 라우트 `GET /api/stocks/:code/co-movement` 가 production 활성됨을 입증한다 (lessons: 코드 green ≠ production 동작 — 옛 이미지 SHA 면 404).

## Plan 03 — server 재배포

| 항목 | 값 |
|------|-----|
| 서비스 | `gh-radar-server` (Cloud Run, region `asia-northeast3`) |
| 재배포 전 revision | `gh-radar-server-00024-9kj` (SHA `73be416`) |
| 1차 배포 revision | `gh-radar-server-00025-z7b` (SHA `cfc6387`) — 앵커 혼입 버그 발견 |
| **최종 활성 revision** | **`gh-radar-server-00026-hqb`** (SHA `1dc1091`, 100% traffic) |
| image digest | `asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/server@sha256:e45bd1bc31b6aa46a6a8572b0c9cda29eb3e7e4dfa5b56e16124bd398a30f26f` |
| env 주입 | 현 서비스 env 추출 재사용(이미지 SHA 만 갱신). `DISCUSSION_CLASSIFY_ENABLED=false` 유지(회귀 함정 — MEMORY project_claude_haiku_cost_classify) |
| 빌드 | `docker build --platform=linux/amd64` (deploy-server.sh) |
| smoke (INV-1~9) | 최종 배포 **9/9 PASS** (rate-limit INV-8 포함) |
| prod URL | `https://gh-radar-server-fnbhvevuva-du.a.run.app` |

> 1차 배포(`00025`) prod curl 에서 앵커(004090)가 자기 co-movement 후보 #1 로 노출되는 회귀 발견 → `deriveAnchor` 휴리스틱(다중 테마 교집합) 추론 실패. 라우트가 아는 진실값 `:code` 를 `computeComovement` 에 명시 전달하도록 수정(`1dc1091`) 후 `00026` 재배포로 해소.

## prod curl 검증 (Plan Task 3b~3d)

### 3b. `GET /api/stocks/004090/co-movement?k=8` (한국석유 앵커)

- HTTP **200**
- 응답 **객체** `{ "candidates": [...] }` — `jq type` = `"object"`, `has("candidates")` = `true` (배열 아님, 계약 드리프트 회피)
- candidates 길이 **8**, **strength desc 정렬** 검증 통과 (`[.candidates[].strength] | . == (sort|reverse)` = true)
- **앵커 004090 제외 확인** (수정 후) — candidates 에 자기 코드 미포함
- **흥구석유(024060) candidates[0]** (최상위) — fixture ground truth(004090↔024060 co-surge=9) 일치
- candidates[0] 전 필드 존재: `code/name/market/liveChangeRate/confD0/strength/isTrailing/sharedThemes/coSurgeCount/sampleConfidence`

top 3 (compact):
```json
[
  {"code":"024060","name":"흥구석유","market":"KOSDAQ","liveChangeRate":2.27,"confD0":0,"strength":0.6558,"isTrailing":false,"sharedThemes":[],"coSurgeCount":9,"sampleConfidence":"low"},
  {"code":"000440","name":"중앙에너비스","market":"KOSDAQ","liveChangeRate":2.61,"confD0":0,"strength":0.5925,"isTrailing":false,"sharedThemes":[],"coSurgeCount":7,"sampleConfidence":"low"},
  {"code":"003280","name":"흥아해운","market":"KOSPI","liveChangeRate":0.22,"confD0":0,"strength":0.5281,"isTrailing":false,"sharedThemes":[],"coSurgeCount":5,"sampleConfidence":"low"}
]
```

> 비고: 004090 앵커의 상위 후보들은 현재 **co-surge 전용**(`sharedThemes:[]`, `confD0:0`, `coSurgeCount` 채움)으로 나타난다 — 한국석유와 동일 활성 테마를 공유하지 않으나 ≥10% 바를 함께 낸 이웃들이 랭킹됨. RESEARCH §두 경로 결합(D-03 evidence 분리)대로 정상. `liveChangeRate` 는 실시간 stock_quotes 조인값(흥구석유 2.27% 등) — 라이브 데이터 결합 확인.

### 3c. 빈 상태 — `GET /api/stocks/005935/co-movement` (삼성전자우)

- HTTP **200**
- 응답 body: `{"candidates":[]}` — 테마·co-surge 둘 다 없는 종목은 빈 배열 (T-11-12 quiet)

### 3d. k 클램프 — `GET /api/stocks/004090/co-movement?k=999`

- HTTP **200**
- candidates 길이 **41** (≤ 50 — Math.min(k,50) 클램프 + 후보 총수 41. T-11-10 DoS 가드 동작)

## 검증 환경 비고

- prod curl 은 사용자 사전 승인 읽기(AskUserQuestion 2026-06-11 — "배포 진행"). 직접 service-role DB 쿼리는 미승인이라 미수행(API 엔드포인트 검증으로 충족).
- 1차 검증 시 smoke 의 rate-limit 테스트(201 req)가 per-IP 윈도우를 소진해 일시 429 — 윈도우 클리어 후 재검증(첫 시도 200) 완료.

---

## Plan 04 — co-movement-sync Job + Scheduler 배포

얇은 `co-movement-sync` 워커(단일 cycle — `rebuild_comovement(24)` RPC 1줄)를 Cloud Run Job + Cloud Scheduler 로 배포. EOD candle-sync 이후 야간 1회 멱등 full-rebuild(TRUNCATE+INSERT)로 사전계산 테이블(theme_comovement / cosurge_edges) 갱신. 사용자 EXPLICIT 승인(AskUserQuestion 2026-06-11 — "승인 — 배포 진행", cron 기본값 `0 2 * * 2-6` 그대로 승인).

| 항목 | 값 |
|------|-----|
| Cloud Run Job | `gh-radar-comovement-sync` (region `asia-northeast3`) |
| image | `asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/co-movement-sync:d0c7f9c` |
| image digest | `sha256:7110f22b1fa463e1d70a50898818f013b09f48c08086d56d0f6d03e4b7c86d50` |
| task-timeout | **180s** (11-CALIBRATION.md 확정 — 실측 ~25s ×7 마진, DB role 천장 600s 하위) |
| memory / cpu | 512Mi / 1, `--max-retries=0` (멱등 full-rebuild — 재시도 불필요) |
| Scheduler | `gh-radar-comovement-sync-nightly`, cron **`0 2 * * 2-6`** (Asia/Seoul — 화~토 새벽 2시, 전 영업일 EOD 확정 후) |
| Scheduler 인증 | `--oauth-service-account-email=gh-radar-scheduler-sa` (**OAuth**, OIDC 금지 — T-11-14) |
| invoker 바인딩 | `gh-radar-scheduler-sa → run.invoker` (Job 리소스 단위, 프로젝트 단위 아님) |
| runtime SA | `gh-radar-comovement-sync-sa` — secret `gh-radar-supabase-service-role:latest` 1개만 (KRX 미바인딩, T-11-16 최소권한) |
| env | `SUPABASE_URL`(기존 candle-sync Job 재사용) / `LOG_LEVEL=info` / `APP_VERSION=d0c7f9c` / `LOOKBACK_MONTHS=24` (KRX_BASE_URL·MODE 없음) |

### smoke INV-1~5 — 6/6 PASS

| INV | 검증 | 결과 |
|-----|------|------|
| INV-1 | `gcloud run jobs execute gh-radar-comovement-sync --wait` exit 0 | PASS |
| INV-2 | Cloud Logging `jsonPayload.msg="co-movement-sync complete"` ≥1건 (최근 5분) | PASS |
| INV-3 | Cloud Logging `"co-movement-sync failed"` 0건 | PASS |
| INV-4 | theme_comovement 행수 > 0 AND cosurge_edges 행수 > 0 (service_role REST count) | PASS |
| INV-5 | Scheduler ENABLED + cron `0 2 * * 2-6` | PASS |

### Job 실행 result (jsonPayload, rebuild_comovement complete)

```
theme_comovement_rows = 5537
cosurge_edge_rows     = 9704
lookback_since        = 2024-06-11   (LOOKBACK_MONTHS=24)
rebuilt_at            = 2026-06-11T08:41:10Z
```

- REST count 재확인: `theme_comovement` content-range `0-999/5537`, `cosurge_edges` content-range `0-999/9704` — Plan 02 production 적재값(5538/9704)과 동일 자릿수(멱등 full-rebuild 일치, theme 1행 차이는 누적 OHLCV 변동 정상범위).
- T-11-16 acceptance: `gh-radar-comovement-sync-sa` → `gh-radar-supabase-service-role` accessor 1건, `gh-radar-krx-auth-key` 바인딩 **0건**(KRX 미사용 입증).

### 배포 중 deviation

1. **[Rule 3 - Blocking] 신규 SA Secret Manager IAM 전파 지연** — `setup-comovement-sync-iam.sh` 가 SA 생성 직후 secret accessor 바인딩 시 `Service account ... does not exist`(400, eventual-consistency). SA describe 로 가시성 확인 후 idempotent 스크립트 1회 재실행으로 바인딩 완료(무한 재시도 아님). 스크립트 무변경.
2. **[Rule 1 - Bug] smoke INV-4 count 추출이 CR 미제거로 빈 문자열** — `content-range: 0-999/5537\r` 의 trailing CR 때문에 `grep -oE '[0-9]+$'` 가 `$`(CR 뒤) 미스매치 → TOTAL 빈값 → FAIL(실제 데이터는 정상 적재). `tr -d '\r'` 추가로 수정(양 INV-4). 재실행 6/6 PASS.

> Scheduler 첫 자동 실행은 다음 cron(화~토 02:00 KST). smoke 는 수동 `execute --wait` 로 즉시 검증.

---

## Plan 05 — Vercel production 배포 (동조 후보 종목상세 섹션)

webapp 프론트(`gh-radar-webapp`)를 Vercel production 에 재배포. `StockComovementSection` 이 종목상세(`/stocks/[code]`) ThemeChips 다음에 마운트되어 Plan 03 라우트(`/api/stocks/:code/co-movement`)를 `apiFetch<CoMovementResponse>` 로 소비하는 UI-SPEC 채택안(변형 C + 기본3/더보기 + 빈상태 + quiet fallback)이 라이브 반영됨. 사용자 EXPLICIT 승인(orchestrator AskUserQuestion 2026-06-11 — "배포 진행").

| 항목 | 값 |
|------|-----|
| 프로젝트 | `gh-radar-webapp` (Vercel, rootDirectory `webapp`, framework nextjs) |
| 배포 경로 | **수동 3단계** `vercel pull --yes --environment=production` → `vercel build --prod` → `vercel deploy --prebuilt --prod` (MEMORY reference_vercel_frontend_deploy — ignoreCommand 가 push 배포 skip 함정 회피) |
| 인증 | `vercel whoami` = `alex-9271` (기존 세션, 재로그인 0) |
| **배포 id** | **`dpl_3zTGmDNBCRNeKFQ9FWspaFRrw2Ty`** |
| 배포 URL | `https://gh-radar-webapp-12eggp2fu-alexs-projects-eabbefc0.vercel.app` |
| readyState | **`READY`** (target `production`, build duration 16s) |
| prod alias | `https://gh-radar-webapp.vercel.app` → 본 배포(`12eggp2fu`) 매핑 확인 (`vercel inspect` alias resolve) |
| build 결과 | `Build completed successfully` — `/stocks/[code]` 68.8 kB / First Load 285 kB (동조 후보 섹션 포함), static 10/10 |
| 활성 확인 | `vercel ls --prod` 최상위 = `12eggp2fu` `● Ready` (35s, 직전 배포 대비 신규) |

### 활성 검증 (HTTP)

- `GET https://gh-radar-webapp.vercel.app/` → **307** (login gate, 정상)
- `GET https://gh-radar-webapp.vercel.app/stocks/004090` → **307** → `Location: /login?next=%2Fstocks%2F004090` (middleware 인증 게이트 — 비로그인 시 종목상세 HTML 직접 미노출)
- 404/5xx 0 — 라우팅·배포 활성 입증. 새 배포가 prod alias 에 반영됨(alias inspect = `12eggp2fu`).

> 비고: 종목상세 HTML 은 로그인 게이트(middleware 307) 뒤에 있어 동조 후보 섹션 마커를 curl 로 직접 확인 불가. CLAUDE.md / 체크포인트 전제대로 **시각 검증은 사용자 수동(로그인 후 `/stocks/004090`)** 으로 갈음 — 11-05-SUMMARY.md "사용자 수동 검증 대기" 체크리스트 참조. 배포 활성은 Vercel CLI readyState `READY` + alias resolve + HTTP 307(게이트 정상) 로 입증.

### build 비고

- 빌드 중 경고 1건: `theme-detail-client.tsx:9 'ScannerEmpty' is defined but never used` — **본 plan 무관 pre-existing 경고**(SCOPE BOUNDARY, 미수정). 동조 후보 섹션 신규 파일에는 lint/type 경고 0.

---

## Gap Fix 재배포 — WR-01 (동반율 raw 표기) + WR-04 (섹션 state 리셋)

11-REVIEW.md / 사용자 시각 검증에서 발견된 2건(11-HUMAN-UAT GAP-1)의 수정 커밋(`b7762e3` WR-01, `f2f76e3` WR-04)을 production 에 재배포. 사용자 EXPLICIT 승인(orchestrator AskUserQuestion 2026-06-11 — server + webapp 둘 다 재배포 승인).

- **WR-01:** UI "동반율 N%" 가 `conf_d0_eff`(타이트니스·앵커참여도 가중)를 노출해 실제 동반율을 ~12배 과소 표기 → 표시 필드 `confD0` 를 raw 동반율(`bestConfD0Raw`)로 교체. 가중값은 strength 랭킹 계산에만 유지. co-surge 전용 후보는 `confD0=0` → UI "—" 계약 불변.
- **WR-04:** 동적 라우트 내 종목 이동(remount 없는 props 갱신) 시 `useEffect` 시작에서 state 전체 리셋(loaded/hasError/expanded/candidates) → 에러 1회 후 섹션 영구 숨김(hasError sticky) + 이전 종목 후보 stale 노출 동시 해결.

### server 재배포 (Cloud Run)

| 항목 | 값 |
|------|-----|
| 서비스 | `gh-radar-server` (region `asia-northeast3`) |
| 재배포 전 revision | `gh-radar-server-00026-hqb` (SHA `1dc1091`) |
| **재배포 후 활성 revision** | **`gh-radar-server-00027-9rl`** (SHA `c8a98ec`, 100% traffic) |
| image digest | `asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/server@sha256:8fd16aa0ee530f3f57bdd035f8aed6dc5fbcde45793ad400ec54cb4aee757bee` |
| env 주입 | 현 서비스 env 추출 재사용(이미지 SHA 만 갱신). `DISCUSSION_CLASSIFY_ENABLED=false` 유지(회귀 함정 — MEMORY project_claude_haiku_cost_classify) |
| 빌드 | `bash scripts/deploy-server.sh` — `docker build --platform=linux/amd64` |
| smoke (INV-1~9) | **9/9 PASS** (rate-limit INV-8 포함) |
| prod URL | `https://gh-radar-server-fnbhvevuva-du.a.run.app` |

### prod curl 검증 — WR-01 raw 동반율 (재배포 전/후 비교)

`GET /api/stocks/004090/co-movement?k=8` → **HTTP 200**, 응답 객체 `{candidates:[...]}`, candidates 길이 8, **strength desc 정렬** 통과, 앵커 004090 제외 확인.

- **k=8 상위(co-surge 전용)** — `sharedThemes:[]`, `confD0:0` 유지(UI "—" 계약 불변). strength 값·순서 재배포 전과 **동일**(흥구석유 0.6558 → 중앙에너비스 0.5925 → …). 즉 표시 메트릭 변경이 랭킹에 영향 없음 입증.
- **테마 근거 후보(k=50 중 28건)** — `confD0` 가 가중값(과소표기)에서 **raw 동반율로 상승**. 동일 코드 비교:

| 코드 | 종목 | 재배포 전 confD0 (가중) | 재배포 후 confD0 (raw) | 배율 | strength(불변) |
|------|------|----:|----:|----:|----:|
| 014990 | 인디에프 | 0.0332 | **0.4000** | ×12.0 | 0.3202 |
| 007110 | 일신석재 | 0.0277 | **0.3333** | ×12.0 | 0.3413 |
| 033340 | 좋은사람들 | 0.0249 | **0.3000** | ×12.0 | 0.3191 |
| 025980 | 아난티 | 0.0192 | **0.2308** | ×12.0 | 0.2857 |
| 009270 | 신원 | 0.0064 | **0.0769** | ×12.0 | 0.3243 |

- 모든 후보 `confD0 ∈ [0,1]` 확인. strength desc 랭킹 k=8/k=50 모두 유지. co-surge 전용 후보 `confD0` 처리(UI "—" 계약) 불변.
- 비고: 재검증 첫 curl 이 직전 smoke 의 rate-limit 테스트(201 req)로 일시 429 — per-IP 윈도우 클리어 후 재검증(이후 200) 완료. 무한 재시도 아님(윈도우 대기 후 1회 성공).

### webapp 재배포 (Vercel production)

| 항목 | 값 |
|------|-----|
| 프로젝트 | `gh-radar-webapp` (rootDirectory `webapp`, nextjs) |
| 배포 경로 | **수동 3단계** `vercel pull --yes --environment=production` → `vercel build --prod` → `vercel deploy --prebuilt --prod` (ignoreCommand 함정 회피) |
| 인증 | `vercel whoami` = `alex-9271` (기존 세션) |
| **배포 id** | **`dpl_VgLsWKG9pZJJWJ65a9rMvGvoSaGN`** |
| 배포 URL | `https://gh-radar-webapp-4718byjsz-alexs-projects-eabbefc0.vercel.app` |
| readyState | **`● Ready`** (target production, build 12s) |
| prod alias | `https://gh-radar-webapp.vercel.app` → 본 배포(`4718byjsz` / `dpl_VgLsW…`) 매핑 확인 (`vercel inspect` alias resolve) |
| build 결과 | `Build completed successfully` |
| 활성 확인 | `vercel ls --prod` 최상위 = `4718byjsz` `● Ready` (43s, 직전 `12eggp2fu` 대비 신규) |

### 활성 검증 (HTTP)

- `GET https://gh-radar-webapp.vercel.app/` → **307** (login gate, 정상)
- `GET https://gh-radar-webapp.vercel.app/stocks/004090` → **307** → `Location: /login?next=%2Fstocks%2F004090` (middleware 인증 게이트)
- WR-04(섹션 state 리셋) 는 로그인 후 종목 간 이동 시각 검증이 필요 — 게이트 뒤라 curl 직접 확인 불가, 사용자 수동 검증으로 갈음. 배포 활성은 readyState Ready + alias resolve + HTTP 307 로 입증.

---
*Phase: 11-co-movement-candidates-top-k*
*Logged: 2026-06-11 (Gap Fix 재배포 append)*
