// 外部（エクスプローラ等）からのドロップを扱う小さなヘルパー。
// カード並べ替え・フォルダ移動の既存D&Dはpointerイベント（dnd.ts / SwipeableCard）なので系統が別で競合しない
export function hasFiles(dt: DataTransfer | null): boolean {
  return dt ? [...dt.types].includes("Files") : false;
}

export function filesFromDataTransfer(dt: DataTransfer | null): File[] {
  return dt ? [...dt.files] : [];
}
