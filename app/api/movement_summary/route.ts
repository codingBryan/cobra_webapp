import { deleteDailySummary, getDailySummaryId } from "@/lib/sti_processing_utils";
import { NextRequest, NextResponse } from "next/server";// Update path to where you saved the function

// Optimization: Forces the server to run the DB check on every request instead of serving a stale static cache
export const dynamic = 'force-dynamic'; 

export async function GET() {
  const id = await getDailySummaryId();
  return NextResponse.json({ id });
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const idParam = searchParams.get('id');

    if (!idParam) {
      return NextResponse.json({ error: "Missing 'id' parameter" }, { status: 400 });
    }

    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid 'id' parameter" }, { status: 400 });
    }

    const success = await deleteDailySummary(id);

    if (success) {
      return NextResponse.json({ success: true, message: `Summary ${id} deleted` });
    } else {
      return NextResponse.json({ error: "Record not found or already deleted" }, { status: 404 });
    }

  } catch (error: any) {
    console.error("Delete API Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}