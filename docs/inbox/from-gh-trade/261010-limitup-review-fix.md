---
status: done
from: gh-trade
from_commit: 2071cac1
from_branch: master
date: 2026-10-10
fbs_sync_marker: 88fc746d
done_commit: 105539b4
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-10

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

**와이어 무변경** — `StockDMA.fbs`·MsgType 85 필드·kind 15 슬롯 매핑 모두 그대로다. Phase 27 코드 리뷰 16건 수정(gh-trade 9a68cc75~56bb579e, 보고 `.planning/phases/27-limitup-lock-report/27-REVIEW-FIX.md`)으로 **기존 값의 뜻·빈도**만 바뀌었다.

1. **85 `p_break_bp` · kind 15 `resultCode`** — 모델이 적용 중이어도 `lock_state != 1` 이면 **−1**(WR-06). 지금은 모델 미승격이라 늘 −1 이므로 화면 변화 없음.
2. **kind 15 행 빈도**(WR-01·WR-02)
   - 그 분에 값이 직전 행과 같은 키는 **행이 없다** — 키별 마지막 행을 이어 쓰면 된다.
   - 장 마감(판정 세션 닫힘) 뒤 밤새 쌓이던 행이 사라진다(잠김 run 도 세션 종료에 닫힌다 — 장후 `entryRound`(lock_state) 2·`qty`(lock_elapsed_s) 0).
   - 분 경계에 키를 틱당 256건씩 나눠 넣어 `gwTimeMs` 가 분 경계보다 최대 약 1.6초 늦을 수 있다.
3. **kind 15 `snap*`**(IN-03) — 슬롯은 그대로, model_state 는 snap 배열 길이(0/1)로 읽는다(문서화만).
4. **밤 export 격자(grid) 잠김 열**(CR-01) — `lock_state`·`lock_elapsed_s`·`lock_sell_krw`·`lock_cancel_krw` 가 **서버 85 와 같은 AtLimit 3초 run 정의**가 된다(다음 밤 배치·재처리 날짜부터). 격자 `lock_id` 는 상태와 무관하게 「그 초를 덮는 터치」 만 가리키고, `break_within_n` 은 「t 뒤 첫 상한가 미만 체결」 기준이다. `locks` 표(터치 단위 사건 — `sell_krw`·`cancel_krw`·`risk_*`)는 그대로라 격자 누적 금액과 locks 금액이 다를 수 있다. `manifest.schema_version` 은 1 그대로.
5. **export 교체 순서**(WR-03) — 옛 디렉터리를 `<D>.old.tmp` 로 rename 해 치운 뒤 `<D>.tmp` → `<D>`. `.tmp` 로 끝나므로 `limitup-pull.sh` 의 `rsync --exclude='*.tmp'` 가 이미 거른다.
6. **D+1 보충**(WR-04) — 대상 종목이 전부 무체결이면 그 날짜 배치 마커로 거래일/휴장을 가른다(거래정지만 있는 날을 휴장으로 착각하지 않는다). `d1_*` 값이 드물게 달라질 수 있다.

판정기가 걸린 파일:

- (판정기 0건 — 수동 인계)

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

- **relay 생성물 재동기화: 불필요**(fbs 무변경). 커밋 훅이 `StrategyEventFormat.h` 를 계약 파일로 표시했지만 변경은 주석 한 단락(링 크기 근거)뿐이다.
- **kind 15 소비 쪽**: 「분마다 키당 1행」 을 가정하는 집계·차트가 있으면 「값이 바뀐 분만 행」 으로 바꾼다(마지막 값 이어 쓰기). 장후 행 부재를 정상으로 본다.
- **p_break_bp 표시**: −1 을 「없음/관찰 중」 으로 그린다면 그대로 맞다. 잠김 아닐 때 값이 있다고 가정한 곳이 있으면 고친다.
- **격자 잠김 열 해석**: 웹이 격자 `lock_state`·`lock_id` 로 잠김 구간을 칠한다면, 사건 경계는 `locks`(터치)로, 격자 lock_state 는 서버 85 와 같은 「3초 이상 매수1=상한가」 구간으로 읽는다. DB 스키마 변경 없음.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: **예** — 와이어 무변경, 값의 뜻만 바뀐다. gh-trade 는 장 마감 뒤 120·119 재배포와 119 분석기 교체, 9/29 이후 날짜 `--force` 재처리를 할 예정이다(재처리 날짜는 files_sig 변경으로 재적재).

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

- 서버 배포 다음 장중: 관찰자 저널 kind 15 에서 같은 키의 연속 행이 값이 바뀔 때만 생기고, 15:30·20:00 이후 새 행이 끊기는지.
- 재처리 뒤 export: 같은 초에서 격자 `lock_state 1` 이 서버 85(`dma_strategy_events` kind 15 의 `entryRound`)와 맞는지 한두 종목 대조.
- 버킷 `export/` 아래 `*.old*` 객체가 없는지.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음.

## gh-radar 처리 (2026-10-10)

코드 변경 없이 맞다는 것을 확인했다. 주석만 고쳤다(105539b4).

- **kind 15 빈도:** 소비처는 주문로그 줄 목록(`use-order-log-feed` · `order-log-list`)과 relay 스토어 보관 상한뿐이다. 「분마다 키당 1행」 을 가정한 집계·차트는 없다. 행이 줄면 보관 상한에 덜 닿을 뿐이다. 「분당 · 키당 1행」 이라 적은 주석 3곳은 「키당 분당 최대 1행 · 값이 바뀐 분만」 으로 고쳤다.
- **p_break_bp −1:** shared `limit-feature.ts` 가 `modelState === 1 && pBreakBp >= 0` 일 때만 확률을 그리고, 아니면 「깨짐확률 관찰 중」 이다. 그대로 맞다.
- **격자 잠김 열:** 보고서의 잠김 구간·번호·요약 칩은 `locks`(터치) 표에서 온다. 격자 `lock_state` 는 「미잠김 단일가」 칸(`auction && lock_state === 0`)에만 쓰고, `lock_sell_krw` · `lock_cancel_krw` · `lock_elapsed_s` · `break_within_n` 은 읽지 않는다. 새 정의(서버 85 와 같은 3초 run)에서도 해석이 맞다.
- **export 교체 순서:** `limitup-pull.sh` 의 `rsync --exclude='*.tmp'` 가 `<D>.old.tmp` 를 받지 않는다. 로컬 미러에 없으니 GCS 업로드에도 실리지 않는다. 워커는 manifest 있는 `YYYYMMDD` 디렉터리만 본다.
- **재처리 날짜:** files_sig 가 바뀌면 워커가 날짜 단위로 다시 적재한다. 따로 할 일은 없다.
