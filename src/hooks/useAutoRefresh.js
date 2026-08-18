import { useEffect, useRef } from 'react';

export function useAutoRefresh(callback, options = {}) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const enabled = options.enabled !== false;
  const minutes = Number.isFinite(options.minutes) ? Math.max(1, options.minutes) : 10;
  const pauseWhenHidden = options.pauseWhenHidden !== false;

  useEffect(() => {
    if (!enabled) return undefined;
    let timer = null;

    function stop() {
      if (timer !== null) globalThis.clearInterval(timer);
      timer = null;
    }

    function start() {
      stop();
      if (pauseWhenHidden && globalThis.document?.hidden) return;
      timer = globalThis.setInterval(() => callbackRef.current?.(), minutes * 60_000);
    }

    function visibilityChanged() {
      if (globalThis.document?.hidden) stop();
      else start();
    }

    start();
    if (pauseWhenHidden) globalThis.document?.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      stop();
      if (pauseWhenHidden) globalThis.document?.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, [enabled, minutes, pauseWhenHidden]);
}
