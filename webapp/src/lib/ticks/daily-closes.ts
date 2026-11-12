'use client';

/** 일 이동평균용 앞 거래일 종가 — RED 뼈대(계약 이름만 · 구현 전). */
export async function fetchPrevCloses(
  _code: string,
  _ymd: string,
  _n: number,
  _signal?: AbortSignal,
): Promise<number[]> {
  return [];
}
