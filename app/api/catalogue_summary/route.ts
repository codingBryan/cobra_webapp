import { CatalogueRecord } from "@/custom_utilities/custom_types";
import { query } from "@/lib/stock_movement_db";
import { ResultSetHeader } from "mysql2";
import { NextRequest, NextResponse } from "next/server";
export async function POST(request: NextRequest) {
    try {
        // 1. Read the JSON body sent from the frontend
        const records: CatalogueRecord[] = await request.json();
        
        const totalReceived = records.length;

        if (!Array.isArray(records) || totalReceived === 0) {
            return NextResponse.json(
                { success: false, message: 'Invalid or empty array of records provided.' },
                { status: 400 }
            );
        }

        // --- FILTER RECORDS ---
        
        const validRecords: CatalogueRecord[] = [];
        const failedBatchNumbers: (string | number)[] = [];

        for (const record of records) {
            // Check for required fields being null
            const hasNullFinancials = (record.cost_usd_50 === null || record.cost_usd_50 === undefined || record.cost_usd_50 === '') ||
                                     (record.hedge_usc_lb === null || record.hedge_usc_lb === undefined || record.hedge_usc_lb === '') ||
                                     (record.diff_usc_lb === null || record.diff_usc_lb === undefined || record.diff_usc_lb === '');
            
            if (hasNullFinancials) {
                // Collect the batch_number of the failed insertion
                if (record.batch_number) {
                    failedBatchNumbers.push(record.batch_number);
                }
            } else {
                validRecords.push(record);
            }
        }
        
        console.log(failedBatchNumbers)
        
        if (validRecords.length === 0) {
             return NextResponse.json({ 
                success: true, 
                message: `No records were inserted. All ${totalReceived} records failed the validation checks.`,
                recordsProcessed: 0,
                failedBatchNumbers: failedBatchNumbers
            }, { status: 200 });
        }


        // --- SQL INSERT/UPDATE LOGIC (using validRecords) ---
        
        const tableName = 'catalogue_summary';
        const columns = [
            'sale_type', 'sale_number', 'outturn', 'grower_mark', 'lot_number', 
            'weight', 'grade', 'season', 'certification', 'batch_number', 
            'cost_usd_50', 'hedge_usc_lb', 'diff_usc_lb', 'trade_month'
        ];

        // Prepare values and placeholders for safe batch insertion
        const placeholders = columns.map(() => '?').join(', '); 
        const valuePlaceholders = `(${placeholders})`; 

        const flatValues: any[] = [];
        const recordValues: any[] = [];

        // Flatten the array of VALID records into a single array of values
        for (const record of validRecords) {
            // Note: Using || null is crucial here for SQL NULL insertion
            const rowValues = columns.map(col => record[col as keyof CatalogueRecord] || null);
            recordValues.push(rowValues);
            flatValues.push(...rowValues);
        }
        
        // Create the batch placeholders string: (?,?,?),(?,?,?),...
        const batchPlaceholders = recordValues.map(() => valuePlaceholders).join(', ');

        // Define the ON DUPLICATE KEY UPDATE clause
        const updateColumns = [
            'sale_type = VALUES(sale_type)', 
            'sale_number = VALUES(sale_number)', 
            'outturn = VALUES(outturn)',
            'grower_mark = VALUES(grower_mark)',
            'lot_number = VALUES(lot_number)',
            'weight = VALUES(weight)',
            'grade = VALUES(grade)',
            'season = VALUES(season)',
            'certification = VALUES(certification)',
            'cost_usd_50 = VALUES(cost_usd_50)', 
            'hedge_usc_lb = VALUES(hedge_usc_lb)', 
            'diff_usc_lb = VALUES(diff_usc_lb)', 
            'trade_month = VALUES(trade_month)' 
        ].join(', ');

        // Construct the final SQL query
        const sql = `
            INSERT INTO ${tableName} (${columns.join(', ')}) 
            VALUES ${batchPlaceholders}
            ON DUPLICATE KEY UPDATE 
            ${updateColumns};
        `;

        // 2. Execute the batch query using your custom query function
        const result = await query({ query: sql, values: flatValues }) as ResultSetHeader | undefined;
        
        // Ensure result is available and has affectedRows property
        const affectedRows = result?.affectedRows ?? 0;

        return NextResponse.json({ 
            success: true, 
            message: `${affectedRows} records processed (inserted or updated).`,
            recordsProcessed: validRecords.length,
            failedBatchNumbers: failedBatchNumbers
        }, { status: 200 });

    } catch (error) {
        // Note: Your custom query function already logs detailed SQL errors.
        console.error('[API Error] /api/catalogue_summary', error);
        return NextResponse.json(
            { success: false, message: 'Failed to execute database insertion.', error: (error as Error).message },
            { status: 500 }
        );
    }
}