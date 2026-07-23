import { useLiveQuery } from "dexie-react-hooks";
import { accentClassFor } from "../lib/colors";
import { listNotesIn } from "../lib/folders";
import { excludeReminders } from "../lib/sort";
import type { Folder } from "../lib/types";
import { FolderIcon } from "./icons";
import { type ReorderHandler, SwipeableCard } from "./SwipeableCard";

export function FolderCard({
  folder,
  isOpen,
  onOpenChange,
  onCloseOthers,
  onOpen,
  onDelete,
  onMoveNote,
  onMoveFolder,
  onReorder,
}: {
  folder: Folder;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseOthers: () => void;
  onOpen: () => void;
  onDelete: () => void;
  onMoveNote: (noteId: string, folderId: string | null) => void;
  onMoveFolder: (id: string, parentId: string | null) => void;
  onReorder: ReorderHandler;
}) {
  // 件数は開いたときに見えるメモ数に合わせる（リマインダー付きは置き場に出さないため数えない）
  const count = useLiveQuery(async () => excludeReminders(await listNotesIn(folder.id)).length, [folder.id], 0);
  return (
    <SwipeableCard
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onCloseOthers={onCloseOthers}
      onDelete={onDelete}
      onOpen={onOpen}
      className={`folder-card ${accentClassFor(folder.name)}`}
      dragPayload={{ kind: "folder", id: folder.id }}
      currentLocationId={folder.parentId}
      onMoveNote={onMoveNote}
      onMoveFolder={onMoveFolder}
      onReorder={onReorder}
    >
      <FolderIcon size={14} className="folder-icon" />
      <span className="folder-name">{folder.name}</span>
      <span className="folder-count">{count}件</span>
    </SwipeableCard>
  );
}
