import { NextRequest, NextResponse } from "next/server";
import {
  getQueuedLeads, getDueFollowUps, getInboxById, getCampaignById,
  updateLead, updateInbox, updateCampaign, createMessage, logEvent,
  incrementAnalytics, resetDailySentCounts, getSettings, getMessagesByLead,
} from "@/lib/firestore-helpers";
import { sendEmail, hasThreadReply } from "@/lib/gmail-client";
import { isWithinSendingWindow, todayString } from "@/lib/utils";
import type { Lead, Inbox } from "@/lib/types";

export async function GET(req: NextRequest) {
  // Vercel Cron sets this header automatically
  const isCron = req.headers.get("x-vercel-cron") === "1";
  const secret = req.headers.get("x-worker-secret");
  const validSecret = secret && secret === process.env.WORKER_SECRET;

  if (!isCron && !validSecret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results = { sent: 0, followups: 0, errors: 0, skipped: 0 };

  try {
    let settings;
    try {
      settings = await getSettings();
    } catch (e) {
      return NextResponse.json({ success: false, stage: "firebase_init", error: String(e) }, { status: 500 });
    }
    await resetDailySentCounts(settings.timezone);

    const [queuedLeads, dueFollowUps] = await Promise.all([
      getQueuedLeads(50),
      getDueFollowUps(50),
    ]);

    for (const lead of queuedLeads) {
      try {
        await processInitialEmail(lead, results);
      } catch (err) {
        results.errors++;
        await logEvent({
          leadId: lead.id, campaignId: lead.campaignId, inboxId: lead.inboxId,
          type: "EMAIL_FAILED",
          metadata: { error: err instanceof Error ? err.message : "Unknown" },
        });
      }
    }

    for (const lead of dueFollowUps) {
      try {
        await processFollowUp(lead, results);
      } catch (err) {
        results.errors++;
        await logEvent({
          leadId: lead.id, campaignId: lead.campaignId, inboxId: lead.inboxId,
          type: "FOLLOWUP_FAILED",
          metadata: { error: err instanceof Error ? err.message : "Unknown" },
        });
      }
    }

    return NextResponse.json({ success: true, data: results });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

async function processInitialEmail(lead: Lead, results: Record<string, number>): Promise<void> {
  const inbox = await getInboxById(lead.inboxId);
  if (!inbox) { results.skipped++; return; }
  if (!canSendFromInbox(inbox)) { results.skipped++; return; }

  const campaign = await getCampaignById(lead.campaignId);
  if (!campaign || campaign.status !== "active") { results.skipped++; return; }

  const { threadId, messageId } = await sendEmail({
    inboxId: inbox.id,
    to: lead.email,
    subject: lead.subject,
    body: lead.body,
    fromEmail: inbox.email,
    fromName: inbox.displayName,
  });

  const now = Date.now();
  const followUpDelays = campaign.followUpDelayDays ?? [];
  const nextFollowUpAt = followUpDelays.length > 0 && lead.followup1
    ? now + followUpDelays[0] * 86400_000
    : null;

  await Promise.all([
    updateLead(lead.id, {
      status: "sent", sentAt: now,
      gmailThreadId: threadId, gmailMessageId: messageId,
      inboxId: inbox.id, currentFollowUp: 1, nextFollowUpAt,
    }),
    updateInbox(inbox.id, { sentToday: (inbox.sentToday ?? 0) + 1 }),
    updateCampaign(lead.campaignId, { sentCount: (campaign.sentCount ?? 0) + 1 }),
    createMessage({
      leadId: lead.id, campaignId: lead.campaignId, inboxId: inbox.id,
      type: "initial", subject: lead.subject, body: lead.body,
      gmailThreadId: threadId, gmailMessageId: messageId,
      sentAt: now, status: "sent", errorMessage: null,
    }),
    incrementAnalytics({
      date: todayString(inbox.timezone),
      campaignId: lead.campaignId,
      inboxId: inbox.id,
      field: "sent",
    }),
    logEvent({
      leadId: lead.id, campaignId: lead.campaignId, inboxId: inbox.id,
      type: "EMAIL_SENT",
      metadata: { threadId, messageId, fromEmail: inbox.email, toEmail: lead.email },
    }),
  ]);

  results.sent++;
}

async function processFollowUp(lead: Lead, results: Record<string, number>): Promise<void> {
  if (!lead.gmailThreadId || !lead.gmailMessageId) { results.skipped++; return; }

  const inbox = await getInboxById(lead.inboxId);
  if (!inbox) {
    await logEvent({
      leadId: lead.id, campaignId: lead.campaignId, inboxId: lead.inboxId,
      type: "FOLLOWUP_FAILED",
      metadata: { error: `Original inbox ${lead.inboxId} no longer exists` },
    });
    results.skipped++;
    return;
  }

  if (!canSendFromInbox(inbox)) { results.skipped++; return; }

  const campaign = await getCampaignById(lead.campaignId);
  if (!campaign || campaign.status !== "active") { results.skipped++; return; }

  const replied = await hasThreadReply({
    inboxId: inbox.id,
    threadId: lead.gmailThreadId,
    ourMessageId: lead.gmailMessageId,
  });

  if (replied) {
    await updateLead(lead.id, { status: "replied", nextFollowUpAt: null });
    await logEvent({
      leadId: lead.id, campaignId: lead.campaignId, inboxId: inbox.id,
      type: "REPLY_DETECTED",
      metadata: { fromEmail: inbox.email, toEmail: lead.email },
    });
    results.skipped++;
    return;
  }

  const followUpIndex = lead.currentFollowUp;
  const followUpBodies = [lead.followup1, lead.followup2, lead.followup3];
  const followUpBody = followUpBodies[followUpIndex - 1];

  if (!followUpBody) {
    await updateLead(lead.id, { nextFollowUpAt: null });
    results.skipped++;
    return;
  }

  const { messageId } = await sendEmail({
    inboxId: inbox.id,
    to: lead.email,
    subject: lead.subject,
    body: followUpBody,
    threadId: lead.gmailThreadId,
    inReplyToMessageId: lead.gmailMessageId,
    fromEmail: inbox.email,
    fromName: inbox.displayName,
  });

  const now = Date.now();
  const nextIndex = followUpIndex + 1;
  const followUpDelays = campaign.followUpDelayDays ?? [];
  const delayDays = followUpDelays[nextIndex - 1];
  const nextFollowUpBody = followUpBodies[nextIndex - 1];
  const nextFollowUpAt = delayDays && nextFollowUpBody ? now + delayDays * 86400_000 : null;

  const messageTypes = ["initial", "followup_1", "followup_2", "followup_3"] as const;

  await Promise.all([
    updateLead(lead.id, { currentFollowUp: nextIndex, nextFollowUpAt, gmailMessageId: messageId }),
    updateInbox(inbox.id, { sentToday: (inbox.sentToday ?? 0) + 1 }),
    createMessage({
      leadId: lead.id, campaignId: lead.campaignId, inboxId: inbox.id,
      type: messageTypes[followUpIndex] ?? "followup_3",
      subject: lead.subject, body: followUpBody,
      gmailThreadId: lead.gmailThreadId, gmailMessageId: messageId,
      sentAt: now, status: "sent", errorMessage: null,
    }),
    incrementAnalytics({
      date: todayString(inbox.timezone),
      campaignId: lead.campaignId,
      inboxId: inbox.id,
      field: "sent",
    }),
    logEvent({
      leadId: lead.id, campaignId: lead.campaignId, inboxId: inbox.id,
      type: "FOLLOWUP_SENT",
      metadata: { followUpIndex, messageId, fromEmail: inbox.email, toEmail: lead.email, sameInboxAsInitial: true, nextFollowUpAt },
    }),
  ]);

  results.followups++;
}

function canSendFromInbox(inbox: Inbox): boolean {
  if (inbox.status !== "active") return false;
  if (inbox.sentToday >= inbox.dailyLimit) return false;
  if (!isWithinSendingWindow(inbox.sendingWindowStart, inbox.sendingWindowEnd, inbox.timezone)) return false;
  return true;
}
