import { NextRequest, NextResponse } from 'next/server';
import { 
  assembleStockSummary,
  debit_credit_processing,
  initialize_daily_summary,
  initialize_grade_strategy_activity_records,
  update_daily_summary, 
   
} from '@/lib/sti_processing_utils'; 
import '@/lib/stock_movement_db'; 
import { InitializedActivityRecords, ProcessSummary, StockData } from '@/custom_utilities/custom_types';
import { update_post_trade_variables } from '@/lib/stack_pricing_utils';


/**
 * API route to initialize the daily stock summary.
 * It finds or creates a summary row for the current date
 * and returns its ID.
 */
export async function GET(request: NextRequest) {
  console.log("[API /api/initialize_summary] Received GET request.");

  try {
    // Call the initialize function. This runs on the server.
    const summary_id = await initialize_daily_summary();

    if (summary_id <= 0) {
       console.error(`[API Error] Initialization returned an invalid ID: ${summary_id}`);
       return NextResponse.json({ error: 'Failed to initialize summary row.' }, { status: 500 });
    }

    // Return the ID of the (new or existing) summary row
    return NextResponse.json({ summary_id: summary_id }, { status: 200 });

  } catch (error) {
    // Log the full error on the server
    console.error("[API Error] /api/initialize_summary:", error);
    
    // Send a generic error message to the client
    return NextResponse.json({ error: 'An internal server error occurred.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  console.log("[API /api/create_summary] Received POST request.");

  try {
    const body = await request.json();

    // 1. Extract all the numbers and objects from the client
    const { 
      summary_id,
      targetDate: targetDateStr,
      process_summary,
      inbound_weight,
      outbound_weight,
      adjustment_weight,
      xbs_current_stock_report
    } = body;

    // 2. Validate the data
    if (
      summary_id == 0 ||
      !targetDateStr || 
      !process_summary || 
      inbound_weight === undefined || 
      outbound_weight === undefined || 
      adjustment_weight === undefined || 
      !xbs_current_stock_report // Check for the object
      ) {
      
      console.error("[API Error] Missing required data in request body.", body);
      return NextResponse.json({ error: 'Missing required summary data.' }, { status: 400 });
    }
    
    const targetDate = new Date(targetDateStr);
    const xbs_report = xbs_current_stock_report as StockData;
    

    await update_daily_summary(summary_id as number, process_summary as ProcessSummary,outbound_weight as number,
      inbound_weight as number,
      adjustment_weight as number,
      xbs_report.total_closing_balance as number
    );

    // --- 3b. Initialize the (empty) activity records ---
    const new_activity_list:InitializedActivityRecords = await initialize_grade_strategy_activity_records(
      xbs_report,
      summary_id,
      targetDate
    );

    // --- 3c. Run the debit/credit logic to populate activities ---
    const updated_activity_list:any = await debit_credit_processing(
      new_activity_list,
      summary_id,
      process_summary as ProcessSummary,
      targetDate
    );

    
    console.log(`[API] Successfully updated summary and activities for ID: ${summary_id}`);

    const skipped_process_numbers = await update_post_trade_variables();
    if (skipped_process_numbers.length < 1){
      console.log(skipped_process_numbers)
    }

    else{
      console.log(skipped_process_numbers)
      console.log(`[API] Successfully updated trade variables: ${summary_id}`);
    }
    
    
    // Return the final updated activity list
    return NextResponse.json(updated_activity_list, { status: 200 });

  } catch (error) {
    // Log the full error on the server
    console.error("[API Error] /api/create_summary:", error);
    
    // Send a generic error message to the client
    return NextResponse.json({ error: 'An internal server error occurred.' }, { status: 500 });
  }
}