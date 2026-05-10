import type { Timestamp } from "firebase-admin/firestore";

// ─── Inbox ────────────────────────────────────────────────────────────────────

export type InboxStatus = "active" | "paused" | "error";
export type InboxHealth = "good" | "warning" | "error";

export interface Inbox {
  id: string;
  email: string;
  displayName: string;
  refreshToken: string; // encrypted
  accessToken: string;
  tokenExpiry: number; // unix ms
  dailyLimit: number;
  sentToday: number;
  lastResetDate: string; // YYYY-MM-DD
  timezone: string;
  sendingWindowStart: string; // HH:mm
  sendingWindowEnd: string; // HH:mm
  status: InboxStatus;
  health: InboxHealth;
  createdAt: number;
  updatedAt: number;
}

export type InboxCreateInput = Omit<
  Inbox,
  "id" | "refreshToken" | "accessToken" | "tokenExpiry" | "sentToday" | "lastResetDate" | "health" | "createdAt" | "updatedAt"
>;

// ─── Campaign ─────────────────────────────────────────────────────────────────

export type CampaignStatus = "draft" | "active" | "paused" | "completed" | "stopped";

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  assignedInboxIds: string[];
  dailyLimit: number;
  timezone: string;
  sendingWindowStart: string; // HH:mm
  sendingWindowEnd: string; // HH:mm
  minDelaySec: number;
  maxDelaySec: number;
  followUpDelayDays: number[]; // [3, 5, 7] = days after previous
  totalLeads: number;
  sentCount: number;
  replyCount: number;
  positiveCount: number;
  bookedCount: number;
  createdAt: number;
  updatedAt: number;
}

export type CampaignCreateInput = Omit<
  Campaign,
  "id" | "totalLeads" | "sentCount" | "replyCount" | "positiveCount" | "bookedCount" | "createdAt" | "updatedAt"
>;

// ─── Lead ─────────────────────────────────────────────────────────────────────

export type LeadStatus =
  | "pending"
  | "queued"
  | "sent"
  | "replied"
  | "positive"
  | "booked"
  | "bounced"
  | "unsubscribed";

export interface Lead {
  id: string;
  campaignId: string;
  inboxId: string;
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  subject: string;
  body: string;
  followup1: string;
  followup2: string;
  followup3: string;
  customVariables: Record<string, string>;
  status: LeadStatus;
  sentAt: number | null;
  gmailThreadId: string | null;
  gmailMessageId: string | null;
  currentFollowUp: number; // 0 = initial not sent, 1 = initial sent, 2 = followup1 sent, etc.
  nextFollowUpAt: number | null;
  notes: string;
  positiveReply: boolean;
  bookedMeeting: boolean;
  replyText: string | null;
  repliedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export type LeadCreateInput = Omit<
  Lead,
  "id" | "inboxId" | "status" | "sentAt" | "gmailThreadId" | "gmailMessageId" | "currentFollowUp" | "nextFollowUpAt" | "notes" | "positiveReply" | "bookedMeeting" | "createdAt" | "updatedAt"
>;

// ─── Message ──────────────────────────────────────────────────────────────────

export type MessageType = "initial" | "followup_1" | "followup_2" | "followup_3";
export type MessageStatus = "sent" | "failed";

export interface Message {
  id: string;
  leadId: string;
  campaignId: string;
  inboxId: string;
  type: MessageType;
  subject: string;
  body: string;
  gmailThreadId: string;
  gmailMessageId: string;
  sentAt: number;
  status: MessageStatus;
  errorMessage: string | null;
}

// ─── Event (lifecycle audit log) ─────────────────────────────────────────────

export type EventType =
  | "LEAD_CREATED"
  | "CAMPAIGN_ASSIGNED"
  | "EMAIL_QUEUED"
  | "EMAIL_SENT"
  | "EMAIL_FAILED"
  | "FOLLOWUP_SCHEDULED"
  | "FOLLOWUP_SENT"
  | "FOLLOWUP_FAILED"
  | "REPLY_DETECTED"
  | "POSITIVE_MARKED"
  | "MEETING_BOOKED"
  | "UNSUBSCRIBED"
  | "BOUNCED"
  | "INBOX_ERROR"
  | "CAMPAIGN_STARTED"
  | "CAMPAIGN_PAUSED"
  | "CAMPAIGN_STOPPED";

export interface LeadEvent {
  id: string;
  leadId: string;
  campaignId: string;
  inboxId: string | null;
  type: EventType;
  metadata: Record<string, unknown>;
  timestamp: number;
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface DailyAnalytics {
  id: string; // date: YYYY-MM-DD
  date: string;
  sent: number;
  replies: number;
  positive: number;
  bounced: number;
  byCampaign: Record<string, { sent: number; replies: number; positive: number }>;
  byInbox: Record<string, { sent: number; replies: number }>;
}

export interface AnalyticsSummary {
  totalSent: number;
  totalReplies: number;
  totalPositive: number;
  totalBooked: number;
  totalBounced: number;
  replyRate: number;
  positiveRate: number;
  dailyData: { date: string; sent: number; replies: number; positive: number }[];
  topInboxes: { email: string; sent: number; replyRate: number }[];
  topCampaigns: { name: string; sent: number; replyRate: number; positiveRate: number }[];
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface AppSettings {
  timezone: string;
  defaultDailyLimit: number;
  minDelaySec: number;
  maxDelaySec: number;
  sendingWindowStart: string;
  sendingWindowEnd: string;
  unsubscribeText: string;
  sendingDays: number[]; // 0=Sun...6=Sat
  cronEnabled: boolean;
  cronIntervalMinutes: number; // how many minutes between worker runs
  lastCronRunAt: number | null; // unix ms of last successful worker run
  updatedAt: number;
}

// ─── Session ──────────────────────────────────────────────────────────────────

export interface SessionData {
  isLoggedIn: boolean;
  email: string;
  gmailOAuthState?: string;
}

// ─── API Response Helpers ─────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Firestore Server Types (Timestamp) ───────────────────────────────────────

export interface FirestoreInbox extends Omit<Inbox, "createdAt" | "updatedAt"> {
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
