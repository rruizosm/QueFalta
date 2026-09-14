import { supabase } from '../lib/supabase';
import { parseDailyWord, parseWordRanking } from '../lib/wordGamePayload';

export type LetterState = 'absent' | 'present' | 'correct';
export type RankingPeriod = 'daily' | 'weekly' | 'monthly' | 'all';
export interface WordGuess { word: string; feedback: LetterState[] }
export interface DailyWord {
  id: string; day: string; language: 'es'; length: number;
  status: 'playing' | 'won' | 'lost'; guesses: WordGuess[]; score: number;
  solution: string | null; endsAt: string; serverNow: string;
}
export interface WordRank {
  rank: number; username: string | null; score: number; wins: number; isMe: boolean;
  avatarUrl?: string | null; isPlus?: boolean;
}
export interface WordRanking { leaders: WordRank[]; me: WordRank | null }

async function request<T>(run: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(run(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('WORD_TIMEOUT')); }, 15_000);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

export async function fetchDailyWord(): Promise<DailyWord> {
  const { data, error } = await request((signal) => supabase.rpc('word_game_today', { p_language: 'es' }).abortSignal(signal));
  if (error) throw error;
  return parseDailyWord(data);
}

export async function submitWordGuess(gameId: string, word: string, expectedAttempts: number): Promise<DailyWord> {
  const { data, error } = await request((signal) => supabase.rpc('word_game_guess', {
    p_game_id: gameId, p_word: word, p_expected_attempts: expectedAttempts,
  }).abortSignal(signal));
  if (error) throw error;
  return parseDailyWord(data);
}

export async function fetchWordRanking(period: RankingPeriod): Promise<WordRanking> {
  const { data, error } = await request((signal) => supabase.rpc('word_game_ranking', { p_language: 'es', p_period: period }).abortSignal(signal));
  if (error) throw error;
  return parseWordRanking(data);
}
