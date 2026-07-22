import { buildPushPayload } from "@block65/webcrypto-web-push";
import type { PushSender, SubRow } from "./reminders";
import type { Env } from "./index";

export function makeSender(env: Env): PushSender {
  return async (sub: SubRow, payload: string) => {
    const subscription = {
      endpoint: sub.endpoint,
      expirationTime: null,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    };
    const vapid = { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
    const req = await buildPushPayload({ data: payload, options: { ttl: 86400 } }, subscription, vapid);
    // buildPushPayloadの戻り値はDOM Fetch型を素朴に想定しており、workers-typesのRequestInit
    // （headersのoptionalプロパティ・BodyInit定義の細部）と構造的に噛み合わない。実行時形状は
    // { method, headers, body } でRequestInit互換のため、型不一致のみキャストで解消する。
    const res = await fetch(sub.endpoint, req as unknown as RequestInit);
    return res.ok ? { ok: true } : { ok: false, status: res.status };
  };
}
