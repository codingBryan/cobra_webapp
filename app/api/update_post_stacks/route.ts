import { process_post_stack_updates } from '@/lib/stack_pricing_utils';
import { NextRequest, NextResponse } from 'next/server';
; // Adjust path as needed

// Define the expected sheet name constant here for clarity
const FILE_FORM_FIELD_NAME = 'current_stock'; 

/**
 * Handles POST requests to upload the Current Stock file and trigger the Post Stack update process.
 * * The request is expected to be multipart/form-data containing a file named 'current_stock_file'.
 */
export async function POST(request: NextRequest) {
    console.log(`[API] Received request to process ${FILE_FORM_FIELD_NAME}.`);
    
    try {
        // 1. Parse the multipart/form-data payload
        const formData = await request.formData();
        
        // 2. Extract the file object
        const file = formData.get(FILE_FORM_FIELD_NAME);

        if (!file || !(file instanceof File)) {
            return NextResponse.json({ 
                success: false, 
                message: `File upload failed. Expected '${FILE_FORM_FIELD_NAME}' file part.` 
            }, { status: 400 });
        }

        console.log(`[API] File received: ${file.name}, Type: ${file.type}`);

        // 3. Call the core processing function
        await process_post_stack_updates(file);

        // 4. Success response
        return NextResponse.json({ 
            success: true, 
            message: `Post Stack updates initiated and completed successfully for file: ${file.name}` 
        });

    } catch (error) {
        console.error("[API] Failed to process post stack file:", error);
        
        // 5. Error response
        return NextResponse.json({ 
            success: false, 
            message: 'Internal server error during post stack processing.',
            error: (error as Error).message || 'Unknown error'
        }, { status: 500 });
    }
}

