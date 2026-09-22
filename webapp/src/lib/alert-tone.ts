/**
 * 돌파 알림음 — Web Audio 단음 합성 (Phase 18 D-17, TRADE-06).
 *
 * ① 코드베이스 최초의 `AudioContext` 사용처다. 로컬 설정·SSR 가드 규율은 아래와 같다
 *   - 기본은 **꺼짐**(`readTonePref()` — `gh-radar:breakout-tone`). 이 기기 전용이다.
 *   - SSR·미지원 브라우저에서 throw 하지 않고 조용한 무동작으로 수렴한다.
 *   - 파일 자산이 없다 — sine 880Hz · 총 160ms · gain 0 → 0.18(ramp 10ms) → 0(exponential ramp).
 *     짧은 attack/release 로 클릭 노이즈를 피한다(UI-SPEC §알림음 확정 파라미터).
 *
 * ② `AudioContext` 는 **지연 생성**이다
 *   모듈 로드 시점에 만들지 않는다 — Next App Router 라 서버에서도 평가되고, 제스처 전 생성은
 *   자동재생 정책에 걸려 `suspended` 로 시작한다.
 *
 * ③ 차단 판정과 해제
 *   `AudioContext.state === "suspended"` 면 차단이다(`isTonePlaybackBlocked`). 해제
 *   `resumeToneContext()` 는 **사용자 제스처 핸들러 안에서만** 부른다 — 제스처 밖 `resume()` 은
 *   브라우저가 무시한다. UI 는 차단일 때 스피커 아이콘에 「클릭해 활성화」를 붙인다.
 *
 * ④ 알림 본문·로그에 계좌번호·금액을 싣지 않는다 — 이 모듈은 아무것도 싣지 않는다.
 */

import { readTonePref } from "@/lib/breakout-list";

const TONE_FREQ_HZ = 880;
const TONE_TOTAL_S = 0.16;
const TONE_ATTACK_S = 0.01;
const TONE_PEAK_GAIN = 0.18;
/** exponential ramp 는 0 에 도달할 수 없다 — 들리지 않는 바닥값. */
const TONE_FLOOR_GAIN = 0.0001;

type AudioContextCtor = new () => AudioContext;

let ctx: AudioContext | null = null;

/** 브라우저의 `AudioContext` 생성자. SSR·미지원이면 `null`. */
function audioCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const g = globalThis as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

/** 컨텍스트를 처음 필요할 때 만든다(②). 생성 실패는 `null`. */
function ensureContext(): AudioContext | null {
  if (ctx !== null) return ctx;
  const Ctor = audioCtor();
  if (Ctor === null) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

/**
 * 돌파 알림음 1회. 울리기를 **시도했으면** `true`, 토글 꺼짐·미지원·실패면 `false`.
 *
 * ⚠️ **순서가 계약이다** — 호출자는 `addSounded` 를 **먼저** 부른 뒤 이 함수를 부른다.
 *    반대로 하면 재생 실패 시 기록이 남지 않아 하루 종일 중복 알림이 난다(D-17).
 *    이 모듈은 저장을 하지 않는다 — 그것은 `breakout-list.ts` 몫이다.
 *
 * 토글이 꺼져 있으면 컨텍스트도 노드도 만들지 않는다. `suspended` 여도 노드는 예약한다 —
 * 차단 표시는 `isTonePlaybackBlocked` 가 따로 한다.
 */
export function playBreakoutTone(): boolean {
  if (readTonePref() !== "on") return false;
  const ac = ensureContext();
  if (ac === null) return false;
  try {
    const t0 = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(TONE_FREQ_HZ, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(TONE_PEAK_GAIN, t0 + TONE_ATTACK_S);
    gain.gain.exponentialRampToValueAtTime(TONE_FLOOR_GAIN, t0 + TONE_TOTAL_S);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + TONE_TOTAL_S);
    return true;
  } catch (err) {
    // 무로그 fail-safe 금지 — 원인만 남긴다(종목·계좌 값은 싣지 않는다).
    console.warn("[alert-tone] 알림음 재생 실패", err);
    return false;
  }
}

/** 자동재생 정책에 막혀 있는가 — `AudioContext.state === "suspended"`. 컨텍스트가 없으면 `false`. */
export function isTonePlaybackBlocked(): boolean {
  return ctx !== null && ctx.state === "suspended";
}

/**
 * 컨텍스트를 만들고(필요하면) `resume()` 한다. **사용자 제스처 핸들러 안에서만** 부른다(③) —
 * 알림음 토글을 켜는 클릭, 「클릭해 활성화」 클릭. 실패해도 throw 하지 않는다.
 */
export async function resumeToneContext(): Promise<void> {
  const ac = ensureContext();
  if (ac === null) return;
  try {
    await ac.resume();
  } catch (err) {
    console.warn("[alert-tone] 오디오 활성화 실패", err);
  }
}
