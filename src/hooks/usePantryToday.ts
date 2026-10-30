import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { pantryLocalDateKey } from '../lib/pantryLayout';

/** One clock for both inventories, refreshed at midnight and on foreground. */
export function usePantryToday(): string {
  const [today, setToday] = useState(pantryLocalDateKey);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      setToday(pantryLocalDateKey());
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(refresh, midnight.getTime() - now.getTime() + 100);
    };
    refresh();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, []);
  return today;
}
