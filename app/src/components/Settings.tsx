import { useState } from "react";
import { BackIcon, ExportIcon, TrashIcon } from "./icons";

type Props = {
  syncBar: React.ReactNode;
  // 画面切替（list/note/settings/trash）のスライドインクラス（slide-in-left/right）。ルート要素(.screen)に直接付ける
  slideClass: string;
  token: string;
  onSave: (t: string) => void;
  onBack: () => void;
  onExport: () => void;
  onTrash: () => void;
};

export function Settings({ syncBar, slideClass, token, onSave, onBack, onExport, onTrash }: Props) {
  const [value, setValue] = useState(token);

  // PCと端末とで表示中のビルドがずれる問題の再発防止。SWがあれば更新チェックしてから、
  // どちらにせよ1秒後にリロードする（SW未対応環境ではリロードのみ行う）
  async function updateApp() {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.update()));
    }
    setTimeout(() => location.reload(), 1000);
  }

  return (
    <div className={`settings screen ${slideClass}`}>
      <div className="list-header">
        {syncBar}
        <div className="toolbar">
          <button className="icon-btn" onClick={onBack} aria-label="戻る">
            <BackIcon />
          </button>
          <h2>設定</h2>
        </div>
      </div>
      <div className="screen-body">
        <label htmlFor="token">APIトークン</label>
        <input id="token" type="password" value={value} onChange={(e) => setValue(e.target.value)} />
        <button className="primary" onClick={() => onSave(value.trim())}>保存</button>
        <hr />
        <button className="tint acc-teal" onClick={onExport}>
          <ExportIcon size={18} />
          全メモをエクスポート（zip）
        </button>
        <button onClick={onTrash}>
          <TrashIcon size={18} />
          ゴミ箱
        </button>
        <hr />
        <p>バージョン: {__APP_VERSION__}</p>
        <button className="tint acc-blue" onClick={() => void updateApp()}>
          アプリを更新
        </button>
      </div>
    </div>
  );
}
