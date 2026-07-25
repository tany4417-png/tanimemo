import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getImageBlob } from "../lib/attachments";
import { isImageMime } from "../lib/attachment-view";
import { db } from "../lib/db";
import type { AttachmentMeta } from "../lib/types";

export function useAttachmentUrls(
  noteId: string,
  limit?: number,
  opts?: { thumb?: boolean; kind?: "image" | "file" | "all" }
): { metas: AttachmentMeta[]; urls: Record<string, string> } {
  const thumb = opts?.thumb ?? false;
  const kind = opts?.kind ?? "all";
  const metas = useLiveQuery(
    async () => {
      const all = await db.attachments.where("noteId").equals(noteId).filter((a) => a.deleted === 0).toArray();
      const picked = kind === "all" ? all : all.filter((a) => (kind === "image") === isImageMime(a.mime));
      return limit ? picked.slice(0, limit) : picked;
    },
    [noteId, limit, kind],
    [] as AttachmentMeta[]
  );
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    const created: string[] = [];
    void (async () => {
      const token = localStorage.getItem("tanimemo.token") ?? "";
      const next: Record<string, string> = {};
      for (const m of metas) {
        const blob = await getImageBlob(m.id, token, undefined, { thumb });
        if (blob) {
          const u = URL.createObjectURL(blob);
          created.push(u);
          next[m.id] = u;
        }
      }
      if (alive) setUrls(next);
    })();
    return () => {
      alive = false;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [metas, thumb]);
  return { metas, urls };
}
