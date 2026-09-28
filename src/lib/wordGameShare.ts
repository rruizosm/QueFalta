import type { LetterState } from '../api/wordGame';

const cellByState: Record<LetterState, string> = {
  correct: '🟩',
  present: '🟨',
  absent: '⬛',
};

interface WordGameShareMessage {
  title: string;
  day: string;
  scoreLine: string;
  feedbackRows: LetterState[][];
  url: string;
}

/** Builds a spoiler-free result: this function never receives the guessed words. */
export function buildWordGameShareMessage({
  title, day, scoreLine, feedbackRows, url,
}: WordGameShareMessage): string {
  const grid = feedbackRows
    .map((row) => row.map((state) => cellByState[state]).join(''))
    .join('\n');

  return `${title}\n${day}\n${scoreLine}\n\n${grid}\n\n${url}`;
}
