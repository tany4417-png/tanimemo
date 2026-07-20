import { beforeEach, describe, expect, it } from "vitest";
import { resetDbForTests } from "./db";
import { allTags, createNote, listActiveNotes, softDeleteNote, updateNote } from "./notes";

beforeEach(async () => {
  await resetDbForTests();
});

describe("メモCRUD", () => {
  it("作成すると一覧に出て、dirty=1が付く", async () => {
    const n = await createNote("最初のメモ", ["仕事"]);
    expect(n.id).toHaveLength(26);
    expect(n.dirty).toBe(1);
    const list = await listActiveNotes();
    expect(list).toHaveLength(1);
    expect(list[0].body).toBe("最初のメモ");
  });

  it("更新でupdatedAtが進みdirty=1に戻る", async () => {
    const n = await createNote("a");
    const before = n.updatedAt;
    const next = await updateNote(n.id, { body: "b", importance: 2 });
    expect(next.body).toBe("b");
    expect(next.importance).toBe(2);
    expect(next.updatedAt).toBeGreaterThanOrEqual(before);
    expect(next.dirty).toBe(1);
  });

  it("softDeleteで一覧から消える（レコードは残る）", async () => {
    const n = await createNote("消すメモ");
    await softDeleteNote(n.id);
    expect(await listActiveNotes()).toHaveLength(0);
  });

  it("allTagsは重複なしのソート済み", async () => {
    await createNote("1", ["b", "a"]);
    await createNote("2", ["a", "c"]);
    const notes = await listActiveNotes();
    expect(allTags(notes)).toEqual(["a", "b", "c"]);
  });
});
