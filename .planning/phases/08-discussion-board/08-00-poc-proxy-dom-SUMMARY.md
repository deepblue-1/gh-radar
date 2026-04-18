---
plan: 08-00
phase: 08
status: complete
completed_at: 2026-04-18
---

# Plan 08-00 Summary — POC: proxy + DOM (옵션 5 전환)

## What was built

1. `.planning/phases/08-discussion-board/POC-RESULTS.md` — 9개 섹션 결과 보고
2. `workers/discussion-sync/tests/helpers/naver-board-types.ts` — `NaverDiscussionApiResponse` 타입
3. `workers/discussion-sync/tests/helpers/naver-board-fixtures.ts` — `NAVER_BOARD_JSON_SAMPLE_ACTIVE/QUIET` (5 posts × 2 종목)

## Key decisions

- **프록시:** Bright Data Web Unlocker — gh-radar 전용 zone **`gh_radar_naver`** 신설 (계정/계약은 weekly-wine-bot 과 공유, zone 만 분리). `country=kr` 파라미터 필수. API 필수 파라미터 `isHolderOnly`/`excludesItemNews`/`isItemNewsOnly` 명시 (zod 검증).
- **본문 수집 경로:** **옵션 5 (JSON API)** — `https://stock.naver.com/api/community/discussion/posts/by-item` 한 번 호출로 50 posts + 본문(`contentSwReplacedButImg`) + 메타데이터 일괄 수집.
- **RESEARCH 가정 무효화:** HTML 파싱 (cheerio), iframe body fetch (옵션 2), iconv-lite, 모두 **불필요**.

## Verification

- HTTP 200: 5/5 종목 (10/10 호출)
- 평균 latency 2.7초, 평균 응답 168KB (HTML 목록) / 210KB (JSON API)
- 본문 추출 검증: `contentSwReplacedButImg` 가 plaintext 본문 전문 포함 (게시글 5개 직접 확인)
- 차단율: 0/30+ (POC 기간)

## Files created

| Path | Purpose |
|------|---------|
| `.planning/phases/08-discussion-board/POC-RESULTS.md` | 결정 + 실측 + α 경로 plan 영향 요약 |
| `workers/discussion-sync/tests/helpers/naver-board-types.ts` | API 응답 타입 (Plan 08-02 sanitize/parser 가 import) |
| `workers/discussion-sync/tests/helpers/naver-board-fixtures.ts` | JSON fixture (Plan 08-02 parser test SoT) |

## Downstream plan adjustments (α path)

본 SUMMARY 직후 같은 wave 내에서 Plan 08-01/08-02/08-03 의 file list / dependency 를 inplace 갱신하는 commit 추가 (별도 commit, "docs(08): JSON API 전환에 따른 plan 갱신").

## key-files.created

- `.planning/phases/08-discussion-board/POC-RESULTS.md`
- `workers/discussion-sync/tests/helpers/naver-board-fixtures.ts`
- `workers/discussion-sync/tests/helpers/naver-board-types.ts`

## Self-Check: PASSED
