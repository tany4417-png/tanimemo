// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { ReminderSheet } from "./ReminderSheet";

const note = { id: "n1", body: "t", importance: 0 as const, createdAt: 1, updatedAt: 1,
  deleted: 0 as const, dirty: 0 as const, folderId: null, remindAt: null, repeatRule: null };

describe("ReminderSheet", () => {
  it("日時を入れて保存するとonSaveにepoch msと繰り返しnullが渡る", () => {
    const onSave = vi.fn();
    render(<ReminderSheet note={note} onSave={onSave} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("通知日時"), { target: { value: "2026-08-01T09:00" } });
    fireEvent.click(screen.getByText("保存"));
    expect(onSave).toHaveBeenCalledWith(new Date("2026-08-01T09:00").getTime(), null);
  });
  it("毎週を選ぶと曜日チェックが出て、repeatRuleが組み立てられる", () => {
    const onSave = vi.fn();
    render(<ReminderSheet note={note} onSave={onSave} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("通知日時"), { target: { value: "2026-08-01T09:00" } });
    fireEvent.change(screen.getByLabelText("繰り返し"), { target: { value: "weekly" } });
    fireEvent.click(screen.getByLabelText("水"));
    fireEvent.click(screen.getByText("保存"));
    expect(onSave).toHaveBeenCalledWith(new Date("2026-08-01T09:00").getTime(), '{"type":"weekly","weekdays":[3]}');
  });
  it("設定済みノートで「解除」を押すとnull/nullが渡る", () => {
    const onSave = vi.fn();
    render(<ReminderSheet note={{ ...note, remindAt: 1754006400000 }} onSave={onSave} onClose={() => {}} />);
    fireEvent.click(screen.getByText("通知を解除"));
    expect(onSave).toHaveBeenCalledWith(null, null);
  });
  it("毎週で月と水をチェック（水→月の順）すると昇順のweekdays配列が保存される", () => {
    const onSave = vi.fn();
    render(<ReminderSheet note={note} onSave={onSave} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("通知日時"), { target: { value: "2026-08-01T09:00" } });
    fireEvent.change(screen.getByLabelText("繰り返し"), { target: { value: "weekly" } });
    fireEvent.click(screen.getByLabelText("水"));
    fireEvent.click(screen.getByLabelText("月"));
    fireEvent.click(screen.getByText("保存"));
    expect(onSave).toHaveBeenCalledWith(new Date("2026-08-01T09:00").getTime(), '{"type":"weekly","weekdays":[1,3]}');
  });
  it("毎月で日付欄に0を入れると保存ボタンが無効化される", () => {
    render(<ReminderSheet note={note} onSave={() => {}} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("通知日時"), { target: { value: "2026-08-01T09:00" } });
    fireEvent.change(screen.getByLabelText("繰り返し"), { target: { value: "monthly" } });
    fireEvent.change(screen.getByDisplayValue("1"), { target: { value: "0" } });
    const saveButton = screen.getByText("保存").closest("button") as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });
});
