import { get_last_update_dates } from "@/lib/stack_pricing_utils";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const dates = await get_last_update_dates();
    return NextResponse.json(dates);
  } catch (error: any) {
    console.error("Error fetching last update dates:", error);
    return NextResponse.json(
      { error: "Failed to fetch update dates" }, 
      { status: 500 }
    );
  }
}