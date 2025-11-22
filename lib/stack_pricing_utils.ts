// Assuming 'stock_movement_db.ts' is in the same directory or correctly imported
import { query } from "./stock_movement_db";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import * as XLSX from 'xlsx'; // Assuming you are using the 'xlsx' library for Node.js

/**
 * Interface for the structure of the data read from the Excel file
 * Based on the prompt's reference to 'Batch No.' and 'Position Strategy Allocation'.
 */
interface ExcelRow {
    'Batch No.': string;
    'Position Strategy Allocation': string | undefined | null;
    [key: string]: any; // To allow other columns
}

/**
 * Interface for the records in the daily_processes table
 */
interface DailyProcessRow extends RowDataPacket {
    id: number;
    summary_id: number;
    processing_date: string; // DATE type in SQL
    process_type: string;
    process_number: string;
    input_qty: number;
    output_qty: number;
    milling_loss: number;
    processing_loss_gain_qty: number;
    trade_variables_updated: boolean;
}

/**
 * Interface for the records in the daily_strategy_processing table
 */
interface DailyStrategyProcessingRow extends RowDataPacket {
    id: number;
    process_id: number;
    strategy: string | null;
    batch_number: string;
    input_qty: number;
    output_qty: number;
    processing_loss_gain_qty: number;
    input_differential: number | null;
    output_differential: number | null;
    input_hedge_level_usc_lb: number | null;
    output_hedge_level_usc_lb: number | null;
    input_cost_usd_50: number | null;
    output_cost_usd_50: number | null;
}

/**
 * Interface for the records in the catalogue_summary table
 */
interface CatalogueSummaryRow extends RowDataPacket {
    id: number;
    batch_number: string;
    cost_usd_50: number | null;
    hedge_usc_lb: number | null;
    diff_usc_lb: number | null;
}


/**
 * Updates trade variables (cost, hedge, differential) for processing records,
 * primarily focusing on 'BULKING' processes.
 * @param excelFilePath The path to the 'test details summary' Excel file (can be null).
 * @returns A promise that resolves to an array of process_numbers that were skipped.
 */
export async function update_post_trade_variables(excelFilePath: string | null): Promise<string[]> {
    console.log("Starting update_post_trade_variables process.");
    const skippedProcessNumbers: string[] = [];

    // --- 1. Update Strategy from Excel File ---
    if (excelFilePath) {
        console.log(`Processing Excel file: ${excelFilePath}`);
        try {
            const workbook = XLSX.readFile(excelFilePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const excelData: ExcelRow[] = XLSX.utils.sheet_to_json(worksheet);

            // Fetch all records with UNDEFINED strategy
            const undefinedStrategyRecords = await query<DailyStrategyProcessingRow[]>({
                query: `
                    SELECT id, batch_number
                    FROM daily_strategy_processing
                    WHERE strategy = 'UNDEFINED'
                `,
            });

            if (undefinedStrategyRecords && undefinedStrategyRecords.length > 0) {
                console.log(`Found ${undefinedStrategyRecords.length} strategy records to check for update.`);
                const updates = [];

                for (const dbRecord of undefinedStrategyRecords) {
                    const matchingExcelRow = excelData.find(
                        row => row['Batch No.'] === dbRecord.batch_number
                    );

                    if (matchingExcelRow) {
                        const newStrategy = matchingExcelRow['Position Strategy Allocation'];
                        if (newStrategy) {
                            const capitalizedStrategy = newStrategy.toUpperCase();
                            updates.push({ id: dbRecord.id, strategy: capitalizedStrategy });
                        }
                    }
                }

                if (updates.length > 0) {
                    console.log(`Applying ${updates.length} strategy updates...`);
                    // Use a transaction for multiple updates (optional but good practice)
                    const updatePromises = updates.map(update =>
                        query<ResultSetHeader>({
                            query: `
                                UPDATE daily_strategy_processing
                                SET strategy = ?
                                WHERE id = ?
                            `,
                            values: [update.strategy, update.id],
                        })
                    );
                    await Promise.all(updatePromises);
                    console.log("Strategy updates completed.");
                } else {
                    console.log("No strategy updates needed from the Excel file.");
                }
            }
        } catch (error) {
            console.error("Error processing Excel file or updating strategies:", error);
            // Continue with the rest of the function even if Excel update fails
        }
    }

    // --- 2. Filter daily_processes with trade_variables_updated = false ---
    const dailyProcesses = await query<DailyProcessRow[]>({
        query: `
            SELECT *
            FROM daily_processes
            WHERE trade_variables_updated = FALSE
        `,
    });

    if (!dailyProcesses || dailyProcesses.length === 0) {
        console.log("No daily_processes records found with trade_variables_updated = FALSE.");
        return skippedProcessNumbers;
    }

    console.log(`Found ${dailyProcesses.length} daily_processes records to process.`);

    // --- 3. Process records based on process_type ---
    for (const process of dailyProcesses) {
        let success = true;

        if (process.process_type === 'BULKING') {
            console.log(`Processing BULKING process_number: ${process.process_number} (id: ${process.id})`);

            // Fetch all related strategy records
            const strategyRecords = await query<DailyStrategyProcessingRow[]>({
                query: `
                    SELECT *
                    FROM daily_strategy_processing
                    WHERE process_id = ?
                `,
                values: [process.id],
            });

            if (!strategyRecords || strategyRecords.length === 0) {
                console.warn(`No strategy records found for process ID ${process.id}. Skipping.`);
                skippedProcessNumbers.push(process.process_number);
                continue;
            }

            const inputBatches = strategyRecords.filter(rec => rec.input_qty > 0);
            const outputBatch = strategyRecords.find(rec => rec.output_qty > 0);

            if (!outputBatch) {
                console.error(`BULKING process ${process.process_number} has no output batch. Skipping.`);
                skippedProcessNumbers.push(process.process_number);
                continue;
            }

            // --- Update Input Batches' Trade Variables ---
            const inputUpdatePromises = inputBatches.map(async (inputRecord) => {
                let tradeVariablesUpdated = false;

                // 3a. Lookup in catalogue_summary
                const catalogueMatch = await query<CatalogueSummaryRow[]>({
                    query: `
                        SELECT cost_usd_50, hedge_usc_lb, diff_usc_lb
                        FROM catalogue_summary
                        WHERE batch_number = ?
                    `,
                    values: [inputRecord.batch_number],
                });

                if (catalogueMatch && catalogueMatch.length > 0 && catalogueMatch[0].cost_usd_50 !== null) {
                    const cat = catalogueMatch[0];
                    await query<ResultSetHeader>({
                        query: `
                            UPDATE daily_strategy_processing
                            SET
                                input_cost_usd_50 = ?,
                                input_hedge_usc_lb = ?,
                                input_differential = ?
                            WHERE id = ?
                        `,
                        values: [cat.cost_usd_50, cat.hedge_usc_lb, cat.diff_usc_lb, inputRecord.id],
                    });
                    tradeVariablesUpdated = true;
                }
                // 3b. Lookup from the BULKING Output Batch (if 3a failed)
                else if (
                    outputBatch.output_cost_usd_50 !== null &&
                    outputBatch.output_hedge_usc_lb !== null &&
                    outputBatch.output_differential !== null
                ) {
                    await query<ResultSetHeader>({
                        query: `
                            UPDATE daily_strategy_processing
                            SET
                                input_cost_usd_50 = ?,
                                input_hedge_usc_lb = ?,
                                input_differential = ?
                            WHERE id = ?
                        `,
                        values: [
                            outputBatch.output_cost_usd_50,
                            outputBatch.output_hedge_usc_lb,
                            outputBatch.output_differential,
                            inputRecord.id,
                        ],
                    });
                    tradeVariablesUpdated = true;
                }

                // Update the inputRecord object to reflect changes for the later check
                // This requires re-fetching or a local update mechanism for accuracy,
                // but for simplicity, we'll check the success flag and then re-fetch if needed.
                return tradeVariablesUpdated;
            });

            await Promise.all(inputUpdatePromises);

            // Re-fetch the strategy records to check for null values after the updates
            const updatedStrategyRecords = await query<DailyStrategyProcessingRow[]>({
                query: `
                    SELECT id, input_qty, input_cost_usd_50, input_hedge_usc_lb, input_differential
                    FROM daily_strategy_processing
                    WHERE process_id = ? AND input_qty > 0
                `,
                values: [process.id],
            });

            const allInputsUpdated = updatedStrategyRecords?.every(
                (rec) =>
                    rec.input_cost_usd_50 !== null &&
                    rec.input_hedge_usc_lb !== null &&
                    rec.input_differential !== null
            );

            if (!allInputsUpdated || !updatedStrategyRecords) {
                console.log(`Skipping process ${process.process_number}: Not all input trade variables were updated.`);
                skippedProcessNumbers.push(process.process_number);
                success = false;
            }

            // --- 4. Calculate and Update Output Batch Trade Variables (Weighted Average) ---
            if (success) {
                const totalInputQty = updatedStrategyRecords!.reduce((sum, rec) => sum + rec.input_qty, 0);

                if (totalInputQty === 0) {
                    console.error(`Skipping process ${process.process_number}: Total input quantity is zero.`);
                    skippedProcessNumbers.push(process.process_number);
                    success = false;
                }

                if (success) {
                    const weightedSumCost = updatedStrategyRecords!.reduce(
                        (sum, rec) => sum + (rec.input_qty * (rec.input_cost_usd_50 ?? 0)),
                        0
                    );
                    const weightedSumHedge = updatedStrategyRecords!.reduce(
                        (sum, rec) => sum + (rec.input_qty * (rec.input_hedge_usc_lb ?? 0)),
                        0
                    );
                    const weightedSumDiff = updatedStrategyRecords!.reduce(
                        (sum, rec) => sum + (rec.input_qty * (rec.input_differential ?? 0)),
                        0
                    );

                    const avgCost = weightedSumCost / totalInputQty;
                    const avgHedge = weightedSumHedge / totalInputQty;
                    const avgDiff = weightedSumDiff / totalInputQty;

                    // Update the Output Batch record
                    await query<ResultSetHeader>({
                        query: `
                            UPDATE daily_strategy_processing
                            SET
                                output_cost_usd_50 = ?,
                                output_hedge_usc_lb = ?,
                                output_differential = ?
                            WHERE id = ?
                        `,
                        values: [avgCost, avgHedge, avgDiff, outputBatch.id],
                    });

                    // --- 5. Final Update: daily_processes.trade_variables_updated ---
                    await query<ResultSetHeader>({
                        query: `
                            UPDATE daily_processes
                            SET trade_variables_updated = TRUE
                            WHERE id = ?
                        `,
                        values: [process.id],
                    });

                    console.log(`Successfully updated trade variables for process: ${process.process_number}`);
                }
            }
        }
        // else if (process.process_type === 'OTHER_TYPE') { ... }
    }

    // --- 6. Success Message and Return Skipped List ---
    console.log("Trade variable update process finished successfully.");
    if (skippedProcessNumbers.length > 0) {
        console.log(`Skipped processes: ${skippedProcessNumbers.join(', ')}`);
    } else {
        console.log("No processes were skipped.");
    }
    return skippedProcessNumbers;
}

// Example usage (optional, remove for final file):
// async function run() {
//     const skipped = await update_post_trade_variables(null); // Pass file path or null
//     console.log('Final Skipped List:', skipped);
// }
// run();