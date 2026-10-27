# Phase 35 — Deferred Items (범위 밖 발견)

## 35-04 실행 중

- **`supabase/tests/dma_gateway_identities.test.sql` 16 not ok (기존 실패 · 이 phase 무관).**
  `--until 20261027200000`(35-04 마이그레이션 전)과 전 마이그레이션 재생 위에서 not ok 목록이 **글자 그대로 같다**
  (3 · 4 · 18~21 · 23 · 25~28 · 31~34 · 37). 실패 단언은 `dma_credentials` gateway 기본값 KB · 자격증명 기반
  가시성 등 Phase 29 v2 레지스트리(app_users × dma_servers · 키 KB120/KYOBO119) 이전 모델을 전제한다 — 테스트가
  낡았다. 35-04 의 재정의(`dma_order_events_for_user` · json 래퍼)는 실패 수 · 목록을 바꾸지 않았다.
  손볼 곳: 이 테스트를 v2 레지스트리 픽스처로 다시 쓰거나 폐기 판단(별도 quick).
