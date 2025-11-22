import { processOutbounds } from '@/lib/sti_processing_utils';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const gdiFile = formData.get('gdiFile') as File | null;
    const current_stock_file = formData.get("current_stock")as File | null;
    const sinceDateStr = formData.get('targetDate') as string | null;
    const summary_id:string = formData.get("summary_id") as string;
    const summary_id_int:number = parseInt(summary_id);

    if (!gdiFile || !sinceDateStr) {
      return NextResponse.json(
        { error: 'Missing gdiFile or sinceDate' },
        { status: 400 }
      );
    }

    const sinceDate = new Date(sinceDateStr);

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