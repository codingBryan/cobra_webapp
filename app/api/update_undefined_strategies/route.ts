import { updateUndefinedStrategies } from "@/lib/sti_processing_utils";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const allFiles:File[] = formData.getAll('current_stock_files') as File[];

    await updateUndefinedStrategies(allFiles);
    return NextResponse.json(
        { message: 'Successfully Updated UNDEFINED strategies' },
        { status: 200 }
    );
    
  } catch (error) {
    console.error('[API Error] /api/update_undefined_straties:', error);
    return NextResponse.json(
      { error: 'An internal server error occurred.' },
      { status: 500 }
    );
  }
}