// Example: src/app/api/process-sti/route.ts
import { processStiFile } from '@/lib/sti_processing_utils';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const stiFile = formData.get('stiFile') as File | null;
    const targetDateStr = formData.get('targetDate') as string | null;
    const summary_id:string = formData.get("summary_id") as string;
    const current_stock_file:File | null = formData.get("current_stock") as File | null;
    const summary_id_int:number = parseInt(summary_id);

    if (!stiFile || !targetDateStr) {
      return NextResponse.json({ error: 'Missing file or date' }, { status: 400 });
    }

    const targetDate = new Date(targetDateStr);

    // --- THIS NOW RUNS ON THE SERVER ---
    // It can access process.env and the database.
    const total_delivered_qty = await processStiFile(targetDate, stiFile, summary_id_int,current_stock_file);
    // ---

    return NextResponse.json({ total_delivered_qty }, { status: 200 });

  } catch (error) {
    console.error("[API Error] /api/process-sti:", error);
    // Send a generic error message to the client
    return NextResponse.json({ error: 'An internal server error occurred.' }, { status: 500 });
  }
}