/**
 * Phase 39 (D-08 ① · D-12) — tickgw 당일 바이트를 서버 안에서 받는 상태표 서버판.
 *
 * 워커 `workers/tick-convert/src/tickgw-live.ts` `fetchLiveDay` 의 축약판이다. 진단 전문가의 시세 도구(`diagnosis-market.ts`)가
 * 한 진단 실행 안에서 같은 (isin, ex) 를 여러 번 부를 때 처음부터 다시 받지 않도록 **실행 단위 메모**(epoch · offsetEnd ·
 * 누적 압축 바이트)를 이어 쓴다. 프로세스 전역 캐시는 두지 않는다(512Mi · RESEARCH Pitfall 3).
 */

/** 한 (isin, ex) 의 당일 누적 — 압축 바이트(이어붙인 zstd 프레임) 그대로. */
export type LiveFetchMemoEntry = {
  /** 마지막 응답의 `X-Tick-Epoch` — 첫 요청 전엔 없음. */
  epoch?: string;
  /** 마지막 응답의 `X-Tick-Offset-End` — 다음 요청의 offset. */
  offsetEnd: number;
  /** 지금까지 받은 압축 바이트(프레임 이어붙임). */
  bytes: Uint8Array;
};
