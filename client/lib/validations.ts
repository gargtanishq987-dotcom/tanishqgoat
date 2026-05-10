import { z } from "zod";

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password required"),
});

export type LoginInput = z.infer<typeof LoginSchema>;

// ─── Inbox ────────────────────────────────────────────────────────────────────

export const InboxUpdateSchema = z.object({
  dailyLimit: z.number().int().min(1).max(500),
  timezone: z.string().min(1),
  sendingWindowStart: z.string().regex(/^\d{2}:\d{2}$/),
  sendingWindowEnd: z.string().regex(/^\d{2}:\d{2}$/),
  status: z.enum(["active", "paused"]),
});

export type InboxUpdateInput = z.infer<typeof InboxUpdateSchema>;

// ─── Campaign ─────────────────────────────────────────────────────────────────

export const CampaignSchema = z.object({
  name: z.string().min(1, "Name required").max(100),
  assignedInboxIds: z.array(z.string()).min(1, "At least one inbox required"),
  dailyLimit: z.number().int().min(1).max(1000),
  timezone: z.string().min(1),
  sendingWindowStart: z.string().regex(/^\d{2}:\d{2}$/),
  sendingWindowEnd: z.string().regex(/^\d{2}:\d{2}$/),
  minDelaySec: z.number().int().min(30),
  maxDelaySec: z.number().int().min(30),
  followUpDelayDays: z.array(z.number().int().min(1)).max(3),
});

export type CampaignInput = z.infer<typeof CampaignSchema>;

// ─── Lead ─────────────────────────────────────────────────────────────────────

export const LeadUpdateSchema = z.object({
  notes: z.string().optional(),
  positiveReply: z.boolean().optional(),
  bookedMeeting: z.boolean().optional(),
  status: z.enum(["pending", "queued", "sent", "replied", "positive", "booked", "bounced", "unsubscribed"]).optional(),
});

export type LeadUpdateInput = z.infer<typeof LeadUpdateSchema>;

// ─── CSV Row ──────────────────────────────────────────────────────────────────

export const CsvRowSchema = z.object({
  first_name: z.string().default(""),
  last_name: z.string().default(""),
  company: z.string().default(""),
  email: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
  followup_1: z.string().default(""),
  followup_2: z.string().default(""),
  followup_3: z.string().default(""),
});

export type CsvRow = z.infer<typeof CsvRowSchema>;

export const REQUIRED_CSV_COLUMNS = ["email", "subject", "body"] as const;

// ─── Send Test ────────────────────────────────────────────────────────────────

export const TestSendSchema = z.object({
  inboxId: z.string().min(1),
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
});

export type TestSendInput = z.infer<typeof TestSendSchema>;

// ─── Settings ─────────────────────────────────────────────────────────────────

export const SettingsSchema = z.object({
  timezone: z.string().min(1),
  defaultDailyLimit: z.number().int().min(1).max(500),
  minDelaySec: z.number().int().min(30),
  maxDelaySec: z.number().int().min(30),
  sendingWindowStart: z.string().regex(/^\d{2}:\d{2}$/),
  sendingWindowEnd: z.string().regex(/^\d{2}:\d{2}$/),
  unsubscribeText: z.string().max(500),
  sendingDays: z.array(z.number().int().min(0).max(6)),
  cronEnabled: z.boolean().optional(),
  cronIntervalMinutes: z.number().int().min(1).max(1440).optional(),
});

export type SettingsInput = z.infer<typeof SettingsSchema>;
