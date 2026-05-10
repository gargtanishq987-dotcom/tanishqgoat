import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { getAnalytics, getAllCampaigns, getAllInboxes, getAllLeads } from "@/lib/firestore-helpers";
import type { AnalyticsSummary } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const { searchParams } = req.nextUrl;
    const days = parseInt(searchParams.get("days") ?? "30", 10);

    const [dailyData, campaigns, inboxes, leads] = await Promise.all([
      getAnalytics(days),
      getAllCampaigns(),
      getAllInboxes(),
      getAllLeads({ limit: 2000 }),
    ]);

    const totalSent = leads.filter((l) => l.status !== "pending" && l.status !== "queued").length;
    const totalReplies = leads.filter((l) => ["replied", "positive", "booked"].includes(l.status)).length;
    const totalPositive = leads.filter((l) => l.positiveReply).length;
    const totalBooked = leads.filter((l) => l.bookedMeeting).length;
    const totalBounced = leads.filter((l) => l.status === "bounced").length;

    const inboxStats = inboxes.map((inbox) => {
      const inboxLeads = leads.filter((l) => l.inboxId === inbox.id);
      const sent = inboxLeads.filter((l) => l.status !== "pending").length;
      const replied = inboxLeads.filter((l) => ["replied", "positive", "booked"].includes(l.status)).length;
      return { email: inbox.email, sent, replyRate: sent > 0 ? replied / sent : 0 };
    });

    const campaignStats = campaigns.map((c) => ({
      name: c.name,
      sent: c.sentCount,
      replyRate: c.sentCount > 0 ? c.replyCount / c.sentCount : 0,
      positiveRate: c.sentCount > 0 ? c.positiveCount / c.sentCount : 0,
    }));

    const summary: AnalyticsSummary = {
      totalSent,
      totalReplies,
      totalPositive,
      totalBooked,
      totalBounced,
      replyRate: totalSent > 0 ? totalReplies / totalSent : 0,
      positiveRate: totalSent > 0 ? totalPositive / totalSent : 0,
      dailyData: dailyData.map((d) => ({
        date: d.date,
        sent: d.sent ?? 0,
        replies: d.replies ?? 0,
        positive: d.positive ?? 0,
      })),
      topInboxes: inboxStats.sort((a, b) => b.sent - a.sent).slice(0, 5),
      topCampaigns: campaignStats.sort((a, b) => b.sent - a.sent).slice(0, 5),
    };

    return NextResponse.json({ success: true, data: summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ success: false, error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
