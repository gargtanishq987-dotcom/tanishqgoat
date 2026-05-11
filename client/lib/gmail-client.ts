import { google } from "googleapis";
import { decrypt, encrypt } from "@/lib/encryption";
import { getDb } from "@/lib/firebase-admin";
import { admin } from "@/lib/firebase-admin";

export async function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (clientId && clientSecret && redirectUri) {
    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  // Fall back to credentials stored in Firestore via Settings → Credentials
  const db = getDb();
  const doc = await db.collection("settings").doc("credentials").get();
  if (!doc.exists) {
    throw new Error("Gmail credentials not configured. Go to Settings → Credentials.");
  }
  const creds = doc.data()!;
  if (!creds.googleClientId || !creds.googleClientSecret || !creds.googleRedirectUri) {
    throw new Error("Gmail credentials incomplete. Go to Settings → Credentials.");
  }
  return new google.auth.OAuth2(
    creds.googleClientId as string,
    decrypt(creds.googleClientSecret as string),
    creds.googleRedirectUri as string
  );
}

export async function getGmailAuthUrl(state: string): Promise<string> {
  const oauth2 = await getOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ],
    state,
  });
}

export async function exchangeCodeForTokens(code: string): Promise<{
  refreshToken: string;
  accessToken: string;
  tokenExpiry: number;
  email: string;
  displayName: string;
}> {
  const oauth2 = await getOAuth2Client();
  const { tokens } = await oauth2.getToken(code);

  if (!tokens.refresh_token || !tokens.access_token) {
    throw new Error("No refresh token returned. Ensure prompt=consent was set.");
  }

  oauth2.setCredentials(tokens);
  const oauth2Api = google.oauth2({ version: "v2", auth: oauth2 });
  const { data: userInfo } = await oauth2Api.userinfo.get();

  return {
    refreshToken: encrypt(tokens.refresh_token),
    accessToken: tokens.access_token,
    tokenExpiry: tokens.expiry_date ?? Date.now() + 3600 * 1000,
    email: userInfo.email ?? "",
    displayName: userInfo.name ?? userInfo.email ?? "",
  };
}

export async function getValidAccessToken(inboxId: string): Promise<string> {
  const db = getDb();
  const doc = await db.collection("inboxes").doc(inboxId).get();
  if (!doc.exists) throw new Error(`Inbox ${inboxId} not found`);

  const data = doc.data()!;
  const now = Date.now();

  if (data.tokenExpiry && data.tokenExpiry > now + 60_000) {
    return data.accessToken as string;
  }

  const oauth2 = await getOAuth2Client();
  oauth2.setCredentials({ refresh_token: decrypt(data.refreshToken as string) });
  const { credentials } = await oauth2.refreshAccessToken();

  await db.collection("inboxes").doc(inboxId).update({
    accessToken: credentials.access_token,
    tokenExpiry: credentials.expiry_date ?? now + 3600_000,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return credentials.access_token!;
}

function sanitizePlainText(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p[^>]*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function toQuotedPrintable(text: string): string {
  const lines = text.split("\n");
  const encoded = lines.map((line) => {
    // Encode using actual UTF-8 bytes — charCodeAt gives Unicode code points,
    // but QP requires each individual byte of the UTF-8 sequence encoded as =XX.
    const bytes = Buffer.from(line, "utf8");
    let result = "";
    for (const byte of bytes) {
      if (byte === 0x3d || byte > 0x7e || (byte < 0x20 && byte !== 0x09)) {
        result += "=" + byte.toString(16).toUpperCase().padStart(2, "0");
      } else {
        result += String.fromCharCode(byte);
      }
    }
    // Encode trailing space or tab (RFC 2045 requirement)
    if (result.endsWith(" ") || result.endsWith("\t")) {
      const last = result[result.length - 1];
      result = result.slice(0, -1) + "=" + last.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0");
    }
    // Soft-wrap at 75 chars with =\r\n (transport safety, clients join these back)
    const wrapped: string[] = [];
    while (result.length > 75) {
      let cut = 75;
      // Don't split inside a =XX sequence
      if (result[cut - 2] === "=") cut -= 2;
      else if (result[cut - 1] === "=") cut -= 1;
      wrapped.push(result.slice(0, cut) + "=");
      result = result.slice(cut);
    }
    wrapped.push(result);
    return wrapped.join("\r\n");
  });
  return encoded.join("\r\n");
}

export async function sendEmail(params: {
  inboxId: string;
  to: string;
  subject: string;
  body: string;
  threadId?: string;
  inReplyToMessageId?: string;
  fromEmail: string;
  fromName: string;
}): Promise<{ threadId: string; messageId: string }> {
  const accessToken = await getValidAccessToken(params.inboxId);
  const oauth2 = await getOAuth2Client();
  oauth2.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  const from = params.fromName
    ? `"${params.fromName}" <${params.fromEmail}>`
    : params.fromEmail;

  const cleanBody = toQuotedPrintable(sanitizePlainText(params.body));
  const subject = params.threadId ? `Re: ${params.subject}` : params.subject;

  const headers: string[] = [
    `From: ${from}`,
    `To: ${params.to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8; format=fixed",
    "Content-Transfer-Encoding: quoted-printable",
  ];

  if (params.inReplyToMessageId) {
    headers.push(`In-Reply-To: ${params.inReplyToMessageId}`);
    headers.push(`References: ${params.inReplyToMessageId}`);
  }

  const message = headers.join("\r\n") + "\r\n\r\n" + cleanBody;
  const encoded = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encoded,
      ...(params.threadId ? { threadId: params.threadId } : {}),
    },
  });

  return {
    threadId: result.data.threadId!,
    messageId: result.data.id!,
  };
}

function extractPlainText(payload: {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: typeof payload[] | null;
}): string | null {
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8").trim();
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractPlainText(part);
      if (text) return text;
    }
  }
  return null;
}

export async function hasThreadReply(params: {
  inboxId: string;
  threadId: string;
  ourMessageId: string;
}): Promise<{ replied: boolean; replyText: string | null; repliedAt: number | null }> {
  try {
    const accessToken = await getValidAccessToken(params.inboxId);
    const oauth2 = await getOAuth2Client();
    oauth2.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: "v1", auth: oauth2 });

    const thread = await gmail.users.threads.get({
      userId: "me",
      id: params.threadId,
      format: "full",
    });

    const messages = thread.data.messages ?? [];
    const ourIndex = messages.findIndex((m) => m.id === params.ourMessageId);

    if (messages.length <= ourIndex + 1) {
      return { replied: false, replyText: null, repliedAt: null };
    }

    const replyMsg = messages[ourIndex + 1];
    const replyText = replyMsg.payload ? extractPlainText(replyMsg.payload as Parameters<typeof extractPlainText>[0]) : null;
    const repliedAt = replyMsg.internalDate ? Number(replyMsg.internalDate) : Date.now();

    return { replied: true, replyText, repliedAt };
  } catch {
    return { replied: false, replyText: null, repliedAt: null };
  }
}
