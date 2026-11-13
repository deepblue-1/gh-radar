---
status: done
from: gh-trade
from_commit: 28695f5f
from_branch: master
date: 2026-11-13
fbs_sync_marker: 204e505d
done_commit: e762eb75
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-11-13 · by-stock 공시가 뉴스에 밀려 안 보임

## 바뀐 것

와이어(.fbs) 무변경. **gh-radar HTTP 계약 `GET /api/news/by-stock` 변경 요청**이다(정본 gh-trade `docs/inbox/from-gh-radar/261112-kis-news-by-stock.md`).

문제: `items[]` 가 뉴스·공시를 한 목록으로 합쳐 최신순 앞 `limit` 줄만 돌려줘서, 공시 뒤에 기사가 몰리면 공시가 잘려 나간다.
재현(11/13 10:14, 금호건설 002990 — 11/12 17:36:54 「거래소 공시 · 금호건설(주) 단일판매ㆍ공급계약체결」):

| 호출 | 결과 |
|---|---|
| `codes=002990&days=3&limit=3` (gh-trade 돌파 배지 주기 조회) | 뉴스 3줄 · 공시 0 |
| `codes=002990&days=3&limit=20` (gh-trade 상따 띠·상세 패널) | 뉴스 20줄(11/12 23:54 까지) · 공시 0 |
| `codes=002990&days=7&limit=50` | 공시가 **26번째 줄** |

사용자 체감: gh-radar 홈 카드엔 공시가 있는데 gh-trade 돌파감지·상따창엔 「공시 없음」. 상한가 종목처럼 기사가 쏟아지는 종목일수록 재료 공시가 사라진다 — 정작 가장 필요한 종목에서 빠지는 셈.

판정기가 걸린 파일:

- (판정기 0건 — 수동 인계, HTTP 계약)

## gh-radar 가 할 일

by-stock 응답이 **종목마다 기간(`days`) 안 최신 공시를 뉴스와 따로 보장**하게 한다. 사용자 결정(11/13): 이 방향으로 수정.

gh-trade 쪽 희망(세부 방식은 gh-radar 판단):

1. `items[]` = 「최신순 앞 `limit` 줄」 ∪ 「기간 안 최신 공시 최대 K건(제안 K=3)」. 그래서 줄 수가 `limit` 을 넘을 수 있다(최대 `limit + K`).
2. **합친 뒤에도 `items[]` 는 작성 시각(`publishedAt`) 최신순 하나로 정렬**한다 — gh-trade 상세 패널·메뉴는 응답 순서를 그대로 그린다(클라 정렬 없음). 그래서 오래된 공시는 시각 자리(대개 목록 끝)에 놓인다.
3. 가능하면 **기본 동작**으로(파라미터 없이) — 그러면 gh-trade 클라는 코드 수정·재발행 없이 고쳐진다. gh-radar 웹 작업대 돌파 띠·카드 띠도 같은 by-stock 을 쓰면 같은 증상일 것이다.
4. `count`·`truncated` 의미가 바뀌면 노트로 알려 달라(gh-trade 배지는 「N건 / N건+」 를 그린다).

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 해당 없음 — DMA 서버·클라 무관. 기본 동작으로 바뀌면 gh-radar server 배포만으로 끝난다. 옵트인 파라미터로 가면 gh-trade 클라가 쿼리(`PollQuery`·`DetailQuery`)에 그 파라미터를 붙여 재발행해야 하니 이름을 노트로 알려 달라.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

- `curl -s '<server>/api/news/by-stock?codes=002990&days=3&limit=3'` → 뉴스 3줄 + 공시 「금호건설(주) 단일판매ㆍ공급계약체결」(11/12 17:36:54)이 함께, 최신순으로(공시가 마지막 줄). (11/15 이후엔 3일 밖으로 나가니 그 전에 확인하거나 다른 공시 많은 종목으로)
- `limit=20` 도 같은 공시가 21번째 줄로.
- 공시 0건 종목·뉴스 0건 종목 응답은 지금과 같음.

## 질문

1. 기본 동작으로 바꿔도 웹 쪽에 문제 없나? (안 되면 옵트인 파라미터 이름)
2. K(보장 공시 수)는 3 으로 괜찮나?
3. 홈 카드는 어떤 경로로 공시를 고르나? — 같은 규칙이면 계약에 적어 두면 좋겠다.

## 처리 기록 (gh-radar · 2026-11-13)

- 기본 동작으로 반영. 기간 안 최신 공시 3건을 따로 보장하고, 응답은 최신순 하나로 최대 `limit + 3` 줄이다.
  - DB `20261113300000_stock_feed_min_disclosures`(`p_min_disclosures`) · shared `takeFeedWithDisclosures` · server by-stock · home-sync(공시 2건 보장) — 커밋 `e762eb75`.
  - DB push → server `gh-radar-server-00096-fnv`(스모크 15/15) → home-sync `e762eb75` 순서로 배포.
- 운영 확인: 금호건설 002990 `limit=3` → 6줄. 앞 3줄은 뉴스이고, 4 ~ 6번째 줄이 공시다(11/12 17:36:54 「단일판매ㆍ공급계약체결」 포함). `limit=20` → 23줄, 같은 공시가 21 ~ 23번째 줄.
- `count` · `truncated` 의미는 그대로다. 질문 1 ~ 3 에 대한 답은 gh-trade 인박스 `from-gh-radar/261113-news-disclosure-quota-done.md`.
- 테스트: pgTAP 새 10개(`stock_feed_min_disclosures`) + kis_news · 네이버 제목 · 별칭 회귀 PASS · shared 1369 · server 1017 · home-sync 188 · 웹 feed 관련 257 통과.

