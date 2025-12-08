import { findUncostedProcessingBatches, updateTradeVariablesFromCsv, filterAndSaveMissingInputTradeBatches, process_sale_diff_update } from '@/lib/stack_pricing_utils';
import { NextRequest, NextResponse } from 'next/server';
// Assuming the utility file is stored at lib/find_and_save_uncosted_batches.ts

/**
 * Handles GET requests to trigger the uncosted batch analysis and save the result file.
 * This function runs entirely on the Node.js server environment.
 */
export async function GET() {
    console.log("[API] Analysis endpoint triggered.");
    
    try {
        // 1. Execute the server-side function that runs the query and writes the file.
        await findUncostedProcessingBatches();

        // 2. Success response
        return NextResponse.json({ 
            success: true, 
            message: 'Analysis complete. The list of uncosted batches has been saved to the "generated_files" folder on the server.'
        }, { status: 200 });

    } catch (error) {
        console.error("[API] Error running uncosted batch analysis:", error);
        
        // 3. Error response
        return NextResponse.json({ 
            success: false, 
            message: 'Internal server error during analysis.',
            error: (error as Error).message || 'Unknown error'
        }, { status: 500 });
    }
}


const FILE_FIELD_NAME = 'ghost_batches_file';

export async function POST(request: NextRequest) {
    console.log(`[API] Received request to update trade variables from CSV.`);
    
    try {
        const formData = await request.formData();
        const file = formData.get(FILE_FIELD_NAME);
        const misc_file = formData.get("misc_file") as File;

        if (!file || !(file instanceof File) || !misc_file || !(misc_file instanceof File)) {
            return NextResponse.json({ 
                success: false, 
                message: `File upload failed. Expected '${FILE_FIELD_NAME}' file part.` 
            }, { status: 400 });
        }

        console.log(`[API] File received: ${file.name}`);
        // await process_sale_diff_update(file);
        await updateTradeVariablesFromCsv(file);
        // await filterAndSaveMissingInputTradeBatches(misc_file);

        return NextResponse.json({ 
            success: true, 
            message: `Trade variables updated successfully from file: ${file.name}` 
        });

    } catch (error) {
        console.error("[API] Error processing CSV update:", error);
        return NextResponse.json({ 
            success: false, 
            message: 'Internal server error during CSV processing.',
            error: (error as Error).message || 'Unknown error'
        }, { status: 500 });
    }
}