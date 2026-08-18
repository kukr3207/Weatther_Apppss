import { useEffect, useState } from 'react';

function readOnline(target) {
  return target?.navigator?.onLine !== false;
}

export function useOnlineStatus(target = globalThis.window) {
  const [online, setOnline] = useState(() => readOnline(target));

  useEffect(() => {
    if (!target?.addEventListener) return undefined;
    const update = () => setOnline(readOnline(target));
    target.addEventListener('online', update);
    target.addEventListener('offline', update);
    return () => {
      target.removeEventListener('online', update);
      target.removeEventListener('offline', update);
    };
  }, [target]);

  return online;
}
