---
status: done
from: gh-trade
from_commit: 776320af
from_branch: master
date: 2026-10-19
fbs_sync_marker: 233cb995
done_commit: 2021cd24
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-19 매집감지 「오늘 매수 평단」 (quick-261019-hni)

## 바뀐 것

클라 매집감지창 상세 패널에 「오늘 매수 평단」 한 칸을 더하려고 88/89 의 `table AccumSignal` 말미에 1필드 append.
MsgType·Envelope 슬롯 추가 없음. **kind 16 은 무변경**(칸 매핑·지문·message 그대로). 같은 quick 의 「이월 갱신」(06:00 판정에서 이월 종목도 어제 팀 순매수 ≥ 1억이면 하루 더, 상한 5거래일)은 서버 설정·판정뿐이라 와이어 밖이다 — kind 16 `carry_days` 가 2 이상으로 올라갈 수 있다는 것만 달라진다(지금까지는 최대 1).

### 88 AccumSignal / 89 AccumSnapshot.items — table AccumSignal 말미 append (261019-accum-sell-warn 의 두 필드 뒤)

| 필드 | 타입 | 필드 id | vtable | TS 접근자 | 기본값 |
|---|---|---|---|---|---|
| `day_avg_px` | uint | 31 | 66 | `dayAvgPx()` | 0 |

- 오늘 팀 매수 평단 = 당일 팀 매수 금액 ÷ 수량 반올림(우리 체결 제외 반영). 당일 매수 없으면 0, 06:00 이월·새 사이클·재기동 복원 직후 0(파일에 없다).
- 구 서버 프레임은 필드가 없어 0 으로 읽힌다. 구 relay 는 모르는 필드를 무시한다.

판정기가 걸린 파일:

server/docs/protocol.md
server/src/protocol/StockDMA.fbs

## gh-radar 가 할 일

- relay 스키마 재생성 — `RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`, 생성 기준 233cb995 → gh-trade master HEAD(이 quick 의 fbs 커밋 776320af, 병합 912feb13). 233cb995 뒤 fbs 변경은 261019-accum-sell-warn(c70b7d41)과 이 건 둘뿐이라 **한 번 재생성으로 두 노트가 같이 닫힌다**(미병합 페이즈 생성물 없음). `--check` 결과(2026-10-19 HEAD 61464812): 신규/변경 예정 1개(`accum-signal.ts`) · 삭제 예정 없음 · .fbs 사본 갱신 예정.
- 88/89 디코드에 `dayAvgPx()` 추가는 선택 — 웹 매집 화면에 보일지는 gh-radar 판단. DB 마이그레이션 없음.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 필드 append 뿐이라 구 relay 가 무시한다. 서버 배포는 장 마감 뒤(fci·gk6·gwm 과 함께).

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

- relay 재생성 뒤 `accum-signal.ts` 에 `dayAvgPx()`(vtable 66) 가 있고, 서버 배포 뒤 88 디코드에 당일 매수가 있는 종목은 0 이 아닌 값.
- 서버 기동 로그 `[Config] accum_signal … carry_renew_net_krw=100000000 carry_max_days=5 …`, 06:00 뒤 `[AccumSignal] 이월 갱신 isin=…` / `이월 갱신 미달 isin=…`.
- kind 16 거래일 첫 스냅샷 행(queue_case 2)의 `carry_days` 가 갱신된 종목에서 2 이상.

## 질문

없음

## 회신 (2026-10-19 · gh-radar quick-261019-j1w)

1. 같은 재생성 커밋 e3f512af 으로 `AccumSignal.dayAvgPx()` 접근자 생성(relay 코드 무변경 · 88 미사용이라 재배포 불필요).
2. 웹 표시는 하지 않음 — 웹은 kind 16 저널만 쓰고 그 칸에 오늘 매수 평단이 없다(kind 16 에 실리면 그때 검토).
3. `carry_days` ≥ 2 는 「이월 D+n」 배지가 값 그대로라 변경 없음.
