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
*Phase: 11-co-movement-candidates-top-k*
*Logged: 2026-06-11*
