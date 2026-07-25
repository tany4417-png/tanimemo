// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NoteScreen } from "./NoteScreen";
import type { Note } from "../lib/types";

const note: Note = {
  id: "N1", body: "本文", importance: 0, createdAt: 1, updatedAt: 1, deleted: 0, dirty: 0,
  folderId: null, orderKey: null, remindAt: null, repeatRule: null,
};

const props = {
  syncBar: null, slideClass: "", note, startEditing: false, startWithReminder: false,
  onChange: () => {}, onDelete: () => {}, onBack: () => {}, onMoveNote: () => {},
  onDeleteAttachment: () => {}, highlightQuery: "", onAutoSave: () => {}, onEditSessionEnd: () => {},
  flushRef: { current: null },
} as unknown as React.ComponentProps<typeof NoteScreen>;

describe("NoteScreen の添付ボタン", () => {
  it("写真ボタンとファイルボタンが両方あり、acceptが分かれている", () => {
    render(<NoteScreen {...props} />);
    expect(screen.getByLabelText("写真を添付")).toBeTruthy();
    expect(screen.getByLabelText("ファイルを添付")).toBeTruthy();
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'));
    expect(inputs.map((i) => i.getAttribute("accept"))).toEqual(["image/*", null]);
  });
});
