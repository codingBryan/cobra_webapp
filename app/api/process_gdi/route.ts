import { processOutbounds } from '@/lib/sti_processing_utils';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const gdiFile = formData.get('gdiFile') as File | null;
    const current_stock_file = formData.get("current_stock")as File | null;
    const since_date_str = formData.get('targetDate') as string | null;
    const last_outbound_date_str = formData.get('last_outbound_date') as string | null;
    const summary_id:string = formData.get("summary_id") as string;
    const summary_id_int:number = parseInt(summary_id);

    if (!gdiFile || !since_date_str) {
      return NextResponse.json(
        { error: 'Missing Goods Dispatch File' },
        { status: 400 }
      );
    }

    let sinceDate:Date;
    if (last_outbound_date_str != null) {
      sinceDate = new Date(last_outbound_date_str);
    }else{
      sinceDate = new Date(since_date_str);
    }

    // Call your existing function.
    // The 'processOutbounds' function is already set up to handle
    // a standard File object, so no changes are needed there.
    const groupedData : {totalOutbound:number;groupedData:[string, number][]} = await processOutbounds(sinceDate, gdiFile, current_stock_file, summary_id_int);

    return NextResponse.json({ groupedData }, { status: 200 });
  } catch (error) {
    console.error('[API Error] /api/process-gdi:', error);
    return NextResponse.json(
      { error: 'An internal server error occurred.' },
      { status: 500 }
    );
  }
}