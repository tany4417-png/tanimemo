import { describe, expect, it, vi } from "vitest";
import { popRedo, popUndo, pushAction, type Action, type ActionStacks } from "./actions";

function makeAction(label: string): Action {
  return { label, undo: vi.fn(async () => {}), redo: vi.fn(async () => {}) };
}

describe("pushAction", () => {
  it("pastの末尾へ積み、futureは空にする", () => {
    const s0: ActionStacks = { past: [], future: [] };
    const a = makeAction("a");
    const s1 = pushAction(s0, a);
    expect(s1).toEqual({ past: [a], future: [] });
  });

  it("複数回積むとpastが積み上がる", () => {
    let s: ActionStacks = { past: [], future: [] };
    const a = makeAction("a");
    const b = makeAction("b");
    s = pushAction(s, a);
    s = pushAction(s, b);
    expect(s).toEqual({ past: [a, b], future: [] });
  });

  it("futureがある状態で積むとfutureが破棄される", () => {
    const a = makeAction("a");
    const b = makeAction("b");
    const c = makeAction("c");
    const s0: ActionStacks = { past: [a], future: [b] };
    const s1 = pushAction(s0, c);
    expect(s1).toEqual({ past: [a, c], future: [] });
  });

  it("pastがmaxを超えたら先頭（古い方）から落とす", () => {
    let s: ActionStacks = { past: [], future: [] };
    const actions = [makeAction("1"), makeAction("2"), makeAction("3"), makeAction("4"), makeAction("5")];
    for (const a of actions) s = pushAction(s, a, 3);
    expect(s.past).toEqual([actions[2], actions[3], actions[4]]);
  });
});

describe("popUndo", () => {
  it("pastが空ならnullを返す", () => {
    const s0: ActionStacks = { past: [], future: [] };
    expect(popUndo(s0)).toBeNull();
  });

  it("pastの末尾を取り出し、futureの先頭へ積む", () => {
    const a = makeAction("a");
    const b = makeAction("b");
    const s0: ActionStacks = { past: [a, b], future: [] };
    const result = popUndo(s0);
    expect(result).not.toBeNull();
    expect(result?.action).toBe(b);
    expect(result?.stacks).toEqual({ past: [a], future: [b] });
  });

  it("既にfutureがある状態でも先頭に積む", () => {
    const a = makeAction("a");
    const c = makeAction("c");
    const s0: ActionStacks = { past: [a], future: [c] };
    const result = popUndo(s0);
    expect(result?.action).toBe(a);
    expect(result?.stacks).toEqual({ past: [], future: [a, c] });
  });
});

describe("popRedo", () => {
  it("futureが空ならnullを返す", () => {
    const s0: ActionStacks = { past: [], future: [] };
    expect(popRedo(s0)).toBeNull();
  });

  it("futureの先頭を取り出し、pastの末尾へ積む", () => {
    const a = makeAction("a");
    const b = makeAction("b");
    const s0: ActionStacks = { past: [], future: [a, b] };
    const result = popRedo(s0);
    expect(result).not.toBeNull();
    expect(result?.action).toBe(a);
    expect(result?.stacks).toEqual({ past: [a], future: [b] });
  });
});

describe("push/undo/redo往復", () => {
  it("push→undo→redoで元の状態に戻る", () => {
    const a = makeAction("a");
    const b = makeAction("b");
    let s: ActionStacks = { past: [], future: [] };
    s = pushAction(s, a);
    s = pushAction(s, b);
    const original = s;

    const u1 = popUndo(s);
    s = u1!.stacks;
    expect(s).toEqual({ past: [a], future: [b] });

    const r1 = popRedo(s);
    s = r1!.stacks;
    expect(s).toEqual(original);
  });

  it("2回undoしてから2回redoすると元に戻る", () => {
    const a = makeAction("a");
    const b = makeAction("b");
    let s: ActionStacks = { past: [], future: [] };
    s = pushAction(s, a);
    s = pushAction(s, b);
    const original = s;

    s = popUndo(s)!.stacks;
    s = popUndo(s)!.stacks;
    expect(s).toEqual({ past: [], future: [a, b] });

    s = popRedo(s)!.stacks;
    s = popRedo(s)!.stacks;
    expect(s).toEqual(original);
  });
});
