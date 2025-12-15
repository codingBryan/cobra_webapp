import { query } from "./stock_movement_db";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import * as XLSX from 'xlsx'; // Assuming you are using the 'xlsx' library for Node.js/browser environments

import * as fs from 'fs/promises';
import fs_node from 'fs';
import * as path from 'path';
import { Batch, DailyStrategyRow, LastUpdateDates, PostStackBatchRow, SaleRecord } from "@/custom_utilities/custom_types";
// --- CONSTANTS FOR COLOR SORTING / NON-BULKING PROCESSES ---

const STRATEGY_VALOS: Record<string, number> = {
    "SPECIALTY": 95.0,
    "AA TOP": 90.0,
    "AB TOP": 70.0,
    "PB TOP": 70.0,
    "AA PLUS": 70.0,
    "PB PLUS": 50.0,
    "AB PLUS": 50.0,
    "ABC PLUS": 45.0,
    "AA FAQ": 40.0,
    "PB FAQ": 20.0,
    "AB FAQ": 20.0,
    "ABC FAQ": 15.0,
    "GRINDERS": -25.0,
    "REJECTS": -270.0,
    "MBUNIS": -25.0,
    "GRINDER BOLD": -25.0, 
    "GRINDER RC": 0, 
    "GRINDER LIGHT": -70.0,
};

const STRATEGY_MAPPING: Record<string, string[]> = {
    "SPECIALTY": [
        "SPECIALTY - WASHED", "SPECIALTY - NATURAL", "SPECIALTY", "NATURAL", "POST NATURAL", "POST WASHED", "POST - WASHED"
    ],
    "AA TOP": [
        "AA - TOP", "POST 17 UP TOP", "IN AA - TOP", "PRE AA - TOP"
    ],
    "AB TOP": [
        "AB - TOP", "FINISHED AB - TOP", "IN AB - TOP", "POST 16 TOP"
    ],
    "PB TOP": [
        "PB-TOP", "PB - Top", "PB - TOP", "POST PB - TOP"
    ],
    "AA PLUS": [
        "AA - PLUS", "IN AA - PLUS", "PRE AA - PLUS", "POST 17 UP PLUS"
    ],
    "AB PLUS": [
        "AB - PLUS", "POST 16 PLUS", "PRE AB - PLUS"
    ],
    "PB PLUS": [
        "PB - PLUS", "POST PB - PLUS", "PRE PB - PLUS"
    ],
    "ABC PLUS": [
        "ABC - PLUS", "POST 14 PLUS"
    ],
    "AA FAQ": [
        "AA - FAQ", "AA - FAQ MINUS", "FAQ - PLUS", "PRE AA - FAQ", "IN AA - FAQ", "IN AA- FAQ", "IN AA - FAQ PLUS", "FINISHED AA - FAQ MINUS", "POST 17 UP FAQ", "FINISHED AA - FAQ", "POST FAQ PLUS"
    ],
    "AB FAQ": [
        "AB - FAQ", "AB - FAQ MINUS", "PRE AB - FAQ", "IN AB - FAQ", "POST 15 FAQ", "POST FAQ MINUS", "FINISHED AB - FAQ MINUS", "FINISHED AB - FAQ", "POST 16 FAQ"
    ],
    "PB FAQ": [
        "PB - FAQ", "PRE PB - FAQ"
    ],
    "ABC FAQ": [
        "ABC - FAQ", "PRE ABC - FAQ", "IN ABC - FAQ", "POST 14 FAQ", "FINISHED ABC - FAQ"
    ],
    "GRINDER BOLD": [
        "PRE GRINDER BOLD", "IN GRINDER BOLD", "POST GRINDER BOLD", "FINISHED GRINDER BOLD", "FINISHED GRINDER ", "GRINDER BOLD", "FINISHED GRINDER", "GRINDERS "
    ],
    "GRINDER RC": [
     "IN GRINDER RECOVERABLE", "PRE GRINDER RECOVERABLE"
    ],
    "GRINDER LIGHT": [
        "PRE GRINDER LIGHT", "IN GRINDER LIGHT", "POST GRINDER LIGHT", "FINISHED GRINDER LIGHT"
    ],
    "MBUNIS": [
        "MBUNIS", "ML", "MH", "PRE MBUNIS", "POST MH", "IN MBUNIS", "FINISHED MBUNIS"
    ],
    "REJECTS": [
        "REJECTS L", "REJECT", "REJECTS B", "DEFECTS P. %", "LOW GRADE", "PRE REJECT", "IN REJECT", "IN REJECTS S", "POST REJECTS S", "FINISHED REJECT", "SWEEPINGS", "DUST", "STONES", "FINISHED DUST"
    ]
};


/**
 * Interface for the Excel row structure used for strategy lookup
 */
interface StrategyRow {
    'Batch No.': string | undefined;
    'Position Strategy Allocation': string | undefined | null;
    [key: string]: any;
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



function mapStrategyToMainKey(detailedStrategy: string): string | null {
    const cleanStrategy = detailedStrategy.toUpperCase().trim();
    for (const mainKey in STRATEGY_MAPPING) {
        if (STRATEGY_MAPPING[mainKey].some(s => s.toUpperCase().trim() === cleanStrategy)) {
            return mainKey;
        }
    }
    if (STRATEGY_VALOS.hasOwnProperty(cleanStrategy)) {
        return cleanStrategy;
    }
    return null;
}

/**
 * Pushes calculated trade variables to any input batch in the system that matches this batch number.
 * Uses strict raw string matching.
 */
async function propagateToDownstreamInputs(batchNumber: string, cost: number, hedge: number, diff: number): Promise<void> {
    // Update using exact raw match
    await query<ResultSetHeader>({
        query: `
            UPDATE daily_strategy_processing
            SET 
                input_cost_usd_50 = ?, 
                input_hedge_level_usc_lb = ?, 
                input_differential = ?
            WHERE 
                batch_number = ?
                AND input_qty > 0
                AND (input_cost_usd_50 IS NULL OR input_hedge_level_usc_lb IS NULL)
        `,
        values: [cost, hedge, diff, batchNumber]
    });
}


export async function logMissingBatchData(processNumber: string, batchNumber: string, reason: string) {
    const fileName = 'processing_batched_missing_data.csv';
    const filePath = path.join(process.cwd(), 'generated_files', fileName);
    
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs_node.existsSync(dir)) {
        fs_node.mkdirSync(dir, { recursive: true });
    }

    const date = new Date().toISOString();
    const csvLine = `${date},${processNumber},${batchNumber},"${reason}"\n`;

    // Add header if file doesn't exist
    if (!fs_node.existsSync(filePath)) {
        const header = 'Timestamp,ProcessNumber,BatchNumber,Reason\n';
        await fs_node.promises.writeFile(filePath, header + csvLine, { flag: 'w' });
    } else {
        await fs_node.promises.appendFile(filePath, csvLine);
    }
}
// --- PROCESSING FUNCTIONS ---
const KG_TO_LBS = 2.20462;

export async function calculate_and_update_trade_variables_for_other_processes(process: DailyProcessRow, enablePush: boolean): Promise<boolean> {
    const processId = process.id;
    const processNumber = process.process_number;

    const strategyRecords = await query<DailyStrategyProcessingRow[]>({
        query: `SELECT * FROM daily_strategy_processing WHERE process_id = ?`, values: [processId],
    });

    if (!strategyRecords || strategyRecords.length === 0) return false;

    const inputBatches = strategyRecords.filter(rec => rec.input_qty > 0);
    const outputBatches = strategyRecords.filter(rec => rec.output_qty > 0);

    if (inputBatches.length === 0 || outputBatches.length === 0) return false;

    // --- STEP 1: Source Input Trade Variables (Lookup & Update DB first) ---
    // We must ensure the DB is updated so we have the correct hedge levels for calculation
    const inputUpdatePromises = inputBatches.map(async (inputRecord) => {
        if (inputRecord.input_cost_usd_50 !== null && inputRecord.input_hedge_level_usc_lb !== null) {
            return true;
        }
        const rawBatchNumber = inputRecord.batch_number;

        // 1a. Catalogue Summary
        const catalogueMatch = await query<CatalogueSummaryRow[]>({
            query: `SELECT cost_usd_50, hedge_usc_lb, diff_usc_lb FROM catalogue_summary WHERE batch_number = ?`,
            values: [rawBatchNumber],
        });

        if (catalogueMatch && catalogueMatch.length > 0 && catalogueMatch[0].cost_usd_50 !== null) {
            const cat = catalogueMatch[0];
            await query<ResultSetHeader>({
                query: `UPDATE daily_strategy_processing SET input_cost_usd_50 = ?, input_hedge_level_usc_lb = ?, input_differential = ? WHERE id = ?`,
                values: [cat.cost_usd_50, cat.hedge_usc_lb, cat.diff_usc_lb, inputRecord.id],
            });
            return true;
        }
        
        // 1b. Standard Lookup (Pull)
        const outputMatch = await query<DailyStrategyProcessingRow[]>({
            query: `SELECT output_cost_usd_50, output_hedge_level_usc_lb, output_differential
                    FROM daily_strategy_processing
                    WHERE batch_number = ? AND output_qty > 0 AND output_cost_usd_50 IS NOT NULL
                    ORDER BY id DESC LIMIT 1`,
            values: [rawBatchNumber],
        });

        if (outputMatch && outputMatch.length > 0) {
            const out = outputMatch[0];
            if (Number.isFinite(Number(out.output_cost_usd_50))) {
                await query<ResultSetHeader>({
                    query: `UPDATE daily_strategy_processing SET input_cost_usd_50 = ?, input_hedge_level_usc_lb = ?, input_differential = ? WHERE id = ?`,
                    values: [out.output_cost_usd_50, out.output_hedge_level_usc_lb, out.output_differential, inputRecord.id],
                });
                return true;
            }
        }
        return false;
    });

    await Promise.all(inputUpdatePromises);

    // --- STEP 2: Fetch Fresh Data & Validate ---
    const updatedInputs = await query<DailyStrategyProcessingRow[]>({
        query: `SELECT * FROM daily_strategy_processing WHERE process_id = ? AND input_qty > 0`,
        values: [processId],
    });

    if (!updatedInputs || updatedInputs.length === 0) return false;

    // Check for missing data
    const failingInputs = updatedInputs.filter(rec => rec.input_cost_usd_50 === null || rec.input_hedge_level_usc_lb === null);
    if (failingInputs.length > 0) {
        for (const fail of failingInputs) {
            await logMissingBatchData(processNumber, fail.batch_number, "Missing input cost or hedge level");
        }
        return false;
    }

    // --- STEP 3: Aggregate Inputs & Calculate INPUT VALUE (Cents) ---
    // Logic: Sum((InputHedge + InputValo) * InputQty * 2.205)
    
    let totalInputQty = 0;
    let wSumCost = 0;
    let wSumHedge = 0;
    let totalInputValueCents = 0;

    for (const rec of updatedInputs) {
        const qty = Number(rec.input_qty);
        const cost = Number(rec.input_cost_usd_50 || 0);
        const hedge = Number(rec.input_hedge_level_usc_lb || 0);
        const strategy = rec.strategy || 'UNDEFINED';

        // Weighted Averages accumulators (still needed for allocating cost to outputs)
        totalInputQty += qty;
        wSumCost += (qty * cost);
        wSumHedge += (qty * hedge);

        // Input VALO Lookup
        let inputValo = 0;
        const mainStrategy = mapStrategyToMainKey(strategy);
        if (mainStrategy && STRATEGY_VALOS[mainStrategy] !== undefined) {
            inputValo = STRATEGY_VALOS[mainStrategy];
        }

        // Value Calculation: (Hedge + Valo) * Qty * 2.205
        const theoreticalInputPrice = hedge + inputValo;
        totalInputValueCents += (inputValo * qty * KG_TO_LBS);
    }

    if (totalInputQty === 0) return false;

    const weightedInputCost = wSumCost / totalInputQty;
    const weightedInputHedge = wSumHedge / totalInputQty; // This becomes the Base Output Hedge

    if (!Number.isFinite(weightedInputHedge)) return false;

    // --- STEP 4: Calculate OUTPUT VALUE (Cents) ---
    // Logic: Sum((OutputHedge + OutputValo) * OutputQty * 2.205)
    
    let totalOutputValueCents = 0;
    let totalTheoreticalAllocScore = 0; // For Cost Allocation only
    const outputData = [];

    for (const output of outputBatches) {
        if (!output.strategy || output.strategy === 'UNDEFINED') {
            await logMissingBatchData(processNumber, output.batch_number, "Output strategy is UNDEFINED");
            return false;
        }
        const mainStrategy = mapStrategyToMainKey(output.strategy);
        const valo = mainStrategy ? STRATEGY_VALOS[mainStrategy] : null;
        if (valo === null) {
            await logMissingBatchData(processNumber, output.batch_number, `Strategy ${output.strategy} not found in VALOS`);
            return false;
        }

        const qty = Number(output.output_qty);

        // 1. Output Value Calculation
        // The output inherits the Weighted Input Hedge as its base hedge level
        const outputHedge = weightedInputHedge; 
        const theoreticalOutputPrice = valo;
        
        const batchValueCents = valo * qty * KG_TO_LBS;
        totalOutputValueCents += batchValueCents;

        // 2. Score for Accounting Cost Allocation (Previous logic, kept to populate cost_usd_50 correctly)
        const unitTheoreticalVal = outputHedge + valo;
        const theoreticalAllocScore = (unitTheoreticalVal < 0 ? 0 : unitTheoreticalVal) * qty;
        totalTheoreticalAllocScore += theoreticalAllocScore;

        outputData.push({ ...output, valo, theoreticalAllocScore });
    }

    // --- STEP 5: PnL Calculation (Dollars) ---
    // PnL = (Output Value Cents - Input Value Cents) / 100
    const pnl = (totalOutputValueCents - totalInputValueCents) / 100;
    const inputValueDollars = totalInputValueCents / 100;
    const outputValueDollars = totalOutputValueCents / 100;

    // --- STEP 6: Update Output Batches (Allocation & Push) ---
    const inputValueInAccountingDollars = (totalInputQty / 50) * weightedInputCost; // Real money spent

    for (const output of outputData) {
        // We still allocate the *Accounting Cost* proportionally based on value created
        const proportionalVal = (totalTheoreticalAllocScore !== 0) ? (output.theoreticalAllocScore / totalTheoreticalAllocScore) : 0;
        const allocatedVal = proportionalVal * inputValueInAccountingDollars;
        const outputQtyIn50s = Number(output.output_qty) / 50;
        
        let finalOutputCost: number | null = (outputQtyIn50s !== 0) ? (allocatedVal / outputQtyIn50s) : null;
        let finalOutputDiff: number | null = (finalOutputCost !== null) ? ((finalOutputCost / 1.1023) - weightedInputHedge) : null;
        let finalOutputHedge: number | null = weightedInputHedge;

        if (!Number.isFinite(finalOutputCost)) { finalOutputCost = null; finalOutputDiff = null; }
        if (finalOutputCost === null) return false;

        // Update DB
        await query<ResultSetHeader>({
            query: `UPDATE daily_strategy_processing SET output_cost_usd_50 = ?, output_hedge_level_usc_lb = ?, output_differential = ? WHERE id = ?`,
            values: [finalOutputCost, finalOutputHedge, finalOutputDiff, output.id],
        });

        if (enablePush) {
            await propagateToDownstreamInputs(output.batch_number, finalOutputCost, finalOutputHedge!, finalOutputDiff!);
        }
    }

    await query<ResultSetHeader>({
        query: `UPDATE daily_processes SET trade_variables_updated = TRUE, input_value = ?, output_value = ?, pnl = ? WHERE id = ?`,
        values: [inputValueDollars, outputValueDollars, pnl, processId],
    });

    console.log(`[${processNumber}] Success. PnL: $${pnl.toFixed(2)}`);
    return true;
}

export async function process_bulking(process: DailyProcessRow, enablePush: boolean): Promise<boolean> {
    const processId = process.id;
    const processNumber = process.process_number;

    const strategyRecords = await query<DailyStrategyProcessingRow[]>({
        query: `SELECT * FROM daily_strategy_processing WHERE process_id = ?`, values: [processId],
    });

    if (!strategyRecords || strategyRecords.length === 0) return false;

    const inputBatches = strategyRecords.filter(rec => rec.input_qty > 0);
    const outputBatch = strategyRecords.find(rec => rec.output_qty > 0);

    if (!outputBatch) return false;

    // --- Source Inputs ---
    const inputUpdatePromises = inputBatches.map(async (inputRecord) => {
        if (inputRecord.input_cost_usd_50 !== null) return true; 
        const rawBatchNumber = inputRecord.batch_number; 
        
        const catalogueMatch = await query<CatalogueSummaryRow[]>({
            query: `SELECT cost_usd_50, hedge_usc_lb, diff_usc_lb FROM catalogue_summary WHERE batch_number = ?`,
            values: [rawBatchNumber],
        });

        if (catalogueMatch && catalogueMatch.length > 0 && catalogueMatch[0].cost_usd_50 !== null) {
            const cat = catalogueMatch[0];
            await query<ResultSetHeader>({
                query: `UPDATE daily_strategy_processing SET input_cost_usd_50 = ?, input_hedge_level_usc_lb = ?, input_differential = ? WHERE id = ?`,
                values: [cat.cost_usd_50, cat.hedge_usc_lb, cat.diff_usc_lb, inputRecord.id],
            });
        } else {
            const outputMatch = await query<DailyStrategyProcessingRow[]>({
                query: `SELECT output_cost_usd_50, output_hedge_level_usc_lb, output_differential FROM daily_strategy_processing WHERE batch_number = ? AND output_qty > 0 AND output_cost_usd_50 IS NOT NULL ORDER BY id DESC LIMIT 1`,
                values: [rawBatchNumber],
            });
            if (outputMatch && outputMatch.length > 0) {
                const out = outputMatch[0];
                if (Number.isFinite(Number(out.output_cost_usd_50))) {
                    await query<ResultSetHeader>({
                        query: `UPDATE daily_strategy_processing SET input_cost_usd_50 = ?, input_hedge_level_usc_lb = ?, input_differential = ? WHERE id = ?`,
                        values: [out.output_cost_usd_50, out.output_hedge_level_usc_lb, out.output_differential, inputRecord.id],
                    });
                }
            }
        }
    });
    await Promise.all(inputUpdatePromises);

    // --- Validation ---
    const updatedInputs = await query<DailyStrategyProcessingRow[]>({
        query: `SELECT * FROM daily_strategy_processing WHERE process_id = ? AND input_qty > 0`,
        values: [processId],
    });
    
    if (!updatedInputs || updatedInputs.length === 0) return false;

    const failingInputs = updatedInputs.filter(rec => rec.input_cost_usd_50 === null || rec.input_hedge_level_usc_lb === null);
    if (failingInputs.length > 0) {
        for (const fail of failingInputs) {
            await logMissingBatchData(processNumber, fail.batch_number, "Missing input cost or hedge level (Bulking)");
        }
        return false;
    }

    // --- Calculate INPUT VALUE (Cents) & Weighted Averages ---
    let totalInputQty = 0;
    let wSumCost = 0;
    let wSumHedge = 0;
    let wSumDiff = 0;
    let totalInputValueCents = 0;

    for (const rec of updatedInputs) {
        const qty = Number(rec.input_qty);
        const cost = Number(rec.input_cost_usd_50 || 0);
        const hedge = Number(rec.input_hedge_level_usc_lb || 0);
        const diff = Number(rec.input_differential || 0);
        const strategy = rec.strategy || 'UNDEFINED';

        totalInputQty += qty;
        wSumCost += (qty * cost);
        wSumHedge += (qty * hedge);
        wSumDiff += (qty * diff);

        // Input Valo Lookup
        let inputValo = 0;
        const mainStrategy = mapStrategyToMainKey(strategy);
        if (mainStrategy && STRATEGY_VALOS[mainStrategy] !== undefined) {
            inputValo = STRATEGY_VALOS[mainStrategy];
        }

        // Value: (Hedge + Valo) * Qty * 2.205
        const theoreticalInputPrice = hedge + inputValo;
        totalInputValueCents += (inputValo * qty * KG_TO_LBS);
    }

    if (totalInputQty === 0) return false;

    // Averages required for output batch properties
    let avgCost: number | null = wSumCost / totalInputQty;
    let avgHedge: number | null = wSumHedge / totalInputQty;
    let avgDiff: number | null = wSumDiff / totalInputQty;

    if (!Number.isFinite(avgCost)) { avgCost = null; avgHedge = null; avgDiff = null; }

    // --- Calculate OUTPUT VALUE (Cents) ---
    // Logic: (OutputHedge + OutputValo) * OutputQty * 2.205
    // Output Hedge for bulking IS the Weighted Avg Input Hedge
    
    let outputValo = 0;
    if (outputBatch.strategy && outputBatch.strategy !== 'UNDEFINED') {
        const mainStrategy = mapStrategyToMainKey(outputBatch.strategy);
        if (mainStrategy && STRATEGY_VALOS[mainStrategy] !== undefined) {
            outputValo = STRATEGY_VALOS[mainStrategy];
        }
    }

    const outputQty = Number(outputBatch.output_qty);
    let totalOutputValueCents = 0;
    
    if (avgHedge !== null) {
        const theoreticalOutputPrice = avgHedge + outputValo;
        totalOutputValueCents = outputValo * outputQty * KG_TO_LBS;
    }

    // --- PnL Calculation ---
    const pnl = (totalOutputValueCents - totalInputValueCents) / 100;
    const inputValueDollars = totalInputValueCents / 100;
    const outputValueDollars = totalOutputValueCents / 100;

    // Update Output Record (Standard Accounting Updates)
    await query<ResultSetHeader>({
        query: `UPDATE daily_strategy_processing SET output_cost_usd_50 = ?, output_hedge_level_usc_lb = ?, output_differential = ? WHERE id = ?`,
        values: [avgCost, avgHedge, avgDiff, outputBatch.id],
    });

    if (enablePush && avgCost !== null) {
        await propagateToDownstreamInputs(outputBatch.batch_number, avgCost, avgHedge!, avgDiff!);
    }

    // Update Process Record
    await query<ResultSetHeader>({
        query: `UPDATE daily_processes SET trade_variables_updated = TRUE, input_value = ?, output_value = ?, pnl = ? WHERE id = ?`,
        values: [inputValueDollars, outputValueDollars, pnl, processId],
    });

    console.log(`[${processNumber}] Successfully updated BULKING. PnL: $${pnl.toFixed(2)}`);
    return true;
}

export async function update_post_trade_variables(excelFiles: File[] = []): Promise<string[]> {
    console.log("Starting update_post_trade_variables process.");
    const skippedProcessNumbers: string[] = [];

    // 1. Strategy Updates from Excel (Standard)
    if (excelFiles.length > 0) {
        const strategyMap = new Map<string, string>();
        for (const file of excelFiles) {
            try {
                const buffer = await file.arrayBuffer();
                const workbook = XLSX.read(buffer, { type: 'buffer' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json<StrategyRow>(worksheet, { range: 0 });
                for (const row of rows) {
                    // NOTE: Removing .toUpperCase() on Batch No here as well to respect raw data instruction
                    // But keeping it for Strategy to match internal map
                    const batchNo = row['Batch No.']?.toString();
                    const strategy = row['Position Strategy Allocation']?.toString();
                    if (batchNo && strategy) strategyMap.set(batchNo, strategy.toUpperCase());
                }
            } catch (e) { console.error(e); }
        }
        if (strategyMap.size > 0) {
            const undefinedRecords = await query<DailyStrategyProcessingRow[]>({ query: `SELECT id, batch_number FROM daily_strategy_processing WHERE strategy = 'UNDEFINED'` });
            if (undefinedRecords) {
                // Raw match for strategy update
                const updates = undefinedRecords.map(r => ({ id: r.id, strategy: strategyMap.get(r.batch_number) })).filter(u => u.strategy);
                if (updates.length > 0) {
                    await Promise.all(updates.map(u => query({ query: `UPDATE daily_strategy_processing SET strategy = ? WHERE id = ?`, values: [u.strategy, u.id] })));
                    console.log("Strategies updated.");
                }
            }
        }
    }

    // 2. PHASE 1: Chronological Processing with "Push"
    console.log("\n--- Starting Phase 1: Chronological Push Processing ---");
    const processes = await query<DailyProcessRow[]>({
        query: `SELECT * FROM daily_processes WHERE trade_variables_updated = FALSE ORDER BY processing_date ASC`,
    });

    if (processes && processes.length > 0) {
        for (const process of processes) {
            if (process.process_type === 'BULKING') {
                await process_bulking(process, true); // enablePush = true
            } else {
                await calculate_and_update_trade_variables_for_other_processes(process, true); // enablePush = true
            }
        }
    }

    // 3. PHASE 2: Final Cleanup Iteration (Standard Pull)
    console.log("\n--- Starting Phase 2: Final Cleanup Iteration ---");
    const cleanupProcesses = await query<DailyProcessRow[]>({
        query: `SELECT * FROM daily_processes WHERE trade_variables_updated = FALSE ORDER BY processing_date ASC`,
    });

    if (cleanupProcesses && cleanupProcesses.length > 0) {
        for (const process of cleanupProcesses) {
            let success = false;
            if (process.process_type === 'BULKING') {
                success = await process_bulking(process, false); // enablePush = false
            } else {
                success = await calculate_and_update_trade_variables_for_other_processes(process, false); // enablePush = false
            }
            if (!success) skippedProcessNumbers.push(process.process_number);
        }
    }

    console.log("\nTrade variable update process finished.");
    if (skippedProcessNumbers.length > 0) {
        console.log(`Skipped: ${skippedProcessNumbers.join(', ')}`);
    }
    return skippedProcessNumbers;
}

/**
 * Interface for the Excel row structure used in the input file.
 */
interface CurrentStockRow {
    'Batch No.': string | undefined;
    'Position Strategy Allocation': string | undefined | null;
    'Qty.': number | string; // Quantity of the batch
    [key: string]: any;
}

/**
 * Structure of the trade variables fetched from daily_strategy_processing.
 */
interface DailyStrategyProcessingTradeVars extends RowDataPacket {
    output_differential: number | null;
    output_cost_usd_50: number | null;
}

/**
 * Structure for the existing post_stack records.
 */
interface PostStackRow extends RowDataPacket {
    id: number;
    stack_type: string;
    diff_usc_lb: number;
    quantity: number;
    price_usd_50: number;
}

/**
 * Temporary structure for a batch after sourcing trade variables.
 */
interface CalculatedBatch {
    batch_number: string;
    quantity: number;
    diff_usc_lb: number; 
    hedge_level: number;
    price_usd_50: number;
    stack_type: string;
    strategy:string,
}

/**
 * Interface for a batch that failed validation.
 */
interface FailedBatchReport {
    'Stack Type': string;
    'Batch No.': string;
    'Quantity': number | string;
    'Reason For Skip': string;
}

// --- UTILITY FUNCTIONS ---

/**
 * Formats a Date object into 'YYYY-MM-DD' string suitable for MySQL DATE columns.
 */
function formatDateAsLocal_YYYYMMDD(date: Date): string {
    const d = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    return d.toISOString().split('T')[0];
}

/**
 * Creates an XLSX workbook from data and saves it to the specified path.
 */
async function saveXLSX(data: any[], filename: string, sheetName: string, subfolder: string = 'generated_files'): Promise<void> {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const outputPath = path.join(process.cwd(), subfolder, filename);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Write the workbook buffer to disk
    await fs.writeFile(outputPath, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}


interface StackProcessingBatch {
    batch_number: string;
    quantity: number;
    diff_usc_lb: number | null;
    hedge_level: number | null;
    price_usd_50: number | null;
    stack_type: string;
    strategy: string;
    validForCalc: boolean;
}


/**
 * Processes a Current Stock File.
 * 1. Archives ALL currently active batches.
 * 2. Categorizes batches into stacks:
 * - Preserves names starting with POST, IN, PRE, FINISHED.
 * - Groups everything else into a single 'OLD' stack.
 * 3. Calculates weighted averages and updates DB.
 * 4. Reactivates batches in daily_strategy_processing.
 */
export async function process_post_stack_updates(currentStockFile: File): Promise<void> {
    console.log(`[STACK UPDATE] Starting processing for file: ${currentStockFile.name}`);
    const todayDate = formatDateAsLocal_YYYYMMDD(new Date());

    // --- 0. INITIAL CLEANUP: Archive ALL currently active batches ---
    try {
        console.log("[STACK UPDATE] 0. Archiving ALL currently active batches...");
        await query<ResultSetHeader>({
            query: `UPDATE daily_strategy_processing SET batch_status = 'archived' WHERE batch_status = 'active'`
        });
    } catch (error) {
        console.error("[STACK UPDATE] Critical Error archiving initial batches:", error);
        return; 
    }

    let rawStockData: CurrentStockRow[] = [];
    
    // --- 1. Read File ---
    try {
        const buffer = await currentStockFile.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0]; 
        const worksheet = workbook.Sheets[sheetName];
        const range = 0; 

        rawStockData = XLSX.utils.sheet_to_json<CurrentStockRow>(worksheet, { range });
    } catch (error) {
        console.error("[STACK UPDATE] Failed to read or parse file:", error);
        return;
    }

    // --- 2. Filter & Grouping Logic ---
    
    // Step A: Keep ANY row that has a strategy allocation string
    const targetBatches = rawStockData.filter(row => 
        row['Position Strategy Allocation']?.trim()
    );

    console.log(`[STACK UPDATE] Found ${targetBatches.length} total batches to process.`);

    // Step B: Bucket them into Stacks
    const groupedStacks = targetBatches.reduce((acc, row) => {
        const rawAlloc = row['Position Strategy Allocation']?.toUpperCase().trim();
        if (!rawAlloc) return acc;

        const VALID_PREFIXES = ['POST', 'IN', 'PRE', 'FINISHED'];
        let stackType = 'OLD'; 

        if (VALID_PREFIXES.some(prefix => rawAlloc.startsWith(prefix))) {
            stackType = rawAlloc;
        }

        if (!acc[stackType]) acc[stackType] = [];
        acc[stackType].push(row);
        
        return acc;
    }, {} as Record<string, CurrentStockRow[]>);


    // --- OPTIMIZATION: Pre-fetch Trade Variables ---
    const uniqueBatchNumbers = [...new Set(targetBatches
        .map(b => b['Batch No.']?.toUpperCase().trim())
        .filter(b => b)
    )];

    const catalogueMap = new Map<string, any>();
    const dailyStrategyMap = new Map<string, any>();

    if (uniqueBatchNumbers.length > 0) {
        const CHUNK_SIZE = 2000;
        for (let i = 0; i < uniqueBatchNumbers.length; i += CHUNK_SIZE) {
            const chunk = uniqueBatchNumbers.slice(i, i + CHUNK_SIZE);
            
            // A. Fetch from Catalogue Summary
            try {
                const catResults = await query<any[]>({
                    query: `SELECT batch_number, diff_usc_lb, cost_usd_50, hedge_usc_lb 
                            FROM catalogue_summary 
                            WHERE batch_number IN (?)`,
                    values: [chunk]
                });
                if(catResults) {
                    catResults.forEach(row => catalogueMap.set(row.batch_number.toUpperCase(), row));
                }
            } catch (err) { console.error(err); }

            // B. Fetch from Daily Strategy Processing
            try {
                const dailyResults = await query<any[]>({
                    query: `SELECT batch_number, output_differential, output_cost_usd_50, output_hedge_level_usc_lb, strategy 
                            FROM daily_strategy_processing 
                            WHERE batch_number IN (?) AND output_qty > 0 
                            ORDER BY id DESC`, 
                    values: [chunk]
                });
                if (dailyResults) {
                    dailyResults.forEach(row => {
                        if(!dailyStrategyMap.has(row.batch_number.toUpperCase())) {
                            dailyStrategyMap.set(row.batch_number.toUpperCase(), row);
                        }
                    });
                }
            } catch (err) { console.error(err); }
        }
    }

    // --- 3. Process Each Grouping (Stack) ---
    const skippedBatchesForReport: FailedBatchReport[] = []; 

    for (const [stackType, batches] of Object.entries(groupedStacks)) {
        console.log(`[STACK UPDATE] Processing Stack Type: ${stackType} (${batches.length} batches)`);
        
        const calculatedBatches: StackProcessingBatch[] = [];
        const seenBatchNumbers = new Set<string>();

        // --- 3a. Sourcing and Validation ---
        for (const batch of batches) {
            const batchNumber = batch['Batch No.']?.toUpperCase().trim();
            const quantity = Number(batch['Qty.']);
            let skipReason = '';

            // 1. Basic Integrity Check (Still skip if no ID or no Qty)
            if (!batchNumber || !Number.isFinite(quantity) || quantity <= 0) {
                skipReason = 'Invalid Batch Number or Quantity in input file.';
                skippedBatchesForReport.push({ 
                    'Stack Type': stackType, 
                    'Batch No.': batch['Batch No.'] || 'N/A', 
                    'Quantity': batch['Qty.'], 
                    'Reason For Skip': skipReason 
                });
                continue; 
            }

            // 2. Duplicate Check
            if (seenBatchNumbers.has(batchNumber)) {
                console.warn(`[${stackType}] Skipping duplicate batch ${batchNumber} found in input file.`);
                continue;
            }
            seenBatchNumbers.add(batchNumber);

            // 3. Trade Data Lookup
            let diff: number | null = null;
            let price: number | null = null;
            let hedge_level: number | null = null;
            let strategy: string | null = null;

            if (catalogueMap.has(batchNumber)) {
                const catData = catalogueMap.get(batchNumber);
                diff = catData.diff_usc_lb;
                price = catData.cost_usd_50;
                hedge_level = catData.hedge_usc_lb;
                strategy = dailyStrategyMap.get(batchNumber)?.strategy || stackType; 
            } else if (dailyStrategyMap.has(batchNumber)) {
                const dailyData = dailyStrategyMap.get(batchNumber);
                diff = dailyData.output_differential;
                price = dailyData.output_cost_usd_50;
                hedge_level = dailyData.output_hedge_level_usc_lb;
                strategy = dailyData.strategy;
            }

            // 4. Data Validity Logic (Partial Allow)
            const isMissingTradeData = (diff === null || price === null || !Number.isFinite(Number(diff)) || !Number.isFinite(Number(price)));

            if (isMissingTradeData) {
                console.warn(`[${stackType}] Batch ${batchNumber} missing trade data. Setting values to NULL but keeping in stack.`);
            }

            calculatedBatches.push({
                batch_number: batchNumber,
                quantity: quantity,
                // If missing, set to null for DB, otherwise Number
                diff_usc_lb: isMissingTradeData ? null : Number(diff),
                price_usd_50: isMissingTradeData ? null : Number(price),
                hedge_level: isMissingTradeData ? null : Number(hedge_level || 0),
                stack_type: stackType,
                strategy: strategy || stackType,
                validForCalc: !isMissingTradeData // Flag used for weighted average calc
            });
        }
        
        // --- 3b. Weighted Average Calculation ---
        // Total Qty includes ALL batches (even "bad" ones), because physically they exist in the stack
        const totalQty = calculatedBatches.reduce((sum, b) => sum + b.quantity, 0);

        if (totalQty === 0) {
             console.error(`[${stackType}] Skipping grouping: Total quantity is zero.`);
             continue;
        }

        // Averages calculated ONLY on VALID batches to avoid poisoning the math
        const validBatches = calculatedBatches.filter(b => b.validForCalc);
        const validQtySum = validBatches.reduce((sum, b) => sum + b.quantity, 0);

        let stackDiff = 0;
        let stackPrice = 0;

        if (validQtySum > 0) {
            const weightedDiffSum = validBatches.reduce((sum, b) => sum + (b.quantity * (b.diff_usc_lb || 0)), 0);
            const weightedPriceSum = validBatches.reduce((sum, b) => sum + (b.quantity * (b.price_usd_50 || 0)), 0);
            
            stackDiff = weightedDiffSum / validQtySum;
            stackPrice = weightedPriceSum / validQtySum;
        } else {
            console.warn(`[${stackType}] Warning: Stack created with 0 valid trade data batches. Price/Diff defaults set to 0.`);
        }
        
        // --- 4. Database Transaction: Find/Create Post Stack ---
        let postStack: PostStackRow | null = null;
        const existingStack = await query<PostStackRow[]>({
            query: `SELECT * FROM post_stack WHERE stack_type = ? LIMIT 1`,
            values: [stackType],
        });

        if (existingStack && existingStack.length > 0) {
            postStack = existingStack[0];
            await query<ResultSetHeader>({
                query: `UPDATE post_stack SET diff_usc_lb = ?, quantity = ?, price_usd_50 = ? WHERE id = ?`,
                values: [stackDiff, totalQty, stackPrice, postStack.id],
            });
            console.log(`[${stackType}] Updated existing post_stack ID: ${postStack.id}`);
        } else {
            const newStackResult = await query<ResultSetHeader>({
                query: `INSERT INTO post_stack (date, stack_type, diff_usc_lb, quantity, price_usd_50) VALUES (?, ?, ?, ?, ?)`,
                values: [todayDate, stackType, stackDiff, totalQty, stackPrice],
            });
            if (newStackResult && newStackResult.insertId) {
                postStack = { id: newStackResult.insertId } as PostStackRow;
                console.log(`[${stackType}] Created new post_stack ID: ${postStack.id}`);
            }
        }

        if (!postStack) {
             console.error(`[${stackType}] Critical error: Failed to find or create post_stack record.`);
             continue;
        }
        const stackId = postStack.id;

        // --- 4b. Create/Override Post Stack History ---
        const existingHistory = await query<RowDataPacket[]>({
            query: `SELECT id FROM post_stack_history WHERE stack_id = ? AND date = ? LIMIT 1`,
            values: [stackId, todayDate],
        });
        
        if (existingHistory && existingHistory.length > 0) {
            await query<ResultSetHeader>({
                query: `UPDATE post_stack_history SET diff_usc_lb = ?, quantity = ?, price_usd_50 = ? WHERE id = ?`,
                values: [stackDiff, totalQty, stackPrice, existingHistory[0].id],
            });
        } else {
            await query<ResultSetHeader>({
                query: `INSERT INTO post_stack_history (date, stack_id, diff_usc_lb, quantity, price_usd_50) VALUES (?, ?, ?, ?, ?)`,
                values: [todayDate, stackId, stackDiff, totalQty, stackPrice],
            });
        }

        // --- 4c. Update Post Stack Batches ---
        // 1. DELETE existing batches for this stack (clears the way)
        await query<ResultSetHeader>({
            query: `DELETE FROM post_stack_batches WHERE stack_id = ?`,
            values: [stackId],
        });

        const batchInsertValues = calculatedBatches.map(batch => [
            stackId,
            batch.batch_number,
            batch.diff_usc_lb, // Can be null now
            batch.hedge_level, // Can be null now
            batch.quantity,
            batch.price_usd_50, // Can be null now
        ]);

        if (batchInsertValues.length > 0) {
            // 2. INSERT unique batches (deduplicated by 'seenBatchNumbers' above)
            // Use INSERT IGNORE as a final safety net
            await query<ResultSetHeader>({
                query: `INSERT IGNORE INTO post_stack_batches (stack_id, batch_number, diff_usc_lb, hedge_level, quantity, price_usd_50) VALUES ?`,
                values: [batchInsertValues], 
            });
             console.log(`[${stackType}] Inserted ${batchInsertValues.length} post_stack_batches (Valid for calc: ${validBatches.length}).`);
        }
    }

    // --- 5. Save Skipped Batches Report ---
    if (skippedBatchesForReport.length > 0) {
        const dateString = formatDateAsLocal_YYYYMMDD(new Date());
        const filename = `post_batches_stinking_${dateString}.xlsx`;
        const sheetName = "Skipped Batches";
        await saveXLSX(skippedBatchesForReport, filename, sheetName);
        console.warn(`[STACK UPDATE REPORT] Skipped batch report saved successfully to ${filename}.`);
    } else {
        console.log("[STACK UPDATE REPORT] No batches caused group skips. No report generated.");
    }

    // --- 6. BATCH STATUS UPDATE (OPTIMIZED) ---
    console.log("[STACK UPDATE] Starting Batch Status Reactivation...");

    try {
        const allFileBatchNumbers = [...new Set(rawStockData
            .map(row => row['Batch No.']?.toUpperCase().trim())
            .filter(b => b)
        )];

        if (allFileBatchNumbers.length > 0) {
            console.log(`[STACK UPDATE] Processing ${allFileBatchNumbers.length} unique batches from file for reactivation.`);
            
            const CHUNK_SIZE = 2000;
            let totalUpdated = 0;

            for (let i = 0; i < allFileBatchNumbers.length; i += CHUNK_SIZE) {
                const chunk = allFileBatchNumbers.slice(i, i + CHUNK_SIZE);
                
                const result = await query<ResultSetHeader>({
                    query: `UPDATE daily_strategy_processing 
                            SET batch_status = 'active' 
                            WHERE batch_number IN (?) 
                            AND output_qty > 0`,
                    values: [chunk]
                });
                
                if (result && result.affectedRows) {
                    totalUpdated += result.affectedRows;
                }
            }
            console.log(`[STACK UPDATE] Successfully reactivated ${totalUpdated} batches.`);
        } else {
            console.log("[STACK UPDATE] No valid batch numbers found in file to reactivate.");
        }

    } catch (error) {
        console.error("[STACK UPDATE] Error during batch status update:", error);
    }

    console.log("[STACK UPDATE] Finished processing all strategy stacks and status updates.");
}


export async function fetchBatchData(): Promise<{ activeBatches: Batch[], historyBatches: Batch[] }> {
    
    // Query 1: Fetch Active Batches from post_stack_batches (Joined with post_stack for strategy)
    const activeQuery = `
        SELECT 
            psb.id,
            psb.batch_number,
            ps.stack_type as strategy, 
            psb.price_usd_50, 
            psb.quantity, 
            psb.hedge_level
        FROM post_stack_batches psb
        JOIN post_stack ps ON psb.stack_id = ps.id
    `;

    // Only execute the active batches query
    const activeRows = await query<any[]>({ query: activeQuery });

    // Map Active Batches
    const activeBatches: Batch[] = (activeRows || []).map(row => ({
        id: row.id.toString(),
        batch_number: row.batch_number,
        strategy: row.strategy || 'UNDEFINED',
        outrightPrice50kg: Number(row.price_usd_50) || 0,
        quantityKg: Number(row.quantity),
        hedgeLevelUSClb: Number(row.hedge_level) || 0,
        status: 'active'
    }));

    // Return empty array for historyBatches as requested
    return { activeBatches, historyBatches: [] };
}

/**
 * Retrieves a history batch and its composition ingredients based on the batch number.
 * * @param batch_number - The unique identifier string for the batch (e.g. "BLEND-2023-...")
 * @returns A Batch object with composition details, or null if not found.
 */
export async function get_history_batch(batch_number: string): Promise<Batch | null> {
    
    // 1. Find the history batch row (Output > 0)
    const historyRows = await query<any[]>({
        query: `
            SELECT * FROM daily_strategy_processing 
            WHERE batch_number = ? 
              AND output_qty > 0 
            ORDER BY id DESC LIMIT 1
        `,
        values: [batch_number]
    });

    if (!historyRows || historyRows.length === 0) {
        return null;
    }

    const row = historyRows[0];

    // 2. Map to Batch Object
    const historyBatch: Batch = {
        id: row.id.toString(),
        batch_number: row.batch_number,
        strategy: row.strategy || 'UNDEFINED',
        outrightPrice50kg: Number(row.output_cost_usd_50) || 0, // Defaulting based on standard schema
        quantityKg: Number(row.output_qty),
        hedgeLevelUSClb: Number(row.output_hedge_level_usc_lb) || 0,
        status: row.batch_status as 'active' | 'archived',
        composition: []
    };

    // 3. Fetch Composition Ingredients
    // Logic: Same process_id as the output batch, but strictly inputs (input_qty > 0)
    if (row.process_id) {
        const ingredientRows = await query<any[]>({
            query: `
                SELECT id, batch_number, strategy, input_qty 
                FROM daily_strategy_processing 
                WHERE process_id = ? 
                  AND input_qty > 0
            `,
            values: [row.process_id]
        });

        if (ingredientRows && ingredientRows.length > 0) {
            historyBatch.composition = ingredientRows.map(ingRow => ({
                batchId: ingRow.id.toString(), // Mapped to row ID as requested
                batch_number: ingRow.batch_number,
                strategy: ingRow.strategy || 'UNDEFINED',
                quantityKg: Number(ingRow.input_qty)
            }));
        }
    }

    return historyBatch;
}


interface SaleRecordExcelRow {
    'No.': number | string;
    'Qty.': number | string;
    'Blocked Date': string | number | Date;
    'Customer Name': string;
    'Packing Nature': string;
    'Batch No.': string;
}

function parseExcelDate(excelDate: any): string {
    if (excelDate instanceof Date) {
        return excelDate.toISOString().split('T')[0];
    }
    // Excel serial date format
    if (typeof excelDate === 'number') {
        const date = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
        return date.toISOString().split('T')[0];
    }
    // String date
    if (typeof excelDate === 'string') {
        const date = new Date(excelDate);
        if (!isNaN(date.getTime())) {
             return date.toISOString().split('T')[0];
        }
    }
    // Default fallback to current date or handle error
    return new Date().toISOString().split('T')[0];
}

export async function process_sale_record(file: File): Promise<void> {
    console.log(`[SALE RECORD] Processing file: ${file.name}`);

    let excelData: SaleRecordExcelRow[] = [];

    try {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        // Set range to 1 to skip the first row (0-indexed) and use the second row as header
        excelData = XLSX.utils.sheet_to_json<SaleRecordExcelRow>(worksheet, { range: 1 });
    } catch (error) {
        console.error("[SALE RECORD] Failed to read Excel file:", error);
        return;
    }

    if (excelData.length === 0) {
        console.log("[SALE RECORD] No data found in file.");
        return;
    }

     await generateStrategyReports()

    console.log(`[SALE RECORD] Found ${excelData.length} rows to process.`);

    // 1. Bulk Fetch Existing Sales Refs for optimization
    const salesRefsFromFile = excelData
        .map(row => row['No.'])
        .filter(val => val !== undefined && val !== null);
    
    const existingSalesSet = new Set<string>();

    if (salesRefsFromFile.length > 0) {
        const CHUNK_SIZE = 1000;
        for (let i = 0; i < salesRefsFromFile.length; i += CHUNK_SIZE) {
            const chunk = salesRefsFromFile.slice(i, i + CHUNK_SIZE);
            const placeholders = chunk.map(() => '?').join(',');
            
            const existingRows = await query<RowDataPacket[]>({
                query: `SELECT sales_ref FROM sale_record WHERE sales_ref IN (${placeholders})`,
                values: chunk
            });

            if (existingRows) {
                existingRows.forEach(row => existingSalesSet.add(String(row.sales_ref)));
            }
        }
    }

    // 2. Bulk Fetch potential Batch IDs
    const batchNumbersFromFile = excelData
        .map(row => row['Batch No.'])
        .filter(val => val);
    
    const batchMap = new Map<string, number>(); // Map<BatchNumber, BatchId>

    if (batchNumbersFromFile.length > 0) {
        const uniqueBatches = [...new Set(batchNumbersFromFile)];
        const CHUNK_SIZE = 1000;
        
        for (let i = 0; i < uniqueBatches.length; i += CHUNK_SIZE) {
            const chunk = uniqueBatches.slice(i, i + CHUNK_SIZE);
            const placeholders = chunk.map(() => '?').join(',');

            // Lookup daily_strategy_processing for matching batch_number AND output_qty > 0
            const batchRows = await query<RowDataPacket[]>({
                query: `
                    SELECT id, batch_number 
                    FROM daily_strategy_processing 
                    WHERE batch_number IN (${placeholders}) 
                    AND output_qty > 0
                `,
                values: chunk
            });

            if (batchRows) {
                batchRows.forEach(row => batchMap.set(String(row.batch_number), row.id));
            }
        }
    }

    // 3. Process Rows
    const recordsToInsert: any[][] = [];
    // NEW: Track sales refs seen *within this file* to prevent duplicates in the same upload
    const processedSalesRefsInFile = new Set<string>(); 

    for (const row of excelData) {
        const saleRefRaw = row['No.'];
        const batchNo = row['Batch No.'];

        if (!saleRefRaw || !batchNo) {
            console.warn("[SALE RECORD] Skipping row due to missing Sale Ref or Batch No.", row);
            continue;
        }
        
        const saleRef = String(saleRefRaw);

        // Check 1: Skip if already exists in DB
        if (existingSalesSet.has(saleRef)) {
            continue;
        }

        // Check 2: Skip if we've already queued this Sale Ref from a previous row in this same file
        if (processedSalesRefsInFile.has(saleRef)) {
            console.warn(`[SALE RECORD] Skipping duplicate Sale Ref in file: ${saleRef}`);
            continue;
        }

        // Find parent batch ID
        const finishedBatchId = batchMap.get(String(batchNo));

        if (!finishedBatchId) {
            console.warn(`[SALE RECORD] Skipping Sale Ref ${saleRef}: Matching finished batch not found for Batch No. ${batchNo}`);
            continue;
        }

        const dispatchedQty = Number(row['Qty.']) || 0;
        const blockedDate = parseExcelDate(row['Blocked Date']);
        const client = row['Customer Name'] || 'Unknown';
        const packagingType = row['Packing Nature'] || 'Unknown';
        
        recordsToInsert.push([
            finishedBatchId,
            saleRef,
            dispatchedQty,
            blockedDate,
            client,
            packagingType,
            null // sale_differential
        ]);

        // Add to our local set so we don't process it again if it appears later in the file
        processedSalesRefsInFile.add(saleRef);
    }

    // 4. Batch Insert (using INSERT IGNORE to be extra safe against race conditions)
    if (recordsToInsert.length > 0) {
        const CHUNK_SIZE = 1000;
        for (let i = 0; i < recordsToInsert.length; i += CHUNK_SIZE) {
            const chunk = recordsToInsert.slice(i, i + CHUNK_SIZE);
            
            try {
                // Changed to INSERT IGNORE to gracefully skip duplicates that might sneak in
                await query<ResultSetHeader>({
                    query: `
                        INSERT IGNORE INTO sale_record 
                        (finished_batch_id, sales_ref, dispatched_qty, blocked_date, client, packaging_type, sale_differential) 
                        VALUES ?
                    `,
                    values: [chunk]
                });
                console.log(`[SALE RECORD] Inserted batch of ${chunk.length} records.`);
            } catch (err) {
                console.error("[SALE RECORD] Error inserting batch:", err);
            }
        }
        console.log(`[SALE RECORD] Successfully processed ${recordsToInsert.length} new sale records.`);
    } else {
        console.log("[SALE RECORD] No new records to insert.");
    }
}

export async function fetchSaleRecords(): Promise<SaleRecord[]> {
    const sql = `
        SELECT 
            sr.id, 
            sr.sales_ref, 
            sr.blocked_date, 
            sr.client, 
            sr.dispatched_qty, 
            sr.sale_differential, 
            sr.packaging_type,
            dsp.batch_number, 
            dsp.strategy, 
            dsp.output_differential, 
            dsp.output_hedge_level_usc_lb, 
            dsp.output_cost_usd_50
        FROM sale_record sr
        JOIN daily_strategy_processing dsp ON sr.finished_batch_id = dsp.id
        ORDER BY sr.blocked_date DESC
    `;

    const rows = await query<any[]>({ query: sql });
    
    if (!rows) return [];

    return rows.map(row => {
        const quantity = Number(row.dispatched_qty);
        const sale_fob_diff_val = row.sale_differential;
        // Determine if sale diff is explicitly null
        const is_sale_diff_null = (sale_fob_diff_val === null || sale_fob_diff_val === undefined);
        
        const sale_fob_diff = is_sale_diff_null ? 0 : Number(sale_fob_diff_val);
        const cost_diff = Number(row.output_differential);
        
        let pnl_per_lb = 0;
        let pnl_total = 0;

        // Only calculate P&L if we have a valid sale differential (is_sale_diff_null is false)
        if (!is_sale_diff_null) {
            pnl_per_lb = sale_fob_diff - cost_diff;
            // Formula: pnl_per_lb * (dispatched_qty * 2.204623) / 100
            pnl_total = (pnl_per_lb * (quantity * 2.204623)) / 100; 
        } else {
            // Explicitly set to 0 if sale diff is null (redundant due to initialization but clear)
            pnl_per_lb = 0;
            pnl_total = 0;
        }

        return {
            id: row.id.toString(),
            contract_number: row.sales_ref,
            // Ensure date string format YYYY-MM-DD
            date: row.blocked_date instanceof Date ? row.blocked_date.toISOString().split('T')[0] : String(row.blocked_date),
            client: row.client,
            batch_number: row.batch_number,
            strategy: row.strategy || 'UNDEFINED',
            packing: row.packaging_type,
            quantity: quantity,
            sale_fob_diff: sale_fob_diff,
            cost_diff: cost_diff,
            hedge_level: Number(row.output_hedge_level_usc_lb),
            cost_usd_50: Number(row.output_cost_usd_50),
            pnl_per_lb: pnl_per_lb,
            pnl_total: pnl_total,
            is_sale_diff_null: is_sale_diff_null
        };
    });
}

export async function get_last_update_dates(): Promise<LastUpdateDates> {
  // Optimized: Fetches all 4 max dates in a single database network request
  const sql = `
    SELECT 
      (SELECT MAX(instructed_date) FROM stock_transfer_instructions) as last_sti,
      (SELECT MAX(adjustment_date) FROM stock_adjustment) as last_sta,
      (SELECT MAX(processing_date) FROM daily_processes) as last_process,
      (SELECT MAX(dispatch_date) FROM daily_outbounds) as last_outbound
  `;

  const rows = await query<RowDataPacket[]>({ query: sql });

  // Return the first row, or nulls if the query somehow fails entirely
  return (rows?.[0] as LastUpdateDates) || {
    last_sti: null,
    last_sta: null,
    last_process: null,
    last_outbound: null
  };
}

export async function updateSaleDifferential(id: string, saleDifferential: number): Promise<boolean> {
    const sql = `
        UPDATE sale_record 
        SET sale_differential = ? 
        WHERE id = ?
    `;

    try {
        const result = await query<ResultSetHeader>({ 
            query: sql, 
            values: [saleDifferential, id] 
        });
        
        // Check if any row was affected (updated)
        // Optimization: Ensure result exists before checking affectedRows to satisfy TS strict null checks
        if (result && 'affectedRows' in result) {
             return result.affectedRows > 0;
        }
        return false;

    } catch (error) {
        console.error(`[SALE RECORD] Error updating differential for ID ${id}:`, error);
        return false;
    }
}
/**
 * Interface for the final result rows from the database query.
 */
interface UncostedBatchResult extends RowDataPacket {
    batch_number: string;
    // The query returns these columns implicitly as part of the join structure,
    // although we primarily select batch_number.
}

/**
 * Reads daily_strategy_processing table to find batches involved in processing (input AND output)
 * that are missing initial cost data in the catalogue_summary table.
 * The final list is saved as a XLSX file.
 * * @returns Promise that resolves when the file operation is complete.
 */
export async function findUncostedProcessingBatches(): Promise<void> {
    console.log("[ANALYSIS] Starting search for uncosted processing batches...");

    // --- 1. OPTIMIZED SINGLE SQL QUERY ---
    // The query remains the same as it correctly identifies the required batch numbers.
    const sqlQuery = `
        SELECT DISTINCT dsp1.batch_number
        FROM daily_strategy_processing dsp1
        WHERE 
            -- Condition 1: Must be part of a process where the batch is BOTH input and output.
            EXISTS (
                SELECT 1 
                FROM daily_strategy_processing dsp_in
                WHERE dsp_in.batch_number = dsp1.batch_number AND dsp_in.input_qty > 0
            )
            AND EXISTS (
                SELECT 1 
                FROM daily_strategy_processing dsp_out
                WHERE dsp_out.batch_number = dsp1.batch_number AND dsp_out.output_qty > 0
            )
            -- Condition 2: Must NOT be present in the catalogue_summary (i.e., missing initial cost data).
            AND NOT EXISTS (
                SELECT 1 
                FROM catalogue_summary cs
                WHERE cs.batch_number = dsp1.batch_number
            )
        ORDER BY dsp1.batch_number;
    `;

    let results: UncostedBatchResult[] = [];
    try {
        results = (await query<UncostedBatchResult[]>({ query: sqlQuery })) || [];
        console.log(`[ANALYSIS] Query executed successfully. Found ${results.length} uncosted processing batches.`);
    } catch (error) {
        console.error("[ANALYSIS] Database query failed:", error);
        throw new Error("Failed to fetch uncosted processing batches from database.");
    }

    // --- 2. Format Data and Save to CSV File ---

    // Create CSV content: Header row followed by batch numbers, each on a new line.
    const csvHeader = "batch_number";
    const csvRows = results.map(row => row.batch_number);
    
    // Combine header and rows
    const csvContent = csvHeader + "\n" + csvRows.join('\n');

    const dateString = new Date().toISOString().slice(0, 10);
    const filename = `uncosted_processing_batches_${dateString}.csv`;
    const outputPath = path.join(process.cwd(), 'generated_files', filename);

    // Create the directory if it doesn't exist
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    try {
        await fs.writeFile(outputPath, csvContent, 'utf-8');
        console.log(`[ANALYSIS] Successfully saved results to: ${outputPath}`);
    } catch (error) {
        console.error(`[ANALYSIS] Failed to write file to ${outputPath}:`, error);
        throw new Error("Failed to write results file to disk.");
    }
}

/**
 * Fetches active and archived batch data from the database.
 */
/**
 * Identifies "Ghost Inputs": Batches that appear as inputs in the factory
 * but have NO origin (never an output) and NO price source (missing from catalogue).
 * * Logic:
 * 1. Appears in daily_strategy_processing with input_qty > 0
 * 2. NEVER appears in daily_strategy_processing with output_qty > 0 (Proof it's a Raw Material)
 * 3. DOES NOT exist in catalogue_summary (Proof it has no Cost)
 */
export async function findGhostInputs(): Promise<void> {
    console.log("[GHOST HUNT] Starting search for unpriced raw material inputs...");

    const sqlQuery = `
        SELECT DISTINCT dsp_in.batch_number
        FROM daily_strategy_processing dsp_in
        WHERE 
            -- 1. It is used as an Input
            dsp_in.input_qty > 0
            
            -- 2. It is NEVER an Output (Safety check: It didn't come from another machine)
            AND NOT EXISTS (
                SELECT 1 
                FROM daily_strategy_processing dsp_out
                WHERE dsp_out.batch_number = dsp_in.batch_number 
                AND dsp_out.output_qty > 0
            )

            -- 3. It is MISSING from the Catalogue (The Root Cause)
            AND NOT EXISTS (
                SELECT 1 
                FROM catalogue_summary cs
                WHERE cs.batch_number = dsp_in.batch_number
            )
        ORDER BY dsp_in.batch_number;
    `;

    let results: UncostedBatchResult[] = [];
    try {
        results = (await query<UncostedBatchResult[]>({ query: sqlQuery })) || [];
        console.log(`[GHOST HUNT] Found ${results.length} ghost inputs.`);
    } catch (error) {
        console.error("[GHOST HUNT] Database query failed:", error);
        return;
    }

    if (results.length === 0) {
        console.log("[GHOST HUNT] Clean! No ghost inputs found.");
        return;
    }

    // Save to CSV
    const csvHeader = "batch_number,issue_description\n";
    const csvRows = results.map(row => `${row.batch_number},Missing from Catalogue Summary`);
    const csvContent = csvHeader + csvRows.join('\n');

    const dateString = new Date().toISOString().slice(0, 10);
    const filename = `ghost_inputs_missing_catalogue_${dateString}.csv`;
    const outputPath = path.join(process.cwd(), 'generated_files', filename);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, csvContent, 'utf-8');

    console.log(`[GHOST HUNT] Report saved: ${outputPath}`);
    console.log(`[ACTION REQUIRED] Add these ${results.length} batches to 'Catalogue Summary' with a price.`);
}




interface CsvTradeRow {
    batch_number: string;
    hedge_level: number | string;
    differential: number | string;
    outright_price: number | string;
    strategy: string;
    [key: string]: any; // Allow loose matching for other columns
}

interface DailyStrategyProcessingRow extends RowDataPacket {
    id: number;
    batch_number: string;
    input_qty: number;
    output_qty: number;
}

// --- HELPER: Chunk Array ---
function chunkArray<T>(array: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
}

/**
 * Updates daily_strategy_processing table using data from a CSV file.
 * Optimized to batch SELECT queries instead of row-by-row lookups.
 * Now includes filtering to remove rows with '#N/A' in strategy or hedge_level.
 * * @param csvFile The uploaded CSV/XLSX file containing trade variables.
 */
export async function updateTradeVariablesFromCsv(csvFile: File): Promise<void> {
    console.log(`[CSV UPDATE] Starting processing for file: ${csvFile.name}`);

    let csvRows: CsvTradeRow[] = [];

    // 1. Parse File
    try {
        const buffer = await csvFile.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Read raw data (assuming header is on row 0)
        csvRows = XLSX.utils.sheet_to_json<CsvTradeRow>(worksheet, { range: 0 });
    } catch (error) {
        console.error("[CSV UPDATE] Failed to read file:", error);
        throw new Error("Invalid file format.");
    }

    if (csvRows.length === 0) {
        console.log("[CSV UPDATE] File is empty.");
        return;
    }

    // --- 1a. Filter out Invalid Rows (NEW STEP) ---
    const originalCount = csvRows.length;
    csvRows = csvRows.filter(row => {
        const strategy = row.strategy ? row.strategy.toString().trim() : '';
        const hedge = row.hedge_level ? row.hedge_level.toString().trim() : '';
        
        // Check for "#N/A" in either field
        if (strategy === '#N/A' || hedge === '#N/A') {
            return false; // Exclude this row
        }
        return true; // Keep valid row
    });

    const filteredCount = csvRows.length;
    const removedCount = originalCount - filteredCount;
    console.log(`[CSV UPDATE] Filtered out ${removedCount} rows containing '#N/A'. Proceeding with ${filteredCount} valid rows.`);

    if (filteredCount === 0) {
        console.log("[CSV UPDATE] No valid rows remaining after filtering.");
        return;
    }

    // 2. Collect unique batch numbers from CSV to fetch from DB efficiently
    const csvBatchMap = new Map<string, CsvTradeRow>();
    const batchNumbers = new Set<string>();

    csvRows.forEach(row => {
        if (row.batch_number) {
            // Keep raw string as requested ("Treat them as they are")
            const batchNo = row.batch_number.toString(); 
            batchNumbers.add(batchNo);
            csvBatchMap.set(batchNo, row);
        }
    });

    const uniqueBatches = Array.from(batchNumbers);
    console.log(`[CSV UPDATE] Found ${uniqueBatches.length} unique batches in CSV.`);

    // 3. Fetch matching DB records in chunks (Optimization)
    const CHUNK_SIZE = 1000;
    const batchChunks = chunkArray(uniqueBatches, CHUNK_SIZE);
    
    // Map: BatchNumber -> Array of DB Rows (One batch might appear multiple times in DB)
    const dbRecordMap = new Map<string, DailyStrategyProcessingRow[]>();

    for (const chunk of batchChunks) {
        if (chunk.length === 0) continue;

        const placeholders = chunk.map(() => '?').join(',');
        const dbResults = await query<DailyStrategyProcessingRow[]>({
            query: `
                SELECT id, batch_number, input_qty, output_qty 
                FROM daily_strategy_processing 
                WHERE batch_number IN (${placeholders})
            `,
            values: chunk
        });

        if (dbResults) {
            dbResults.forEach(row => {
                const bNo = row.batch_number; // Exact match from DB
                if (!dbRecordMap.has(bNo)) {
                    dbRecordMap.set(bNo, []);
                }
                dbRecordMap.get(bNo)?.push(row);
            });
        }
    }

    // 4. Perform Updates
    const updatePromises: Promise<ResultSetHeader | undefined>[] = [];

    for (const csvRow of csvRows) {
        if (!csvRow.batch_number) continue;

        const batchNo = csvRow.batch_number.toString();
        const dbMatches = dbRecordMap.get(batchNo);

        if (!dbMatches || dbMatches.length === 0) {
            // Batch in CSV not found in DB
            continue;
        }

        // Prepare values from CSV
        const differential = parseFloat(csvRow.differential?.toString() || '0');
        const hedgeLevel = parseFloat(csvRow.hedge_level?.toString() || '0');
        const outrightPrice = parseFloat(csvRow.outright_price?.toString() || '0');
        const strategy = csvRow.strategy ? csvRow.strategy.toString().toUpperCase() : null;

        for (const dbRow of dbMatches) {
            // Logic: Input Qty > 0
            if (dbRow.input_qty > 0) {
                updatePromises.push(query<ResultSetHeader>({
                    query: `
                        UPDATE daily_strategy_processing
                        SET 
                            input_differential = ?,
                            input_hedge_level_usc_lb = ?,
                            input_cost_usd_50 = ?,
                            strategy = COALESCE(?, strategy) -- Only update strategy if CSV has one
                        WHERE id = ?
                    `,
                    values: [differential, hedgeLevel, outrightPrice, strategy, dbRow.id]
                }));
            }

            // Logic: Output Qty > 0 (Note: separate if, so a row with both gets both updated)
            if (dbRow.output_qty > 0) {
                updatePromises.push(query<ResultSetHeader>({
                    query: `
                        UPDATE daily_strategy_processing
                        SET 
                            output_differential = ?,
                            output_hedge_level_usc_lb = ?,
                            output_cost_usd_50 = ?,
                            strategy = COALESCE(?, strategy)
                        WHERE id = ?
                    `,
                    values: [differential, hedgeLevel, outrightPrice, strategy, dbRow.id]
                }));
            }
        }
    }

    // Execute all updates (chunked Promise.all if list is huge, but node handles 10k+ promises okay usually)
    // For extreme safety with DB pools, we can chunk the execution too.
    const UPDATE_CONCURRENCY = 500;
    const promiseChunks = chunkArray(updatePromises, UPDATE_CONCURRENCY);
    
    let totalUpdated = 0;
    for (const chunk of promiseChunks) {
        await Promise.all(chunk);
        totalUpdated += chunk.length;
    }

    console.log(`[CSV UPDATE] Processing complete. Executed ${totalUpdated} updates.`);
}


interface MissingHedgeBatch extends RowDataPacket {
    id: number;
    batch_number: string;
    strategy: string;
    input_qty: number;
    output_qty: number;
    input_hedge_level_usc_lb: number | null;
    output_hedge_level_usc_lb: number | null;
}
/**
 * Scans daily_strategy_processing for rows missing hedge levels where quantity exists.
 * Saves the result to a CSV file in 'generated_reports'.
 */
export async function findAndSaveMissingHedgeBatches(): Promise<void> {
    console.log("[ANALYSIS] Searching for batches with missing hedge levels...");

    const sqlQuery = `
        SELECT 
            id, 
            batch_number, 
            strategy, 
            input_qty, 
            output_qty, 
            input_hedge_level_usc_lb, 
            output_hedge_level_usc_lb
        FROM daily_strategy_processing dsp
        WHERE 
            (
                input_qty > 0 
                AND input_hedge_level_usc_lb IS NULL
                AND NOT EXISTS (
                    SELECT 1 
                    FROM daily_strategy_processing dsp_out 
                    WHERE dsp_out.batch_number = dsp.batch_number 
                      AND dsp_out.output_qty > 0
                )
            )
        
        ORDER BY id DESC;
    `;

    let results: MissingHedgeBatch[] = [];
    try {
        results = (await query<MissingHedgeBatch[]>({ query: sqlQuery })) || [];
        console.log(`[ANALYSIS] Found ${results.length} rows with missing hedge levels.`);
    } catch (error) {
        console.error("[ANALYSIS] Database query failed:", error);
        throw new Error("Failed to query missing hedge batches.");
    }

    if (results.length === 0) {
        console.log("[ANALYSIS] No missing hedge data found. Skipping CSV generation.");
        return;
    }

    // --- Generate CSV Content ---
    const headers = [
        "ID", 
        "Batch Number", 
        "Strategy", 
        "Input Qty", 
        "Output Qty", 
        "Input Hedge (Missing)", 
        "Output Hedge (Missing)"
    ];

    const csvRows = results.map(row => {
        return [
            row.id,
            `${row.batch_number}`, // Quote to handle potential commas
            `${row.strategy}`,
            row.input_qty,
            row.output_qty,
            row.input_hedge_level_usc_lb === null ? "NULL" : row.input_hedge_level_usc_lb,
            row.output_hedge_level_usc_lb === null ? "NULL" : row.output_hedge_level_usc_lb
        ].join(",");
    });

    const csvContent = headers.join(",") + "\n" + csvRows.join("\n");

    // --- Save to File ---
    const dateString = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const filename = `missing_hedge_batches_${dateString}.csv`;
    const outputDir = path.join(process.cwd(), 'generated_files');
    const outputPath = path.join(outputDir, filename);

    try {
        await fs.mkdir(outputDir, { recursive: true });
        await fs.writeFile(outputPath, csvContent, 'utf-8');
        console.log(`[ANALYSIS] Report saved successfully: ${outputPath}`);
    } catch (error) {
        console.error(`[ANALYSIS] Failed to write file to ${outputPath}:`, error);
        throw new Error("Failed to save CSV report.");
    }
}

interface BatchIdRow {
    batch_id: string;
    [key: string]: any;
}

// Interface for the database lookup result
interface TradeValuesCheck extends RowDataPacket {
    batch_number: string;
    input_hedge_level_usc_lb: number | null;
    input_cost_usd_50: number | null;
    input_differential: number | null;
}



export async function filterAndSaveMissingInputTradeBatches(csvFile: File): Promise<void> {
    console.log(`[FILTER] Starting input trade validation for file: ${csvFile.name}`);

    let inputRows: BatchIdRow[] = [];

    // 1. Parse Input CSV
    try {
        const buffer = await csvFile.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Read using header row 0
        inputRows = XLSX.utils.sheet_to_json<BatchIdRow>(worksheet, { range: 0 });
    } catch (error) {
        console.error("[FILTER] Failed to read input file:", error);
        throw new Error("Invalid file format.");
    }

    if (inputRows.length === 0) {
        console.log("[FILTER] Input file is empty.");
        return;
    }

    const uniqueBatchIds = [...new Set(inputRows.map(row => row.batch_id?.toString().trim()).filter(id => id))];
    console.log(`[FILTER] Found ${uniqueBatchIds.length} unique batch IDs to check.`);

    // 2. Database Lookup (Chunked for efficiency)
    const batchesToKeep: string[] = [];
    const CHUNK_SIZE = 1000;

    for (let i = 0; i < uniqueBatchIds.length; i += CHUNK_SIZE) {
        const chunk = uniqueBatchIds.slice(i, i + CHUNK_SIZE);
        
        if (chunk.length === 0) continue;

        const placeholders = chunk.map(() => '?').join(',');
        
        // Query to find existing batches and their trade values
        const dbResults = await query<TradeValuesCheck[]>({
            query: `
                SELECT batch_number, strategy, input_hedge_level_usc_lb, input_cost_usd_50, input_differential
                FROM daily_strategy_processing
                WHERE batch_number IN (${placeholders})
            `,
            values: chunk
        });

        // Map of existing batches in DB (Handling potential duplicates by keeping latest/any match)
        const dbBatchMap = new Map<string, TradeValuesCheck>();
        if (dbResults) {
            dbResults.forEach(row => dbBatchMap.set(row.batch_number, row));
        }

        // Filter logic
        for (const batchId of chunk) {
            const dbRecord = dbBatchMap.get(batchId);

            if (!dbRecord) {
                // Case A: Batch NOT in database.
                // Prompt constraint: "until the file is left with only batches that are in my database"
                // So if it's not in DB, we discard it.
                continue; 
            } 
            
            // Case B: Batch IS in database. Check if it is COMPLETE.
            // A batch is complete if it has non-null values for ALL four fields.
            const isComplete = 
                (dbRecord.strategy !== null && dbRecord.strategy !== 'UNDEFINED') &&
                dbRecord.input_hedge_level_usc_lb !== null && 
                dbRecord.input_cost_usd_50 !== null && 
                dbRecord.input_differential !== null;

            if (isComplete) {
                // If complete, REMOVE (do not add to keep list)
                continue;
            } else {
                // If missing ANY value, KEEP it in the list
                batchesToKeep.push(batchId);
            }
        }
    }

    console.log(`[FILTER] Filter complete. ${batchesToKeep.length} batches match criteria (In DB but missing at least one input value).`);

    if (batchesToKeep.length === 0) {
        console.log("[FILTER] All batches in the file are complete (or not in DB). No file generated.");
        return;
    }

    // 3. Save to CSV
    const csvHeader = "batch_id";
    const csvContent = csvHeader + "\n" + batchesToKeep.join('\n');

    const dateString = new Date().toISOString().slice(0, 10);
    const filename = `batches_incomplete_input_trades_${dateString}.csv`;
    const outputDir = path.join(process.cwd(), 'generated_reports');
    const outputPath = path.join(outputDir, filename);

    try {
        await fs.mkdir(outputDir, { recursive: true });
        await fs.writeFile(outputPath, csvContent, 'utf-8');
        console.log(`[FILTER] Report saved successfully: ${outputPath}`);
    } catch (error) {
        console.error(`[FILTER] Failed to write file to ${outputPath}:`, error);
        throw new Error("Failed to save CSV report.");
    }
}

export async function process_sale_diff_update(file: File): Promise<void> {
    console.log(`[SALE DIFF UPDATE] Processing file: ${file.name}`);

    let excelData: any[] = [];

    try {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Read from first row (headers expected)
        excelData = XLSX.utils.sheet_to_json(worksheet); 
    } catch (error) {
        console.error("[SALE DIFF UPDATE] Failed to read Excel file:", error);
        return;
    }

    if (excelData.length === 0) {
        console.log("[SALE DIFF UPDATE] No data found in file.");
        return;
    }

    console.log(`[SALE DIFF UPDATE] Found ${excelData.length} rows to process.`);

    // Extract relevant data: Map<sale_contract, sale_diff>
    // Assuming column names 'sale_contract' and 'sale_diff' based on prompt
    // Adjusting for potential variations/normalization
    const updatesMap = new Map<string, number>();

    for (const row of excelData) {
        // Flexible key access
        const contract = row['sale_contract'] || row['Sale Contract'] || row['contract'] || row['Contract'];
        const diff = row['sale_diff'] || row['Sale Diff'] || row['diff'] || row['Diff'];

        if (contract && diff !== undefined && diff !== null && !isNaN(Number(diff))) {
            updatesMap.set(String(contract).trim(), Number(diff));
        }
    }

    if (updatesMap.size === 0) {
        console.log("[SALE DIFF UPDATE] No valid rows found with sale_contract and sale_diff.");
        return;
    }


    const updates = Array.from(updatesMap.entries());
    let updatedCount = 0;

    // Using Promise.all with concurrency limit (chunking) to avoid connection pool exhaustion
    const CHUNK_SIZE = 500; 
    for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
        const chunk = updates.slice(i, i + CHUNK_SIZE);
        
        const promises = chunk.map(async ([contract, diff]) => {
            try {
                const result = await query<ResultSetHeader>({
                    query: `UPDATE sale_record SET sale_differential = ? WHERE sales_ref = ?`,
                    values: [diff, contract]
                });
                if (result && result.affectedRows > 0) {
                    return 1;
                }
            } catch (err) {
                console.error(`[SALE DIFF UPDATE] Error updating ${contract}:`, err);
            }
            return 0;
        });

        const results = await Promise.all(promises);
        updatedCount += results.reduce<number>((sum, count) => sum + count, 0);
    }

    console.log(`[SALE DIFF UPDATE] Successfully updated ${updatedCount} records.`);
}

const QUERY_INPUT_NO_DIFF = `
SELECT *
FROM daily_strategy_processing dsp
WHERE 
    dsp.input_qty > 0 AND input_differential IS NULL 
    AND NOT EXISTS (
        SELECT 1
        FROM daily_strategy_processing dsp2
        WHERE dsp2.batch_number = dsp.batch_number
          AND dsp2.output_qty > 0
    );
`;

const QUERY_HAS_DIFF = `
SELECT * FROM daily_strategy_processing 
WHERE input_differential IS NOT NULL OR output_differential IS NOT NULL;
`;

/**
 * Executes specific reporting queries and saves the results as Excel files.
 * @returns An object containing the paths of the generated files.
 */
export async function generateStrategyReports() {
    try {
        console.log("[REPORT] Starting report generation...");

        // 1. Execute Queries in Parallel
        const [inputNoDiffResults, hasDiffResults] = await Promise.all([
            query<RowDataPacket[]>({ query: QUERY_INPUT_NO_DIFF }),
            query<RowDataPacket[]>({ query: QUERY_HAS_DIFF })
        ]);

        // 2. Prepare Directory
        const reportDir = path.join(process.cwd(), 'generated_reports');
        
        // FIX: Using fs.existsSync and fs.mkdirSync from the standard 'fs' module
        if (!fs_node.existsSync(reportDir)) {
            fs_node.mkdirSync(reportDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14); // YYYYMMDDHHMMSS
        const filesGenerated: string[] = [];

        // 3. Helper to save data to Excel
        const saveToExcel = (data: any[], fileName: string) => {
            if (!data || data.length === 0) {
                console.warn(`[REPORT] No data found for ${fileName}. Skipping file generation.`);
                return null;
            }

            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(workbook, worksheet, "Report Data");

            const filePath = path.join(reportDir, fileName);
            
            // FIX: Generate buffer manually and write using fs_node to avoid internal library file access issues
            const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
            fs_node.writeFileSync(filePath, buffer);
            
            console.log(`[REPORT] Saved: ${filePath}`);
            return filePath;
        };

        // 4. Generate Files
        // Report 1: Inputs with No Differential and No Output Match
        const file1 = saveToExcel(
            inputNoDiffResults || [], 
            `missing_differential_inputs_${timestamp}.xlsx`
        );
        if (file1) filesGenerated.push(file1);

        // Report 2: Records with Any Differential Present
        const file2 = saveToExcel(
            hasDiffResults || [], 
            `existing_differentials_${timestamp}.xlsx`
        );
        if (file2) filesGenerated.push(file2);

        return {
            success: true,
            files: filesGenerated,
            message: `Successfully generated ${filesGenerated.length} reports in ${reportDir}`
        };

    } catch (error) {
        console.error("[REPORT] Critical error generating reports:", error);
        throw error;
    }
}