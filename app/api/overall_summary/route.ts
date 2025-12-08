import { getInventoryDashboard } from "@/lib/stock_movement_utils";
import { NextResponse } from "next/server";
// Adjust this import path to match where your getInventoryDashboard.ts file is located

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Extract optional query parameters
    // Expected format: ?fromDate=2023-01-01&toDate=2023-01-31
    const fromDate = searchParams.get("fromDate") || undefined;
    const toDate = searchParams.get("toDate") || undefined;

    // Call the optimized dashboard function
    const data = await getInventoryDashboard(fromDate, toDate);

    // Return the result with a 200 OK status
    return NextResponse.json(data);
    
  } catch (error) {
    console.error("Dashboard API Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch inventory dashboard data" },
      { status: 500 }
    );
  }
}