import { strFromU8, unzipSync } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDbForTests } from "./db";
import { createFolder } from "./folders";
import type { Note } from "./types";
import { exportZip, localYmd, noteContent, notePath, slugify } from "./export";

beforeEach(async () => {
  await resetDbForTests();
});

function n(over: Partial<Note> = {}): Note {
  return {
    id: "01HZXW3E8PDEMO0000000000AB", body: "買い物メモ\n- [ ] 牛乳", importance: 2,
    createdAt: new Date("2026-07-20T09:00:00").getTime(), updatedAt: 0, deleted: 0, dirty: 0, folderId: null,
    remindAt: null, repeatRule: null, ...over,
  };
}

describe("エクスポートの純関数", () => {
  it("slugifyは記号と空白をハイフンにし30文字に切る", () => {
    expect(slugify("買い物 メモ/夏")).toBe("買い物-メモ-夏");
    expect(slugify("   ")).toBe("memo");
    expect(slugify("あ".repeat(40))).toHaveLength(30);
  });

  it("notePathは日付-タイトル-ID末尾4桁.md", () => {
    expect(notePath(n())).toBe("2026-07-20-買い物メモ-00AB.md");
  });

  it("noteContentはフロントマター付き（folderPath省略時はfolder行なし）", () => {
    const c = noteContent(n());
    expect(c).toContain("importance: 2");
    expect(c).not.toContain("folder:");
    expect(c.endsWith("買い物メモ\n- [ ] 牛乳\n")).toBe(true);
  });

  it("noteContentはfolderPathを渡すとfolder行が入る", () => {
    const c = noteContent(n(), "仕事/2026");
    expect(c).toContain("folder: 仕事/2026");
  });

  it("localYmdはローカル日付をYYYY-MM-DDで返す", () => {
    expect(localYmd(new Date("2026-07-20T09:00:00"))).toBe("2026-07-20");
  });
});

describe("exportZip", () => {
  it("実体が無い添付（token空）はmissingFilesにカウントされ除外される", async () => {
    await db.attachments.put({
      id: "X", noteId: "N", mime: "image/png", size: 1, createdAt: 1, updatedAt: 1, deleted: 0, dirty: 0,
    });
    const { blob, missingFiles } = await exportZip();
    expect(missingFiles).toBe(1);
    expect(blob).toBeInstanceOf(Blob);
  });

  it("実体がある添付はmissingFiles0でzip Blobが返る", async () => {
    await db.attachments.put({
      id: "Y", noteId: "N", mime: "image/png", size: 1, createdAt: 1, updatedAt: 1, deleted: 0, dirty: 0,
    });
    await db.attachmentBlobs.put({ id: "Y", blob: new Blob([new Uint8Array([1])], { type: "image/png" }) });
    const { blob, missingFiles } = await exportZip();
    expect(missingFiles).toBe(0);
    expect(blob).toBeInstanceOf(Blob);
  });

  it(":thumbキーのサムネblobは走査対象に含まれない（attachmentsメタ起点のため）", async () => {
    await db.attachments.put({
      id: "Z", noteId: "N", mime: "image/png", size: 1, createdAt: 1, updatedAt: 1, deleted: 0, dirty: 0,
    });
    await db.attachmentBlobs.put({ id: "Z", blob: new Blob([new Uint8Array([1])], { type: "image/png" }) });
    await db.attachmentBlobs.put({ id: "Z:thumb", blob: new Blob([new Uint8Array([2])], { type: "image/jpeg" }) });
    const { blob, missingFiles } = await exportZip();
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const keys = Object.keys(files);
    expect(missingFiles).toBe(0);
    expect(keys).toContain("images/Z.png");
    expect(keys.some((k) => k.includes("thumb"))).toBe(false);
  });

  it("非画像添付が実体無しでもmissingFilesにカウントされる（画像専用カウンタではない）", async () => {
    await db.attachments.put({
      id: "PDF1", noteId: "N", mime: "application/pdf", size: 1, name: "見積書.pdf",
      createdAt: 1, updatedAt: 1, deleted: 0, dirty: 0,
    });
    const { missingFiles } = await exportZip();
    expect(missingFiles).toBe(1);
  });

  it("非画像の添付はfiles/配下に元の拡張子で出る", async () => {
    await db.notes.add({
      id: "N1", body: "本文", importance: 0, createdAt: 1, updatedAt: 1, deleted: 0, dirty: 0,
      folderId: null, orderKey: null, remindAt: null, repeatRule: null,
    });
    await db.attachments.add({
      id: "A1", noteId: "N1", mime: "application/pdf", size: 1, name: "見積書.pdf",
      createdAt: 1, updatedAt: 1, deleted: 0, dirty: 0,
    });
    await db.attachmentBlobs.add({ id: "A1", blob: new Blob([new Uint8Array([1])], { type: "application/pdf" }) });
    const { blob } = await exportZip();
    const names = Object.keys(unzipSync(new Uint8Array(await blob.arrayBuffer())));
    expect(names).toContain("files/A1.pdf");
  });

  it("フォルダ配下のメモはfolder行にフォルダパスが書き出される", async () => {
    const root = await createFolder("仕事", null);
    const child = await createFolder("2026", root.id);
    await db.notes.put(n({ id: "01FOLDERNOTE00000000000AA", folderId: child.id }));

    const { blob } = await exportZip();
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const mdKey = Object.keys(files).find((k) => k.endsWith(".md"));
    expect(mdKey).toBeDefined();
    const content = strFromU8(files[mdKey!]);
    expect(content).toContain("folder: 仕事/2026");
  });

  it("ルート直下のメモはfolder行を書き出さない", async () => {
    await db.notes.put(n({ id: "01ROOTNOTE0000000000000AA", folderId: null }));

    const { blob } = await exportZip();
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const mdKey = Object.keys(files).find((k) => k.endsWith(".md"));
    expect(mdKey).toBeDefined();
    const content = strFromU8(files[mdKey!]);
    expect(content).not.toContain("folder:");
  });
});
