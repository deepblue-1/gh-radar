# Phase 8 POC Pivot — JSON API 전환 델타 (α 경로)

**일자:** 2026-04-18
**적용 Plan:** 08-01, 08-02, 08-03, 08-06
**원천:** `POC-RESULTS.md` §4 (옵션 5 채택) + `08-00-poc-proxy-dom-SUMMARY.md`

본 문서는 Plan 08-00 POC 결과로 **후속 plan 들이 어떻게 변경되는지**를 단일 지점에서 기록합니다. 실행자는 각 plan 의 원본 의도 위에 본 델타를 덮어쓰고 구현합니다 (충돌 시 본 문서가 우선).

---

## 핵심 전환 요약

| 항목 | 원 plan 가정 | POC 후 확정 |
|------|-------------|-------------|
| 수집 엔드포인트 | `finance.naver.com/item/board.naver?code={code}` (HTML) | `stock.naver.com/api/community/discussion/posts/by-item` (JSON) |
| 파서 | cheerio + sanitize-html | `JSON.parse` + zod schema + sanitize-html (본문 HTML → plaintext) |
| 본문 수집 | 옵션 2 (상위 5건 `board_read.naver?nid=` 추가 fetch) | 본문이 JSON 응답에 `contentSwReplacedButImg` 로 전문 포함 — **추가 fetch 불필요** |
| 인코딩 처리 | iconv-lite (EUC-KR → UTF-8) | 불필요 (API 가 UTF-8 JSON) |
| 프록시 | ScraperAPI (`PROXY_API_KEY`) | Bright Data Web Unlocker (`BRIGHTDATA_API_KEY`, `BRIGHTDATA_ZONE=gh_radar_naver`) |
| 날짜 파싱 | `'2026.04.17 14:32'` (KST) → ISO | `writtenAt` 이 이미 `2026-04-17T14:32:29` (KST, offset 없음) → `+09:00` 추가만 |
| 월 비용 | ~$149 (Startup) + body fetch 862K | ~$144 (144K req/mo, body 추가 fetch 없음) |

---

## Plan 08-01 (shared-types-scaffold) 델타

### 변경 없음 (원 plan 유지)
- `packages/shared/src/discussion.ts` (`Discussion` camelCase 타입) — DB row shape 매핑이라 API 변화와 무관
- `stripHtmlToPlaintext` — `contentSwReplaced` 에서 `<br>` 등 제거 시 여전히 필요 (Phase 9 AI 요약 파이프라인 대비)
- V-20 guardrail (shared 에 sanitize-html 도입 금지)

### 변경
- **`extractNid`**: 의미 축소 — JSON 에서 `post.id` 가 이미 있어서 파서 경로에서는 불필요. 그러나 레거시 HTML URL → nid 추출 시나리오(예: 사용자가 공유한 URL 링크 파싱) 대비 유지. Test 케이스는 그대로.
- **`parseNaverBoardDate`**: 입력 포맷 변경 — `'2026.04.17 14:32'` (HTML dot) 대신 `'2026-04-17T14:32:29'` (API ISO). 함수 시그니처/이름 유지하되, **구현은 ISO 8601 suffix 처리 중심**:
  - '2026-04-17T14:32:29' → '2026-04-17T14:32:29+09:00' (offset 추가)
  - 이미 `+09:00` 또는 `Z` 포함이면 그대로 반환
  - 레거시 dot 포맷 `'2026.04.17 14:32'` 도 tolerant 하게 파싱 (unit test 양쪽 커버)
  - 테스트 케이스: 기존 6 → 10 로 확장 (ISO 신규 4 케이스 추가)

### Task 2 (workers/discussion-sync 스캐폴드) 의존성 변경
- `package.json` 의 `dependencies`:
  - **추가/유지**: `@supabase/supabase-js`, `axios`, `sanitize-html` (server 본문 sanitize 용), `dotenv`, `p-limit`, `pino`, `@gh-radar/shared`
  - **제거**: `cheerio`, `iconv-lite` (둘 다 JSON 경로에서 불필요)
- `workers/discussion-sync/tests/helpers/naver-board-fixtures.ts` + `naver-board-types.ts` 는 **Plan 08-00 에서 이미 생성됨** — 본 plan 은 추가/수정 안 함 (git status 확인만).

---

## Plan 08-02 (discussion-sync-worker) 델타

### 파일명 변경 (small diff)
| 원본 | 신규 |
|------|------|
| `src/scraper/fetchBoard.ts` | `src/scraper/fetchDiscussions.ts` |
| `src/scraper/parseBoardHtml.ts` | `src/scraper/parseDiscussionsJson.ts` |
| `src/scraper/fetchPostBody.ts` | **삭제** (body fetch 불필요) |
| `tests/scraper/parseBoardHtml.test.ts` | `tests/scraper/parseDiscussionsJson.test.ts` |
| `tests/scraper/fetchBoard.test.ts` | `tests/scraper/fetchDiscussions.test.ts` |

### 구현 변경 핵심

#### `src/scraper/fetchDiscussions.ts`
```ts
export interface FetchDiscussionsInput {
  itemCode: string;          // '005930'
  pageSize?: number;         // default 50 (max allowed: check API, 100 ok)
  isHolderOnly?: boolean;    // default false (REQUIRED query param)
  excludesItemNews?: boolean;// default false (REQUIRED query param)
  isItemNewsOnly?: boolean;  // default false (REQUIRED query param)
  isCleanbotPassedOnly?: boolean; // default false
}

export async function fetchDiscussions(
  input: FetchDiscussionsInput,
  deps: { proxy: ProxyClient; logger: Logger }
): Promise<NaverDiscussionApiResponse> { ... }
```
- Bright Data Web Unlocker 경유 POST `https://api.brightdata.com/request`
- body: `{ zone: process.env.BRIGHTDATA_ZONE, url: targetUrl, format: 'raw', country: 'kr' }`
- `targetUrl` = `https://stock.naver.com/api/community/discussion/posts/by-item?${params}` — 필수 파라미터 3개 (`isHolderOnly`, `excludesItemNews`, `isItemNewsOnly`) 항상 포함
- Retry: 429/503/5xx exponential backoff (기존 retry 모듈 재활용)
- 응답 `Content-Type: application/json` 검증 + `JSON.parse` + zod schema 검증

#### `src/scraper/parseDiscussionsJson.ts`
```ts
export function parseDiscussionsJson(
  raw: NaverDiscussionApiResponse,
  opts: { stockCode: string; fetchedAt: string }
): ParsedDiscussion[] {
  return raw.posts
    .filter(p => p.replyDepth === 0)            // D11 스팸필터 1차: 최상위 글만
    .filter(p => p.postType === 'normal')       // itemNewsResearch (뉴스봇) 제외
    .map(p => ({
      postId: p.id,
      title: p.title,
      body: sanitizeHtml(p.contentSwReplacedButImg, { allowedTags: [] }).trim() || null,
      author: p.writer.nickname,
      postedAt: parseNaverBoardDate(p.writtenAt),  // '2026-04-17T14:32:29' → '...+09:00'
      url: `https://stock.naver.com/domestic/stock/${opts.stockCode}/discussion/${p.id}?chip=all`,
      scrapedAt: opts.fetchedAt,
      isCleanbotPassed: p.isCleanbotPassed,
    }));
}
```

#### 스팸 필터 D11 확장
`isCleanbotPassed === false` 인 post 는 drop. API 가 이미 1차 필터를 수행하므로 워커 코드가 단순.

#### 환경변수 (config.ts)
- **추가**: `BRIGHTDATA_API_KEY` (Secret Manager), `BRIGHTDATA_ZONE=gh_radar_naver`, `NAVER_DISCUSSION_API_BASE` (default `https://stock.naver.com/api/community/discussion/posts/by-item`)
- **제거**: `PROXY_API_KEY` (ScraperAPI 잔재)

### UPSERT 전략 — 변경 없음
RESEARCH §"UPSERT 전략" 의 `DO UPDATE SET scraped_at = EXCLUDED.scraped_at` 유지. `post_id` unique 보장되어 중복 glide.

### 테스트 변경
- `parseDiscussionsJson.test.ts`:
  - fixture `NAVER_BOARD_JSON_SAMPLE_ACTIVE` / `QUIET` import
  - 케이스: 5 posts → 5 ParsedDiscussion (replyDepth=0 & postType=normal 필터 통과 시)
  - edge: `contentSwReplacedButImg` 가 빈 문자열일 때 body=null
  - edge: `isCleanbotPassed=false` post 는 drop (또는 별도 flag 로 pass — 구현 선택)
- `fetchDiscussions.test.ts`:
  - mock Bright Data response (성공 JSON / 207B 에러 / 429 / 503)
  - zod 검증 실패 시 throw

---

## Plan 08-03 (server-discussion-routes) 델타

### on-demand scrape 경로 동일화
`POST /api/stocks/:code/discussions/refresh` 가 호출하는 internal scraper 는 Plan 08-02 의 `fetchDiscussions` + `parseDiscussionsJson` 을 재사용. cheerio import 완전 제거.

### 파일 변경
| 원본 | 비고 |
|------|------|
| `server/src/schemas/discussions.ts` | 그대로 — camelCase Discussion 응답 schema |
| `server/src/mappers/discussions.ts` | DB row → Discussion 매핑, 변경 없음 |
| `server/src/routes/discussions.ts` | 내부에서 cheerio 대신 `@gh-radar/discussion-sync` 의 parser 재사용 (workspace import 또는 일부 로직 shared 로 승격) |

### 환경변수
- **추가**: `BRIGHTDATA_API_KEY` / `BRIGHTDATA_ZONE` (server 도 on-demand 스크랩 시 필요)
- **제거**: `PROXY_API_KEY`

---

## Plan 08-06 (deploy-and-e2e) 델타

### Secret Manager 시크릿명 변경
| 원본 | 신규 |
|------|------|
| `gh-radar-proxy-api-key` | `gh-radar-brightdata-api-key` |
| — | `gh-radar-brightdata-zone` (값: `gh_radar_naver`) — optional, 환경변수로 하드코딩도 OK |

### IAM 스크립트 (`scripts/setup-discussion-sync-iam.sh`)
Secret 이름만 치환:
```bash
# 원: gh-radar-proxy-api-key
# 신: gh-radar-brightdata-api-key
```

### Cloud Run Job 환경변수 주입
```bash
gcloud run jobs update discussion-sync \
  --region asia-northeast3 \
  --set-secrets BRIGHTDATA_API_KEY=gh-radar-brightdata-api-key:latest \
  --set-env-vars BRIGHTDATA_ZONE=gh_radar_naver,BRIGHTDATA_URL=https://api.brightdata.com/request
```

### Threat Model T-02 ~ T-05 disposition 업데이트
- T-02 (proxy credential leak): `BRIGHTDATA_API_KEY` 로 이름만 변경. 본질 동일 (Secret Manager + SA 최소권한).
- T-05 (DoS / 예산 소진): 144K req/mo (옵션 5) 로 기준 변경. 사용자 기존 Bright Data 계약 여유.

### smoke INV 항목 추가
- INV-7: Cloud Run Job 실행 후 Bright Data dashboard 에서 `gh_radar_naver` zone credit 소모 관찰 (≈ 100 req / Job 실행 — 100 종목 × 1 호출 가정)

---

## 적용 순서

1. **본 문서 (08-POC-PIVOT.md)** commit
2. Plan 08-01/08-02/08-03/08-06 각 상단에 preamble 2줄 추가:
   ```markdown
   > **POC pivot:** 본 plan 은 `08-POC-PIVOT.md` 의 "Plan 08-XX 델타" 섹션과 함께 읽어야 합니다. JSON API 전환 후 확정된 파일명/함수명/환경변수가 그곳에 있으며 본 plan 의 원 기술 제안보다 우선합니다.
   ```
3. 각 plan 실행 시 executor 가 plan + pivot 을 모두 읽고 델타 적용

---

## 미확정 항목 (실행자 재량)

- `contentSwReplaced` (HTML) vs `contentSwReplacedButImg` (plaintext): v1 은 plaintext 저장. Phase 9 AI 요약에서 HTML 필요하면 재추가 검토.
- API 가 `viewCount` 미제공 → `discussions` 테이블에 `view_count` 컬럼이 있다면 NULL 저장 또는 migration 으로 제거 (DB 스키마 수정은 별도 plan).
- 댓글(reply) 저장 여부: v1 은 `replyDepth === 0` 만 저장. 댓글 수는 `commentCount` 컬럼만 보관.
