# Phase 08 POC — 프록시 + 본문 수집 경로 실증 결과

**일자:** 2026-04-18
**Plan:** 08-00 (POC: proxy + DOM)
**상태:** ✅ Complete — 옵션 5 채택 (JSON API 직접 사용, RESEARCH 가정 무효화)

---

## 1. 프록시 서비스 선정

**선택:** Bright Data Web Unlocker — gh-radar 전용 zone **`gh_radar_naver`**
**결정일:** 2026-04-18
**월 예산:** 사용자 기존 Bright Data 계약 흡수 — gh-radar 추가 비용 = 144K req/mo × Web Unlocker pay-per-request 단가 (~$1/1K) ≈ **$144/mo** (배치만, body fetch 불필요)
**결정 근거:**
- 사용자가 weekly-wine-bot (`zone=wine_scraper`) 에서 Web Unlocker 운영 중 — 신규 가입 마찰 0
- 서비스 격리 위해 gh-radar 전용 zone `gh_radar_naver` 신설 (사용량 분리 모니터링, 차단 영향 격리)
- 5종목 5/5 HTTP 200 확인 (`country=kr` 파라미터 필수)
- `*.naver.com` 도메인 화이트리스트 / KR country targeting / JS rendering OFF 권장 설정

**대안 시 전환 조건:** 차단률 >5% 2일 연속 발생 시 (a) Bright Data 자체 retry 옵션 활성화 → (b) Browser API zone (JS rendering, 10× credit) 으로 escalate.

**약관 확인:** Bright Data Web Unlocker 는 합법 데이터 수집 목적의 commercial 사용 명시 허용 (https://brightdata.com/legal/terms-of-service §3 — "lawful data collection"). 개인 프로젝트의 공개 페이지 스크래핑은 약관 범위 내.

**환경변수 (Plan 08-02/08-06 에서 사용):**
- `BRIGHTDATA_API_KEY` — 계정 token (weekly-wine-bot 과 공유 가능)
- `BRIGHTDATA_ZONE=gh_radar_naver`

---

## 2. HTTP 성공률 / 인코딩

**5종목 × 2회 = 10 req:** HTTP 200 = **10/10** (100%)

| 종목 | HTTP | latency | bytes |
|------|------|---------|-------|
| 005930 (삼성전자) | 200 | 2.95s | 168,096 |
| 373220 (LG에너지솔루션) | 200 | 2.48s | 167,458 |
| 035720 (카카오) | 200 | 2.98s | 166,641 |
| 247540 (에코프로) | 200 | 2.55s | 168,039 |
| 068270 (셀트리온) | 200 | 3.02s | 169,891 |

**인코딩:**
- `finance.naver.com/item/board.naver` — Bright Data 가 EUC-KR → UTF-8 자동 디코딩 (file output: `UTF-8 text`)
- `stock.naver.com/api/community/...` — 원본이 UTF-8 JSON
- **iconv-lite 도입 불필요** (RESEARCH Pitfall 3 해소)

**파라미터 핵심:** `country=kr` 없이 호출하면 Naver 가 "페이지를 찾을 수 없습니다" 에러 페이지(2.7KB) 반환. `country=kr` 추가 시 정상 응답 (~168KB).

---

## 3. DOM selector 실증 결과 — **무효 / 폐기**

RESEARCH §"네이버 종목토론방 DOM 구조" 가 가정한 cheerio 셀렉터는 **사용하지 않습니다**. 본 POC 가 §4 에서 발견한 JSON API 가 동일 데이터를 더 간단/안정적으로 제공합니다.

참고용으로 HTML 목록 페이지 selector 도 실증 통과는 했음:
- `<a href="/item/board_read.naver?code={code}&nid={nid}&page=1">` 패턴 — 모든 5종목에서 19~20 링크 추출 성공
- nid 9자리 숫자 (RESEARCH 추정 6~12자리 부합)

하지만 **본문(body) 가 SSR 안 됨** 이 결정적 문제:
- 데스크탑 `board_read.naver` 페이지는 본문을 `<iframe src='https://m.stock.naver.com/pc/...'>` 로 분리
- iframe 페이지는 Next.js SPA — `__NEXT_DATA__` JSON 에도 본문 미포함, 클라이언트 JS 가 별도 fetch
- CONTEXT D5/D10 (body 2줄 preview) 충족 불가 — HTML 경로로는 옵션 1 (목록만) 강제

→ 옵션 5 (JSON API) 로 우회.

---

## 4. body 수집 경로 확정 — **옵션 5 (Discussion JSON API)**

### 발견 경위
Playwright 로 `https://stock.naver.com/domestic/stock/005930/discussion?chip=all` 페이지의 XHR 트래픽 캡처 (`/tmp/poc-naver/inspect-v2.mjs`). SPA 가 호출하는 community API endpoint 발견.

### 채택 endpoint

```
GET https://stock.naver.com/api/community/discussion/posts/by-item
    ?discussionType=domesticStock
    &itemCode={code}
    &isHolderOnly=false              ← required (zod)
    &excludesItemNews=false          ← required (zod)
    &isItemNewsOnly=false            ← required (zod)
    &isCleanbotPassedOnly=false
    &pageSize=50
```

응답: JSON (`Content-Type: application/json; charset=utf-8`), 평균 ~210KB / 50 posts.

⚠️ **필수 파라미터 발견 (POC 추가 검증):** `isHolderOnly`, `excludesItemNews`, `isItemNewsOnly` 누락 시 API 가 207B `{"detailCode":"invalid_type,...","fieldErrors":{...}}` 반환. → Plan 08-02 fetcher 의 URL builder 가 이 3 파라미터를 항상 명시 (default false) 해야 함. zod 스키마로 client-side 강제 권장.

### 필드 매핑 (CONTEXT D10 갱신)

| CONTEXT 필드 | API 필드 | 비고 |
|--------------|----------|------|
| `nid` | `id` | 9자리 string |
| `title` | `title` | UTF-8 plain |
| `body` (plaintext) | `contentSwReplacedButImg` | 욕설 필터 + 이미지 제거 |
| `body_html` | `contentSwReplaced` | 욕설 필터 + `<br>` 등 일부 HTML 유지 |
| `author` | `writer.nickname` | |
| `author_type` | `writer.profileType` | `normal` / `itemNews` (뉴스 봇 필터) |
| `posted_at` | `writtenAt` | ISO 8601 KST (offset 없음 — `+09:00` 가정) |
| `comment_count` | `commentCount` | |
| `recommend_count` | `recommendCount` | |
| `view_count` | — | **API 미제공** — D10 에서 제거 |
| `is_cleanbot_passed` | `isCleanbotPassed` | 스팸 필터 D11 의 1차 시그널 |

### 옵션 비교 — 채택 근거

| 옵션 | 본문 수집 | 호출 수 / 50 posts | 비용 | 채택 |
|------|-----------|-------------------|------|------|
| 1 (HTML 목록만) | ❌ 본문 없음 | 1 (HTML) | 144K/mo | ❌ — D5 위배 |
| 2 (HTML + body fetch) | ❌ iframe SPA | 1 + 5 (상세 5건) | 862K/mo | ❌ — body SSR 안 됨 |
| 3 (JS rendering) | ✅ | 1 (Browser API) | 10× credit | ❌ — 운영 복잡도 + zone 추가 |
| **5 (JSON API)** | ✅ 전문 | **1** | **144K/mo** | **✅** |

### 월 요청량 영향 (옵션 5)

배치 주기 30분 × 24시간 × 30일 × 100 종목 = 144K req/mo (고정).
body fetch 추가 호출 0. 종목 수 1000 까지 확장해도 1.44M req/mo (Bright Data 단일 zone tier 내).

---

## 5. 차단율 관측

POC 기간 (2026-04-18, ~45분 집중 실험): **40+ 요청 (`wine_scraper` 초기 검증 + `gh_radar_naver` 신규 zone 5종목 × 2회), HTTP 403/429 = 0건.**

신규 zone `gh_radar_naver` 5종목 검증:

| 종목 | HTTP | latency | bytes | posts |
|------|------|---------|-------|-------|
| 005930 | 200 | 2.85s | 262,796 | 50 |
| 373220 | 200 | 2.93s | 133,156 | 50 |
| 035720 | 200 | 3.07s | 164,900 | 50 |
| 247540 | 200 | 2.64s | 293,896 | 50 |
| 068270 | 200 | 3.47s | 548,287 | 50 |

48h 장기 관측은 **Plan 08-06 (deploy + smoke)** 에서 production Cloud Run Job 실행 로그로 대체 검증. 사용자가 weekly-wine-bot 에서 동일 Bright Data Web Unlocker 제품을 wine-searcher 도메인으로 안정 운영 중인 점도 추가 신뢰 시그널.

**미달 시 대응:** Plan 08-02 worker 의 retry 로직이 429/503 발생 시 exponential backoff 적용. 24h 누적 차단율 >5% 발생 시 alert (Plan 08-06 의 monitoring 항목).

---

## 6. 비용 실측

POC 기간 credit 소모: 30~40 requests (estimate, Bright Data dashboard 확인은 사용자 책임).

**월 환산 예측 (옵션 5 채택):**
- 100 종목 × 30분 주기 = 4,800 req/일 = **144K req/월**
- Bright Data Web Unlocker 단가 (~$1/1K req 가정): **~$144/월**
- 사용자 기존 계약 내 흡수 가능 — gh-radar 신규 비용 없음

**판정:** 🟢 green — 예산 여유 大. 종목 수 200 ~ 500 까지 확장해도 안전.

---

## 7. fixture 캡처

다음 산출물:

1. **`workers/discussion-sync/tests/helpers/naver-board-types.ts`** — `NaverDiscussionApiResponse` / `NaverDiscussionPost` / `NaverDiscussionWriter` 타입 (실측 응답 기반).

2. **`workers/discussion-sync/tests/helpers/naver-board-fixtures.ts`** — 5 posts × 2 종목 fixture (`zone=gh_radar_naver` 캡처):
   - `NAVER_BOARD_JSON_SAMPLE_ACTIVE` (005930, 활발)
   - `NAVER_BOARD_JSON_SAMPLE_QUIET` (247540, 적당)
   - 트림 사유: 50 posts × 2 = ~600KB → diff 가독성을 위해 5 posts 로 축소. 전체는 `/tmp/poc-naver/zone-{code}-v2.json` 에 보존 (POC 기간만).

`08-01-shared-types-scaffold` 의 sanitize 헬퍼와 `08-02-discussion-sync-worker` 의 parser/mapper 테스트가 본 fixture 를 import.

---

## 8. Plan 영향 (α 경로 — small-diff revision)

| Plan | 변경 |
|------|------|
| 08-01 | shared types: `Discussion` interface 의 `body` 필드를 `string \| null` 유지하되 nullable 사유를 "API 응답에 contentSwReplacedButImg 없을 때" 로 명시. `discussion-sanitize.ts` 헬퍼는 그대로 (HTML → plaintext 변환 필요). |
| 08-02 | `scraper/fetchBoard.ts` → `scraper/fetchDiscussions.ts` (URL 만 교체). `scraper/parseBoardHtml.ts` → `scraper/parseDiscussionsJson.ts` (cheerio 제거, JSON.parse + zod schema). `scraper/fetchPostBody.ts` 삭제 — 불필요. cheerio dependency 제거. |
| 08-03 | server route 도 동일 endpoint 호출. 파싱 로직 단순화. cheerio import 제거. |
| 08-06 | smoke 스크립트의 차단율 검증을 production Cloud Run Job 로그 기반으로 (POC 의 12h 자동 cron 대체). |

---

## 9. 결정 요약 (한 줄)

**Bright Data Web Unlocker (zone=`gh_radar_naver`, country=kr) → `stock.naver.com/api/community/discussion/posts/by-item` JSON API → 본문 포함 50 posts 한 번에 수집. cheerio 불필요, iconv-lite 불필요, body fetch 불필요. 월 비용 ~$144 (사용자 기존 Bright Data 계약 내 흡수).**
