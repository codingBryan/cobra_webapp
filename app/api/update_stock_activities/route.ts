// This API route handles the POST request to update daily stock activities.

import { InitializedActivityRecords, StockData } from '@/custom_utilities/custom_types';
import { update_grade_stock_movements, update_strategy_stock_movements } from '@/lib/sti_processing_utils';
import { NextRequest, NextResponse } from 'next/server';


/**
 * Handles POST requests to calculate and save daily stock movements for both grades and strategies.
 * Expects a JSON body containing stock_data, new_activities_data, and summary_id.
 * * @param request The incoming NextRequest object.
 * @returns A NextResponse object with success or error status.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Parse the request body as JSON
    const body = await request.json(); 

    // 2. Extract and validate data directly from the JSON body
    const stocks_data: StockData | null = body.stock_data as StockData | null;
    const new_activities : InitializedActivityRecords | null = body.new_activities_data as InitializedActivityRecords | null;
    
    // Safely extract and parse summary_id
    const summary_id_str: string = body.summary_id?.toString() || '';
    const summary_id_int: number = parseInt(summary_id_str, 10);
    
    // Validate required objects and numeric summary_id
    if (stocks_data == null || new_activities == null || isNaN(summary_id_int)) {
      console.log("Invalid data passed to endpoint: /api/update_stock_activity");
      return NextResponse.json(
        { error: 'Invalid or missing crucial data (stocks_data, new_activities, or summary_id).' },
        { status: 400 }
      );
    }


    // 3. Call the core logic function to calculate stock movements and save to DB
    await update_grade_stock_movements(
        new_activities, 
        stocks_data, 
        summary_id_int
    );
    // NOTE: updated_strategy_stock_movements logic is assumed to exist elsewhere
    await update_strategy_stock_movements(
        new_activities, 
        stocks_data, 
        summary_id_int
    );

    // 4. Return a success response
    return NextResponse.json(
      { message: 'Stock movements calculated and saved successfully.' }, 
      { status: 200 }
    );
    
  } catch (error) {
    console.error('[API Error] /api/update_stock_activity:', error);
    
    const errorMessage = error instanceof Error 
      ? `Internal Server Error: ${error.message}`
      : 'An internal server error occurred.';
      
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}