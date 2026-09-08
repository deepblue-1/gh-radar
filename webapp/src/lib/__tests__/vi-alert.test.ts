import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Phase 16 Plan 14 Task 1 — VI 공용 순수 유틸 (TRADE-02).
 *
 * 여기서 잠그는 것은 **한 곳이 틀리면 금액·시각이 통째로 어긋나는** 계약이다:
 *   - 만원↔원 변환 (한 자리 틀리면 1만 배 주문)
 *   - `vi_end_time` 3분기 (정상 −10초 / 파싱 실패 +110초 / **과거 시각** +110초)
 *   - 마감알림 설정은 **이 기기 전용**이고 권한 거부가 조용히 지나가지 않는다
 *   - `ServerMessage` VI 몫 판정이 상따 판정을 **재사용**하고 relay 자기 거부를 먹지 않는다
 */

import {
  VI_ALERT_FALLBACK_MS,
  VI_ALERT_LEAD_MS,
  VI_ALERT_STORAGE_KEY,
  isViServerMessage,
  krwToManwon,
  manwonToKrw,
  notifyViEnd,
  parseViEndTime,
  readViAlertEnabled,
  requestViAlertPermission,
  scheduleViAlert,
  writeViAlertEnabled,
} from '../vi-alert';

/** 수신 시각 기준선 — 2026-09-09 13:44:02.000 (로컬). */
const RECEIVED = new Date(2026, 8, 9, 13, 44, 2, 0);

describe('금액 단위 변환 — 만원 ↔ 원', () => {
  it('만원 → 원은 정확히 10,000 배다', () => {
    expect(manwonToKrw(1_000)).toBe(10_000_000);
    expect(manwonToKrw(0)).toBe(0);
    expect(manwonToKrw(1)).toBe(10_000);
  });

  it('원 → 만원은 내림이다 — 올리면 재전송 때 금액이 늘어난다', () => {
    expect(krwToManwon(10_000_000)).toBe(1_000);
    expect(krwToManwon(19_999)).toBe(1);
    expect(krwToManwon(9_999)).toBe(0);
  });

  it('왕복해도 만원 단위 값은 보존된다', () => {
    for (const manwon of [0, 1, 22, 1_000, 12_345]) {
      expect(krwToManwon(manwonToKrw(manwon))).toBe(manwon);
    }
  });
});

describe('parseViEndTime — "HHMMSSuuu"', () => {
  it('정상 값은 수신일에 붙은 Date 다', () => {
    const end = parseViEndTime('134530250', RECEIVED);
    expect(end).not.toBeNull();
    expect(end!.getFullYear()).toBe(2026);
    expect(end!.getMonth()).toBe(8);
    expect(end!.getDate()).toBe(9);
    expect(end!.getHours()).toBe(13);
    expect(end!.getMinutes()).toBe(45);
    expect(end!.getSeconds()).toBe(30);
    expect(end!.getMilliseconds()).toBe(250);
  });

  it('9자 미만·숫자 아님·범위 밖은 null 이다 — 0시로 뭉개지 않는다', () => {
    expect(parseViEndTime('', RECEIVED)).toBeNull();
    expect(parseViEndTime('13453', RECEIVED)).toBeNull();
    expect(parseViEndTime('13453025x', RECEIVED)).toBeNull();
    expect(parseViEndTime('254530250', RECEIVED)).toBeNull(); // hh = 25
    expect(parseViEndTime('136030250', RECEIVED)).toBeNull(); // mm = 60
    expect(parseViEndTime('134560250', RECEIVED)).toBeNull(); // ss = 60
  });
});

describe('scheduleViAlert — 3분기', () => {
  it('① 정상 시각 → 마감 −10초', () => {
    // 13:45:30.250 마감 → 13:45:20.250 알림
    const s = scheduleViAlert({ viEndTime: '134530250' }, RECEIVED);
    expect(s.fallback).toBe(false);
    expect(s.at.getTime()).toBe(new Date(2026, 8, 9, 13, 45, 30, 250).getTime() - VI_ALERT_LEAD_MS);
  });

  it('② 파싱 실패 → 수신 +110초', () => {
    const s = scheduleViAlert({ viEndTime: 'nonsense!' }, RECEIVED);
    expect(s.fallback).toBe(true);
    expect(s.at.getTime()).toBe(RECEIVED.getTime() + VI_ALERT_FALLBACK_MS);
  });

  it('③ 과거 시각 → 수신 +110초 (즉시 울리지 않는다)', () => {
    // 13:40:00 은 수신(13:44:02)보다 과거다.
    const s = scheduleViAlert({ viEndTime: '134000000' }, RECEIVED);
    expect(s.fallback).toBe(true);
    expect(s.at.getTime()).toBe(RECEIVED.getTime() + VI_ALERT_FALLBACK_MS);
    // ★ −10초를 그대로 적용했다면 알림이 과거에 잡혀 즉시 울린다.
    expect(s.at.getTime()).toBeGreaterThan(RECEIVED.getTime());
  });

  it('마감이 수신과 같은 시각이어도 폴백이다 (미래가 아니다)', () => {
    const s = scheduleViAlert({ viEndTime: '134402000' }, RECEIVED);
    expect(s.fallback).toBe(true);
  });

  it('타이머를 걸지 않는다 — 순수 함수다', () => {
    const spy = vi.spyOn(window, 'setTimeout');
    scheduleViAlert({ viEndTime: '134530250' }, RECEIVED);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('마감알림 설정 — 이 기기 전용', () => {
  beforeEach(() => window.localStorage.clear());

  it('기본은 꺼짐이다', () => {
    expect(readViAlertEnabled()).toBe(false);
  });

  it('저장 키는 `gh-radar:vi-alert` 이고 값이 왕복한다', () => {
    writeViAlertEnabled(true);
    expect(window.localStorage.getItem(VI_ALERT_STORAGE_KEY)).toBe('on');
    expect(readViAlertEnabled()).toBe(true);

    writeViAlertEnabled(false);
    expect(window.localStorage.getItem(VI_ALERT_STORAGE_KEY)).toBe('off');
    expect(readViAlertEnabled()).toBe(false);
  });

  it('알 수 없는 값은 꺼짐으로 읽는다', () => {
    window.localStorage.setItem(VI_ALERT_STORAGE_KEY, 'yes');
    expect(readViAlertEnabled()).toBe(false);
  });
});

describe('알림 권한 — 실패는 사유를 들고 돌아온다', () => {
  afterEach(() => {
    // 다음 테스트가 남은 스텁을 보고 통과하지 않게 지운다.
    Reflect.deleteProperty(window, 'Notification');
  });

  function stubNotification(
    permission: NotificationPermission,
    request?: () => Promise<NotificationPermission>,
  ): void {
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      writable: true,
      value: Object.assign(
        function FakeNotification() {
          /* 생성만 되고 아무 일도 하지 않는다 */
        },
        {
          permission,
          requestPermission: request ?? (async () => permission),
        },
      ),
    });
  }

  it('Notification 자체가 없으면 사유를 돌려준다 (조용한 성공 금지)', async () => {
    const result = await requestViAlertPermission();
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('알림을 지원하지 않아요');
  });

  it('이미 허용돼 있으면 다시 묻지 않는다', async () => {
    const ask = vi.fn(async () => 'granted' as NotificationPermission);
    stubNotification('granted', ask);
    await expect(requestViAlertPermission()).resolves.toEqual({ ok: true });
    expect(ask).not.toHaveBeenCalled();
  });

  it('거부되면 사유를 돌려준다', async () => {
    stubNotification('default', async () => 'denied');
    const result = await requestViAlertPermission();
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('차단돼 있어요');
  });

  it('권한이 없으면 알림을 만들지 않는다', () => {
    const ctor = vi.fn();
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      writable: true,
      value: Object.assign(ctor, { permission: 'denied', requestPermission: async () => 'denied' }),
    });
    notifyViEnd('삼성전자');
    expect(ctor).not.toHaveBeenCalled();
  });

  it('허용돼 있으면 종목명만 실어 알린다 — 계좌·금액은 싣지 않는다', () => {
    const ctor = vi.fn();
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      writable: true,
      value: Object.assign(ctor, {
        permission: 'granted',
        requestPermission: async () => 'granted',
      }),
    });
    notifyViEnd('이수페타시스');
    expect(ctor).toHaveBeenCalledTimes(1);
    const [title, options] = ctor.mock.calls[0] as [string, NotificationOptions];
    expect(title).toBe('VI 마감 임박');
    expect(options.body).toContain('이수페타시스');
    expect(options.body).not.toMatch(/\d{6,}/); // 계좌번호·금액 같은 긴 숫자가 없다
  });
});

describe('isViServerMessage — 통지 몫 판정 (Pitfall 9)', () => {
  const msg = (src: string, i: string) => ({ src, i });

  it('`SetVITrigger` 는 VI 몫이다', () => {
    expect(isViServerMessage(msg('SetVITrigger', ''))).toBe(true);
    expect(isViServerMessage(msg('SetVITrigger', 'KR7005930003'))).toBe(true);
  });

  it('종목 없는 `Account` 통지는 VI 몫이다', () => {
    expect(isViServerMessage(msg('Account', ''))).toBe(true);
  });

  it('종목 붙은 `Account` 통지는 상따 몫이라 VI 가 먹지 않는다', () => {
    expect(isViServerMessage(msg('Account', 'KR7005930003'))).toBe(false);
  });

  it('`SetLimitChaser` 는 VI 몫이 아니다', () => {
    expect(isViServerMessage(msg('SetLimitChaser', ''))).toBe(false);
  });

  it('★ relay 자기 거부(`Relay`)를 VI 통지로 읽지 않는다', () => {
    // 이걸 먹으면 상따 요청의 형식 오류가 「내 자동매수가 거부됐다」로 그려진다.
    expect(isViServerMessage(msg('Relay', ''))).toBe(false);
    expect(isViServerMessage(msg('System', ''))).toBe(false);
  });
});
