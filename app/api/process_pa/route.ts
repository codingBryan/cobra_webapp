import { ProcessDetails, ProcessSummary } from "@/custom_utilities/custom_types";
import { getProcessDetails } from "@/lib/sti_processing_utils";
import { NextRequest, NextResponse } from "next/server";


export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const processing_analysis_file = formData.get('processing_analysis_file') as File | null;
    const current_stock_file = formData.get("current_stock")as File | null;
    const since_date_str = formData.get('targetDate') as string | null;
    const last_processing_date_str = formData.get('last_processing_date') as string | null;

    if (!processing_analysis_file || !since_date_str || !current_stock_file) {
      return NextResponse.json(
        { error: 'Missing Processing analysis File or Current Stock File' },
        { status: 400 }
      );
    }

    let sinceDate:Date;
    if (last_processing_date_str != null) {
      sinceDate = new Date(last_processing_date_str);
    }else{
      sinceDate = new Date(since_date_str);
    }

    // Call your existing function.
    const process_summary: ProcessSummary = await getProcessDetails(sinceDate, processing_analysis_file, current_stock_file);

    return NextResponse.json(process_summary, { status: 200 });
  } catch (error) {
    console.error('[API Error] /api/process_pa:', error);
    return NextResponse.json(
      { error: 'An internal server error occurred.' },
      { status: 500 }
    );
  }
}