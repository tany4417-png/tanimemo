import { useState } from "react";

type Props = { token: string; onSave: (t: string) => void; onBack: () => void };

export function Settings({ token, onSave, onBack }: Props) {
  const [value, setValue] = useState(token);
  return (
    <div className="settings">
      <div className="toolbar">
        <button onClick={onBack}>←</button>
        <h2>設定</h2>
      </div>
      <label htmlFor="token">APIトークン</label>
      <input id="token" type="password" value={value} onChange={(e) => setValue(e.target.value)} />
      <button className="primary" onClick={() => onSave(value.trim())}>保存</button>
    </div>
  );
}
