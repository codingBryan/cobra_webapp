import { NextRequest, NextResponse } from 'next/server';
import { NextApiRequest, NextApiResponse } from 'next'; // Keeping these for type reference within the function signature
import { query } from "@/lib/stock_movement_db" // Assuming this path is correct
import { getStockDataframe } from '@/lib/sti_processing_utils';
import { StockData } from '@/custom_utilities/custom_types';

// Define the type for the expected JSON response
// IMPORTANT: For App Router, we usually return raw data/objects, 
// and wrap the response in NextResponse.json().
interface UserData {
    name: string;
}


export async function GET(
    // App Router GET handlers receive Request object for req, and no separate res object.
    // However, if you are strictly trying to mimic the old handler signature for the query logic, 
    // the structure must still be simplified for the App Router.
    // Since you are using query parameters, the standard Request object is sufficient.
    request: Request
) {
    try {
        // Query database
        const summary = await query({
            query: "SELECT * FROM daily_grade_activities",
            values:[]
        });
        
        // Return the query result directly or transform it
        // Note: NextResponse.json is used for the App Router
        return NextResponse.json({ 
            // Returning placeholder data matching UserData for now
            name: "John Doe", 
            summary: summary // Include the fetched data
        });

    } catch (error) {
        console.error("Database error:", error);
        // Always return a NextResponse in App Router
        return NextResponse.json(
            { error: "Failed to fetch stock movement data." }, 
            { status: 500 }
        );
    }
}



export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const current_stock_file = formData.get('current_stock') as File | null;

    if (!current_stock_file) {
      return NextResponse.json({ error: 'Missing file or date' }, { status: 400 });
    }

    // It can access process.env and the database.
    const current_stock_summary:StockData = await getStockDataframe(current_stock_file);


    return NextResponse.json({ current_stock_summary }, { status: 200 });

  } catch (error) {
    console.error("[API Error] /api/stock_movement:", error);
    // Send a generic error message to the client
    return NextResponse.json({ error: 'An internal server error occurred.' }, { status: 500 });
  }
}
