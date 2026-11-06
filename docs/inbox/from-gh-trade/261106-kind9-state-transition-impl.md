---
status: done
from: gh-trade
from_commit: a836e9e1
from_branch: master
date: 2026-11-06
fbs_sync_marker: 2ca631fc
done_commit: b5ec7414  # relay 생성물 커밋 · 진단 지식 정합 b4f50e0b
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-11-06 · kind 9 「상태전이」 구현 회신 (quick-261106-kjo, 미배포)

요청 노트 gh-trade `docs/inbox/from-gh-radar/261106-chatbot-kind9-mapping.md` 의 1차 중 **슬림 범위**(Cfg* + Auto*)를 구현했다. Sys* 4종은 토큰 이름만 예약·미송신(운영자 결정 — 다음 차수).

## 바뀐 것

- **와이어 무변경.** `enum StrategyEventKind` 에 `StateTransition = 9` 값과 주석만(예약 주석 대체). 테이블·필드·슬롯·MsgType 변화 없음.
- **송신 경로: 관찰자 저널 80 전용** — `IsObserverOnlyKind(9)` 참. 82 실시간·81 백필 없음(Q3).
- **reason_code 토큰 22개** — 송신 12 = `CfgSubmit` · `AutoPreBuyOff` · `AutoAddBuyOff` · `AutoAddBuyGiveUp` · `AutoAddBuyRecheck` · `AutoPostBuyUnlock` · `AutoPostBuyRelock` · `AutoPostBuyFire` · `AutoMasterOff` · `AutoRiskLatchOn` · `AutoRiskLatchReset` · `AutoRiskFire` / 이름만 예약 = `CfgRearm` · `SysCloseOff` · `SysKillSwitch` · `SysRestore` · `SysCommand` · `LatchSellOn` · `LatchCancelOn` · `GateSessionBlocked` · `GateConsumed` · `ViNoOrder`.
- `reason_code` 칸은 **토큰 낱말 그대로**(kind 11~14 의 「토큰 + 공백 + 설명」 꼬리 없음).
- 칸 배치는 요청 노트 43칸 표·스위치 비트셋(bit0~13) 그대로. 다른 점은 아래 Q5.
- gh-trade 커밋: `2ca631fc`(CfgSubmit·fbs·클라 생성물) · `f311f71a`(Auto* 11종) · `2893c026`(문서) · 병합 `42c34a07`. cloud-verify 전체 통과(17/17 샤드, 2843건).

판정기가 걸린 파일:

- docs/features/order-journal.md
- server/docs/protocol.md
- server/src/protocol/StockDMA.fbs
- server/src/trade/journal/StrategyEventFormat.cpp
- server/src/trade/journal/StrategyEventFormat.h

## gh-radar 가 할 일

1. **relay 생성물 커밋** — gh-trade 가 `sync-relay-schema.sh` 를 이미 돌렸다(삭제 0). gh-radar 작업 트리에 미커밋 변경 2개가 있다: `relay/src/generated/StockDMA.fbs` · `relay/src/generated/stock-dma/strategy-event-kind.ts`(`StateTransition = 9` 추가). 경로 지정으로 커밋해 달라(relay 동작 변화 없음 — enum 값 추가뿐).
2. **라벨 사전 맞추기** — 아래 Q 답의 낱말·단계 번호·`ev_qty` 의미로.
3. 행 수 관찰(Q4 주의 참조) — 배포 첫날 계좌·종목당 kind 9 행 수를 봐 주면 좋다.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: **아니오 — gh-radar 먼저.** gh-radar 웹·DB·server 는 11/6 15:2x 배포 완료 통보를 받았다(a1136df0). 그래서 이제 gh-trade 서버 배포가 가능하다. 서버 배포(120·119)는 장 마감 뒤 운영자 지시로 하고, 배포하면 이 노트에 이어 SendMessage 로 알린다.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

- 서버 배포 뒤 `dma_strategy_events` 에 kind 9 행 — `account_no` 채움 · `reason_code` 가 위 토큰 · 같은 값 재제출 행 없음.
- 사람 행: `order_condition` = 로그인 id(예 `milles`), `base_cum` = change_mask, `message` = 바뀐 값 칸만.
- 동기 사례 꼴(선매수 발주 → AutoPreBuyOff, 재제출 → CfgSubmit bit1 0→1)은 gh-trade 테스트 T3(c)로 고정돼 있다. 실제 행은 다음 같은 꼴 사례에서 확인.

## 질문 (요청 노트 Q1~Q5 답)

- **Q1 제출자:** `order_condition` = 제출 연결의 로그인 DMA id(`Session::GetId()`, users.toml id, 예 `milles`, 최대 15바이트). 42 재제출이 C# 클라든 relay 든 **그 연결이 로그인한 id** — relay 가 사용자와 같은 id 로 로그인하면 둘을 가를 수 없다. 서버 행(Auto*)은 `""`. `dma_user_id` 는 전략 소유 세션 해석값(감사 칸).
- **Q2 CfgRearm:** 구분 불필요 → **이름만 예약·미송신, CfgSubmit 하나.** 에코가 소진된 게이트를 스위치 비트 0 으로 접어 보이므로, 체크 ON 재제출로 게이트가 다시 열리면 항상 그 비트가 0→1 → CfgSubmit. 11/5 milles 13:10:25 는 `CfgSubmit` · group 1 · bit1 0→1.
- **Q3 82:** 80 저널 전용(82·81 없음). C# 클라가 kind 9 를 모르고, 재제출 빈도로 늘 수 있는 종류라 실시간 팬아웃에 싣지 않는다.
- **Q4 행 수(계좌·종목당 하루):** 평소 5 ~ 20행, 많은 날 50 ~ 150행(후매수 잠금 출렁임 · 위험도 래치 켜짐/리셋이 대부분). 같은 값 재제출 0행. **주의:** 잔량추적 ON 칸(매도·취소 감시수량)에 클라·relay 가 서버 기준선을 되실어 change_mask 없이(전체 제출) 재제출하면 기준선이 오를 때마다 「값 변경」 행이 생길 수 있다 — relay 가 change_mask(buy3_schema ≥ 6)로 바뀐 칸만 보내면 생기지 않는다.
- **Q5 칸 배치 다른 점:**
  - 단계(`cond_threshold`→`cond_actual`): 후매수 0 꺼짐 · 1 감시 · 2 보유중 · 3 소진 — 잠금해제/재잠금 1→1, 발동 1→2 / 위험도 0 대기 · 1 무장 · 2 발동 — 래치 켜짐 0→1, 리셋 1→0, 발동 1→2.
  - `ev_qty_before/after`: 후매수 해제 0 → 심은 발동잔량 · 재잠금 리셋 전 발동잔량 → 0 · 발동 = 발동잔량/발동잔량 · 줄매수 포기 = 최대 → 포기 틱 매수1잔량 · **위험도 3종 = 기준 % → 그 순간 위험도 %**(같은 값의 전/후가 아님) · CfgSubmit 은 값 칸이 정확히 1개 바뀌었을 때만.
  - `AutoRiskFire` 는 `order_no`/`price`/`qty` 비움 — 위험도 매도는 결과이고 kind 6 SellOrder(reason `SellRisk`)로 따로 남는다.
  - `AutoPostBuyFire` 비트셋 「전」 은 근사 — cfg 의 매도·취소가 꺼져 있을 때만 bit4·bit5 를 0 으로(발동이 켠 것만 0→1 로 보이게).
  - 주문 원인 3종(`AutoPreBuyOff`·`AutoAddBuyOff`·`AutoPostBuyFire`)의 `order_no` 는 접수(A)를 최대 2초 기다려 싣고(SOR 상대 인스턴스 포함), 없으면 `""`(거부는 kind 8 이 따로). `price`/`qty` 는 늘 채움.
  - `gw_time_ms`: 사람 행 = 설정 적용 순간, 서버 행 = 상태를 바꾼 순간(드레인 시각 아님).
  - CfgSubmit `message`: 바뀐 값 칸만 `라벨 전→후단위` 를 ` · ` 로 결합(예 `선매수 주문수량 10→20주`), 등록 `"등록"`·삭제 `"삭제"`, 스위치만 바뀌면 `""`. `base_cum` = change_mask ∧ 54비트. SOR 미러로 상대 거래소 키가 바뀌면 그 키에도 1행.
  - 다음 후보 토큰(이번 미송신): 줄매수 버스트 해제 · 후매수 자동 켬 · 후매수 정리 끝 · 위험도 꺼짐(발동 외) · 매도/취소 송신 뒤 게이트 소진.

## gh-radar 처리 (2026-11-06)

- relay 생성물 2파일(`relay/src/generated/StockDMA.fbs` · `stock-dma/strategy-event-kind.ts`) 경로 지정 커밋 `b5ec7414` — relay 동작 무변경, 배포 안 함.
- 라벨 사전: 토큰 낱말·단계 번호(후매수 0~3 · 위험도 0~2)는 shared `STATE_REASON_LABELS` · `POST_BUY_STAGE_LABELS` · `RISK_LATCH_LABELS` 와 이미 같아 수정 없음. 웹 kind 9 문장은 `ev_qty_before/after` 를 쓰지 않아 위험도 % 의미 차이의 영향이 없다.
- 진단 챗봇 지식만 회신에 맞춤(`b4f50e0b`): 게이트 재개방도 CfgSubmit(스위치 꺼짐→켜짐) · CfgRearm·Sys*·2차는 미송신 · 제출자 = 로그인 id. server 재배포 시 반영.
- 행 수 관찰(Q4)은 gh-trade 서버 배포 첫날 계좌·종목당 kind 9 행 수로 확인 예정.
