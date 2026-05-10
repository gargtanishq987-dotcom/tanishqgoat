import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { getLeadById, updateLead, deleteLead, getMessagesByLead, getEventsByLead, updateCampaign, getCampaignById, logEvent } from "@/lib/firestore-helpers";
import { LeadUpdateSchema } from "@/lib/validations";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
    const { id } = await params;
    const [lead, messages, events] = await Promise.all([
      getLeadById(id),
      getMessagesByLead(id),
      getEventsByLead(id),
    ]);
    if (!lead) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: { lead, messages, events } });
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
    const parsed = LeadUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }

    const lead = await getLeadById(id);
    if (!lead) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    await updateLead(id, parsed.data);

    if (parsed.data.positiveReply === true && !lead.positiveReply) {
      await logEvent({ leadId: id, campaignId: lead.campaignId, inboxId: lead.inboxId, type: "POSITIVE_MARKED", metadata: {} });
      const campaign = await getCampaignById(lead.campaignId);
      if (campaign) await updateCampaign(lead.campaignId, { positiveCount: (campaign.positiveCount ?? 0) + 1 });
    }

    if (parsed.data.bookedMeeting === true && !lead.bookedMeeting) {
      await logEvent({ leadId: id, campaignId: lead.campaignId, inboxId: lead.inboxId, type: "MEETING_BOOKED", metadata: {} });
      const campaign = await getCampaignById(lead.campaignId);
      if (campaign) await updateCampaign(lead.campaignId, { bookedCount: (campaign.bookedCount ?? 0) + 1 });
    }

    return NextResponse.json({ success: true, data: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ success: false, error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
    const { id } = await params;
    const lead = await getLeadById(id);
    await deleteLead(id);
    if (lead) {
      const campaign = await getCampaignById(lead.campaignId);
      if (campaign) {
        await updateCampaign(lead.campaignId, {
          totalLeads: Math.max(0, (campaign.totalLeads ?? 1) - 1),
        });
      }
    }
    return NextResponse.json({ success: true, data: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ success: false, error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
