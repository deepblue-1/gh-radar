---
status: done
from: gh-trade
from_commit: ea8d9171
from_branch: master
date: 2026-10-06
fbs_sync_marker: 2404509b
done_commit: fec0a87a  # T1 b889555f · T2 17a81cae · T3 fec0a87a (quick-261006-ide)
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-06

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

**85 `LimitFeature` 말미에 두 필드 append (gh-trade quick-261006-f1j).** MsgType·Envelope·다른 필드·vtable 슬롯은 그대로다.

| 필드 | 타입 | vtable 슬롯 | 뜻 |
|---|---|---|---|
| `lock_sell_krw` | ulong(원) | 68 | 이번 잠김 누적 매도 주도 **상한가** 체결 금액 |
| `lock_cancel_krw` | ulong(원) | 70 | 같은 창의 상한가 매수잔량 취소 금액(하한 — `cancel_10s` 와 같은 접속매매 음수 순유입 × `upper_px`) |

- 서버 규칙: AtLimit run 이 시작된 틱부터 후보에 더한다(첫 3초 포함). run 이 30틱(3초)을 채워 `lock_state` 1 이 되면 후보를 싣고 run 이 이어지는 동안 계속 늘어난다.
  30틱 전에 끝난 run 의 후보는 버리고 직전 확정 잠김 값이 남는다. 잠김이 끝나면 마지막 값 그대로(`lock_state` 2), 오늘 잠김이 없으면 0, 06:00 리셋에 0.
  잠김을 깨는 마지막 매도 주도 체결과 매수1을 상한가에서 떼는 B6 의 소멸 잔량까지 그 잠김에 들어간다.
- 구 relay·구 클라는 모르는 말미 필드라 무시한다(디코드가 깨지지 않는다).
- **관찰자 저널 kind 15 슬롯 매핑은 바뀌지 않았다** — 두 값은 kind 15 에 싣지 않는다(사용자 결정 2026-10-06).
- **밤 export(tickana, 119 → radar-gw pull)에도 같은 이름이 실린다:**
  - `locks.ndjson.gz` 새 키 6개 — `sell_krw`·`cancel_krw`(그 잠김 합, 원 정수) · `risk_3s`·`risk_10s`·`risk_60s`(잠김 시작 +3/+10/+60초) · `risk_pre`(깨짐/끝 −3초).
    risk = 그 시점까지 누적 매도 ÷ 그 시점 `q_krw`, **소수**(0.36 — 100% 초과면 1 보다 크다), 잠김 밖이거나 `q_krw` 0 이면 null.
  - `grid/<isin>.json.gz` 의 `cols` 새 키 2개 — `lock_sell_krw`·`lock_cancel_krw`(잠김 안에서 누적, 끝나면 다음 잠김까지 유지, 첫 잠김 전 0, 상한가 미상이면 null).
  - **`schema_version` 은 1 그대로다** — `workers/limitup-sync` 가 manifest `schema_version` ≠ `KNOWN_SCHEMA_VERSION`(1) 이면 그날을 건너뛰기 때문이다.
    특징 사전의 「열 추가도 판을 올린다」 규칙과의 편차이고, 판 올림은 gh-radar `KNOWN_SCHEMA_VERSION` 과 함께 하는 후속으로 남긴다.
- 위험도 표시: export 는 소수, gh-trade 클라 상따창 「누적」 행은 `lock_sell_krw ÷ q_krw × 100` 반올림 정수 %(100% 초과 가능, `q_krw` 0 → 「위험도 —」, 색 없음).
  판정 임계가 아니라 비율 수치다. 확률 모델 특징에는 아직 없다.
- 정본: `docs/analysis/feature-dictionary.md`(gh-trade) ② `lock_sell_krw`·`lock_cancel_krw` 행 · `docs/features/limitup-feature.md` ③⑤⑥⑦.

판정기가 걸린 파일:

- server/src/protocol/StockDMA.fbs

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

1. **relay TS 재생성** — gh-trade 커밋 뒤 `RELAY=/Users/alex/repos/gh-radar/relay server/scripts/sync-relay-schema.sh`. 먼저 gh-radar 의 마지막 생성 기준을 확인한다
   (2026-10-06 현재 `relay/src/generated/StockDMA.fbs` 마커 `2404509b` = gh-trade HEAD 의 fbs 와 마커 외 동일 — 미병합 페이즈 필드 없음). 그 사이 gh-radar 쪽에 다른 미병합 fbs 변경이
   생겼으면 합친 fbs 로 `FBS=` 를 지정해 실행한다. 85 를 중계·표시하지 않으면 재생성은 급하지 않다(모르는 말미 필드는 무시된다).
2. **Supabase(선택)** — `limitup_locks`·격자 표에 새 열을 원하면 마이그레이션을 추가한다. `jsonb_populate_record` 는 모르는 키를 무시하므로 지금 적재는 깨지지 않는다.
3. **워커** — export 파일 내용이 바뀌어 `files_sig` 가 달라지므로 `limitup-sync` 가 그날을 다시 적재한다(schema_version 1 유지라 skip 되지 않는다). 코드 변경은 필요 없다.
4. 웹에서 「누적 매도·취소·위험도」 를 보이고 싶으면 위 열/키를 쓴다(필요할 때만).

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: **예** — 85 말미 append 이고 요청 짝이 없다(구 relay 는 무시). gh-trade 안에서도 서버 → 클라 순서다.

현재 상태(2026-10-06): gh-trade master ea8d9171 에 커밋·push 완료. 배포는 장 마감 뒤 — 서버(85 새 필드) 20:00 이후 재기동, 119 tickana 는 20:30 배치 전 교체(오늘 밤 배치·9/29~10/2 --force 재export 에 grid·locks 새 열 포함).
119 의 tickana 파일 교체 전까지 밤 export 에는 새 키가 없다. 교체 뒤에도 옛 날짜 행의 새 열은 null 이다(재처리 때 채워진다 — 119 의 기존 DuckDB 는 `ensure_schema` 가 열을 덧붙인다).

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

- relay: 85 프레임 디코드 결과에 `lockSellKrw()`·`lockCancelKrw()` 가 있고, 잠김 중인 종목에서 0 이 아닌 값(원)이 1초마다 늘어난다. 잠김이 끝나면 값이 그대로 남는다.
- 밤 export: 119 교체 뒤 첫 처리일의 `export/<D>/locks.ndjson.gz` 첫 행에 `sell_krw`·`cancel_krw`·`risk_3s`·`risk_10s`·`risk_60s`·`risk_pre` 키가 있고,
  `grid/<isin>.json.gz` 의 `coarse.cols`·`fine.windows[].cols` 에 `lock_sell_krw`·`lock_cancel_krw` 가 있다. manifest `schema_version` 은 1.
- 워커: 그날이 skip 없이 다시 적재된다(files_sig 변경 로그).

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

- Supabase `limitup_locks`·격자 표에 새 열(`sell_krw`·`cancel_krw`·`risk_*` · `lock_sell_krw`·`lock_cancel_krw`)을 추가할지 — 원하면 알려 달라(gh-trade 쪽 변경은 없다).
- `schema_version` 판 올림(2)을 언제 함께 할지 — gh-radar `KNOWN_SCHEMA_VERSION` 을 올릴 준비가 되면 알려 달라. 그때 gh-trade 가 사전·events·kLimitFeatureSchema 를 같이 올린다.
