/**
 * Phase 37 Plan 10 — 틱 격자 픽스처(테스트 입력). 원천 = shared 골든 픽스처 `cut1300-krx.ticks.zst`(37-02 오라클 생성 ·
 * 에코앤드림 KR7101360006 2026-10-16 13:00~13:59 KRX · 레코드 11,990 = A3 3,089 + B6 8,901 · zstd 한 프레임).
 *
 * - `tickGridZst()` = 서명 URL 이 주는 바이트 그대로(압축).
 * - `tickGridBytes()` = 해제한 레코드 프레이밍 바이트(Node zstd — 한 프레임이라 첫 프레임만 푸는 Node 한계에 걸리지 않는다).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { zstdDecompressSync } from 'node:zlib';

export const TICK_FIXTURE_DATE = '20261016';
export const TICK_FIXTURE_ISIN = 'KR7101360006';
export const TICK_FIXTURE_RECORDS = 11_990;
export const TICK_FIXTURE_A3 = 3_089;

const FILE = path.resolve(__dirname, '../../../packages/shared/src/__fixtures__/ticks/cut1300-krx.ticks.zst');

export function tickGridZst(): Uint8Array {
  return new Uint8Array(readFileSync(FILE));
}

export function tickGridBytes(): Uint8Array {
  return new Uint8Array(zstdDecompressSync(readFileSync(FILE)));
}
