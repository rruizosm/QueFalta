import type { DailyWord, WordRank, WordRanking } from '../api/wordGame';

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const word = (value: unknown, length: number): value is string => typeof value === 'string' && value.length === length && /^[A-ZÑ]+$/.test(value);
const timestamp = (value: unknown): boolean => typeof value === 'string' && Number.isFinite(Date.parse(value));
const invalid = (): never => { throw new Error('WORD_BAD_RESPONSE'); };

/** Fail closed instead of rendering a malformed board or unlocking extra turns. */
export function parseDailyWord(data: unknown): DailyWord {
  if (!record(data) || typeof data.id !== 'string' || !data.id ||
    typeof data.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.day) ||
    data.language !== 'es' || !integer(data.length, 4, 6) ||
    (data.status !== 'playing' && data.status !== 'won' && data.status !== 'lost') || !integer(data.score, 0, 1000) ||
    !timestamp(data.endsAt) || !timestamp(data.serverNow) || !Array.isArray(data.guesses) || data.guesses.length > 6) return invalid();
  const length = data.length;
  if (!data.guesses.every((guess: unknown) => record(guess) && word(guess.word, length) &&
    Array.isArray(guess.feedback) && guess.feedback.length === length &&
    guess.feedback.every((state: unknown) => state === 'absent' || state === 'present' || state === 'correct'))) return invalid();
  if (data.status === 'playing' && (data.solution !== null || data.score !== 0 || data.guesses.length >= 6)) return invalid();
  if (data.status !== 'playing' && (!word(data.solution, length) || !data.guesses.length)) return invalid();
  if (data.status === 'lost' && (data.guesses.length !== 6 || data.score !== 0)) return invalid();
  if (data.status === 'won' && data.score !== 1000 - 150 * (data.guesses.length - 1)) return invalid();
  return data as unknown as DailyWord;
}

function rank(value: unknown): value is WordRank {
  return record(value) && integer(value.rank, 1) && integer(value.score, 0) && integer(value.wins, 0) &&
    (value.username === null || typeof value.username === 'string') && typeof value.isMe === 'boolean' &&
    (value.avatarUrl === undefined || value.avatarUrl === null || typeof value.avatarUrl === 'string') &&
    (value.isPlus === undefined || typeof value.isPlus === 'boolean');
}
export function parseWordRanking(data: unknown): WordRanking {
  if (!record(data) || !Array.isArray(data.leaders) || data.leaders.length > 50 ||
    !data.leaders.every(rank) || !(data.me === null || (rank(data.me) && data.me.isMe))) return invalid();
  return data as unknown as WordRanking;
}
