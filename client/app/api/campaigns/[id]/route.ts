import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import {
  getCampaignById, updateCampaign, deleteCampaign, createCampaign, getAllLeads,
  batchCreateLeads, logEvent
} from "@/lib/firestore-helpers";
import { CampaignSchema } from "@/lib/validations";
import type { Campaign } from "@/lib/types";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
    const { id } = await params;
    const campaign = await getCampaignById(id);
    if (!campaign) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: campaign });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ success: false, error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
    const { id } = await params;
    const body = await req.json().catch(() => null);

    if (body?.action) {
      return handleAction(id, body.action);
    }

    const parsed = CampaignSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    await updateCampaign(id, parsed.data);
    return NextResponse.json({ success: true, data: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ success: false, error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

async function handleAction(id: string, action: string): Promise<NextResponse> {
  const campaign = await getCampaignById(id);
  if (!campaign) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  if (action === "start" || action === "resume") {
    await updateCampaign(id, { status: "active" });
    await logEvent({ leadId: "", campaignId: id, inboxId: null, type: "CAMPAIGN_STARTED", metadata: {} });

    if (action === "start") {
      const leads = await getAllLeads({ campaignId: id });
      const pendingLeads = leads.filter((l) => l.status === "pending");
      const inboxIds = campaign.assignedInboxIds;
      let inboxIndex = 0;

      for (const lead of pendingLeads) {
        const inboxId = inboxIds[inboxIndex % inboxIds.length];
        await updateCampaign(id, {});
        const { updateLead } = await import("@/lib/firestore-helpers");
        await updateLead(lead.id, { status: "queued", inboxId });
        await logEvent({ leadId: lead.id, campaignId: id, inboxId, type: "EMAIL_QUEUED", metadata: {} });
        inboxIndex++;
      }
    }

    return NextResponse.json({ success: true, data: null });
  }

  if (action === "pause") {
    await updateCampaign(id, { status: "paused" });
    await logEvent({ leadId: "", campaignId: id, inboxId: null, type: "CAMPAIGN_PAUSED", metadata: {} });
    return NextResponse.json({ success: true, data: null });
  }

  if (action === "stop") {
    await updateCampaign(id, { status: "stopped" });
    await logEvent({ leadId: "", campaignId: id, inboxId: null, type: "CAMPAIGN_STOPPED", metadata: {} });
    return NextResponse.json({ success: true, data: null });
  }

  if (action === "duplicate") {
    const { id: _id, createdAt: _c, updatedAt: _u, sentCount, replyCount, positiveCount, bookedCount, totalLeads, ...rest } = campaign;
    const newId = await createCampaign({
      ...rest,
      name: `${rest.name} (copy)`,
      status: "draft",
      totalLeads: 0,
      sentCount: 0,
      replyCount: 0,
      positiveCount: 0,
      bookedCount: 0,
    });
    return NextResponse.json({ success: true, data: { id: newId } }, { status: 201 });
  }

  return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
    const { id } = await params;
    await deleteCampaign(id);
    return NextResponse.json({ success: true, data: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ success: false, error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
