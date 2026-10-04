---
status: open            # open | done
from_commit: 65caaf2e        # 10/5 갱신 — master 병합 63aa0899 · 처음 확정 23d7721a
from_branch: master
date: 2026-10-05            # 처음 2026-10-04
fbs_sync_marker: 26b3493e
done_commit:            # gh-radar 가 처리한 커밋 해시 — done 으로 바꿀 때 채운다
---

# Phase 28 자동매도 — 와이어 계약 확정 (HANDOFF §4-1 v0.2 그대로)

정본 메모(전문): `/Users/alex/repos/gh-trade/.planning/phases/28-auto-sell/28-G1-NOTIFY.md` (master)
합의 기록: 같은 디렉터리 `28-HANDOFF-gh-radar-fields.md` (§1~§5, §4-1 v0.2 — gh-radar 수용분과 이름·번호 동일, 사용자 「확정」 2026-10-04).

## 10/5 갱신 — master 병합·120 가동 (이 절이 위 내용보다 우선)

- **master 병합·push 완료**: 63aa0899(10/5 00:30), 최신 65caaf2e. 와이어는 처음 확정본에서 **바뀌지 않았다** — Phase 28 쪽 `.fbs` 변경은 23d7721a 이후 0건(master fbs blob `68679e9a` 의 차이는 Phase 27 의 85 뿐, 아래).
- **KB 120 서버 가동 중**(63aa0899, 10/5 00:31 재기동) · 클라 발행 01:40(65caaf2). 즉 **41/42/43/84·60 에코 schema 4·kind 11~14 가 지금 실서버에서 나간다** — 옛 relay 는 84 를 warn 로그로 버리고 있을 것이다(무해). 127 은 미배포.
- **동기화는 master 에서** 한다(worktree 경로 폐기). `--check` 결과: 생성 .ts 신규/변경 12개 · 삭제 0 · .fbs 사본 갱신. SYNC MARKER `26b3493e` 이후 gh-radar 생성물에 미병합 변경이 없으면 그대로 반영하면 된다.
- master fbs 에는 **Phase 27 의 MsgType 85 `LimitFeature`(Envelope 슬롯 90)·`StrategyEventKind` 15** 도 함께 들어 있다(2404509b). 생성물에 같이 실리지만 85 의 중계·표시는 Phase 27 세션이 따로 넘긴다 — 이 노트 범위 밖. 서버 120 가동본(63aa0899)은 아직 85 를 보내지 않는다.
- **코드 리뷰 수정(10/4, 와이어 무변경)** 중 gh-radar 가 알아둘 동작:
  - CR-01 — 킬 스위치(`DisableStrategiesReq`)·단일 행 비활성화가 **자동매도도 끈다**: 60 에코의 `auto_sell_enabled=false` 로 내려온다(15:40 정리는 여전히 유지).
  - WR-07 — 15:40 정리 사본이 41 바로시작·중지를 되돌리지 않는다.
  - WR-05(부분 수정) — 같은 {수량,가격} 의 상따 매도와 겹쳐 접수되면 kind 6 의 group(7 SellOrder ↔ 9 AutoSell) 표기가 뒤바뀔 수 있다. 문장 조립기는 group 만 믿지 말고 reason_code 첫 토큰 `AutoSell` 도 같이 보면 안전하다.
- 실동작 UAT(장전 08:50 동시호가 회차·장중 주기 매도)는 오늘(10/5) 진행 — 결과에 따라 이 노트에 덧붙인다. 실데이터 대조는 120 서버 로그·저널(kind 6 group 9, kind 11~14)로 한다.

## 바뀐 것

- `.fbs` 확정 커밋 `23d7721a8e751ec56a9826bc6dbd020f43f43241` · `server/src/protocol/StockDMA.fbs` blob `7cc328c9c71bec098ad8987044af8399eddbb7f0` (안정 식별자 — master 병합 뒤 커밋 해시는 바뀔 수 있음). (10/5: master 병합 완료 — 위 갱신 절.)
- MsgType: **41** `AutoSellCommandReq`(C→S, Envelope `auto_sell_command_req` 슬롯 86) · **42** `SetUserSettingsReq`(C→S, `user_settings` 슬롯 88) · **43** `GetUserSettingsReq`(본문 없음) · **84** `UserSettingsResp`(S→C, 슬롯 88 공유).
- 새 테이블 `AutoSellCommandReq{isin, account_no, exchange, action 1 Start·2 Stop}` · `UserSettings`(12필드, 금액 단위 만원, `present` 는 84 전용).
- `SetLimitChaser` 말미 8필드 vtable 140~154 — 양방향 4(140~146) · **S→C 전용 4(148~154)**. `buy3_schema` 4 = 자동매도 4필드를 싣는 클라.
- enum: `StrategyEventKind` 11~14 (9 비움 유지) · `OrderGroup::AutoSell = 9` · `CancelReason` 10 `AutoSellBuyFirst` · 11 `AutoSellAuctionTrim`(신규).
- reason_code 13종(첫 토큰 `AutoSell`) — 전문 메모 (c) 표. kind 6 group 9 는 reason_code 로 주기 매도(`AutoSellAsk1/Bid1`)와 장전 동시호가 회차(`AutoSellAuctionOrder`)를 가른다.
- `ServerMessage.source`: `"AutoSell"`(54 INFO 사유 줄) · `"AutoSellCommand"`(41 실패 54 ERROR, isin 동반).

## gh-radar 가 할 일

1. relay 생성물 갱신 — 아래 「확인 방법」 명령(master, `RELAY=` 필수). SYNC MARKER `26b3493e` 이후 master 에 없는 미병합 변경이 gh-radar 생성물에 있으면 두 `.fbs` 를 합쳐 `FBS=` 로.
2. relay: `lcBuy3SchemaOf` 4번째 분기(schema 4), S→C 전용 4필드(148~154)를 서버전용 필드 목록에, 84 사용자별 캐시·브라우저 인증 때 재전송, 41/42/43 중계.
3. 문장 조립기: kind 11~14 / group 9 칸 재해석(HANDOFF §4-1 v0.2), CancelReason 10·11 라벨.
4. webapp: 자동매도 칸·사용자 설정 화면(HANDOFF 그대로).

## 배포 순서 제약

gh-trade 서버를 먼저 배포해도 안전하다(옛 relay 는 모르는 84 를 warn 로그만 남기고 버림, 60 에코 새 필드는 무시). gh-radar 안에서는 relay → webapp 순(옛 relay 는 브라우저의 모르는 메시지 종류에 소켓을 닫음). (10/5 갱신: 서버 120 은 이미 배포·가동 중이다.)

## 확인 방법

```bash
cd /Users/alex/repos/gh-trade/server      # master (10/5 갱신 — worktree 경로 폐기)
RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh --check   # 대조만
RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh           # 반영
```

## 질문

1. `UserSettings` 금액 3칸 단위는 만원(C# `LimitChaserDefaults` 와 같음). 웹 입력·표시도 만원으로 맞출 수 있는가?
2. `present=false`(서버 저장값 없음)면 84 는 내장 기본값을 싣는다. C# 클라는 ini 값으로 42 를 1회 보내 이전한다. 웹은 이전 없이 내장 기본값을 그대로 보여 주면 되는가?
3. `CancelReason` 10·11 라벨 추가 부탁(그 전엔 숫자 일반 줄 — 오류 없음).
