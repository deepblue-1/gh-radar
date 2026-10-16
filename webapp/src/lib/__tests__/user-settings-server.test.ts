import { describe, expect, it } from 'vitest';
import type { RelayAccount, RelayUserSettingsMsg } from '@gh-radar/shared';
import { firstServerKeyOf, userSettingsForAccount, userSettingsForServer } from '../user-settings-server';

/** 84 한 건 — 서버를 가르는 값은 `preBuyAmount` 하나로 본다. */
function us(serverKey: string | undefined, preBuyAmount: number): RelayUserSettingsMsg {
  return {
    t: 'user.settings',
    present: true,
    ...(serverKey === undefined ? {} : { serverKey }),
    preBuyAmount,
    addBuyAmount: 4000,
    postBuyAmount: 4000,
    postBuyMaxCount: 3,
    postBuyFloorQty: 0,
    postBuyReboundPct: 30,
    sellQtyTrackRatio: 55,
    autoSellPeriodSec: 3,
    auctionSellRatioPct: 20,
    autoSellRatioDefaultPct: 10,
    autoSellMethodDefault: 3,
    postBuyFloorAmount: 84,
  };
}

const KB = us('KB120', 1000);
const KYOBO = us('KYOBO119', 2000);
/** 구 relay(서버키 없음) 84 — 리듀서가 `""` 칸에 둔다. */
const LEGACY = us(undefined, 3000);

/** relay 병합 순 — primary(KB120) 계좌가 먼저. */
const ACCOUNTS: RelayAccount[] = [
  { accountNo: '111', name: 'KB 계좌', serverKey: 'KB120' },
  { accountNo: '222', name: '교보 계좌', serverKey: 'KYOBO119' },
  { accountNo: '333', name: '서버키 모름' },
];

describe('P32 서버별 84 조회 (D-14a · D-14b · Pitfall 14)', () => {
  describe('firstServerKeyOf — accounts[] 에서 처음 나온 서버키 = primary', () => {
    it('서버키 없는 계좌는 건너뛰고 첫 서버키 · 하나도 없으면 undefined', () => {
      const noKey: RelayAccount = { accountNo: 'x', name: '' };
      expect(firstServerKeyOf([noKey, ...ACCOUNTS])).toBe('KB120');
      expect(firstServerKeyOf([noKey])).toBeUndefined();
      expect(firstServerKeyOf([])).toBeUndefined();
    });
  });

  describe('userSettingsForServer — /me 설정 탭(구 relay 관용 있음)', () => {
    it('그 서버 칸이 있으면 그 값', () => {
      const map = new Map([
        ['KB120', KB],
        ['KYOBO119', KYOBO],
      ]);
      expect(userSettingsForServer(map, 'KB120', ACCOUNTS)).toBe(KB);
      expect(userSettingsForServer(map, 'KYOBO119', ACCOUNTS)).toBe(KYOBO);
    });

    it('그 서버 칸이 없고 첫 서버(primary)이며 "" 칸이 있으면 "" 값(구 relay 84 = primary 것)', () => {
      const map = new Map([['', LEGACY]]);
      expect(userSettingsForServer(map, 'KB120', ACCOUNTS)).toBe(LEGACY);
    });

    it('그 서버 칸이 없고 첫 서버가 아니면 undefined — "" 칸(primary 값)을 다른 서버 값으로 쓰지 않는다', () => {
      const map = new Map([
        ['', LEGACY],
        ['KB120', KB],
      ]);
      expect(userSettingsForServer(map, 'KYOBO119', ACCOUNTS)).toBeUndefined();
    });

    it('그 서버 칸이 있으면 "" 칸보다 우선한다(새 relay 84 가 이긴다)', () => {
      const map = new Map([
        ['', LEGACY],
        ['KB120', KB],
      ]);
      expect(userSettingsForServer(map, 'KB120', ACCOUNTS)).toBe(KB);
    });

    it('serverKey 가 없거나 빈 문자열이면 "" 칸(서버키 없는 계좌 · 목록 밖 계좌 = 종전 단일 동작)', () => {
      const legacyOnly = new Map([['', LEGACY]]);
      expect(userSettingsForServer(legacyOnly, undefined, ACCOUNTS)).toBe(LEGACY);
      expect(userSettingsForServer(legacyOnly, '', ACCOUNTS)).toBe(LEGACY);
      // 새 relay 는 "" 칸을 만들지 않는다 → 목록 밖 계좌는 「불러오는 중」 잠금(fail-safe).
      expect(userSettingsForServer(new Map([['KB120', KB]]), undefined, ACCOUNTS)).toBeUndefined();
    });

    it('빈 Map(아무 서버도 84 미수신) → undefined', () => {
      expect(userSettingsForServer(new Map(), 'KB120', ACCOUNTS)).toBeUndefined();
      expect(userSettingsForServer(new Map(), undefined, ACCOUNTS)).toBeUndefined();
    });
  });

  describe('userSettingsForAccount — 상따 폼 시딩(관용 없음)', () => {
    it('계좌 serverKey 가 없으면 undefined — "" 칸이 있어도 쓰지 않는다', () => {
      const map = new Map([
        ['', LEGACY],
        ['KB120', KB],
      ]);
      expect(userSettingsForAccount(map, '333', ACCOUNTS)).toBeUndefined();
    });

    it('accounts[] 에 없는 계좌도 undefined', () => {
      expect(userSettingsForAccount(new Map([['', LEGACY]]), '999', ACCOUNTS)).toBeUndefined();
    });

    it('계좌 serverKey 가 있으면 그 서버 칸', () => {
      const map = new Map([
        ['KB120', KB],
        ['KYOBO119', KYOBO],
      ]);
      expect(userSettingsForAccount(map, '111', ACCOUNTS)).toBe(KB);
      expect(userSettingsForAccount(map, '222', ACCOUNTS)).toBe(KYOBO);
    });

    it('그 서버 칸이 없으면 undefined — primary(KB120) · "" 칸으로 대신 채우지 않는다(Pitfall 14)', () => {
      const map = new Map([
        ['', LEGACY],
        ['KB120', KB],
      ]);
      expect(userSettingsForAccount(map, '222', ACCOUNTS)).toBeUndefined();
    });

    it('첫 서버 계좌도 "" 칸으로 대신 채우지 않는다(/me 관용과 다르다)', () => {
      expect(userSettingsForAccount(new Map([['', LEGACY]]), '111', ACCOUNTS)).toBeUndefined();
    });
  });
});
