/**
 * supervisor 进程内的轮次跟踪器（durable SOT 是 events.jsonl，这里只临时记住 input seq
 * 让 inbox/stdout 发出匹配的 turn_started/turn_finished）。MVP 不接 idle 计时，hooks 多为空。
 */
export interface ActiveTurn {
  inputSeq: number;
  turnId: string;
}

export type TurnOutcome = "done" | "error" | "aborted";

export interface TurnTrackerHooks {
  onIdleExit?: () => void;
  onIdleEnter?: () => void;
}

export class TurnTracker {
  private turns: ActiveTurn[] = [];
  private hooks: TurnTrackerHooks;

  constructor(hooks: TurnTrackerHooks = {}) {
    this.hooks = hooks;
  }

  begin(inputSeq: number): ActiveTurn {
    const wasIdle = this.turns.length === 0;
    const turn: ActiveTurn = { inputSeq, turnId: `msg:${inputSeq}` };
    this.turns.push(turn);
    if (wasIdle) this.hooks.onIdleExit?.();
    return turn;
  }

  finish(): ActiveTurn | undefined {
    const turn = this.turns.pop();
    if (turn && this.turns.length === 0) this.hooks.onIdleEnter?.();
    return turn;
  }

  abortCurrent(): ActiveTurn | undefined {
    const turn = this.turns.pop();
    if (turn && this.turns.length === 0) this.hooks.onIdleEnter?.();
    return turn;
  }

  current(): ActiveTurn | undefined {
    return this.turns[this.turns.length - 1];
  }
}
