import type { DailyWord } from '../api/wordGame';

export type WordGameError = '' | 'loadError' | 'sendError' | 'invalid' | 'repeated' | 'length' | 'stale' | 'expired' | 'notSent';
export interface WordGameState {
  game: DailyWord | null;
  draft: string;
  loading: boolean;
  sending: boolean;
  uncertain: boolean;
  error: WordGameError;
  remaining: number;
}
interface Dependencies {
  storageKey: string;
  today: () => Promise<DailyWord>;
  submit: (id: string, word: string, attempts: number) => Promise<DailyWord>;
  readDraft: () => Promise<string | null>;
  writeDraft: (value: string) => Promise<unknown>;
  now?: () => number;
}
interface Draft { gameId: string; attempts: number; word: string; pending: boolean }
const draftWrites = new Map<string, Promise<unknown>>();

export function wordDraftKey(userId: string) {
  return `@quefalta/word-draft:v1:${userId}:es`;
}

/** Only drafts live on the device. Attempts, feedback and scores are server-owned. */
export class WordGameSession {
  state: WordGameState = { game: null, draft: '', loading: true, sending: false, uncertain: false, error: '', remaining: 0 };
  private listeners = new Set<(state: WordGameState) => void>();
  private active = false;
  private deadline = 0;
  private retryAt = 0;
  private operation = false;
  private refreshAfterSend = false;
  private readonly now: () => number;

  constructor(private readonly deps: Dependencies) { this.now = deps.now ?? (() => performance.now()); }

  subscribe(listener: (state: WordGameState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }

  private update(patch: Partial<WordGameState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener(this.state));
  }

  private persist() {
    const { game, draft, uncertain } = this.state;
    if (!game) return Promise.resolve();
    const value = JSON.stringify({ gameId: game.id, attempts: game.guesses.length, word: draft, pending: uncertain } satisfies Draft);
    // Preserve write order when typing quickly or leaving during a submission.
    const key = this.deps.storageKey;
    const write = (draftWrites.get(key) ?? Promise.resolve()).then(() => this.deps.writeDraft(value)).catch(() => {});
    draftWrites.set(key, write);
    void write.then(() => { if (draftWrites.get(key) === write) draftWrites.delete(key); });
    return write;
  }

  private async savedDraft(game: DailyWord): Promise<Draft | null> {
    try {
      await draftWrites.get(this.deps.storageKey);
      const saved: unknown = JSON.parse(await this.deps.readDraft() ?? 'null');
      if (!saved || typeof saved !== 'object') return null;
      const value = saved as Draft;
      if (value.gameId !== game.id || value.attempts !== game.guesses.length ||
        typeof value.word !== 'string' || !/^[A-ZÑ]*$/.test(value.word) || value.word.length > game.length ||
        typeof value.pending !== 'boolean' || (value.pending && value.word.length !== game.length)) return null;
      return value;
    } catch { return null; }
  }

  private accept(game: DailyWord, draft?: Draft | null) {
    const duration = Math.max(0, Date.parse(game.endsAt) - Date.parse(game.serverNow));
    this.deadline = this.now() + duration;
    const sameSlot = this.state.game?.id === game.id && this.state.game.guesses.length === game.guesses.length;
    const word = game.status === 'playing' ? (draft?.word ?? (sameSlot ? this.state.draft : '')) : '';
    const pending = game.status === 'playing' && (draft?.pending ?? (sameSlot && this.state.uncertain));
    this.update({ game, draft: word, uncertain: pending, remaining: Math.ceil(duration / 1000), error: pending ? 'sendError' : '' });
    // Reads do not rewrite storage: a late refresh from a closed screen must
    // not overwrite typing in its replacement. Old slots are ignored on load.
  }

  setActive(active: boolean) {
    this.active = active;
    if (active) void this.refresh();
  }

  async refresh() {
    if (this.operation) {
      if (this.state.sending) this.refreshAfterSend = true;
      return;
    }
    this.operation = true;
    this.update({ loading: true, error: '' });
    try {
      const game = await this.deps.today();
      const draft = this.state.game ? undefined : await this.savedDraft(game);
      this.accept(game, draft);
      this.retryAt = 0;
    } catch { this.retryAt = this.now() + 30_000; this.update({ error: 'loadError' }); }
    finally {
      this.operation = false;
      this.update({ loading: false });
    }
  }

  tick() {
    if (!this.active) return;
    const remaining = Math.max(0, Math.ceil((this.deadline - this.now()) / 1000));
    if (remaining !== this.state.remaining) this.update({ remaining });
    // Errors never permanently block the new day. Back off when offline.
    if ((!this.state.game || remaining === 0) && !this.operation && this.now() >= this.retryAt) void this.refresh();
  }

  key(letter: string) {
    const { game, draft, uncertain } = this.state;
    if (!game || this.operation || uncertain || game.status !== 'playing' || this.now() >= this.deadline) return;
    if (letter !== '⌫' && !/^[A-ZÑ]$/.test(letter)) return;
    this.update({ draft: letter === '⌫' ? draft.slice(0, -1) : (draft.length < game.length ? draft + letter : draft), error: '' });
    void this.persist();
  }

  async send(): Promise<DailyWord['status'] | undefined> {
    const { game, draft } = this.state;
    if (!game || this.operation || game.status !== 'playing') return;
    if (this.now() >= this.deadline) { await this.refresh(); return; }
    if (draft.length !== game.length) { this.update({ error: 'length' }); return; }
    this.operation = true;
    this.update({ sending: true, uncertain: true, error: '' });
    await this.persist();
    try {
      const result = await this.deps.submit(game.id, draft, game.guesses.length);
      this.accept(result);
      return result.status;
    } catch (cause) {
      const message = cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : '';
      if (message.includes('WORD_INVALID') || message.includes('WORD_REPEATED')) {
        this.update({ uncertain: false, error: message.includes('WORD_INVALID') ? 'invalid' : 'repeated' });
        void this.persist();
      } else {
        try {
          const current = await this.deps.today();
          const changed = current.id !== game.id || current.guesses.length !== game.guesses.length;
          const committed = current.id === game.id && current.guesses[game.guesses.length]?.word === draft;
          this.accept(current);
          if (committed) return current.status;
          // Keep the exact pending request if the read raced a timed-out write.
          // Replaying it is idempotent; editing it before resolution is unsafe.
          this.update({ error: current.id !== game.id ? 'expired' : changed ? 'stale' : 'notSent' });
        } catch { this.update({ error: 'sendError' }); }
      }
    } finally {
      this.operation = false;
      this.update({ sending: false });
      if (this.refreshAfterSend) {
        this.refreshAfterSend = false;
        if (this.active) void this.refresh();
      }
    }
  }
}
