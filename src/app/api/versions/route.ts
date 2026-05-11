import { NextResponse } from "next/server";
import { getManifest } from "@/lib/ism/repository";

export async function GET() {
  return NextResponse.json(await getManifest());
}
