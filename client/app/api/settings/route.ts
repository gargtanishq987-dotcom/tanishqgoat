import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { getSettings, updateSettings } from "@/lib/firestore-helpers";
import { SettingsSchema } from "@/lib/validations";

export async function GET() {
  try {
    await requireSession();
    const settings = await getSettings();
    return NextResponse.json({ success: true, data: settings });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ success: false, error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireSession();
    const body = await req.json().catch(() => null);
    const parsed = SettingsSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }
    await updateSettings(parsed.data);
    return NextResponse.json({ success: true, data: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ success: false, error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
