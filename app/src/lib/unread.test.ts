import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDbForTests } from "./db";
import { createNote, softDeleteNote } from "./notes";
import { clearUnread, markUnread, pruneUnread, syncAppBadge } from "./unread";

beforeEach(async () => {
  await resetDbForTests();
  vi.unstubAllGlobals();
});

describe("unread", () => {
  it("markUnreadで未読が積まれ、同じメモの再通知でも1件のまま", async () => {
    await markUnread("a");
    await markUnread("a");
    await markUnread("b");
    expect(await db.unread.count()).toBe(2);
  });

  it("clearUnreadで該当メモの未読だけ消える", async () => {
    await markUnread("a");
    await markUnread("b");
    await clearUnread("a");
    expect((await db.unread.toArray()).map((r) => r.noteId)).toEqual(["b"]);
  });

  it("pruneUnreadは消えたメモ・ゴミ箱行きメモの未読だけ掃除する", async () => {
    const alive = await createNote("残る");
    const trashed = await createNote("ゴミ箱行き");
    await softDeleteNote(trashed.id);
    await markUnread(alive.id);
    await markUnread(trashed.id);
    await markUnread("missing-note-id");
    await pruneUnread();
    expect((await db.unread.toArray()).map((r) => r.noteId)).toEqual([alive.id]);
  });

  it("未読数がアプリアイコンバッジへ反映される（0件でクリア）", async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const clear = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { setAppBadge: set, clearAppBadge: clear });
    await markUnread("a");
    expect(set).toHaveBeenCalledWith(1);
    await clearUnread("a");
    expect(clear).toHaveBeenCalled();
  });

  it("Badging API未対応環境（navigatorにsetAppBadge無し）でも例外にならない", async () => {
    vi.stubGlobal("navigator", {});
    await markUnread("a");
    await syncAppBadge();
    expect(await db.unread.count()).toBe(1);
  });
});
