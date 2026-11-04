import { NextRequest, NextResponse } from "next/server";
import { getControlHistory } from "@/lib/ism/repository";
import { CONTROL_ID_PATTERN } from "@/lib/validation";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params; // already URL-decoded by Next
  const id = rawId.trim();
  if (!CONTROL_ID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid control id" }, { status: 400 });
  }

  const history = await getControlHistory(id);
  if (!history) {
    return NextResponse.json({ error: "Control not found" }, { status: 404 });
  }
  return NextResponse.json(history);
}
