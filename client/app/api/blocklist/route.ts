import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { getBlocklist, addToBlocklist, removeFromBlocklist } from "@/lib/firestore-helpers";

export async function GET() {
  try {
    await requireSession();
    const emails = await getBlocklist();
    return NextResponse.json({ success: true, data: emails });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ success: false, error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireSession();
    const body = await req.json().catch(() => null);
    const emails: string[] = Array.isArray(body?.emails) ? body.emails : [];
    if (!emails.length) return NextResponse.json({ success: false, error: "emails[] required" }, { status: 400 });
    await addToBlocklist(emails);
    return NextResponse.json({ success: true, data: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ success: false, error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireSession();
    const body = await req.json().catch(() => null);
    const email: string = body?.email ?? "";
    if (!email) return NextResponse.json({ success: false, error: "email required" }, { status: 400 });
    await removeFromBlocklist(email);
    return NextResponse.json({ success: true, data: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ success: false, error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
