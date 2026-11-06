---
status: done
from: gh-trade
from_commit: 08d8e031
from_branch: master
date: 2026-11-06
fbs_sync_marker: 8e0c1417
done_commit:
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-11-06 · kind 9 「해제」·「전부 정지」 기록(SysDisableOne · SysKillSwitch, quick-261106-tf8, 미배포)

요청 노트 gh-trade `docs/inbox/from-gh-radar/261106-chatbot-disable-strategy-history.md` 회신.

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

**와이어 무변경.** kind 9 `reason_code` 토큰 2개 송신 시작 — fbs 는 `StrategyEventKind` 9 주석에 토큰만 추가(값·필드·슬롯 무변경).

- **`SysDisableOne`(새 토큰)** — 클라 「해제」·행 끄기 = `DisableStrategies` key 1건.
- **`SysKillSwitch`(기존 예약 토큰, 이제 송신)** — 「전부 정지」 = `DisableStrategies` key 빈 값. 세션의 상따 전부가 대상, 실제로 꺼진 상따마다 1행. VI·개장차익 슬롯은 행 없음.
- **기록 조건:** 그 상따의 스위치 비트셋(bit0~13)이 끄기 전후로 **실제로 달라졌을 때만** 1행. 이미 꺼진 전략 = 0행. 비트 밖 옵션(매도 ☐체결·☐잔량추적·☐버스트 해제)만 켜져 있던 전략도 0행. 해제 직전 같은 값 전체 재제출은 종전대로 CfgSubmit 0행.
- **SOR 짝:** 단건 해제는 SOR 짝 상대 거래소 키도 대상 — 짝은 매수 게이트를 공유해 한쪽만 꺼도 상대 비트가 접히므로, 상대 비트가 바뀌었으면 상대 키에도 1행(안 바뀌면 0행).
- **값 칸은 비교하지 않는다(스위치 전용 판정)** — 끄는 과정의 후매수 흡수·체크 해제가 값 칸을 건드려도 「값 변경」 이 섞이지 않게.
- gh-trade 커밋: `a36190a9`(SysDisableOne) · `7601404e`(SysKillSwitch·SOR 짝) · `8e0c1417`(fbs 주석·클라 스키마·문서) · 병합 `08d8e031`. cloud-verify 17/17 통과.

판정기가 걸린 파일:

- docs/features/order-journal.md
- server/docs/protocol.md
- server/src/protocol/StockDMA.fbs
- server/src/trade/journal/StrategyEventFormat.h

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

1. **relay 생성물 커밋** — gh-trade 가 `sync-relay-schema.sh` 를 가드 통과 뒤 이미 돌렸다(삭제 0). gh-radar 작업 트리에 ` M relay/src/generated/StockDMA.fbs` 1개(주석 1줄 + 마커 `8e0c1417`) — 경로 지정 커밋해 달라(relay 동작 무변경).
2. **라벨 사전·챗봇 지식** — `SysDisableOne`(해제)·`SysKillSwitch`(전부 정지) 라벨 추가, 「Sys* 아직 기록 안 됨」 문구를 「해제·전부 정지는 기록, 15:40/20:00 정리·재기동 복원·41 명령은 아직」 으로.
3. DB 마이그레이션 없음(reason_code 는 문자열 그대로).

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: **예 — 순서 무관**(요청 노트 판정과 같음). relay 는 kind·reason_code 를 거르지 않고, 칩은 원문을 보인다. 다만 챗봇 지식 문구는 서버 배포 전후 아무 때나 고쳐도 된다. 서버 배포(120·119·112)는 장 마감 뒤 운영자 지시로 하고, 배포하면 SendMessage 로 알린다.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

- 배포 뒤 클라에서 켜진 전략 하나를 「해제」 → 그 ms 에 kind 9 `SysDisableOne` 1행: `order_condition` = 로그인 id, `ahead_qty`/`expected_cum` = 비트셋 전/후(XOR = 꺼진 스위치), CfgSubmit 행 없음.
- 같은 전략을 다시 해제 → 0행. 「전부 정지」 → 켜져 있던 상따 수만큼 `SysKillSwitch` 행.
- 칸 상세: `dma_user_id` = 전략 소유 세션 해석값 · `group` = 바뀐 비트가 한 그룹 안이면 1·2·3·9, 아니면 0 · `base_cum` 0 · `message` `""` · `ev_qty_before/after` 0 · `gw_time_ms` = 끈 직후 · `cum_volume` = 그 종목 누적 · `account_no` 채움 · 저널 80 전용(82·81 없음).
- 테스트 근거: gh-trade T6(단건 1행·재제출 0행·재해제 0행) · T7(켜진 2 + 꺼진 1 → 2행) · T8(SOR 짝 상대 키 1행).

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음. 요청 노트 질문 답:
- **Q1** `SysKillSwitch` 는 같은 경로라 이번에 같이 넣었다(위 조건). `SysCommand`(41 명령)는 경로가 달라 이번에도 이름만 — `SysCloseOff`·`SysRestore` 도 이름만.
- **Q2** 꺼진 전략 정보는 기존 kind 9 스위치 비트 칸 재사용 — `ahead_qty` = 전, `expected_cum` = 후.

## gh-radar 처리 (2026-11-06)

1. relay 생성물 `relay/src/generated/StockDMA.fbs` 경로 지정 커밋(주석 1줄 + 마커 `8e0c1417`, relay 동작 무변경).
2. 라벨 사전(`packages/shared/src/strategy-event-labels.ts`): `SysDisableOne` = 「해제」 추가 · `SysKillSwitch` = 「킬 스위치」 → 「전부 정지」(웹 문구와 맞춤). 제출자 괄호는 기존 규칙(`order_condition` 비어 있지 않으면 붙임) 그대로라 코드 변경 없음.
3. 챗봇 지식(`diagnosis-knowledge.ts` STATE 절): 해제 · 전부 정지는 기록됨 · 이미 꺼진 전략과 해제 직전 같은 값 재제출은 줄 없음 · SOR 짝 상대 줄 · 배포 전 날짜엔 줄 없음을 단정 근거로 쓰지 말 것 · CfgRearm · SysCloseOff · SysRestore · SysCommand · 2차는 여전히 미기록.
4. DB 마이그레이션 없음. 테스트: shared 1159 · server specialists 76 · webapp 주문로그·챗 133 통과.
