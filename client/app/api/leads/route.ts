import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import {
  getAllLeads, batchCreateLeads, updateCampaign, getCampaignById,
  logEvent, getBlocklist, getLeadsByEmails,
} from "@/lib/firestore-helpers";
import { CsvRowSchema } from "@/lib/validations";
import { replacePlaceholders, buildLeadVariables } from "@/lib/utils";
import type { Lead } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const { searchParams } = req.nextUrl;
    const campaignId = searchParams.get("campaignId") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const inboxId = searchParams.get("inboxId") ?? undefined;
    const positiveReply = searchParams.get("positiveReply") === "true" ? true : undefined;
    const bookedMeeting = searchParams.get("bookedMeeting") === "true" ? true : undefined;
    const leads = await getAllLeads({ campaignId, status, inboxId, positiveReply, bookedMeeting });
    return NextResponse.json({ success: true, data: leads });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ success: false, error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireSession();
    const body = await req.json().catch(() => null);

    if (!body?.campaignId || !Array.isArray(body?.leads)) {
      return NextResponse.json({ success: false, error: "campaignId and leads[] required" }, { status: 400 });
    }

    const { campaignId, leads: rawLeads, allowDuplicates = false } = body as { campaignId: string; leads: Record<string, string>[]; allowDuplicates?: boolean };

    const campaign = await getCampaignById(campaignId);
    if (!campaign) {
      return NextResponse.json({ success: false, error: "Campaign not found" }, { status: 404 });
    }

    // Load blocklist and existing emails in parallel
    const incomingEmails = rawLeads.map((r) => (r.email ?? "").toLowerCase().trim()).filter(Boolean);
    const [blocklist, existingLeads] = await Promise.all([
      getBlocklist(),
      getLeadsByEmails(incomingEmails),
    ]);

    const blocklistSet = new Set(blocklist.map((e) => e.toLowerCase().trim()));
    const existingEmailSet = new Set(existingLeads.map((l) => l.email.toLowerCase().trim()));

    const validLeads: Omit<Lead, "id" | "createdAt" | "updatedAt">[] = [];
    const errors: { row: number; error: string }[] = [];
    let blocked = 0;
    let duplicates = 0;

    for (let i = 0; i < rawLeads.length; i++) {
      const row = rawLeads[i];
      const emailLower = (row.email ?? "").toLowerCase().trim();

      // Check blocklist
      if (blocklistSet.has(emailLower)) {
        blocked++;
        errors.push({ row: i + 1, error: `${row.email} is on the block list` });
        continue;
      }

      // Check duplicates across all campaigns (skipped when allowDuplicates is set)
      if (!allowDuplicates && existingEmailSet.has(emailLower)) {
        duplicates++;
        errors.push({ row: i + 1, error: `${row.email} already exists in a campaign` });
        continue;
      }

      const parsed = CsvRowSchema.safeParse(row);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const field = String(issue?.path?.[0] ?? "row");
        const msg = issue?.message ?? "Invalid row";
        errors.push({ row: i + 1, error: `${field}: ${msg}` });
        continue;
      }

      const d = parsed.data;
      const customVariables: Record<string, string> = {};
      const knownKeys = new Set(["first_name", "last_name", "company", "email", "subject", "body", "followup_1", "followup_2", "followup_3"]);
      for (const [k, v] of Object.entries(row)) {
        if (k && !knownKeys.has(k) && typeof v === "string") customVariables[k] = v;
      }

      const vars = buildLeadVariables({
        firstName: d.first_name,
        lastName: d.last_name,
        company: d.company,
        email: d.email,
        customVariables,
      });

      // Mark email as seen so within-batch duplicates are also caught
      existingEmailSet.add(emailLower);

      validLeads.push({
        campaignId,
        inboxId: "",
        firstName: d.first_name,
        lastName: d.last_name,
        company: d.company,
        email: d.email,
        subject: replacePlaceholders(d.subject, vars),
        body: replacePlaceholders(d.body, vars),
        followup1: replacePlaceholders(d.followup_1, vars),
        followup2: replacePlaceholders(d.followup_2, vars),
        followup3: replacePlaceholders(d.followup_3, vars),
        customVariables,
        status: "pending",
        sentAt: null,
        gmailThreadId: null,
        gmailMessageId: null,
        currentFollowUp: 0,
        nextFollowUpAt: null,
        notes: "",
        positiveReply: false,
        bookedMeeting: false,
        replyText: null,
        repliedAt: null,
      });
    }

    const ids = await batchCreateLeads(validLeads);
    for (const id of ids) {
      await logEvent({ leadId: id, campaignId, inboxId: null, type: "LEAD_CREATED", metadata: {} });
    }
    await updateCampaign(campaignId, { totalLeads: (campaign.totalLeads ?? 0) + validLeads.length });

    return NextResponse.json(
      { success: true, data: { imported: ids.length, blocked, duplicates, errors } },
      { status: 201 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ success: false, error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
