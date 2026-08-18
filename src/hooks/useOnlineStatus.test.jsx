import { act, renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { useOnlineStatus } from './useOnlineStatus';

function target(initial) {
  const listeners = new Map();
  return {
    navigator: { onLine: initial },
    addEventListener: vi.fn((name, listener) => listeners.set(name, listener)),
    removeEventListener: vi.fn((name) => listeners.delete(name)),
    change(name, value) {
      this.navigator.onLine = value;
      listeners.get(name)?.();
    },
  };
}

describe('online status hook', () => {
  test('tracks online and offline browser events', () => {
    const browser = target(true);
    const { result, unmount } = renderHook(() => useOnlineStatus(browser));
    expect(result.current).toBe(true);
    act(() => browser.change('offline', false));
    expect(result.current).toBe(false);
    act(() => browser.change('online', true));
    expect(result.current).toBe(true);
    unmount();
    expect(browser.removeEventListener).toHaveBeenCalledTimes(2);
  });
});
