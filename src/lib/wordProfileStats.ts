export const STAT_PERIODS = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type StatPeriod = typeof STAT_PERIODS[number];
export interface WordProfileStats {
  today: string;
  currentStreak: number;
  bestStreak: number;
  completedCount: number;
  activityDays: string[];
  bestPositions: Partial<Record<StatPeriod, { rank: number; periodStart: string; provisional: boolean }>>;
}

export function parseWordProfileStats(value: unknown): WordProfileStats {
  const v = value as WordProfileStats;
  const date = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
    && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
  const count = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
  if (!v || !date(v.today) || !count(v.currentStreak) || !count(v.bestStreak) || !count(v.completedCount)
    || !Array.isArray(v.activityDays) || !v.activityDays.every(date)
    || !v.bestPositions || typeof v.bestPositions !== 'object') throw new Error('WORD_STATS_INVALID');
  for (const period of STAT_PERIODS) {
    const position = v.bestPositions[period];
    if (position && (!count(position.rank) || position.rank < 1 || !date(position.periodStart)
      || typeof position.provisional !== 'boolean')) throw new Error('WORD_STATS_INVALID');
  }
  return v;
}

// UTC is used only for calendar arithmetic; today is supplied by the Madrid server.
export function activityMonths(today: string) {
  const end = new Date(`${today}T12:00:00Z`);
  return Array.from({ length: 12 }, (_, index) => {
    const first = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11 + index, 1, 12));
    const length = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    const offset = (first.getUTCDay() + 6) % 7;
    const cells = Array.from({ length: 42 }, (_, cell) => {
      const day = cell - offset + 1;
      return day < 1 || day > length ? null
        : new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), day, 12)).toISOString().slice(0, 10);
    });
    return { month: first.toISOString(), cells };
  });
}
