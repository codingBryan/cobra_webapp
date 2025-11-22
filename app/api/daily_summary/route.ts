import { NextResponse } from 'next/server';
import { NextApiRequest, NextApiResponse } from 'next'; // Keeping these for type reference within the function signature
import { query } from "@/lib/stock_movement_db" // Assuming this path is correct

// Define the type for the expected JSON response
// IMPORTANT: For App Router, we usually return raw data/objects, 
// and wrap the response in NextResponse.json().
interface UserData {
    name: string;
}

/**
 * Handles incoming API requests for the GET method.
 */
export async function GET(request: Request) {
    try {
        // Query database
        const summary = await query({
            // MODIFIED: Added ORDER BY and LIMIT 1
            query: "SELECT * FROM daily_stock_summaries ORDER BY date DESC LIMIT 1",
            values:[]
        });
        
        return NextResponse.json(summary);

    } catch (error) {
        console.error("Database error:", error);
        // Always return a NextResponse in App Router
        return NextResponse.json(
            { error: "Failed to fetch stock movement data." }, 
            { status: 500 }
        );
    }
}