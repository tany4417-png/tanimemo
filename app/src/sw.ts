/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { clientsClaim } from "workbox-core";
import { NavigationRoute, registerRoute } from "workbox-routing";

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
  // 必ず通知を表示する（表示しないpushが続くとiOSは購読を打ち切る）。parse失敗もフォールバック表示
  let title = "タニメモ";
  let noteId: string | undefined;
  try {
    const data = event.data?.json() as { title?: string; noteId?: string };
    if (data?.title) title = data.title;
    noteId = data?.noteId;
  } catch { /* フォールバック文言のまま */ }
  event.waitUntil(self.registration.showNotification(title, { body: "タニメモのリマインダー", data: { noteId } }));
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
