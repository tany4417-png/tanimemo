import { db } from "./db";

export function urlBase64ToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(base64 + pad);
  // Uint8Array.from(...)はUint8Array<ArrayBufferLike>を返しPushSubscriptionOptionsInit（ArrayBuffer限定）と
  // 型が合わないため（TS 6のlib.dom更新）、実体をArrayBuffer確定のnew Uint8Array(length)で確保してから埋める
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

const headers = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

export async function isPushEnabled(): Promise<boolean> {
  return (await db.meta.get("pushEnabled"))?.value === "1";
}

// 冪等: 購読が無ければ再購読する。サーバー登録POSTは冪等upsertなので毎回行う（ヘルスチェック兼再登録）
export async function ensurePushSubscription(token: string): Promise<"subscribed" | "denied" | "unsupported"> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") {
    if ((await Notification.requestPermission()) !== "granted") return "denied";
  }
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const vapid = (await (await fetch("/api/push/vapid", { headers: headers(token) })).json()) as { publicKey: string };
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid.publicKey) });
  }
  const json = sub.toJSON();
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys, deviceLabel: navigator.platform ?? "" }),
  });
  await db.meta.put({ key: "pushEnabled", value: "1" });
  return "subscribed";
}

// サーバーDELETEが失敗しても続行する。ローカルでunsubscribeしておけば、サーバーに購読が残っても
// 次回送信時に404/410となりサーバー側で自動削除されるため、ローカルの無効化を優先する
export async function disablePush(token: string): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    try {
      await fetch("/api/push/subscribe", { method: "DELETE", headers: headers(token), body: JSON.stringify({ endpoint: sub.endpoint }) });
    } catch {
      // サーバーへの通知に失敗してもローカルの無効化は継続する（上記コメント参照）
    }
    await sub.unsubscribe();
  }
  await db.meta.put({ key: "pushEnabled", value: "0" });
}

export async function sendTestPush(token: string): Promise<boolean> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return false;
  const res = await fetch("/api/push/test", { method: "POST", headers: headers(token), body: JSON.stringify({ endpoint: sub.endpoint }) });
  return ((await res.json()) as { ok: boolean }).ok;
}
