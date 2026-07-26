import { ulid } from "ulid";
import type { Env } from "./index";
import { MAX_ATTACHMENT_BYTES } from "./attachments";
import { upsertAttachment, upsertNote } from "./sync";

// リクエスト全体（multipart/form-data）の上限（2026-07-26 レビュー指摘）。
// 個々のファイルの上限（下のf.sizeチェック）だけでは、その前段のreq.formData()自体がリクエスト
// 全体をメモリに展開してパースするため、Workerのメモリ上限(128MB)への接近を防げていなかった。
// 「最大サイズのファイル2つぶん＋multipartのboundary/ヘッダ等のオーバーヘッド余裕(1MB)」を目安に、
// 128MBより十分低いところで「明らかに大きすぎる」リクエストだけをformData()解析前に弾く。
// この線を超えない範囲であれば、個々のファイルが上限超過でもスキップして残りを保存する
// 既存の挙動（下のf.sizeチェック）はそのまま
export const MAX_SHARE_REQUEST_BYTES = MAX_ATTACHMENT_BYTES * 2 + 1024 * 1024;

// iOSショートカットを1つにまとめる（受け取る内容にURL・テキスト・ファイルを全部入れる）と、
// URLやテキストも file フィールドにファイル化されて届く。これを添付として保存すると、
// URLを共有しただけで「中身がURL1行のファイル」が付いたメモになってしまう。
// 小さなテキストは添付ではなく本文に回して、共有シートにショートカットが2つ並ばないようにする
// （2026-07-26 オーナー要望）。テキストファイルを意図的に添付したい場合は、この線を超えるものが添付になる
const TEXT_AS_BODY_MAX_BYTES = 4096;

const TAB = 9;
const LF = 10;
const CR = 13;
const SPACE = 32;
const DEL = 127;

// バイナリを取り違えないための番人。NUL等の制御文字が混ざっていたらテキストとして扱わない。
// 改行・復帰・タブは本文に含まれてよいので通す
function hasControlChars(s: string): boolean {
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c === TAB || c === LF || c === CR) continue;
    if (c < SPACE || c === DEL) return true;
  }
  return false;
}

function mayBeSharedText(f: File): boolean {
  if (f.size > TEXT_AS_BODY_MAX_BYTES) return false;
  const t = f.type;
  // iOSがURL・テキストをファイル化して送るときのtypeは当てにならない（空・text/plain・public.url のほか、
  // typeなしで送るとmultipartの経路で application/octet-stream に補完される）。
  // そこで「明らかにバイナリと分かるものだけ先に除外し、残りは中身で判定する」形にする（番人はhasControlChars）
  if (t.startsWith("image/") || t.startsWith("audio/") || t.startsWith("video/")) return false;
  if (t === "application/pdf" || t === "application/zip") return false;
  return true;
}

export async function handleShare(req: Request, env: Env): Promise<Response> {
  // Content-Lengthで明らかな超過をformData()解析前に弾く。ヘッダが無い/信用できない場合は
  // ここでは弾かない（誤検知でリクエストを止めないため。formData()以降は従来どおり）
  const contentLength = Number(req.headers.get("Content-Length") ?? "0");
  if (contentLength > MAX_SHARE_REQUEST_BYTES) return new Response("too large", { status: 413 });
  const form = await req.formData();
  // 一時的な診断ログ（2026-07-26 iOSショートカットから届かない件の切り分け用）。
  // キー名と型・サイズだけを出す。中身は出さない
  console.log(
    "share:",
    JSON.stringify(
      [...form.entries()].map(([k, v]) =>
        v instanceof File ? `${k}=File(type=${v.type || "none"},size=${v.size},name=${v.name || "none"})` : `${k}=string(${String(v).length}chars)`
      )
    )
  );
  const text = form.get("text");
  const files = form.getAll("file").filter((f): f is File => f instanceof File);

  const bodyParts: string[] = [];
  const attachments: File[] = [];
  if (typeof text === "string" && text.trim() !== "") {
    bodyParts.push(text.trim());
  } else if (text instanceof File) {
    // iOSショートカットのフォームフィールドは「テキスト」と「ファイル」の2種類があり、
    // どちらを選んでいるかが画面から分かりにくい。textキーにファイルとして届いても本文として読む
    // （2026-07-26 オーナーがUI上で種類を切り替えられなかったため、サーバー側で吸収する）
    let consumed = false;
    if (mayBeSharedText(text)) {
      const s = (await text.text()).trim();
      if (s !== "" && !hasControlChars(s)) {
        bodyParts.push(s);
        consumed = true;
      }
    }
    // 本文にできない中身（大きい・バイナリ）でも捨てない。fileキー側と同じく添付に回す。
    // 以前はここで行き場を失い、textキーだけが丸ごと消えて400になっていた（2026-07-26 レビュー指摘）
    if (!consumed) attachments.push(text);
  }
  // fileとして届いた小さなテキスト（＝URL共有をファイル用ショートカットで受けた場合）は本文に回す
  for (const f of files) {
    if (mayBeSharedText(f)) {
      const s = (await f.text()).trim();
      if (s !== "" && !hasControlChars(s)) {
        bodyParts.push(s);
        continue;
      }
    }
    attachments.push(f);
  }
  if (bodyParts.length === 0 && attachments.length === 0) return new Response("empty", { status: 400 });

  const now = Date.now();
  const noteId = ulid();
  const body = bodyParts.join("\n\n").replace(/\r\n?/g, "\n");
  await upsertNote(env.DB, { id: noteId, body, importance: 0, createdAt: now, updatedAt: now, deleted: 0, folderId: null });

  for (const f of attachments) {
    // 上限超過分だけ弾いて残りは保存する（ショートカット経由は複数ファイルをまとめて送れるため、
    // 1件のサイズ超過で他の正常なファイルまで巻き添えにしない）
    if (f.size > MAX_ATTACHMENT_BYTES) continue;
    const attId = ulid();
    const mime = f.type || "application/octet-stream";
    // ショートカット経由ではファイル名が空のことがある。その場合はidの末尾で識別できる名前を作る
    const name = f.name && f.name !== "" ? f.name : `ファイル-${attId.slice(-6)}`;
    const data = await f.arrayBuffer();
    await env.ATT.put(`att/${attId}`, data, { httpMetadata: { contentType: mime } });
    await upsertAttachment(env.DB, { id: attId, noteId, mime, size: data.byteLength, name, createdAt: now, updatedAt: now, deleted: 0 });
  }
  return Response.json({ ok: true, noteId });
}
