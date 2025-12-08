// Example: src/app/api/process-sti/route.ts
import { processStiFile } from '@/lib/sti_processing_utils';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const stiFile = formData.get('stiFile') as File | null;
    const since_date_str = formData.get('targetDate') as string | null;
    const last_instruction_date_str = formData.get('last_instruction_date') as string | null;
    const summary_id:string = formData.get("summary_id") as string;
    const current_stock_file:File | null = formData.get("current_stock") as File | null;
    const summary_id_int:number = parseInt(summary_id);

    if (!stiFile || !since_date_str) {
      return NextResponse.json({ error: 'Missing Stock Transfer Instruction File' }, { status: 400 });
    }

    let sinceDate:Date;
    if (last_instruction_date_str != null) {
      sinceDate = new Date(last_instruction_date_str);
    }else{
      sinceDate = new Date(since_date_str);
    }

    // --- THIS NOW RUNS ON THE SERVER ---
    // It can access process.env and the database.
    const total_delivered_qty = await processStiFile(sinceDate, stiFile, summary_id_int,current_stock_file);
    // ---

    return NextResponse.json({ total_delivered_qty }, { status: 200 });

  } catch (error) {
    console.error("[API Error] /api/process-sti:", error);
    return NextResponse.json({ error: 'An internal server error occurred.' }, { status: 500 });
  }
}