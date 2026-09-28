import { parseWordProfileStats, type WordProfileStats } from '../lib/wordProfileStats';
import { supabase } from '../lib/supabase';
import { parseDailyWord, parseWordRankingWindow } from '../lib/wordGamePayload';

export type LetterState = 'absent' | 'present' | 'correct';
export type RankingPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'all';
export interface WordGuess { word: string; feedback: LetterState[] }
export interface DailyWord {
  id: string; day: string; language: 'es'; length: number;
  status: 'playing' | 'won' | 'lost'; guesses: WordGuess[]; score: number;
  scoringVersion: 1 | 2; startedAt: string | null; durationSeconds: number | null;
  solution: string | null; endsAt: string; serverNow: string;
}
export interface WordRank {
  rank: number; username: string | null; score: number; wins: number; isMe: boolean;
  avatarUrl?: string | null; isPlus?: boolean;
}
export interface WordRanking { leaders: WordRank[]; me: WordRank | null }
export interface WordRankingWindow extends WordRanking {
  periodStart: string; periodEnd: string; offset: number; hasPrevious: boolean;
}

async function request<T>(run: (signal: AbortSignal) => PromiseLike<T>, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  if (signal?.aborted) throw new Error('WORD_CANCELLED');
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(run(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('WORD_TIMEOUT')); }, 15_000);
      }),
    ]);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export async function fetchDailyWord(): Promise<DailyWord> {
  const { data, error } = await request((signal) => supabase.rpc('word_game_today', { p_language: 'es' }).abortSignal(signal));
  if (error) throw error;
  return parseDailyWord(data);
}

export async function startDailyWord(gameId: string): Promise<DailyWord> {
  const { data, error } = await request((signal) => supabase.rpc('word_game_start', { p_game_id: gameId }).abortSignal(signal));
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

export async function fetchWordRanking(period: RankingPeriod, offset = 0, groupId?: string, signal?: AbortSignal): Promise<WordRankingWindow> {
  const { data, error } = await request((signal) => supabase.rpc('word_game_ranking_window', {
    p_period: period, p_offset: offset, p_group_id: groupId ?? null,
  }).abortSignal(signal), signal);
  if (error) throw error;
  return parseWordRankingWindow(data);
}

export async function fetchWordProfileStats(signal?: AbortSignal): Promise<WordProfileStats> {
  const { data, error } = await request((requestSignal) =>
    supabase.rpc('word_game_profile_statistics').abortSignal(requestSignal), signal);
  if (error) throw error;
  return parseWordProfileStats(data);
}
