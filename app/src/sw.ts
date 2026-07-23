/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { clientsClaim } from "workbox-core";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { markUnread } from "./lib/unread";

declare let self: ServiceWorkerGlobalScope;

// registerType:autoUpdate 相当の挙動維持に必須
self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
// 旧generateSWの既定 navigateFallback: "index.html" 相当。/?note=<id> 等への未起動オフラインタップが
// ブラウザ既定のエラーページになるのを防ぐ
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));

self.addEventListener("push", (event) => {
  // 必ず通知を表示する（表示しないpushが続くとiOSは購読を打ち切る）。parse失敗もフォールバック表示。
  // bodyはworkerが本文2行目以降の抜粋を入れてくる。無ければbody無し通知
  // （旧固定文言「タニメモのリマインダー」はiOSが自動表示するアプリ名と重複するため廃止）
  let title = "タニメモ";
  let body: string | undefined;
  let noteId: string | undefined;
  try {
    const data = event.data?.json() as { title?: string; body?: string; noteId?: string };
    if (data?.title) title = data.title;
    if (data?.body) body = data.body;
    noteId = data?.noteId;
  } catch { /* フォールバック文言のまま */ }
  event.waitUntil((async () => {
    // 未読記録＋アイコンバッジ。失敗しても通知表示は必ず行う（表示が最優先）
    try {
      if (noteId) await markUnread(noteId);
    } catch { /* IndexedDB障害等。バッジは補助表示なので黙認 */ }
    await self.registration.showNotification(title, { ...(body ? { body } : {}), data: { noteId } });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const noteId = (event.notification.data as { noteId?: string } | undefined)?.noteId;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (clients.length > 0) {
      await clients[0].focus();
      if (noteId) clients[0].postMessage({ type: "open-note", noteId });
    } else {
      await self.clients.openWindow(noteId ? `/?note=${noteId}` : "/");
    }
  })());
});
