import { getDb, admin } from "@/lib/firebase-admin";
import { encrypt, decrypt } from "@/lib/encryption";
import type {
  Inbox, Campaign, Lead, LeadEvent, Message, DailyAnalytics, AppSettings, EventType
} from "@/lib/types";

const db = () => getDb();
const TS = () => admin.firestore.FieldValue.serverTimestamp();
const now = () => Date.now();

// ─── Inboxes ──────────────────────────────────────────────────────────────────

export async function getAllInboxes(): Promise<Inbox[]> {
  const snap = await db().collection("inboxes").orderBy("createdAt", "desc").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Inbox));
}

export async function getInboxById(id: string): Promise<Inbox | null> {
  const doc = await db().collection("inboxes").doc(id).get();
  return doc.exists ? ({ id: doc.id, ...doc.data() } as Inbox) : null;
}

export async function createInbox(data: Omit<Inbox, "id" | "createdAt" | "updatedAt">): Promise<string> {
  const ref = db().collection("inboxes").doc();
  await ref.set({ ...data, createdAt: TS(), updatedAt: TS() });
  return ref.id;
}

export async function updateInbox(id: string, data: Partial<Inbox>): Promise<void> {
  await db().collection("inboxes").doc(id).update({ ...data, updatedAt: TS() });
}

export async function deleteInbox(id: string): Promise<void> {
  await db().collection("inboxes").doc(id).delete();
}

export async function resetDailySentCounts(timezone: string): Promise<void> {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  const snap = await db().collection("inboxes")
    .where("lastResetDate", "!=", today)
    .get();

  const batch = db().batch();
  snap.docs.forEach((doc) => {
    batch.update(doc.ref, { sentToday: 0, lastResetDate: today, updatedAt: TS() });
  });
  await batch.commit();
}

// ─── Campaigns ────────────────────────────────────────────────────────────────

export async function getAllCampaigns(): Promise<Campaign[]> {
  const snap = await db().collection("campaigns").orderBy("createdAt", "desc").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Campaign));
}

export async function getCampaignById(id: string): Promise<Campaign | null> {
  const doc = await db().collection("campaigns").doc(id).get();
  return doc.exists ? ({ id: doc.id, ...doc.data() } as Campaign) : null;
}

export async function createCampaign(data: Omit<Campaign, "id" | "createdAt" | "updatedAt">): Promise<string> {
  const ref = db().collection("campaigns").doc();
  await ref.set({ ...data, createdAt: TS(), updatedAt: TS() });
  return ref.id;
}

export async function updateCampaign(id: string, data: Partial<Campaign>): Promise<void> {
  await db().collection("campaigns").doc(id).update({ ...data, updatedAt: TS() });
}

export async function deleteCampaign(id: string): Promise<void> {
  await db().collection("campaigns").doc(id).delete();
}

// ─── Leads ────────────────────────────────────────────────────────────────────

export async function getLeadsByCampaign(
  campaignId: string,
  limit = 100,
  startAfterDoc?: FirebaseFirestore.DocumentSnapshot
): Promise<{ leads: Lead[]; lastDoc: FirebaseFirestore.DocumentSnapshot | null }> {
  let query = db()
    .collection("leads")
    .where("campaignId", "==", campaignId)
    .orderBy("createdAt", "desc")
    .limit(limit);

  if (startAfterDoc) query = query.startAfter(startAfterDoc);

  const snap = await query.get();
  const leads = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead));
  const lastDoc = snap.docs.length === limit ? snap.docs[snap.docs.length - 1] : null;
  return { leads, lastDoc };
}

export async function getAllLeads(filters?: {
  campaignId?: string;
  status?: string;
  inboxId?: string;
  positiveReply?: boolean;
  bookedMeeting?: boolean;
  limit?: number;
}): Promise<Lead[]> {
  let query: FirebaseFirestore.Query = db().collection("leads").orderBy("createdAt", "desc");

  if (filters?.campaignId) query = query.where("campaignId", "==", filters.campaignId);
  if (filters?.status) query = query.where("status", "==", filters.status);
  if (filters?.inboxId) query = query.where("inboxId", "==", filters.inboxId);
  if (filters?.positiveReply !== undefined) query = query.where("positiveReply", "==", filters.positiveReply);
  if (filters?.bookedMeeting !== undefined) query = query.where("bookedMeeting", "==", filters.bookedMeeting);
  if (filters?.limit) query = query.limit(filters.limit);

  const snap = await query.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead));
}

export async function getLeadById(id: string): Promise<Lead | null> {
  const doc = await db().collection("leads").doc(id).get();
  return doc.exists ? ({ id: doc.id, ...doc.data() } as Lead) : null;
}

export async function createLead(data: Omit<Lead, "id" | "createdAt" | "updatedAt">): Promise<string> {
  const ref = db().collection("leads").doc();
  await ref.set({ ...data, createdAt: TS(), updatedAt: TS() });
  return ref.id;
}

export async function batchCreateLeads(leads: Omit<Lead, "id" | "createdAt" | "updatedAt">[]): Promise<string[]> {
  const ids: string[] = [];
  const chunks = [];
  for (let i = 0; i < leads.length; i += 500) {
    chunks.push(leads.slice(i, i + 500));
  }

  for (const chunk of chunks) {
    const batch = db().batch();
    for (const lead of chunk) {
      const ref = db().collection("leads").doc();
      ids.push(ref.id);
      batch.set(ref, { ...lead, createdAt: TS(), updatedAt: TS() });
    }
    await batch.commit();
  }

  return ids;
}

export async function updateLead(id: string, data: Partial<Lead>): Promise<void> {
  await db().collection("leads").doc(id).update({ ...data, updatedAt: TS() });
}

export async function deleteLead(id: string): Promise<void> {
  await db().collection("leads").doc(id).delete();
}

export async function getLeadsByIds(ids: string[]): Promise<Lead[]> {
  if (!ids.length) return [];
  const results: Lead[] = [];
  for (let i = 0; i < ids.length; i += 30) {
    const refs = ids.slice(i, i + 30).map((id) => db().collection("leads").doc(id));
    const snaps = await db().getAll(...refs);
    results.push(...snaps.filter((s) => s.exists).map((s) => ({ id: s.id, ...s.data() } as Lead)));
  }
  return results;
}

export async function batchDeleteLeads(ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 500) {
    const batch = db().batch();
    for (const id of ids.slice(i, i + 500)) {
      batch.delete(db().collection("leads").doc(id));
    }
    await batch.commit();
  }
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function createMessage(data: Omit<Message, "id">): Promise<string> {
  const ref = db().collection("messages").doc();
  await ref.set(data);
  return ref.id;
}

export async function getMessagesByLead(leadId: string): Promise<Message[]> {
  const snap = await db()
    .collection("messages")
    .where("leadId", "==", leadId)
    .orderBy("sentAt", "asc")
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message));
}

// ─── Events ───────────────────────────────────────────────────────────────────

export async function logEvent(
  event: Omit<LeadEvent, "id" | "timestamp">
): Promise<void> {
  const ref = db().collection("events").doc();
  await ref.set({ ...event, timestamp: now() });
}

export async function getEventsByLead(leadId: string): Promise<LeadEvent[]> {
  const snap = await db()
    .collection("events")
    .where("leadId", "==", leadId)
    .orderBy("timestamp", "desc")
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as LeadEvent));
}

export async function getRecentEvents(limitCount = 50): Promise<LeadEvent[]> {
  const snap = await db()
    .collection("events")
    .orderBy("timestamp", "desc")
    .limit(limitCount)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as LeadEvent));
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function incrementAnalytics(params: {
  date: string;
  campaignId: string;
  inboxId: string;
  field: "sent" | "replies" | "positive" | "bounced";
}): Promise<void> {
  const ref = db().collection("analytics").doc(params.date);
  const inc = admin.firestore.FieldValue.increment(1);

  await ref.set(
    {
      date: params.date,
      [params.field]: inc,
      [`byCampaign.${params.campaignId}.${params.field}`]: inc,
      [`byInbox.${params.inboxId}.${params.field === "sent" ? "sent" : "replies"}`]: inc,
    },
    { merge: true }
  );
}

export async function getAnalytics(days = 30): Promise<DailyAnalytics[]> {
  const snap = await db()
    .collection("analytics")
    .orderBy("date", "desc")
    .limit(days)
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as DailyAnalytics));
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<AppSettings> {
  const doc = await db().collection("settings").doc("global").get();
  const defaults: AppSettings = {
    timezone: "America/New_York",
    defaultDailyLimit: 30,
    minDelaySec: 60,
    maxDelaySec: 300,
    sendingWindowStart: "09:00",
    sendingWindowEnd: "17:00",
    unsubscribeText: "To unsubscribe, reply STOP.",
    sendingDays: [1, 2, 3, 4, 5],
    cronEnabled: true,
    cronIntervalMinutes: 5,
    lastCronRunAt: null,
    updatedAt: now(),
  };
  if (!doc.exists) return defaults;
  return { ...defaults, ...doc.data() } as AppSettings;
}

export async function updateSettings(data: Partial<AppSettings>): Promise<void> {
  await db().collection("settings").doc("global").set(
    { ...data, updatedAt: now() },
    { merge: true }
  );
}

// ─── Gmail Credentials ────────────────────────────────────────────────────────

export interface GmailCredentials {
  googleClientId: string;
  googleClientSecret: string; // stored encrypted
  googleRedirectUri: string;
  updatedAt: number;
}

export async function getGmailCredentials(): Promise<Omit<GmailCredentials, "googleClientSecret"> & { configured: boolean; secretMasked: string }> {
  const doc = await db().collection("settings").doc("credentials").get();
  if (!doc.exists) {
    return { googleClientId: "", googleRedirectUri: "", configured: false, secretMasked: "", updatedAt: 0 };
  }
  const data = doc.data() as GmailCredentials;
  return {
    googleClientId: data.googleClientId ?? "",
    googleRedirectUri: data.googleRedirectUri ?? "",
    configured: !!(data.googleClientId && data.googleClientSecret && data.googleRedirectUri),
    secretMasked: data.googleClientSecret ? "••••••••••••••••" : "",
    updatedAt: data.updatedAt ?? 0,
  };
}

export async function saveGmailCredentials(creds: {
  googleClientId: string;
  googleClientSecret?: string;
  googleRedirectUri: string;
}): Promise<void> {
  const existing = await db().collection("settings").doc("credentials").get();
  const existingData = existing.exists ? (existing.data() as GmailCredentials) : null;

  const update: Partial<GmailCredentials> = {
    googleClientId: creds.googleClientId,
    googleRedirectUri: creds.googleRedirectUri,
    updatedAt: now(),
  };

  if (creds.googleClientSecret && creds.googleClientSecret !== "••••••••••••••••") {
    update.googleClientSecret = encrypt(creds.googleClientSecret);
  } else if (existingData?.googleClientSecret) {
    update.googleClientSecret = existingData.googleClientSecret;
  }

  await db().collection("settings").doc("credentials").set(update, { merge: true });
}

// ─── Block List ───────────────────────────────────────────────────────────────

export async function getBlocklist(): Promise<string[]> {
  const doc = await db().collection("settings").doc("blocklist").get();
  if (!doc.exists) return [];
  return (doc.data()?.emails ?? []) as string[];
}

export async function addToBlocklist(emails: string[]): Promise<void> {
  if (!emails.length) return;
  await db().collection("settings").doc("blocklist").set(
    { emails: admin.firestore.FieldValue.arrayUnion(...emails.map((e) => e.toLowerCase().trim())) },
    { merge: true }
  );
}

export async function removeFromBlocklist(email: string): Promise<void> {
  await db().collection("settings").doc("blocklist").update({
    emails: admin.firestore.FieldValue.arrayRemove(email.toLowerCase().trim()),
  });
}

// ─── Email deduplication ──────────────────────────────────────────────────────

export async function getLeadsByEmails(emails: string[]): Promise<Lead[]> {
  if (!emails.length) return [];
  const results: Lead[] = [];
  for (let i = 0; i < emails.length; i += 30) {
    const chunk = emails.slice(i, i + 30);
    const snap = await db().collection("leads").where("email", "in", chunk).get();
    results.push(...snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead)));
  }
  return results;
}

// ─── Worker Queue ─────────────────────────────────────────────────────────────

export async function getPendingLeadsForCampaign(campaignId: string): Promise<Lead[]> {
  const snap = await db()
    .collection("leads")
    .where("campaignId", "==", campaignId)
    .where("status", "==", "pending")
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead));
}

export async function getActiveCampaigns(): Promise<Campaign[]> {
  const snap = await db()
    .collection("campaigns")
    .where("status", "==", "active")
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Campaign));
}

export async function getQueuedLeads(limitCount = 50): Promise<Lead[]> {
  const snap = await db()
    .collection("leads")
    .where("status", "==", "queued")
    .limit(limitCount)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead));
}

export async function getSentLeadsForReplyCheck(limitCount = 20): Promise<Lead[]> {
  const snap = await db()
    .collection("leads")
    .where("status", "==", "sent")
    .where("nextFollowUpAt", "==", null)
    .limit(limitCount)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead));
}

export async function getDueFollowUps(limitCount = 50): Promise<Lead[]> {
  const nowTs = now();
  const snap = await db()
    .collection("leads")
    .where("status", "==", "sent")
    .where("nextFollowUpAt", "<=", nowTs)
    .orderBy("nextFollowUpAt", "asc")
    .limit(limitCount)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead));
}
