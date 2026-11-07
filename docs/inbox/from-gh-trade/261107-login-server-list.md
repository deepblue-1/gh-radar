---
status: done
from: gh-trade
from_commit: c162e3b4
from_branch: master
date: 2026-11-07
fbs_sync_marker: 8e0c1417
done_commit: 46a6c9ac  # relay 배포 46a6c9ac · Caddy 리로드 2026-11-07 — 실측 200 no-store · 키 없음 404 · KB120 · KYOBO119 · KYOBO112
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 요청 — 클라 로그인창 서버 목록 (2026-11-07)

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

와이어(StockDMA.fbs) 무변경. **새 요청**이다.

gh-trade 클라 로그인창은 지금 `settings.ini [DMA] KB_Host/Kyobo_Host` 로 접속 서버를 정한다. 이걸 없애고
교보/KB 탭 아래 「서버」 콤보에 **gh-radar 레지스트리(`dma_servers`)의 켜진 서버** 중 그 탭 증권사 것만 보여 고르게 한다
(사용자 결정 2026-11-07 — 탭 유지·이름만 표시 `KB 120`/`교보 119`). 클라는 Supabase 에 직접 못 닿으므로 gh-radar 가 읽기 전용 목록을 내줘야 한다.

판정기가 걸린 파일:

- (판정기 0건 — 수동 인계)

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

클라가 읽을 목록 하나를 **`https://dma.jx1.io/ghtrade/servers.json`** 에 내준다(제안 — 경로·구현 방식은 gh-radar 재량, 정해지면 회신).

- 인증: 기존 `/ghtrade/*` 와 같은 Bearer 고정키(Caddy `@ghtrade_deny` 그대로) — 이 경로면 Caddy 변경 없이 걸린다
- 캐시: `Cache-Control: no-store`(manifest 2종과 같이 — `@ghtrade_nostore` 에 추가)
- 내용: `dma_servers` 중 **`enabled = true` 만**, `sort_order` 오름차순
- 갱신: 레지스트리 변경(Admin 서버 화면) 뒤 수 분 안에 반영되면 충분. 예) relay 레지스트리 재적재 때 `/srv/ghtrade/servers.json` 을 임시파일+mv 로 쓰기
  (gh-trade `publish-client.sh` 는 `/srv/ghtrade` 에 `--delete` 를 쓰지 않으므로 이 파일을 지우지 않는다)
- 시세 주 서버·주문 서버 여부는 클라가 쓰지 않으니 넣지 않아도 된다

JSON 모양(제안):

```json
{
  "v": 1,
  "servers": [
    { "key": "KB120",    "broker": "KB",    "host": "10.41.1.120",   "port": 9100 },
    { "key": "KYOBO119", "broker": "KYOBO", "host": "10.16.207.119", "port": 9100 },
    { "key": "KYOBO112", "broker": "KYOBO", "host": "10.16.207.112", "port": 9100 }
  ]
}
```

클라 규칙: 표시 이름은 클라가 key 로 만든다(`KB120`→`KB 120`, `KYOBO119`→`교보 119`). 모르는 필드는 무시, `v` 가 1 이 아니면 무시하고 지난 목록을 쓴다.
목록을 못 받으면(오프라인·404) 지난번 받은 목록(클라 AppData 보관)을 쓴다.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 해당 없음(서버 무변경). **gh-radar 먼저**가 안전하다 — 새 클라는 목록을 못 받으면 지난 목록, 그것도 없으면 내장 기본값(KB 120·교보 119)으로 떨어지게 만든다.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

- `curl -s -H 'Authorization: Bearer <고정키>' https://dma.jx1.io/ghtrade/servers.json` 가 위 모양 · 켜진 서버만 · sort_order 순
- 키 없이 요청하면 404
- Admin 에서 서버 하나를 끄면 목록에서 빠진다

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

1. 경로·구현 방식(정적 파일 vs relay 라우트) 어느 쪽으로 할지 — 정해지면 최종 URL 회신 부탁
2. `dma_servers` 에 KYOBO112 가 들어가 켜져 있는지(교보 112 11/5 가동)

## gh-radar 회신 (2026-11-07 · gh-radar-8b)

1. **최종 URL = 제안 그대로 `https://dma.jx1.io/ghtrade/servers.json`** · 구현은 **relay 라우트**(정적 파일 아님).
   relay 가 메모리의 서버 레지스트리(`dma_servers` 60초 재적재 + Admin 서버 편집 즉시 reload)에서 매 요청 만든다 —
   파일 동기화 · `/srv/ghtrade` 쓰기 권한이 없고, Admin 에서 끄면 길어야 60초(보통 즉시) 안에 빠진다.
   - 인증: 기존 `@ghtrade_deny` 그대로(키 없음·틀림 → 404). Caddy 는 `handle /ghtrade/servers.json` → `127.0.0.1:8090` 한 블록 추가.
   - 헤더: `Content-Type: application/json; charset=utf-8` · `Cache-Control: no-store`(relay 가 붙인다).
   - 모양: 제안 그대로 `{"v":1,"servers":[{"key","broker","host","port"}]}` — enabled 만 · sort_order 오름차순 · 역할 칸 없음.
     전부 꺼지면 `servers: []`(클라는 빈 목록을 「못 받음」처럼 다뤄 지난 목록 → 내장 기본값으로 떨어지길 권장).
   - 코드: `relay/src/registry/registry.ts` `ghtradeServerList` · `relay/src/index.ts` 8090 요청 처리 · `infra/relay/Caddyfile`.
2. **KYOBO112 는 켜져 있다** — 운영 `/healthz` 의 `adminConns` 가 `KB120 · KYOBO119 · KYOBO112`(2026-11-07 확인).
   지금 목록은 이 셋이 sort_order 순으로 나온다(교보 주문 서버는 KYOBO119).
