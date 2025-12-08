import { getDailyProcesses, getProcessingDetails } from "@/lib/stock_movement_utils";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    
    const id = searchParams.get("id");
    const fromDate = searchParams.get("fromDate") || undefined;
    const toDate = searchParams.get("toDate") || undefined;

    // SCENARIO 1: Get Details for a specific Process ID
    if (id) {
      const processId = Number(id);
      if (isNaN(processId)) {
        return NextResponse.json({ error: "Invalid Process ID" }, { status: 400 });
      }
      
      const details = await getProcessingDetails(processId);
      return NextResponse.json(details);
    }

    // SCENARIO 2: Get List of Processes (with optional date filtering)
    const processes = await getDailyProcesses(fromDate, toDate);
    return NextResponse.json(processes);
    
  } catch (error) {
    console.error("Daily Processing API Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch processing data" },
      { status: 500 }
    );
  }
}