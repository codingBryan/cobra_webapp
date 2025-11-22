import { processAdjustments } from '@/lib/sti_processing_utils';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const staFile = formData.get('staFile') as File | null;
    const current_stock_file = formData.get('current_stock') as File | null;
    const sinceDateStr = formData.get('targetDate') as string | null;
    const summary_id:string = formData.get("summary_id") as string;
    const summary_id_int:number = parseInt(summary_id);

    if (!staFile || !sinceDateStr) {
      return NextResponse.json(
        { error: 'Missing Adjustment File or targetDate' },
        { status: 400 }
      );
    }

    const sinceDate = new Date(sinceDateStr);

    // Call your existing function.
    const { totalAdjustment, groupedData } = await processAdjustments(sinceDate, staFile, summary_id_int, current_stock_file);


    console.log("The total adjustment value is:", totalAdjustment);
    console.log(groupedData);

    // Return the full object
    return NextResponse.json({ totalAdjustment, groupedData }, { status: 200 });
  } catch (error) {
    console.error('[API Error] /api/process_sta:', error);
    return NextResponse.json(
      { error: 'An internal server error occurred.' },
      { status: 500 }
    );
  }
}