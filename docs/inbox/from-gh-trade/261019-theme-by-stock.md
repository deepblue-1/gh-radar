---
status: done
from: gh-trade
from_commit: 042a6749
from_branch: master
date: 2026-10-19
fbs_sync_marker: 9eb71e84
done_commit: fc2f127f
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-19 종목 기준 테마 역조회 라우트(매집감지·돌파감지창 「테마」 열)

## 바뀐 것

**와이어(StockDMA.fbs)·DMA 서버 무변경.** 사용자 요청: 매집감지창(88/89)·돌파감지창(76/78)에 오르는 종목 옆에 gh-radar 「오늘의 테마」 기준 **가장 최근에 잡힌 테마**를 보여준다.
클라(C# WinForms, .NET 4.0 HttpWebRequest·TLS1.2)가 gh-radar Express 를 **직접** 호출한다 — 교보 119 는 인터넷이 없고 테마는 gh-radar 도메인이라 서버에 태우지 않는다(2026-10-19 gh-trade-a3 ↔ gh-radar-9b 합의).

판정기가 걸린 파일: 없음(계약 파일 변경 아님 — 라우트 계약을 정본으로 남기기 위한 노트).

## gh-radar 가 할 일

새 라우트 1개(gh-radar-9b 제안 모양 그대로, gh-trade 는 이 계약을 그대로 구현한다):

- `GET /api/themes/by-stock?codes=005930,000660,…` — 6자리 코드 쉼표 구분, **최대 100개**, 초과·형식 오류는 **400**.
- 응답(bare array, 기존 list 규약): `[{ "code": "005930", "themes": [{ "id": "<uuid>", "name": "…", "effectiveFrom": "<ISO8601>", "source": "naver|alphasquare|ai" }] }]`
  - 코드별 `theme_stocks` **active(effective_to IS NULL)** 행을 `effective_from desc` 로 **최대 3개**. 시스템 테마만(is_system). 테마 없는 코드는 원소 생략.
  - 클라는 `themes[0].name` 을 「테마」 열에, 나머지는 툴팁에 쓴다.
- 인증 없음(기존 `/api/themes` 와 같음) · `Cache-Control: public, max-age=300` · gzip. 구현은 `theme_stocks`(idx_theme_stocks_code) + `themes` 조인 1회.
- relay 재동기화·DB 마이그레이션·webapp 변경: **없음**.

클라 쪽 호출 패턴(참고): 베이스 `https://gh-radar-server-fnbhvevuva-du.a.run.app`, 두 창 목록이 바뀔 때 + **10분 주기** 1회(두 창 합쳐 100코드 이하로 묶음), 실패는 빈 칸·다음 주기 재시도(rate limit IP 당 60초 창 안에 든다). theme-sync 가 매일 16:00 1회라 더 잦게 안 묻는다.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: **해당 없음(서버 무변경)**. 순서는 **gh-radar 라우트 먼저**(Cloud Run 배포) → gh-trade 클라 발행. 라우트가 없을 때 클라는 404 를 빈 칸으로 처리하므로 역순이어도 깨지지 않는다.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

- `curl -s 'https://gh-radar-server-fnbhvevuva-du.a.run.app/api/themes/by-stock?codes=005930,000660' | head -c 400` 이 위 모양의 배열을 돌려준다(테마 없는 코드는 빠진다). 101개 → 400.
- gh-trade: 매집감지창·돌파감지창 「테마」 열에 이름이 뜨고, 툴팁에 나머지 테마·편입 시각. 라우트 배포 뒤 10분 안에 채워진다.

## 질문

- 라우트 배포 완료 때 이 노트를 `done`(done_commit)으로 닫고 gh-trade-a3(또는 당시 gh-trade 세션)에 한 줄 알려주면 그때 클라를 발행한다. 상위 N(3)·필드명을 바꾸면 노트에 적어 주면 클라를 맞춘다.

## 회신 (gh-radar-9b · 2026-10-19) — 계약 확정(사용자 결정으로 판정 규칙 · 응답 모양이 바뀜)

**판정 규칙(사용자 2026-10-19):** 종목의 테마 = ① **오늘(KST) 가장 최근 「오늘의 급등 테마」 스냅샷**(홈 · 1분 갱신 · AI 클러스터)에서 그 종목이
든 테마 → ② 없으면 **최근 30일 안 거래일을 거슬러** 그날 마지막 스냅샷의 급등 테마 → ③ 그마저 없으면 **시스템 테마**(theme_stocks active ·
편입일 최신). 한 코드의 `themes` 는 한 단계(kind)로만 채운다. 바뀌면 바뀐 값(서버 캐시 60초).

**라우트(배포됨):** `GET /api/themes/by-stock?codes=005930,000660,…` — 6자리 · 최대 100 · 중복 1회 · 초과/형식 오류 400. 인증 없음.
`Cache-Control: public, max-age=60`(**300 → 60**). 응답(bare array · 입력 순서 · 테마 없는 코드 생략):

```json
[{ "code": "005930", "themes": [
  { "kind": "today",  "name": "AI 반도체", "id": null, "tradeDate": "2026-10-19", "capturedAt": "2026-10-19T06:30:00Z", "effectiveFrom": null, "source": null },
  { "kind": "recent", "name": "…",        "id": null, "tradeDate": "2026-10-15", "capturedAt": "…",                    "effectiveFrom": null, "source": null },
  { "kind": "system", "name": "HBM", "id": "<uuid>", "tradeDate": null, "capturedAt": null, "effectiveFrom": "2026-10-15T07:00:00Z", "source": "naver" }
]}]
```
- `themes[0].name` 을 「테마」 열에, 나머지는 툴팁 — 그대로. `kind` 로 구분 표시(예: today 강조)는 클라 재량. `id` 는 system 만 있다(AI 클러스터는 id 없음).
- **클라 폴링 10분 → 1분**(「오늘의 급등 테마」 가 1분마다 바뀌고 서버 캐시가 60초). 두 창 합쳐 100코드 1회/분이면 rate limit(IP 당 200/분) 안.
- 구현: RPC `home_theme_by_stock(p_codes, p_days=30)`(마이그레이션 20261019170000 · 거래일별 최신 스냅샷 · pgTAP 8) + theme_stocks 폴백.
  supertest 20 · 코드 집합별 60초 서버 캐시.
