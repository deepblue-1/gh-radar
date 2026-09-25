import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';

/**
 * Phase 21 Plan 04 Task 2 — 오버레이 참조계수 · `back()` 회귀면(D-12 · D-26 · T-21-18).
 *
 * 실제 `ui/sheet` · `ui/dialog` 를 렌더한다 — Content 안 `NativeOverlayMarker` 의 마운트 수명이 곧
 * 오버레이 열림 수명이다. 각 케이스는 **깨졌을 때 사용자가 겪는 일**과 1:1 이다.
 *
 *  1. 열림/닫힘 신호 1회씩    → 깨지면 시트를 열어도 네이티브 탭바가 그대로 떠서 시트 하단을 가리거나,
 *                               닫아도 탭바가 영영 안 돌아온다(계수 누수 · T-21-18)
 *  2. 겹친 오버레이 0↔1 전이만 → 깨지면 시트 위 다이얼로그를 닫는 순간 탭바가 시트 위로 튀어나온다
 *  3. back() 가장 위만 닫음    → 깨지면 안드로이드 뒤로가기 한 번에 주문 확인과 그 아래 시트가 한꺼번에
 *                               닫히거나, 열린 시트가 있는데 앱이 뒤로 가 버린다
 *  4. 브라우저 무송신          → 깨지면 일반 브라우저에서 시트를 열 때마다 채널 송신이 난다
 *  5. 부모가 open 을 직접 바꿈 → 깨지면 AppShell 햄버거 드로어(`setSheetOpen(true)`)처럼 onOpenChange 가
 *                               안 불리는 경로에서 열림을 놓친다(RESEARCH Pattern 8)
 *  6. 키패드 시트(직접 조립)   → 깨지면 상따 값 편집 중 탭바가 키패드를 가리고, 당기면 입력이 날아간다
 *
 * ⚠️ 송신 단언은 **실제 postMessage 인자 배열을 JSON 파싱한 결과**로 한다. 닫힘은 퇴장 애니메이션 뒤
 *    Content 언마운트를 `waitFor` 로 확인한 다음 본다.
 */

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', theme: 'light', setTheme: vi.fn() }),
}));

import { NativeBridgeProvider } from '../native-bridge-provider';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { NumberPadSheet } from '@/components/trading/lc/number-pad-sheet';
import {
  enterBrowser,
  enterNativeApp,
  resetNativeMode,
  type NativeTestWindow,
} from './native-app-mode';

function gh(): NonNullable<NativeTestWindow['__ghTrade']> {
  const g = (window as NativeTestWindow).__ghTrade;
  if (!g) throw new Error('window.__ghTrade 가 설치되지 않았다');
  return g;
}

interface HarnessProps {
  sheetOpen: boolean;
  dialogOpen?: boolean;
  onSheetOpenChange?: (o: boolean) => void;
  onDialogOpenChange?: (o: boolean) => void;
}

/** 부모가 `open` 을 직접 쥔 제어형 — onOpenChange 는 스파이일 뿐 상태를 바꾸지 않는다. */
function Harness({ sheetOpen, dialogOpen = false, onSheetOpenChange, onDialogOpenChange }: HarnessProps) {
  return (
    <NativeBridgeProvider>
      <Sheet open={sheetOpen} onOpenChange={onSheetOpenChange}>
        <SheetContent side="left">
          <SheetTitle>시트 A</SheetTitle>
          <SheetDescription>드로어</SheetDescription>
        </SheetContent>
      </Sheet>
      <Dialog open={dialogOpen} onOpenChange={onDialogOpenChange}>
        <DialogContent>
          <DialogTitle>다이얼로그 B</DialogTitle>
          <DialogDescription>주문 확인</DialogDescription>
        </DialogContent>
      </Dialog>
    </NativeBridgeProvider>
  );
}

async function waitGone(name: string): Promise<void> {
  await waitFor(() => expect(screen.queryByRole('dialog', { name })).toBeNull());
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  resetNativeMode();
  vi.restoreAllMocks();
});

describe('앱 — 오버레이 참조계수', () => {
  it('1·5. 부모가 open 을 직접 true 로 바꾼 Sheet → overlay {open:true} 1회 · 닫힘(언마운트 뒤) → {open:false} 1회', async () => {
    const mode = enterNativeApp('ios');
    const onSheetOpenChange = vi.fn();
    const { rerender } = render(<Harness sheetOpen={false} onSheetOpenChange={onSheetOpenChange} />);
    expect(mode.payloadsOf('overlay')).toEqual([]);

    rerender(<Harness sheetOpen onSheetOpenChange={onSheetOpenChange} />);
    expect(screen.getByRole('dialog', { name: '시트 A' })).toBeTruthy();
    expect(onSheetOpenChange).not.toHaveBeenCalled();
    expect(mode.payloadsOf('overlay')).toEqual([{ open: true }]);

    rerender(<Harness sheetOpen={false} onSheetOpenChange={onSheetOpenChange} />);
    await waitGone('시트 A');
    expect(mode.payloadsOf('overlay')).toEqual([{ open: true }, { open: false }]);
  });

  it('2. Sheet A 위에 Dialog B 를 열고 닫아도 추가 송신 0 · A 를 닫을 때만 {open:false} 1회', async () => {
    const mode = enterNativeApp('android');
    const { rerender } = render(<Harness sheetOpen />);
    expect(mode.payloadsOf('overlay')).toEqual([{ open: true }]);

    rerender(<Harness sheetOpen dialogOpen />);
    expect(screen.getByRole('dialog', { name: '다이얼로그 B' })).toBeTruthy();
    expect(mode.payloadsOf('overlay')).toEqual([{ open: true }]);

    rerender(<Harness sheetOpen dialogOpen={false} />);
    await waitGone('다이얼로그 B');
    expect(mode.payloadsOf('overlay')).toEqual([{ open: true }]);

    rerender(<Harness sheetOpen={false} />);
    await waitGone('시트 A');
    expect(mode.payloadsOf('overlay')).toEqual([{ open: true }, { open: false }]);
  });
});

describe('앱 — NumberPadSheet(radix Dialog 직접 조립)', () => {
  it('6. 키패드 시트가 열리면 {open:true} 1회 · 닫혀 언마운트되면 {open:false} 1회', async () => {
    const mode = enterNativeApp('ios');
    const returnFocusRef = { current: null as HTMLElement | null };
    const pad = (open: boolean) => (
      <NativeBridgeProvider>
        <NumberPadSheet
          open={open}
          title="잔량"
          description="잔량이 이 값보다 줄면 매수를 넣어요"
          unit="주"
          purpose="apply"
          initialValue={10_000}
          serverValue={10_000}
          ctx={{ current: 0, upper: 0 }}
          returnFocusRef={returnFocusRef}
          onConfirm={vi.fn()}
          onClose={vi.fn()}
        />
      </NativeBridgeProvider>
    );
    const { rerender } = render(pad(true));
    expect(mode.payloadsOf('overlay')).toEqual([{ open: true }]);

    rerender(pad(false));
    await waitFor(() => expect(document.querySelector('[data-slot="numpad-sheet"]')).toBeNull());
    expect(mode.payloadsOf('overlay')).toEqual([{ open: true }, { open: false }]);
  });
});

describe('앱 — back()', () => {
  it('3. A·B 가 열려 있으면 true 이고 B 의 onOpenChange(false) 만 불린다(A 는 열린 채)', () => {
    enterNativeApp('android');
    const onSheetOpenChange = vi.fn();
    const onDialogOpenChange = vi.fn();
    render(
      <Harness
        sheetOpen
        dialogOpen
        onSheetOpenChange={onSheetOpenChange}
        onDialogOpenChange={onDialogOpenChange}
      />,
    );

    let ok = false;
    act(() => {
      ok = gh().back();
    });

    expect(ok).toBe(true);
    expect(onDialogOpenChange).toHaveBeenCalledTimes(1);
    expect(onDialogOpenChange).toHaveBeenCalledWith(false);
    expect(onSheetOpenChange).not.toHaveBeenCalled();
    // A 는 B(모달) 아래라 aria-hidden(접근성 이름 계산 제외)이지만 Content 는 여전히 마운트돼 있다.
    expect(document.querySelector('[data-slot="sheet-content"]')).not.toBeNull();
  });

  it('3b. 아무것도 안 열려 있으면 false', () => {
    enterNativeApp('android');
    render(<Harness sheetOpen={false} />);

    expect(gh().back()).toBe(false);
  });

  it('3c. 오버레이가 모두 닫히면(언마운트 뒤) 다시 false', async () => {
    enterNativeApp('ios');
    const { rerender } = render(<Harness sheetOpen />);
    rerender(<Harness sheetOpen={false} />);
    await waitGone('시트 A');

    expect(gh().back()).toBe(false);
  });
});

describe('브라우저(html.native-app 없음)', () => {
  it('4. Sheet 를 열고 닫아도 postMessage 0 · window.__ghTrade 없음', async () => {
    const mode = enterBrowser();
    const { rerender } = render(<Harness sheetOpen={false} />);
    rerender(<Harness sheetOpen />);
    expect(screen.getByRole('dialog', { name: '시트 A' })).toBeTruthy();
    rerender(<Harness sheetOpen={false} />);
    await waitGone('시트 A');

    for (const s of mode.spies) expect(s).not.toHaveBeenCalled();
    expect((window as NativeTestWindow).__ghTrade).toBeUndefined();
  });
});
