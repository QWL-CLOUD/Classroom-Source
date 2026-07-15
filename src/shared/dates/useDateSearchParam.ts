import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { parseLocalDate, todayLocalDate } from '@/shared/dates/localDate';

export function useDateSearchParam() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawDate = searchParams.get('date');
  const date = useMemo(() => (parseLocalDate(rawDate) ? rawDate! : todayLocalDate()), [rawDate]);

  const setDate = useCallback(
    (nextDate: string, options: { replace?: boolean } = {}) => {
      if (!parseLocalDate(nextDate)) throw new Error(`Invalid local date: ${nextDate}`);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('date', nextDate);
      setSearchParams(nextParams, options);
    },
    [searchParams, setSearchParams],
  );

  return { date, setDate };
}
