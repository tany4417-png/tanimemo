import type { Note } from "./types";

export type SortMode = "created" | "updated" | "importance";

const comparers: Record<SortMode, (a: Note, b: Note) => number> = {
  created: (a, b) => b.createdAt - a.createdAt,
  updated: (a, b) => b.updatedAt - a.updatedAt,
  importance: (a, b) => b.importance - a.importance || b.updatedAt - a.updatedAt,
};

export function sortNotes(notes: Note[], mode: SortMode): Note[] {
  const sorted = [...notes].sort(comparers[mode]);
  if (mode === "importance") return sorted;
  return [...sorted.filter((n) => n.importance === 3), ...sorted.filter((n) => n.importance !== 3)];
}

export function filterByTags(notes: Note[], tags: string[]): Note[] {
  if (tags.length === 0) return notes;
  return notes.filter((n) => tags.every((t) => n.tags.includes(t)));
}

export function searchNotes(notes: Note[], query: string): Note[] {
  const q = query.trim().toLowerCase();
  if (!q) return notes;
  return notes.filter((n) => n.body.toLowerCase().includes(q));
}
