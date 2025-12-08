import { updateUndefinedStrategies } from "@/lib/sti_processing_utils";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const test_details_summary:File = formData.get('test_details_summary_file') as File;

    await updateUndefinedStrategies(test_details_summary);
    return NextResponse.json(
        { message: 'Successfully Updated UNDEFINED strategies' },
        { status: 200 }
    );
    
  } catch (error) {
    console.error('[API Error] /api/update_undefined_strategies:', error);
    return NextResponse.json(
      { error: 'An internal server error occurred.' },
      { status: 500 }
    );
  }
}