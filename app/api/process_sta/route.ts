import { processAdjustments } from '@/lib/sti_processing_utils';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const staFile = formData.get('staFile') as File | null;
    const current_stock_file = formData.get('current_stock') as File | null;
    const since_date_str = formData.get('targetDate') as string | null;
    const last_adjustment_date_str = formData.get('last_adjustment_date') as string | null;
    const summary_id:string = formData.get("summary_id") as string;
    const summary_id_int:number = parseInt(summary_id);

    if (!staFile || !since_date_str) {
      return NextResponse.json(
        { error: 'Missing Adjustment File' },
        { status: 400 }
      );
    }

    let sinceDate:Date;
    if (last_adjustment_date_str != null) {
      sinceDate = new Date(last_adjustment_date_str);
    }else{
      sinceDate = new Date(since_date_str);
    }

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