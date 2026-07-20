import { useState } from "react";

type Props = { token: string; onSave: (t: string) => void; onBack: () => void; onExport: () => void };

export function Settings({ token, onSave, onBack, onExport }: Props) {
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
      <hr />
      <button onClick={onExport}>全メモをエクスポート（zip）</button>
    </div>
  );
}
