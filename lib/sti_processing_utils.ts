import * as XLSX from 'xlsx';
import { query } from "@/lib/stock_movement_db"; 
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { CurrentStockRow, DailyGradeActivity, DailyOutbound, DailyStrategyActivity, GdiRow, GradeAdjustmentTotals, GradeInboundTotals, GradeOutboundTotals, GradeProcessingTotals, InitializedActivityRecords, InstructedBatch, OutboundRow, PreviousClosingStock, ProcessDetails, ProcessingAnalysisRow, ProcessSummary, StaRow, StiRow, StockData, StockRow, StockSummary, StockTransferInstruction, StrategyAdjustmentTotals, StrategyInboundTotals, StrategyOutboundTotals, StrategyProcessingTotals, StrategyRow, UndefinedRow } from '@/custom_utilities/custom_types';
import * as ExcelJS from 'exceljs';



/**
 * Safely parses a value (string or number) into a float.
 * Returns 0 if the value is null, undefined, or not a valid number.
 */
function parseSafeFloat(value: any): number {
  if (value === null || value === undefined) return 0;
  const num = parseFloat(value.toString());
  return isNaN(num) ? 0 : num;
}

/**
 * Formats a JavaScript Date object into a 'YYYY-MM-DD' string for MySQL.
 */
function formatDateForMySQL(date: Date): string {
  return date.toISOString().split('T')[0];
}

// --- START: Timezone-Safe Date Formatter ---
/**
 * Formats a Date object to a 'YYYY-MM-DD' string based on its *local* date parts,
 * ignoring timezone conversions. This prevents off-by-one day errors.
 * @param date The Date object to format.
 * @returns A string in 'YYYY-MM-DD' format.
 */
function formatDateAsLocal_YYYYMMDD(date: Date): string {
  if (!(date instanceof Date)) {
    console.warn("Invalid date passed to formatDateAsLocal_YYYYMMDD:", date);
    // Try to recover if it's a date string
    const d = new Date(date);
    if (isNaN(d.getTime())) {
      return ""; // Return empty string for invalid dates
    }
    date = d;
  }
  
  const year = date.getFullYear();
  // getMonth() is 0-indexed (0=Jan), so we add 1
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  // getDate() is 1-indexed
  const day = date.getDate().toString().padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Finds all pending batches in the DB and updates their status if the
 * Excel file shows them as 'Completed'.
 * @param allRows All rows read from the Excel file.
 * @returns A Set of sti_id numbers that were affected by the updates.
 */
async function syncPendingBatches(allRows: StiRow[]): Promise<Set<number>> {
  console.log("[SYNC] Starting sync of pending batches...");

  // Create a lookup map from the Excel file for fast checking
  // Key: "Batch No.-Transaction No.", Value: "Stock Transfer Status"
  const fileStatusMap = new Map<string, string>();
  allRows.forEach(row => {
    const batchNum = row['Batch No.']?.toString();
    const transNum = row['Transaction No.']?.toString();
    if (batchNum && transNum) {
      const key = `${batchNum}-${transNum}`;
      fileStatusMap.set(key, row['Stock Transfer Status']?.toString() || ''); // <-- FIX: Ensure value is a string
    }
  });
  console.log(`[SYNC] Built status map with ${fileStatusMap.size} entries from file.`);

  // Get all batches from DB that are not yet completed
  const pendingBatches = await query<RowDataPacket[]>({ // <-- FIX: Expect RowDataPacket[] from DB
    query: `
      SELECT id, batch_number, transaction_number, sti_id 
      FROM instructed_batches 
      WHERE status = 'fully_pending' OR status = 'partially_delivered'
    `,
    values: []
  });

  if (pendingBatches && pendingBatches.length === 0) {
    console.log("[SYNC] No pending batches found in database. Skipping sync.");
    return new Set<number>();
  }
  console.log(`[SYNC] Found ${pendingBatches && pendingBatches.length} pending batches in DB to check.`);

  const affectedStiIds = new Set<number>();
  const updatePromises: Promise<any>[] = [];

  // FIX: Cast the array from RowDataPacket[] to the type we know it is
  for (const batch of pendingBatches as (InstructedBatch & { id: number })[]) { 
    const key = `${batch.batch_number}-${batch.transaction_number}`;
    const fileStatus = fileStatusMap.get(key);

    // If the file shows this batch is now 'Completed', update it in the DB
    if (fileStatus === 'Completed') {
      console.log(`[SYNC] Batch ${batch.batch_number} is 'Completed' in file. Updating DB...`);
      updatePromises.push(
        query<ResultSetHeader>({
          query: `UPDATE instructed_batches SET status = 'completed' WHERE id = ?`,
          values: [batch.id]
        })
      );
      // Track the parent STI ID so its status can be updated
      affectedStiIds.add(batch.sti_id);
    }
  }

  // Run all updates in parallel
  await Promise.all(updatePromises);
  console.log(`[SYNC] Pending batch sync complete. ${updatePromises.length} batches updated.`);
  return affectedStiIds;
}


/**
 * Recalculates and updates the status of parent STIs based on their child batch statuses.
 * @param stiIdsToUpdate A Set of STI IDs to check and update.
 */
async function updateStiHeaderStatuses(stiIdsToUpdate: Set<number>) {
  if (stiIdsToUpdate.size === 0) {
    console.log("[STATUS UPDATE] No STI headers to update.");
    return;
  }
  
  console.log(`[STATUS UPDATE] Updating statuses for ${stiIdsToUpdate.size} STI headers...`);
  const stiIdArray = [...stiIdsToUpdate];

  try {
    // 1. Get the aggregated status of all batches for each affected STI
    const placeholders = stiIdArray.map(() => '?').join(',');
    const statusQuery = `
      SELECT
        sti_id,
        COUNT(*) AS total_batches,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_batches,
        SUM(CASE WHEN status = 'fully_pending' THEN 1 ELSE 0 END) AS pending_batches
      FROM instructed_batches
      WHERE sti_id IN (${placeholders}) 
      GROUP BY sti_id
    `;
    
    const batchStats = await query<RowDataPacket[]>({
      query: statusQuery,
      values: stiIdArray
    });

    const updatePromises: Promise<any>[] = [];

    // 2. Determine and apply the new status for each STI
    if (batchStats) {
      for (const stat of batchStats) {
      const { sti_id, total_batches, completed_batches, pending_batches } = stat;
      let newStatus: string;

      if (total_batches == completed_batches) {
        newStatus = 'Closed'; // All batches are completed
      } else if (total_batches == pending_batches) {
        newStatus = 'Fully Pending'; // All batches are still pending
      } else {
        newStatus = 'Partially Pending'; // A mix of statuses
      }

      console.log(`[STATUS UPDATE] STI ${sti_id}: Total: ${total_batches}, Completed: ${completed_batches}, Pending: ${pending_batches}. New Status: ${newStatus}`);
      
      updatePromises.push(
        query<ResultSetHeader>({
          query: `UPDATE stock_transfer_instructions SET status = ? WHERE id = ?`,
          values: [newStatus, sti_id]
        })
      );
    }
    }

    // Run all updates in parallel
    await Promise.all(updatePromises);
    console.log(`[STATUS UPDATE] Successfully updated ${updatePromises.length} STI header statuses.`);

  } catch (error) {
    console.error("[STATUS UPDATE] Error during STI header status update:", error);
    // Don't throw, as this is a secondary operation
  }
}

/**
 * Reads the 'sti_file', filters by date, aggregates STI data, updates the
 * `stock_transfer_instructions` table, inserts new batches, syncs pending
 * batch statuses, and rolls up STI parent statuses.
 *
 * @param targetDate The specific date to filter transactions by.
 * @param stiFile The Excel file (File object) to process.
 * @returns A Promise resolving to the total delivered quantity for the target date.
 */
export async function processStiFile(
  targetDate: Date, 
  stiFile: File | null, 
  summary_id: number,
  currentStockFile: File | null // <-- NEW PARAMETER
): Promise<number> {
  console.log("--- processStiFile START ---");

  // --- 1. Read and Parse Excel File ---
  console.log("[Step 1] Reading and parsing Excel file...");
  let allRows: StiRow[];
  try {
    let buffer: ArrayBuffer | null = null;
    if (stiFile != null) {
      buffer = await stiFile.arrayBuffer();
    }
    if (buffer === null) {
      console.error("[Step 1] Error: STI File is null.");
      throw new Error("STI File is null or empty. Please upload a valid file.");
    }

    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      console.error("[Step 1] Error: Worksheet is invalid or empty.");
      throw new Error("STI file seems to be empty or workbook is invalid.");
    }
    
    allRows = XLSX.utils.sheet_to_json<StiRow>(worksheet, { range: 1 });
    console.log(`[Step 1] Success. Total rows read: ${allRows.length}`);
    
  } catch (error) {
    console.error("[Step 1] Failed to read or parse STI Excel file:", error);
    throw error;
  }
  
  // --- NEW STEP 1.5: Read Stock File and create lookup map ---
  console.log('[Step 1.5] Reading and parsing Current Stock file...');
  const stockStrategyMap = new Map<string, string>();
  if (currentStockFile) {
    try {
      const stockBuffer = await currentStockFile.arrayBuffer();
      // NOTE: Assuming stock file is CSV. If it's .xlsx, this is fine.
      const stockWorkbook = XLSX.read(stockBuffer, { type: 'buffer' }); 
      const stockSheetName = stockWorkbook.SheetNames[0]; // Assuming first sheet
      const stockWorksheet = stockWorkbook.Sheets[stockSheetName];
      if (stockWorksheet) {
        // Read stock file (assuming header is on row 1)
        const stockRows = XLSX.utils.sheet_to_json<CurrentStockRow>(stockWorksheet);
        stockRows.forEach(row => {
          const batchNo = row['Batch No.']?.toString().toUpperCase();
          const strategy = row['Position Strategy Allocation'];
          if (batchNo && strategy) {
            stockStrategyMap.set(batchNo, strategy);
          }
        });
        console.log(`[Step 1.5] Built strategy map with ${stockStrategyMap.size} entries.`);
      }
    } catch (error) {
      console.error('[Step 1.5] Error reading current_stock_file:', error);
      // Continue without strategy data
    }
  } else {
    console.warn('[Step 1.5] No Current Stock file provided. Strategies will be "UNDEFINED".');
  }

  // --- NEW STEP 1.6: Augment allRows with Strategy ---
  allRows.forEach((row: StiRow) => {
    const batchNum = row['Batch No.']?.toString().toUpperCase();
    if (batchNum) {
      row['Strategy'] = stockStrategyMap.get(batchNum) || 'UNDEFINED';
    } else {
      row['Strategy'] = 'UNDEFINED';
    }
  });
  console.log("[Step 1.6] Augmented all STI rows with strategy data.");


  // --- Diagnostic Logging ---
  try {
    // --- START MODIFICATION ---
    const totalRows = allRows.length;
    const rowsToLog = allRows.slice(0, 5); // Get first 5 rows
    console.log("[Step 1] Logging first 5 'Transaction Date_1' values for format check:");
    rowsToLog.forEach((row, index) => {
      console.log(`  Row ${index + 1} Raw Date Value:`, row['Transaction Date_1']);
      console.log(`  Row ${index + 1} Found Strategy:`, row['Strategy']); // Log strategy
    });

    if (totalRows > 5) {
      const lastRowsToLog = allRows.slice(-5); // Get last 5 rows
      console.log("[Step 1] Logging last 5 'Transaction Date_1' values for format check:");
      lastRowsToLog.forEach((row, index) => {
        // Calculate the actual row number (1-based)
        const rowNum = totalRows - 5 + index + 1;
        console.log(`  Row ${rowNum} Raw Date Value:`, row['Transaction Date_1']);
        console.log(`  Row ${rowNum} Found Strategy:`, row['Strategy']); // Log strategy
      });
    }
    // --- END MODIFICATION ---
  } catch (logError) {
    console.error("Error during diagnostic logging:", logError);
  }
  // --- END Logging ---
  
  // --- 2. Sync Existing Pending Batches (NEW) ---
  // This runs *before* date filtering, using the whole file
  let affectedStiIdsFromSync: Set<number>;
  try {
    affectedStiIdsFromSync = await syncPendingBatches(allRows);
  } catch (error) {
    console.error("[Step 2] Error during pending batch sync:", error);
    throw error; // Throw if this critical step fails
  }

  // --- 3. Filter Rows by Target Date (Was 2) ---
  // --- FIX: Reverted to formatDateForMySQL ---
  const targetDateString = formatDateForMySQL(targetDate); 
  console.log(`[Step 3] Filtering for target date (MySQL format): ${targetDateString}`); 

  const dateFilteredRows = allRows.filter(row => {
    const transactionDate = row['Transaction Date_1'] as unknown as Date;
    if (!transactionDate || !(transactionDate instanceof Date)) return false;
    
    // --- FIX: Reverted to formatDateForMySQL ---
    const formattedTransactionDate = formatDateForMySQL(transactionDate); 
    return formattedTransactionDate === targetDateString;
  });

  if (dateFilteredRows.length === 0) {
    console.warn(`[Step 3] No STI transactions found for date ${targetDateString}.`);
    // --- NEW: Still need to update statuses even if no new rows ---
    await updateStiHeaderStatuses(affectedStiIdsFromSync);
    console.log("--- processStiFile END (Exiting early after sync) ---");
    return 0; // Return 0 as no *new* batches were delivered
  }
  console.log(`[Step 3] Found ${dateFilteredRows.length} rows for the target date.`);

  // --- 4. Calculate Total Delivered Qty for the day (Was 3) ---
  const total_delivered_qty = dateFilteredRows.reduce((acc, row) => {
    return acc + parseSafeFloat(row['Qty._2']);
  }, 0);
  console.log(`[Step 4] Calculated Total Delivered Qty: ${total_delivered_qty}`);

  // --- 5. Get Unique STI Numbers and Aggregate STI Data (Was 4) ---
  console.log("[Step 5] Aggregating STI data...");
  const uniqueStiStrings = [...new Set(
    dateFilteredRows
      .map(row => row['Number']?.toString()) // Corrected: Was 'STI Number'
      .filter((s): s is string => !!s) 
  )];

  if (uniqueStiStrings.length === 0) {
    console.warn(`[Step 5] No STI Numbers found in the filtered rows for ${targetDateString}.`);
    // --- NEW: Still need to update statuses even if no new rows ---
    await updateStiHeaderStatuses(affectedStiIdsFromSync);
    console.log("--- processStiFile END (Exiting early after sync) ---");
    return total_delivered_qty;
  }
  console.log(`[Step 5] Found ${uniqueStiStrings.length} unique STI Numbers:`, uniqueStiStrings);
  
  const aggregatedStis: Omit<StockTransferInstruction, 'id' | 'status'>[] = [];

  for (const stiNum of uniqueStiStrings) {
    const allRowsForThisSti = allRows.filter(row => row['Number']?.toString() === stiNum);
    if (allRowsForThisSti.length === 0) {
      console.warn(`[Step 5] No rows found for STI Number ${stiNum} in 'Number' column.`);
      continue;
    }

    const instructed_quantity = allRowsForThisSti.reduce((acc, r) => acc + parseSafeFloat(r['Qty.']), 0);
    const delivered_quantity = allRowsForThisSti.reduce((acc, r) => acc + parseSafeFloat(r['Qty._2']), 0);
    const loss_gain = allRowsForThisSti.reduce((acc, r) => acc + parseSafeFloat(r['Qty._3']), 0);
    
    const firstRow = allRowsForThisSti[0];
    const instructed_date = firstRow['Date'] as unknown as Date;

    if (!instructed_date || !(instructed_date instanceof Date)) {
      console.warn(`[Step 5] Could not determine instructed_date for STI: ${stiNum}. Skipping this STI.`);
      continue;
    }
    
    aggregatedStis.push({
      sti_number: stiNum,
      instructed_date,
      instructed_qty: instructed_quantity,
      delivered_qty: delivered_quantity,
      loss_gain: loss_gain,
    });
  }
  console.log(`[Step 5] Successfully aggregated ${aggregatedStis.length} STIs.`);

  // --- 6. Batch Update/Insert `stock_transfer_instructions` (Was 5) ---
  console.log(`[Step 6] Upserting ${aggregatedStis.length} STIs into database...`);
  try {
    for (const sti of aggregatedStis) {
      const upsertQuery = `
        INSERT INTO stock_transfer_instructions 
          (summary_id, sti_number, instructed_date, instructed_qty, delivered_qty, loss_gain)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          summary_id = VALUES(summary_id),
          instructed_date = VALUES(instructed_date),
          instructed_qty = VALUES(instructed_qty),
          delivered_qty = VALUES(delivered_qty),
          loss_gain = VALUES(loss_gain)
      `;
      await query<ResultSetHeader>({
        query: upsertQuery,
        values: [
          summary_id, // <-- ADDED
          sti.sti_number,
          formatDateForMySQL(sti.instructed_date), // <-- FIX: Reverted to formatDateForMySQL
          sti.instructed_qty,
          sti.delivered_qty,
          sti.loss_gain
        ]
      });
    }
    console.log("[Step 6] STI upsert complete.");
  } catch (error) {
    console.error("[Step 6] Database error during STI upsert:", error);
    throw error;
  }

  // --- 7. Get STI IDs for Foreign Key Mapping (Was 6) ---
  console.log("[Step 7] Fetching STI IDs from database for mapping...");
  const stiPlaceholders = uniqueStiStrings.map(() => '?').join(',');
  const stiRows = await query<StockTransferInstruction[]>({
    query: `SELECT id, sti_number FROM stock_transfer_instructions WHERE sti_number IN (${stiPlaceholders})`,
    values: uniqueStiStrings
  });
  
  const stiNumberToIdMap = new Map<string, number>();
  const affectedStiIdsFromUpsert = new Set<number>();
  if (stiRows !== undefined) {
      stiRows.forEach(row => {
      stiNumberToIdMap.set(row.sti_number, row.id);
      affectedStiIdsFromUpsert.add(row.id); // Add to set for final status update
    });
  }
  console.log(`[Step 7] Mapped ${stiNumberToIdMap.size} STI numbers to IDs.`);

  // --- 8. Process and Insert New `instructed_batches` (Was 7) ---
  console.log(`[Step 8] Processing ${dateFilteredRows.length} filtered rows to find new batches...`);
  const newBatchesToInsert: InstructedBatch[] = [];

  for (const row of dateFilteredRows) {
    const batch_number = row['Batch No.']?.toString();
    const transaction_number = row['Transaction No.']?.toString();
    const arrival_date = row['Transaction Date_1'] as unknown as Date;

    if (!batch_number || !transaction_number || !arrival_date || !(arrival_date instanceof Date)) {
      console.warn("[Step 8] Skipping batch row due to missing Batch No., Transaction No., or invalid Arrival Date.", row);
      continue;
    }

    const existingBatch = await query<RowDataPacket[]>({
      query: `
        SELECT id FROM instructed_batches 
        WHERE batch_number = ? AND transaction_number = ? AND arrival_date = ?
      `,
      values: [batch_number, transaction_number, formatDateForMySQL(arrival_date)] // <-- FIX: Reverted to formatDateForMySQL
    });

    if (existingBatch && existingBatch.length > 0) {
      console.log(`[Step 8] Skipping batch (already exists): B:${batch_number}, T:${transaction_number}`);
      continue;
    }

    // --- 9. Create New Batch Object (Interface Instance) (Was 8) ---
    const sti_number_for_row = row['Number']?.toString(); // Corrected: Was 'STI Number'
    if (!sti_number_for_row) {
        console.warn("[Step 9] Skipping batch row: STI Number is missing.", row);
        continue;
    }

    const sti_id = stiNumberToIdMap.get(sti_number_for_row);
    if (!sti_id) {
      console.warn(`[Step 9] Skipping batch row: Could not find parent STI ID for STI Number ${sti_number_for_row}.`, row);
      continue;
    }

    const delivered_qty = parseSafeFloat(row['Qty._2']);
    const status_val = row['Stock Transfer Status'];
    let status: string;

    if (status_val === 'Completed') {
      status = 'completed';
    } else if (status_val === 'Pending' && delivered_qty > 0) {
      status = 'partially_delivered';
    } else if (status_val === 'Pending' && delivered_qty <= 0) {
      status = 'fully_pending';
    } else {
      status = 'Pending'; // Default fallback
    }
    
    // --- Reverted Due Date Logic ---
    const due_date = row['Storage Due Date'] as unknown as Date;
    // --- END: Reverted Due Date Logic ---

    const newBatch: InstructedBatch = {
      sti_id: sti_id,
      grade: row['Item Name'] || 'UNKNOWN',
      strategy: row['Strategy'] || 'UNDEFINED', // <-- USE THE AUGMENTED STRATEGY
      instructed_qty: parseSafeFloat(row['Qty.']),
      delivered_qty: delivered_qty,
      balance_to_transfer: parseSafeFloat(row['Qty._5']),
      loss_gain_qty: parseSafeFloat(row['Qty._3']),
      status: status,
      // --- START FIX: Corrected the column name case ---
      from_location: row['From WareHouse - Zone'] || 'UNDEFINED', // Was 'From Warehouse - Zone'
      // --- END FIX ---
      due_date: (due_date instanceof Date) ? due_date : null, // Use the value from the column
      arrival_date: arrival_date,
      transaction_number: transaction_number,
      batch_number: batch_number,
    };
    
    newBatchesToInsert.push(newBatch);
  }
  console.log(`[Step 9] Found ${newBatchesToInsert.length} new batches to insert.`);

  // --- 10. Batch Insert New Batches (if any) (Was 9) ---
  if (newBatchesToInsert.length > 0) {
    console.log(`[Step 10] Inserting ${newBatchesToInsert.length} new instructed batches...`);
    try {
      const insertQuery = `
        INSERT INTO instructed_batches (
          summary_id, sti_id, grade, strategy, instructed_qty, delivered_qty, balance_to_transfer, 
          loss_gain_qty, status, from_location, due_date, arrival_date, 
          transaction_number, batch_number
        ) VALUES ?
      `; // <-- ADDED 'strategy'
      const values = newBatchesToInsert.map((batch) => [
        summary_id, // <-- ADDED
        batch.sti_id,
        batch.grade,
        batch.strategy, // <-- ADDED
        batch.instructed_qty,
        batch.delivered_qty,
        batch.balance_to_transfer,
        batch.loss_gain_qty,
        batch.status,
        batch.from_location,
        batch.due_date ? formatDateForMySQL(batch.due_date) : null, // <-- FIX: Reverted to formatDateForMySQL
        formatDateForMySQL(batch.arrival_date), // <-- FIX: Reverted to formatDateForMySQL
        batch.transaction_number,
        batch.batch_number,
      ]);

      // Pass the 2D 'values' array wrapped in an outer array
      await query<ResultSetHeader>({ query: insertQuery, values: [values] });
      
      console.log(`[Step 10] Successfully inserted ${newBatchesToInsert.length} new instructed batches.`);

    } catch (error) {
      console.error("[Step 10] Database error during batch insert of instructed batches:", error);
      throw error;
    }
  } else {
    console.log("[Step 10] No new instructed batches found to insert.");
  }

  // --- 11. Update all affected STI Header statuses (NEW) ---
  // Combine STIs updated during the sync AND STIs that just had new batches added
  const allAffectedStiIds = new Set([...affectedStiIdsFromSync, ...affectedStiIdsFromUpsert]);
  await updateStiHeaderStatuses(allAffectedStiIds);

  // --- 12. Return the total delivered qty for the day (Was 10) ---
  console.log(`[Step 12] Returning total delivered quantity: ${total_delivered_qty}`);
  console.log("--- processStiFile END ---");
  return total_delivered_qty;
}
/**
 * A cache to store summary IDs for dates already processed in this run.
 * Maps a YYYY-MM-DD string to a summary_id.
 */
const summaryCache = new Map<string, number>();

/**
 * Finds a daily_stock_summary for the given date, or creates a new one
 * with 0 values if it doesn't exist.
 * @param summaryDate The date to find or create a summary for.
 * @returns A Promise resolving to the ID of the summary record.
 */
async function getOrCreateDailySummary(summaryDate: Date): Promise<number|undefined> {
  const dateString = formatDateForMySQL(summaryDate);

  // 1. Check cache first
  if (summaryCache.has(dateString)) {
    return summaryCache.get(dateString)!;
  }

  // 2. Check database
  const selectQuery = `SELECT id FROM daily_stock_summaries WHERE date = ?`;
  const existingSummary = (await query<RowDataPacket[]>({
    query: selectQuery,
    values: [dateString],
  })) as { id: number }[];

  if (existingSummary.length > 0) {
    const summaryId = existingSummary[0].id;
    summaryCache.set(dateString, summaryId); // Add to cache
    return summaryId;
  }

  // 3. Create new "test object" summary if not found
  console.log(
    `[getOrCreateDailySummary] No summary found for ${dateString}. Creating new one.`
  );
  const insertQuery = `
    INSERT INTO daily_stock_summaries (
      date, total_opening_qty, total_to_processing_qty, 
      total_from_processing_qty, total_loss_gain_qty, total_inbound_qty, 
      total_outbound_qty, total_stock_adjustment_qty, 
      total_xbs_closing_stock, total_regrade_discrepancy
    ) VALUES (?, 0, 0, 0, 0, 0, 0, 0, 0, 0)
  `;
  const result = await query<ResultSetHeader>({
    query: insertQuery,
    values: [dateString],
  });

  let newSummaryId:number|undefined = undefined;
  if (result) {
    newSummaryId = result.insertId;
    summaryCache.set(dateString, newSummaryId); // Add new one to cache
  }
  
  return newSummaryId;
}

/**
 * Reads the 'gdi_file', filters by date, and inserts new outbound dispatches
 * into the `daily_outbounds` table if they don't exist.
 *
 * @param sinceDate The minimum date (inclusive) to filter transactions by.
 * @param gdiFile The Excel file (File object) to process.
 * @returns A Promise resolving to a list of [Item Name, Total Quantity] tuples.
 */
export async function processOutbounds(
  sinceDate: Date, 
  gdiFile: File | null,
  currentStockFile: File | null,
  summary_id:number
): Promise<{ totalOutbound: number, groupedData: [string, number][] }> {
  
  console.log('--- processOutbounds START ---');

  // --- NEW STEP 1: Read Stock File and create lookup map ---
  console.log('[Step 1a] Reading and parsing Current Stock file...');
  const stockStrategyMap = new Map<string, string>();
  if (currentStockFile) {
    try {
      const stockBuffer = await currentStockFile.arrayBuffer();
      const stockWorkbook = XLSX.read(stockBuffer, { type: 'buffer' });
      const stockSheetName = stockWorkbook.SheetNames[0]; // Assuming first sheet
      const stockWorksheet = stockWorkbook.Sheets[stockSheetName];
      if (stockWorksheet) {
        const stockRows = XLSX.utils.sheet_to_json<CurrentStockRow>(stockWorksheet);
        stockRows.forEach(row => {
          const batchNo = row['Batch No.']?.toString().toUpperCase();
          const strategy = row['Position Strategy Allocation'];
          if (batchNo && strategy) {
            stockStrategyMap.set(batchNo, strategy);
          }
        });
        console.log(`[Step 1a] Built strategy map with ${stockStrategyMap.size} entries.`);
      }
    } catch (error) {
      console.error('[Step 1a] Error reading current_stock_file:', error);
      // Continue without strategy data
    }
  } else {
    console.warn('[Step 1a] No Current Stock file provided. Strategies will be "UNDEFINED".');
  }

  // --- 1. Read and Parse Excel File ---
  console.log('[Step 1b] Reading and parsing GDI file...');
  let allRows: GdiRow[];
  try {
    let buffer: ArrayBuffer | null = null;
    if (gdiFile != null) {
      buffer = await gdiFile.arrayBuffer();
    }
    if (buffer === null) {
      console.error('[Step 1b] Error: GDI File is null.');
      throw new Error('GDI File is null or empty. Please upload a valid file.');
    }
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0]; // Assuming first sheet
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      console.error('[Step 1b] Error: Worksheet is invalid or empty.');
      throw new Error('GDI file seems to be empty or workbook is invalid.');
    }
    // Use range: 1 to set the second row as the header
    allRows = XLSX.utils.sheet_to_json(worksheet, { range: 1 });
    console.log(`[Step 1b] Success. Total rows read: ${allRows.length}`);
  } catch (error) {
    console.error('[Step 1b] Failed to read or parse GDI Excel file:', error);
    throw error;
  }

  // --- 2. Filter Rows by Target Date ---
  const sinceDateMidnight = new Date(sinceDate.setHours(0, 0, 0, 0));
  console.log(`[Step 2] Filtering for rows with 'DC Date' on or after ${formatDateAsLocal_YYYYMMDD(sinceDateMidnight)}`);
  
  const dateFilteredRows = allRows.filter(function (row: GdiRow) {
      const dcDate = row['DC Date'] as unknown as Date;
      if (!dcDate || !(dcDate instanceof Date)) return false;
      // Filter for rows with DC Date values same as or later than that date
      return dcDate >= sinceDateMidnight;
  });

  console.log(`[Step 2] Found ${dateFilteredRows.length} rows on or after the target date.`);
  if (dateFilteredRows.length === 0) {
      console.warn('[Step 2] No GDI transactions found on or after the date.');
      console.log('--- processOutbounds END (Exiting early) ---');
      return { totalOutbound: 0, groupedData: [] };
  }

  // --- 3. Process Rows and Insert New Dispatches ---
  console.log(`[Step 3] Processing ${dateFilteredRows.length} filtered rows...`);
  let newDispatchesCount = 0;
  const insertPromises: Promise<any>[] = [];

  for (const row of dateFilteredRows) {
    const ticket_numbers = row['Ticket No.']?.toString();
    const dispatch_number = row['GDI No']?.toString();
    const dispatch_dc_numbers = row['DC No.']?.toString();
    const dispatched_grade = row['Item Code_1']?.toString();
    const dispatch_date = row['DC Date'] as unknown as Date;
    const batch_number = row['Batch No.']?.toString(); // <-- Get batch number

    // Check if all unique keys are present
    if (!ticket_numbers ||
        !dispatch_number ||
        !dispatch_dc_numbers ||
        !dispatched_grade ||
        !(dispatch_date instanceof Date)) {
        console.warn('[Step 3] Skipping row due to missing unique key(s) or invalid DC Date.', row);
        continue;
    }

    const selectQuery = `
      SELECT id FROM daily_outbounds 
      WHERE ticket_numbers = ? 
        AND dispatch_number = ? 
        AND dispatch_dc_numbers = ? 
        AND dispatched_grade = ?
    `;
    const existingDispatch = await query<RowDataPacket[]>({
        query: selectQuery,
        values: [
            ticket_numbers,
            dispatch_number,
            dispatch_dc_numbers,
            dispatched_grade,
        ],
    });

    if (existingDispatch && existingDispatch.length === 0) {
        // --- 4. Does not exist. Create and insert new record ---
        newDispatchesCount++;

  
        let strategy = 'UNDEFINED';
        if (batch_number) {
          strategy = stockStrategyMap.get(batch_number.toUpperCase()) || 'UNDEFINED';
        }
        // --- END: MODIFIED LOGIC ---

        const newOutbound: OutboundRow = {
            dispatch_date: dispatch_date,
            dispatch_dc_numbers: dispatch_dc_numbers,
            dispatch_number: dispatch_number,
            dispatched_grade: dispatched_grade,
            dispatched_quantity: parseSafeFloat(row['Qty.']),
            dispatched_strategy: strategy, // <-- Use looked-up strategy
            ticket_numbers: ticket_numbers,
            batch_number: batch_number || 'N/A', // Ensure it's a string
        };

        const insertQuery = "INSERT INTO daily_outbounds (summary_id, dispatch_date, dispatch_dc_numbers, dispatch_number, dispatched_grade, dispatched_quantity, dispatched_strategy, ticket_numbers, batch_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ";
        insertPromises.push(query({
            query: insertQuery,
            values: [
                summary_id,
                formatDateAsLocal_YYYYMMDD(newOutbound.dispatch_date),
                newOutbound.dispatch_dc_numbers,
                newOutbound.dispatch_number,
                newOutbound.dispatched_grade,
                newOutbound.dispatched_quantity,
                newOutbound.dispatched_strategy,
                newOutbound.ticket_numbers,
                newOutbound.batch_number,
            ],
        }));
    }
  }

  // --- Wait for all inserts to complete ---
  if (insertPromises.length > 0) {
    try {
        await Promise.all(insertPromises);
        console.log(`[Step 4] Successfully inserted ${newDispatchesCount} new dispatches.`);
    } catch (error) {
        console.error('[Step 4] Error during batch insert of dispatches:', error);
        throw error;
    }
  } else {
    console.log('[Step 4] No new dispatches found to insert.');
  }

  // --- 5. Group by Item Name, Calculate Total, and Return ---
  console.log('[Step 5] Grouping filtered rows by Item Name...');
  const grouped: Record<string, number> = {};
  let totalOutbound = 0;
  for (const row of dateFilteredRows) {
      const itemName = row['Item Code_1']?.toString() || 'UNDEFINED';
      const qty = parseSafeFloat(row['Qty.']);
      grouped[itemName] = (grouped[itemName] || 0) + qty;
      totalOutbound += qty;
  }
  
  const result = Object.entries(grouped);
  console.log(`[Step 5] Total Outbound: ${totalOutbound}`);
  console.log(`[Step 5] Returning ${result.length} grouped items.`);
  console.log('--- processOutbounds END ---');
  return { totalOutbound: totalOutbound, groupedData: result };
}

/**
 * Finds or creates a daily summary row for today.
 * 1. Checks if a row for today's date already exists.
 * 2. If yes, returns that row's ID.
 * 3. If no, fetches the previous day's closing stock to use as today's opening stock.
 * 4. Creates a new row for today, initializing all other values to 0.
 * 5. Returns the new row's ID.
 * * @returns {Promise<number>} The ID of the daily_stock_summaries row for today.
 */
export async function initialize_daily_summary(): Promise<number> {
  
  const today = new Date();
  const todayString = formatDateAsLocal_YYYYMMDD(today);

  // 1. Check if a summary for today already exists
  try {
    const checkQuery = `SELECT id FROM daily_stock_summaries WHERE date = ? LIMIT 1`;
    const existingRows = await query<RowDataPacket[]>({
        query: checkQuery,
        values: [todayString]
    });

    // 2. If it exists, return that ID immediately
    // This makes the function idempotent (safe to run multiple times)
    if (existingRows && existingRows.length > 0) {
        console.log(`[INIT] Summary for today (${todayString}) already exists. ID: ${existingRows[0].id}`);
        return existingRows[0].id as number;
    }
  } catch (e) {
      console.error("[INIT] Error checking for existing summary:", e);
      throw e; // Fail fast
  }

  console.log(`[INIT] No summary found for ${todayString}. Creating a new one...`);

  // 3. If it doesn't exist, get the opening_qty from the *previous* day.
  let total_opening_qty = 0;
  try {
    const openingQtyQuery = `SELECT total_xbs_closing_stock FROM daily_stock_summaries WHERE date < ? ORDER BY date DESC LIMIT 1`;
    const openingQtyResult = await query<RowDataPacket[]>({
        query: openingQtyQuery,
        values: [todayString]
    });

    if (openingQtyResult && openingQtyResult.length > 0) {
        total_opening_qty = parseSafeFloat(openingQtyResult[0].total_xbs_closing_stock);
    }
    console.log(`[INIT] Fetched opening quantity from previous day: ${total_opening_qty}`);
  } catch (e) {
     console.error("[INIT] Error fetching opening quantity:", e);
     console.warn("[INIT] Defaulting opening quantity to 0.");
  }
  
  // 4. Create the new row with all values initialized
  try {
    const insertQuery = `
        INSERT INTO daily_stock_summaries (
            date, total_opening_qty, total_to_processing_qty, 
            total_from_processing_qty, total_loss_gain_qty, total_milling_loss_qty,
            total_inbound_qty, total_outbound_qty, total_stock_adjustment_qty,
            total_xbs_closing_stock, total_regrade_discrepancy
        ) VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0)
    `;

    const result = await query<ResultSetHeader>({
        query: insertQuery,
        values: [todayString, total_opening_qty]
    });

    // 5. Return the new ID
    if (result) {
      return result.insertId;
    }
    else{
      return 0;
    }
    
    
  } catch (error) {
     console.error("[INIT] Error creating new summary row:", error);
     throw error;
  }
}


/**
 * Reads the 'sta_file' (Stock Adjustment), filters by date,
 * inserts new adjustments, and returns total adjustment quantity
 * and data grouped by grade.
 *
 * @param sinceDate The date to filter transactions *after*.
 * @param staFile The Excel file (File object) to process.
 *... A Promise resolving to an object containing total adjustment qty and grouped data.
 */
export async function processAdjustments(
  sinceDate: Date,
  staFile: File | null,
  summary_id: number,
  currentStockFile: File | null // <-- NEW PARAMETER
): Promise<{ totalAdjustment: number; groupedData: [string, number][] }> {
  console.log('--- processAdjustments START ---');

  // --- NEW STEP 1.5: Read Stock File and create lookup map ---
  console.log('[Step 1.5] Reading and parsing Current Stock file...');
  const stockStrategyMap = new Map<string, string>();
  if (currentStockFile) {
    try {
      const stockBuffer = await currentStockFile.arrayBuffer();
      // Assuming stock file is CSV or Excel
      const stockWorkbook = XLSX.read(stockBuffer, { type: 'buffer' }); 
      const stockSheetName = stockWorkbook.SheetNames[0]; // Assuming first sheet
      const stockWorksheet = stockWorkbook.Sheets[stockSheetName];
      if (stockWorksheet) {
        // Read stock file (assuming header is on row 1)
        const stockRows = XLSX.utils.sheet_to_json<CurrentStockRow>(stockWorksheet);
        stockRows.forEach(row => {
          const batchNo = row['Batch No.']?.toString().toUpperCase();
          const strategy = row['Position Strategy Allocation'];
          if (batchNo && strategy) {
            stockStrategyMap.set(batchNo, strategy);
          }
        });
        console.log(`[Step 1.5] Built strategy map with ${stockStrategyMap.size} entries.`);
      }
    } catch (error) {
      console.error('[Step 1.5] Error reading current_stock_file:', error);
      // Continue without strategy data
    }
  } else {
    console.warn('[Step 1.5] No Current Stock file provided. Strategies will be "UNDEFINED".');
  }
  // --- END NEW STEP 1.5 ---


  // --- 1. Read and Parse Excel File ---
  console.log('[Step 1] Reading and parsing STA file...');
  let allRows: StaRow[]; // Assuming StaRow is a type similar to GdiRow
  try {
    let buffer: ArrayBuffer | null = null;
    if (staFile != null) {
      buffer = await staFile.arrayBuffer();
    }
    if (buffer === null) {
      console.error('[Step 1] Error: STA File is null.');
      throw new Error('STA File is null or empty. Please upload a valid file.');
    }

    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      console.error('[Step 1] Error: Worksheet is invalid or empty.');
      throw new Error('STA file seems to be empty or workbook is invalid.');
    }

    allRows = XLSX.utils.sheet_to_json<StaRow>(worksheet, { range: 0 });
    console.log(`[Step 1] Success. Total rows read: ${allRows.length}`);

    // --- START: NEW DEBUG LOG ---
    // Add this log to see all available column headers
    if (allRows.length > 0) {
      console.log(
        '[Step 1 Debug] Found headers:',
        Object.keys(allRows[0])
      );
    }
    // --- END: NEW DEBUG LOG ---

  } catch (error) { // <-- FIX: Corrected syntax
    console.error('[Step 1] Failed to read or parse STA Excel file:', error);
    throw error;
  }

  // --- 2. Filter Rows by Target Date ---
  // Normalize 'sinceDate' to midnight for comparison
  const sinceDateMidnight = new Date(sinceDate.setHours(0, 0, 0, 0));
  console.log(
    `[Step 2] Filtering for rows with 'SA Date' *after* ${formatDateAsLocal_YYYYMMDD(
      sinceDateMidnight
    )}`
  );

  const dateFilteredRows = allRows.filter((row, index) => {
    const saDate = row['SA Date'] as unknown as Date;

    // --- START: New Diagnostic Logging ---
    // Log the first 10 rows to see what the values look like
    if (index < 10) {
      console.log(
        `[Step 2 Debug] Row ${index} | Raw Value:`,
        row['SA Date'],
        `| Type: ${typeof row['SA Date']}`
      );
      if (saDate instanceof Date) {
        console.log(
          `[Step 2 Debug] Row ${index} | Parsed as Date: ${saDate.toISOString()}`
        );
        console.log(
          `[Step 2 Debug] Row ${index} | Comparison: ${saDate.toISOString()} > ${sinceDateMidnight.toISOString()} = ${
            saDate > sinceDateMidnight
          }`
        );
      } else {
        console.log(
          `[Step 2 Debug] Row ${index} | FAILED: Value is not a Date object.`
        );
      }
    }
    // --- END: New Diagnostic Logging ---

    if (!saDate || !(saDate instanceof Date)) return false;

    // Filter for rows with SA Date values *later than* that date
    return saDate > sinceDateMidnight;
  });

  console.log(
    `[Step 2] Found ${dateFilteredRows.length} rows after the target date.`
  );

  if (dateFilteredRows.length === 0) {
    console.warn(`[Step 2] No STA transactions found after the date.`);
    console.log('--- processAdjustments END (Exiting early) ---');
    return { totalAdjustment: 0, groupedData: [] };
  }

  // --- START: MODIFIED LOGIC ---
  // --- 3. Calculate Total Adjustment from ALL filtered rows ---
  // This is the total adjustment for the period, regardless of what's already in the DB.
  const total_adjustment_quantity = dateFilteredRows.reduce((acc, row) => {
    return acc + parseSafeFloat(row['Qty.']);
  }, 0);
  console.log(
    `[Step 3] Calculated total adjustment (from all ${dateFilteredRows.length} filtered rows): ${total_adjustment_quantity}`
  );
  // --- END: MODIFIED LOGIC ---

  // --- 4. Process Rows and Insert New Adjustments --- (Was Step 3)
  console.log(
    `[Step 4] Processing ${dateFilteredRows.length} filtered rows to find *new* inserts...`
  );
  let new_adjustment_insert_quantity = 0; // Renamed from total_adjustment_quantity
  let newAdjustmentsCount = 0;
  const insertPromises: Promise<any>[] = [];

  for (const row of dateFilteredRows) {
    // Keys from file
    const batch_number = row['Batch No.']?.toString();
    const grade = row['Item Name']?.toString();
    const adjusted_quantity = parseSafeFloat(row['Qty.']); // Assumes "Qty."
    const adjustment_date = row['SA Date'] as unknown as Date;
    const reason = row['Reason']?.toString();

    // Uniqueness check keys
    if (
      !batch_number ||
      !grade ||
      isNaN(adjusted_quantity) || // Check for valid number
      !adjustment_date ||
      !(adjustment_date instanceof Date)
    ) {
      console.warn(
        '[Step 3] Skipping row due to missing unique key(s) or invalid SA Date.',
        row
      );
      continue;
    }

    // Check if this adjustment already exists
    const selectQuery = `
      SELECT id FROM stock_adjustment 
      WHERE batch_number = ? 
        AND grade = ? 
        AND adjusted_quantity = ?
    `;
    const existingAdjustment = await query<RowDataPacket[]>({
      query: selectQuery,
      values: [batch_number, grade, adjusted_quantity],
    });

    if (existingAdjustment!=undefined && existingAdjustment.length === 0) {
      // --- 4. Does not exist. Create and insert new record ---
      newAdjustmentsCount++;

      // --- START: MODIFIED LOGIC ---
      let strategy = 'UNDEFINED';
      if (batch_number) {
        // Look up the strategy from the map
        strategy = stockStrategyMap.get(batch_number.toUpperCase()) || 'UNDEFINED';
      }
      // --- END: MODIFIED LOGIC ---

      // @ts-ignore - Assuming StockAdjustment type
      const newAdjustment: Omit<StockAdjustment, 'id'> = {
        adjustment_date: adjustment_date,
        grade: grade,
        adjusted_quantity: adjusted_quantity, // Column name from your schema
        strategy: strategy, // <-- Use looked-up strategy
        batch_number: batch_number,
        reason: reason || 'N/A', // Provide fallback for reason
      };

      // Add insert query to promise array
      const insertQuery = `
        INSERT INTO stock_adjustment (
          summary_id, adjustment_date, grade, adjusted_quantity, 
          strategy, batch_number, reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      insertPromises.push(
        query({
          query: insertQuery,
          values: [
            summary_id,
            formatDateAsLocal_YYYYMMDD(newAdjustment.adjustment_date),
            newAdjustment.grade,
            newAdjustment.adjusted_quantity,
            newAdjustment.strategy,
            newAdjustment.batch_number,
            newAdjustment.reason,
          ],
        }) // <-- FIX: Closed parenthesis
      ); // <-- FIX: Closed parenthesis
      
      // Increment total *only for new rows*
      new_adjustment_insert_quantity += newAdjustment.adjusted_quantity;
    }
  }

  // Wait for all inserts to complete
  if (insertPromises.length > 0) {
    try {
      await Promise.all(insertPromises);
      console.log(
        `[Step 4] Successfully inserted ${newAdjustmentsCount} new adjustments.`
      );
    } catch (error) {
      console.error(
        '[Step 4] Error during batch insert of adjustments:',
        error
      );
      throw error;
    }
  } else {
    console.log('[Step 4] No new adjustments found to insert.');
  }

  // --- 5. Group by Item Name (Grade) and Return ---
  console.log('[Step 5] Grouping *all* filtered rows by Item Name...');
  const grouped: { [key: string]: number } = {};

  // Group *all* date-filtered rows as requested
  for (const row of dateFilteredRows) {
    const grade = row['Item Name']?.toString() || 'UNDEFINED';
    const qty = parseSafeFloat(row['Qty.']);
    grouped[grade] = (grouped[grade] || 0) + qty;
  }

  // Convert to array of tuples [Grade, Total Quantity]
  const groupedData: [string, number][] = Object.entries(grouped);

  console.log(
    `[Step 5] Total Adjustment (from ALL filtered rows): ${total_adjustment_quantity}` // Updated log
  );
  console.log(`[Step 5] Returning ${groupedData.length} grouped items.`);
  console.log('--- processAdjustments END ---');
  return { totalAdjustment: total_adjustment_quantity, groupedData }; // Return the new total
}

/**
 * Reads a stock CSV or Excel file and processes it to return a dataframe object
 * with summarized quantities based on type, item name, and strategy.
 *
 * @param {File | null} stockFile The 'current stock.csv' file as a File object.
 * @returns {Promise<StockData>} A promise that resolves to the dataframe object.
 */
export async function getStockDataframe(stockFile: File | null): Promise<StockData> {
  // 1. Initialize the accumulator variables
  let blocked_for_processing_quantity: number = 0;
  let work_in_progress_quantity: number = 0;
  let total_closing_balance: number = 0; // Spelling as requested
  const grades_closing_balances: Record<string, number> = {};
  const strategies_closing_balances: Record<string, number> = {};

  // --- 1. Read and Parse Excel/CSV File ---
  let allRows: StockRow[];
  try {
    let buffer: ArrayBuffer | null = null;
    if (stockFile != null) {
      buffer = await stockFile.arrayBuffer();
    }
    if (buffer === null) {
      console.error('Error: Stock File is null.');
      throw new Error('Stock File is null or empty. Please upload a valid file.');
    }

    // Read the file buffer
    // This works for both .xlsx and .csv
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      console.error('Error: Worksheet is invalid or empty.');
      throw new Error('Stock file seems to be empty or workbook is invalid.');
    }

    // Convert sheet to JSON. Assumes headers are in the first row.
    allRows = XLSX.utils.sheet_to_json<StockRow>(worksheet);
    console.log(`[getStockDataframe] Success. Total rows read: ${allRows.length}`);

  } catch (error: any) {
    console.error('[getStockDataframe] Failed to read or parse stock file:', error.message);
    throw error;
  }

  // --- 2. Process all rows ---
  for (const rowObject of allRows) {
    try {
      // Get the quantity, parse it as a number
      const qty = parseFloat(rowObject['Qty.'] as string);

      // Skip row if quantity is not a valid number
      if (isNaN(qty)) {
        continue;
      }

      // 2. Sum quantities based on 'Type'
      const type: string = rowObject['Type'] || '';
      if (type === 'PIL') {
        blocked_for_processing_quantity += qty;
      } else if (type === 'WIP') {
        work_in_progress_quantity += qty;
      } else if (type === 'WH') {
        total_closing_balance += qty;
      }

      // 3. Group and sum for grades_closing_balances
      const itemName: string = rowObject['Item Name'] || '';
      if (itemName) {
        grades_closing_balances[itemName] = (grades_closing_balances[itemName] || 0) + qty;
      }

      // 4. Group and sum for strategies_closing_balances
      const strategy: string = rowObject['Position Strategy Allocation'] || '';
      if (strategy) {
        strategies_closing_balances[strategy] = (strategies_closing_balances[strategy] || 0) + qty;
      }
    } catch (e: any) {
      // Log an error for a problematic row but continue processing
      console.error(`Error processing stock row: ${JSON.stringify(rowObject)}`, e.message);
    }
  }

  // 5. Return the final compiled object.
  return {
    blocked_for_processing_quantity,
    work_in_progress_quantity,
    total_closing_balance,
    grades_closing_balances,
    strategies_closing_balances
  };
}

/**
 * Converts an Excel serial date number to a JavaScript Date object.
 * Returns null if the input is not a valid Excel date number.
 * @param {any} excelDate The Excel date (which might be a number or string)
 * @returns {Date | null} A Date object or null.
 */
function convertExcelDate(excelDate: any): Date | null {
  if (typeof excelDate !== 'number' || excelDate < 1) {
    // It's not a number or it's a number that doesn't represent an Excel date
    return null;
  }
  // 25569 is the number of days from 1900-01-01 (Excel epoch) to 1970-01-01 (Unix epoch),
  // accounting for Excel's 1900 leap year bug.
  const milliseconds = (excelDate - 25569) * 86400 * 1000;
  const date = new Date(milliseconds);
  
  // Check for invalid date (e.g., if milliseconds calculation was off)
  if (isNaN(date.getTime())) {
    return null;
  }
  return date;
}


/**
 * Reads a specified Excel file and returns a list of
 * process objects with aggregated details.
 *
 * @param {Date} sinceDate The date to filter by. Only records with
 * 'Receipt Date' *after* this date will be processed.
 * @param {File | null} processingFile The 'processing analysis.xlsx' file as a File object.
 * @returns {Promise<Array<ProcessDetails>>} A promise that resolves to a list of process objects.
 */
export async function getProcessDetails(
  sinceDate: Date, 
  processingFile: File | null,
  currentStockFile: File | null // <-- NEW PARAMETER
): Promise<ProcessSummary> {

  // --- NEW STEP 1: Read the Current Stock CSV ---
  const stockStrategyMap = new Map<string, string>();
  try {
    if (currentStockFile) {
      const stockBuffer = await currentStockFile.arrayBuffer();
      const stockWorkbook = XLSX.read(stockBuffer, { type: 'buffer' });
      const stockSheetName = stockWorkbook.SheetNames[0];
      const stockWorksheet = stockWorkbook.Sheets[stockSheetName];
      if (stockWorksheet) {
        const stockRows = XLSX.utils.sheet_to_json<CurrentStockRow>(stockWorksheet);
        stockRows.forEach(row => {
          if (row['Batch No.'] && row['Position Strategy Allocation']) {
            stockStrategyMap.set(row['Batch No.'].toUpperCase(), row['Position Strategy Allocation']);
          }
        });
        console.log(`[getProcessDetails] Built strategy map with ${stockStrategyMap.size} entries.`);
      }
    } else {
      console.warn('[getProcessDetails] No Current Stock file provided. Strategies will be "UNDEFINED".');
    }
  } catch (error: any) {
    console.error(`[getProcessDetails] Error reading current_stock_file: ${error.message}`);
    // Continue without strategy data
  }


  // --- STEP 2: Read the Processing Analysis file ---
  let allRows: ProcessingAnalysisRow[];
  try {
    let buffer: ArrayBuffer | null = null;
    if (processingFile != null) {
      buffer = await processingFile.arrayBuffer();
    }
    if (buffer === null) {
      console.error('Error: Processing File is null.');
      throw new Error('Processing File is null or empty. Please upload a valid file.');
    }

    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheetName = 'Processing Analysis';
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      throw new Error(`Worksheet "${sheetName}" not found in the Excel file.`);
    }

    // --- STEP 3: Convert sheet to JSON ---
    allRows = XLSX.utils.sheet_to_json<ProcessingAnalysisRow>(worksheet, { range: 1 });

    if (allRows.length === 0) {
        console.warn(`Worksheet "${sheetName}" is empty.`);
        return { processes: [], total_input_quantity: 0, total_output_quantity: 0, total_milling_loss: 0, total_processing_loss: 0 };
    }
  } catch (error: any) {
    console.error(`[getProcessDetails] Error reading or parsing file: ${error.message}`);
    throw error;
  }
  
  // --- NEW STEP 4: Augment rows with Strategy data ---
  // We do this *before* filtering so that process-aggregation logic works correctly
  allRows.forEach((row: ProcessingAnalysisRow) => {
    const inputBatch = row['Batch No.']?.toUpperCase();
    const outputBatch = row['Batch No._1']?.toUpperCase();
    
    // --- THIS IS THE FIX ---
    // Get strategy for BOTH input and output batches
    if (inputBatch) {
      row.InputStrategy = stockStrategyMap.get(inputBatch) || 'UNDEFINED';
    }
    if (outputBatch) {
      row.OutputStrategy = stockStrategyMap.get(outputBatch) || 'UNDEFINED';
    }
    // --- END FIX ---
  });
  console.log("[getProcessDetails] Augmented all rows with strategy data.");


  // --- STEP 5: Filter data by 'Receipt Date' ---
  let checkedDateFilter = false; 
  const dateFilteredRows = allRows.filter((row: ProcessingAnalysisRow) => {
    let receiptDate = row['Receipt Date'] as unknown as Date;
    
    // --- Diagnostic logging (runs once) ---
    if (!checkedDateFilter && allRows.length > 0) {
      console.log(`\n--- Date Filter Diagnostic (getProcessDetails) ---`);
      console.log(`Checking against sinceDate: ${formatDateAsLocal_YYYYMMDD(sinceDate)}`);
      console.log(`Original 'Receipt Date' in file:`, row['Receipt Date']);
      console.log(`Is 'Receipt Date' a Date object?`, receiptDate instanceof Date);
      if (receiptDate instanceof Date) {
        console.log(`Converted 'Receipt Date':`, formatDateAsLocal_YYYYMMDD(receiptDate));
        console.log(`Is it >= sinceDate?`, receiptDate >= sinceDate);
      }
      console.log(`------------------------------\n`);
      checkedDateFilter = true;
    }
    return receiptDate instanceof Date && !isNaN(receiptDate.getTime()) && receiptDate >= sinceDate;
  });

  // --- STEP 6: Get unique 'Process No.' values ---
  const uniqueProcessNumbers: (string | number | undefined)[] = [
    ...new Set(dateFilteredRows.map((row: ProcessingAnalysisRow) => row['Process No.']))
  ].filter(Boolean);

  if (uniqueProcessNumbers.length === 0) {
      console.warn('No processes found matching the date filter.');
  }

  const processObjectsList: ProcessDetails[] = [];
  
  // --- Initialize Grand Totals ---
  let total_input_quantity = 0;
  let total_output_quantity = 0;
  let total_milling_loss = 0;
  let total_processing_loss = 0;


  // --- STEP 7: Loop for each unique process number ---
  for (const processNo of uniqueProcessNumbers) {
    
    // Get all rows (from the original 'allRows') matching this process number
    const matchingRows = allRows.filter((row: ProcessingAnalysisRow) => row['Process No.'] === processNo);

    if (matchingRows.length === 0) {
      continue;
    }

    const firstRow = matchingRows[0];
    const processing_loss = parseSafeFloat(firstRow['Loss/Gain']);
    const milling_loss = parseSafeFloat(firstRow['Milling Loss']);

    // 6. Create the base process object
    const process_object: ProcessDetails = {
      process_number: firstRow['Process No.']!,
      process_type: firstRow['Process Name'] || 'N/A',
      issue_date: firstRow['Issue Date'] as unknown as Date,
      processing_date: firstRow['Receipt Date'] as unknown as Date,
      input_item_names: {},
      input_batches: {}, // MODIFIED: Will hold { strategy, quantity }
      output_item_names: {},
      output_batches: {}, // MODIFIED: Will hold { strategy, quantity }
      processing_loss: processing_loss, 
      milling_loss: milling_loss,       
    };
    
    let current_process_input = 0;
    let current_process_output = 0;

    // 7. Loop through all matching rows to aggregate data
    for (const row of matchingRows) {
      // --- Process Inputs ---
      const inputQty = parseSafeFloat(row['Qty.']);
      if (inputQty > 0) {
        current_process_input += inputQty;
        
        const inputItemName = row['Item Name'];
        if (inputItemName) {
          process_object.input_item_names[inputItemName] = (process_object.input_item_names[inputItemName] || 0) + inputQty;
        }

        // --- MODIFIED: Aggregate input_batches with strategy ---
        const inputBatchNo = row['Batch No.'];
        if (inputBatchNo) {
          const strategy = row.InputStrategy || 'UNDEFINED'; // Use augmented strategy
          if (!process_object.input_batches[inputBatchNo]) {
            // If first time seeing this batch, create the object
            process_object.input_batches[inputBatchNo] = { strategy: strategy, quantity: 0 };
          }
          // Add the quantity
          process_object.input_batches[inputBatchNo].quantity += inputQty;
        }
      }

      // --- Process Outputs ---
      const outputQty = parseSafeFloat(row['Qty._1']);
      if (outputQty > 0) {
        current_process_output += outputQty;

        const outputItemName = row['Item Name_1'];
        if (outputItemName) {
          process_object.output_item_names[outputItemName] = (process_object.output_item_names[outputItemName] || 0) + outputQty;
        }

        // --- MODIFIED: Aggregate output_batches with strategy ---
        const outputBatchNo = row['Batch No._1'];
        if (outputBatchNo) {
          const strategy = row.OutputStrategy || 'UNDEFINED'; // Use augmented strategy
          if (!process_object.output_batches[outputBatchNo]) {
            // If first time seeing this batch, create the object
            process_object.output_batches[outputBatchNo] = { strategy: strategy, quantity: 0 };
          }
          // Add the quantity
          process_object.output_batches[outputBatchNo].quantity += outputQty;
        }
      }
    }

    // 8. Add the completed object to the list
    processObjectsList.push(process_object);
    
    // --- Add this process's totals to the grand totals ---
    total_input_quantity += current_process_input;
    total_output_quantity += current_process_output;
    total_milling_loss += milling_loss;
    total_processing_loss += processing_loss;
  }

  // 9. Return the final summary object
  return {
    processes: processObjectsList,
    total_input_quantity: total_input_quantity,
    total_output_quantity: total_output_quantity,
    total_milling_loss: total_milling_loss,
    total_processing_loss: total_processing_loss
  };
}

/**
 * Assembles the final StockSummary object by fetching the opening balance
 * and combining all provided metrics.
 * * @param processSummary The summary object from getProcessDetails
 * @param outbound_weight Total outbound weight
 * @param inbound_weight Total inbound weight (from STI processing)
 * @param adjustment_weight Total stock adjustment weight
 * @param xbs_closing The closing stock from the XBS file
 * @returns Promise<void> - This function will log the object.
 */
export async function assembleStockSummary(
  targetDate: Date,
  processSummary: ProcessSummary,
  outbound_weight: number,
  inbound_weight: number,
  adjustment_weight: number,
  xbs_closing: number,
): Promise<number> {

  console.log("[SUMMARY] Assembling daily stock summary...");

  // --- 1. Get total_opening_quantity ---
  let total_opening_quantity = 0;
  // Format the date for the DB query
  const summaryDateString = formatDateAsLocal_YYYYMMDD(targetDate);
  try {
    // This query fetches the closing stock of the DAY BEFORE the targetDate
    const openingQtyResult = await query<RowDataPacket[]>({
      query: `SELECT total_xbs_closing_stock 
              FROM daily_stock_summaries 
              WHERE date < ?
              ORDER BY date DESC 
              LIMIT 1`,
      values: [summaryDateString] // Use the formatted target date
    });

    if (openingQtyResult!=undefined && openingQtyResult.length > 0) {
      total_opening_quantity = parseSafeFloat(openingQtyResult[0].total_xbs_closing_stock);
      console.log(`[SUMMARY] Fetched opening quantity: ${total_opening_quantity}`);
    } else {
      console.warn("[SUMMARY] No previous summary found. Defaulting opening quantity to 0.");
    }
  } catch (e) {
     console.error("[SUMMARY] Error fetching opening quantity:", e);
     console.warn("[SUMMARY] Defaulting opening quantity to 0.");
  }

  // --- 2. Create the summary object ---
  // This object's keys are shaped to match your DB table schema
  const summaryData = {
    date: summaryDateString,
    total_opening_qty: total_opening_quantity,
    total_to_processing_qty: processSummary.total_input_quantity,
    total_from_processing_qty: processSummary.total_output_quantity,
    total_inbound_qty: inbound_weight,
    total_outbound_qty: outbound_weight,
    total_stock_adjustment_qty: adjustment_weight,
    total_xbs_closing_stock: xbs_closing,
    total_regrade_discrepancy: 0 ,
    total_loss_gain_qty: processSummary.total_processing_loss,
    total_milling_loss_qty: processSummary.total_milling_loss,
    
  };

  // --- 3. Save the object to the database ---
  // Use INSERT ... ON DUPLICATE KEY UPDATE to make this operation idempotent
  const dbInsertQuery = `
    INSERT INTO daily_stock_summaries (
      date, total_opening_qty, total_to_processing_qty, total_from_processing_qty,
      total_loss_gain_qty, total_inbound_qty, total_outbound_qty, 
      total_stock_adjustment_qty, total_xbs_closing_stock, total_regrade_discrepancy, total_milling_loss_qty
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      date = VALUES(date),
      total_opening_qty = VALUES(total_opening_qty),
      total_to_processing_qty = VALUES(total_to_processing_qty),
      total_from_processing_qty = VALUES(total_from_processing_qty),
      total_loss_gain_qty = VALUES(total_loss_gain_qty),
      total_inbound_qty = VALUES(total_inbound_qty),
      total_outbound_qty = VALUES(total_outbound_qty),
      total_stock_adjustment_qty = VALUES(total_stock_adjustment_qty),
      total_xbs_closing_stock = VALUES(total_xbs_closing_stock),
      total_regrade_discrepancy = VALUES(total_regrade_discrepancy),
      total_milling_loss_qty =  VALUES(total_milling_loss_qty)
  `;
  
  const dbValues = [
    summaryData.date,
    summaryData.total_opening_qty,
    summaryData.total_to_processing_qty,
    summaryData.total_from_processing_qty,
    summaryData.total_loss_gain_qty,
    summaryData.total_inbound_qty,
    summaryData.total_outbound_qty,
    summaryData.total_stock_adjustment_qty,
    summaryData.total_xbs_closing_stock,
    summaryData.total_regrade_discrepancy,
    summaryData.total_milling_loss_qty,
  ];

  try {
    console.log(`[SUMMARY] Inserting/Updating summary for date: ${summaryData.date}`);
    const result = await query<ResultSetHeader>({
      query: dbInsertQuery,
      values: dbValues
    });

    // result.insertId will be 0 on an UPDATE, 
    // but if it's an INSERT, it will be the new ID.
    // If it was an update, we need to get the ID.
    if (result!=undefined && result.insertId > 0) {
      console.log(`[SUMMARY] Successfully INSERTED summary. New ID: ${result.insertId}`);
      return result.insertId;
    } else {
      console.log(`[SUMMARY] Successfully UPDATED summary for date: ${summaryData.date}.`);
      // If it was an update, fetch the ID for that date
      const idResult = await query<RowDataPacket[]>({
        query: `SELECT id FROM daily_stock_summaries WHERE date = ?`,
        values: [summaryData.date]
      });
      const returnedId = idResult && idResult.length > 0 ? idResult[0].id : 0;
      console.log(`[SUMMARY] Returning existing ID: ${returnedId}`);
      return returnedId;
    }

  } catch (error) {
    console.error("[SUMMARY] Error saving summary to database:", error);
    throw error;
  }
}


export async function initialize_grade_strategy_activity_records(
  current_stock_summary: StockData,
  summary_id: number,
  targetDate: Date
): Promise<InitializedActivityRecords> {

  console.log("[INIT] Initializing grade and strategy activity records...");
  const new_grade_activity: DailyGradeActivity[] = [];
  const new_strategy_activity: DailyStrategyActivity[] = [];

  const summaryDateString = formatDateAsLocal_YYYYMMDD(targetDate);

  // --- 1. Process Grades ---
  console.log("current stock summary");
  console.log(current_stock_summary);
  for (const [grade, closing_balance] of Object.entries(current_stock_summary.grades_closing_balances)) {
    
    let opening_qty = 0;
    try {
      // Get the most recent xbs_closing_stock for this grade
      const prevStockResult = await query<RowDataPacket[]>({
        query: `SELECT xbs_closing_stock FROM daily_grade_activities WHERE grade = ? ORDER BY date DESC LIMIT 1`,
        values: [grade]
      });

      if (prevStockResult!=undefined && prevStockResult.length > 0) {
        opening_qty = parseSafeFloat(prevStockResult[0].xbs_closing_stock);
      }
    } catch (e) {
      console.error(`[INIT] Error fetching opening qty for grade ${grade}:`, e);
      // Continue with opening_qty = 0
    }

    new_grade_activity.push({
      summary_id: summary_id,
      date: summaryDateString,
      grade: grade,
      opening_qty: opening_qty,
      xbs_closing_stock: closing_balance,
      to_processing_qty: 0,
      from_processing_qty: 0,
      loss_gain_qty: 0,
      inbound_qty: 0,
      outbound_qty: 0,
      stock_adjustment_qty: 0,
      regrade_discrepancy: 0
    });
  }
  console.log(`[INIT] Initialized ${new_grade_activity.length} grade records.`);

  // --- 2. Process Strategies ---
  console.log("[INIT] Processing strategies_closing_balances...");
  for (const [strategy, closing_balance] of Object.entries(current_stock_summary.strategies_closing_balances)) {
    
    let opening_qty = 0;
    try {
      // Get the most recent xbs_closing_stock for this strategy
      const prevStockResult = await query<RowDataPacket[]>({
        query: `SELECT xbs_closing_stock 
                FROM daily_strategy_activities 
                WHERE strategy = ? 
                ORDER BY date DESC 
                LIMIT 1`,
        values: [strategy]
      });

      if (prevStockResult!= undefined && prevStockResult.length > 0) {
        opening_qty = parseSafeFloat(prevStockResult[0].xbs_closing_stock);
      }
    } catch (e) {
      console.error(`[INIT] Error fetching opening qty for strategy ${strategy}:`, e);
      // Continue with opening_qty = 0
    }

    new_strategy_activity.push({
      summary_id: summary_id,
      date: summaryDateString,
      strategy: strategy,
      opening_qty: opening_qty,
      xbs_closing_stock: closing_balance,
      // Set all other activity fields to 0 per your instructions
      to_processing_qty: 0,
      from_processing_qty: 0,
      loss_gain_qty: 0,
      inbound_qty: 0,
      outbound_qty: 0,
      stock_adjustment_qty: 0,
      regrade_discrepancy: 0
    });
  }
  console.log(`[INIT] Initialized ${new_strategy_activity.length} strategy records.`);

  // --- 3. Return the two lists ---
  return {
    new_grade_activity,
    new_strategy_activity
  };
}

export async function debit_credit_processing(
  new_activity_list: InitializedActivityRecords,
  summary_id: number,
  processing_summary_object: ProcessSummary,
  targetDate: Date 
): Promise<InitializedActivityRecords> { 

  // --- FIX: Extract the 'processes' array from the input object ---
  const processing_summaries = processing_summary_object.processes;
  // ---

  if (!processing_summaries || typeof processing_summaries.length !== 'number') {
    console.error("[DEBIT/CREDIT] Error: 'processing_summaries' is not an iterable array.", processing_summary_object);
    return new_activity_list; // Return the original list
  }
  
  console.log(`[DEBIT/CREDIT] Starting processing for ${processing_summaries.length} processes...`);

  // --- Main loop for each process (e.g., Milling, Sorting) ---
  for (const process_object of processing_summaries) { 
    
    // --- 1. Calculate parent process totals ---
    // Recalculate total input from the new batch structure
    const total_process_input_qty = Object.values(process_object.input_batches).reduce((acc, batch) => acc + batch.quantity, 0);
    const total_process_output_qty = Object.values(process_object.output_batches).reduce((acc, batch) => acc + batch.quantity, 0);
    
    const milling_loss = parseSafeFloat(process_object.milling_loss);
    const processing_loss = parseSafeFloat(process_object.processing_loss);
    const total_process_loss = milling_loss + processing_loss;

    console.log(`[DEBIT/CREDIT] Processing Process No: ${process_object.process_number}`);
    console.log(`  -> Total Input: ${total_process_input_qty}, Total Output: ${total_process_output_qty}, Total Loss: ${total_process_loss}`);

    // --- 2. Create the parent 'daily_processes' row ---
    const processInsertQuery = `
      INSERT INTO daily_processes (
        summary_id, processing_date, process_type, process_number,
        input_qty, output_qty, milling_loss, processing_loss_gain_qty
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    let new_process_id: number=0;
    try {
      const result = await query<ResultSetHeader>({
        query: processInsertQuery,
        values: [
          summary_id,
          // --- FIX: Convert string back to Date before formatting ---
          process_object.processing_date ? formatDateAsLocal_YYYYMMDD(new Date(process_object.processing_date)) : null,
          process_object.process_type,
          process_object.process_number,
          total_process_input_qty,
          total_process_output_qty,
          milling_loss,
          processing_loss
        ]
      });
      if (result) {
        new_process_id = result.insertId;
      }
      
      console.log(`  -> Created 'daily_processes' row with ID: ${new_process_id}`);
    } catch (error) {
      console.error(`[DEBIT/CREDIT] Failed to create 'daily_processes' row for ${process_object.process_number}. Skipping this process.`, error);
      continue; // Skip to the next process
    }

    // --- 3. START: MODIFIED GRADE LOGIC ---
    const grade_processing_rows_to_insert = [];

    // Get a unique set of all grades involved (both inputs and outputs)
    const all_grades_in_process = new Set([
      ...Object.keys(process_object.input_item_names),
      ...Object.keys(process_object.output_item_names)
    ]);

    console.log(`  -> Found ${all_grades_in_process.size} unique grades for this process.`);

    // Loop through the combined set of all grades
    for (const grade of all_grades_in_process) {
      
      const activity_grade = new_activity_list.new_grade_activity.find(g => g.grade === grade);

      if (!activity_grade) {
        console.warn(`  -> Grade '${grade}' found in process but not in closing stock summary. Skipping.`);
        continue;
      }

      // 4. Calculate values
      const grade_input_qty = process_object.input_item_names[grade] || 0;
      const grade_output_qty = process_object.output_item_names[grade] || 0;
      
      let grade_allocated_loss = 0;
      if (total_process_input_qty > 0 && grade_input_qty > 0) { // Loss is only allocated to inputs
        grade_allocated_loss = (grade_input_qty / total_process_input_qty) * total_process_loss;
      }
      
      // 5. Update activity list in memory
      activity_grade.to_processing_qty += grade_input_qty;
      activity_grade.from_processing_qty += grade_output_qty;
      activity_grade.loss_gain_qty += grade_allocated_loss;

      // 6. Create row object
      // (The schema provided has no 'batch_number', so it is omitted)
      const newGradeProcessRow = [
        new_process_id,
        grade,
        grade_input_qty,
        grade_output_qty,
        grade_allocated_loss
      ];
      grade_processing_rows_to_insert.push(newGradeProcessRow);
    }
    // --- 3. END: MODIFIED GRADE LOGIC ---
    
    // 7. Batch insert grade rows
    if (grade_processing_rows_to_insert.length > 0) {
      try {
        const gradeInsertQuery = `
          INSERT INTO daily_grade_processing (
            process_id, grade, input_qty, output_qty, processing_loss_gain_qty
          ) VALUES ?
        `;
        await query<ResultSetHeader>({
          query: gradeInsertQuery,
          values: [grade_processing_rows_to_insert] // Pass as 3D array
        });
        console.log(`  -> Inserted ${grade_processing_rows_to_insert.length} 'daily_grade_processing' rows.`);
      } catch (error) {
        console.error(`[DEBIT/CREDIT] Failed to batch insert 'daily_grade_processing' rows for process ID ${new_process_id}.`, error);
      }
    }

    // --- 8. MODIFIED: Loop through strategies to create 'daily_strategy_processing' rows ---
    const strategy_processing_rows_to_insert = [];
    
    // Get all unique batch numbers from both inputs and outputs for this process
    const all_batch_numbers = new Set([
      ...Object.keys(process_object.input_batches),
      ...Object.keys(process_object.output_batches)
    ]);

    for (const batch_number of all_batch_numbers) {
      const input_details = process_object.input_batches[batch_number];
      const output_details = process_object.output_batches[batch_number];

      // Get quantities
      const batch_input_qty = input_details?.quantity || 0;
      const batch_output_qty = output_details?.quantity || 0;
      
      // Determine strategy (prioritize input, then output, then undefined)
      const strategy = input_details?.strategy || output_details?.strategy || 'UNDEFINED';

      // --- START FIX: Find or Create logic ---
      let activity_strategy = new_activity_list.new_strategy_activity.find(s => s.strategy === strategy);

      // If the strategy doesn't exist in our activity list, create it in memory
      if (!activity_strategy) {
        console.warn(`  -> Strategy '${strategy}' for batch '${batch_number}' not found. Creating a new activity record for it...`);
        
        const summaryDateString = formatDateAsLocal_YYYYMMDD(targetDate);

        activity_strategy = {
          summary_id: summary_id,
          date: summaryDateString,
          strategy: strategy,
          opening_qty: 0, // No opening stock for a new strategy
          xbs_closing_stock: 0, // Will be calculated later
          to_processing_qty: 0,
          from_processing_qty: 0,
          loss_gain_qty: 0,
          inbound_qty: 0,
          outbound_qty: 0,
          stock_adjustment_qty: 0,
          regrade_discrepancy: 0
        };
        // Add this new object to the main list so it's included in the return value
        new_activity_list.new_strategy_activity.push(activity_strategy);
      }
      // --- END FIX ---

      // Allocate loss based on this batch's share of the total input
      let batch_allocated_loss = 0;
      if (total_process_input_qty > 0 && batch_input_qty > 0) { // Loss is only allocated to inputs
        batch_allocated_loss = (batch_input_qty / total_process_input_qty) * total_process_loss;
      }

      // Update the main strategy activity list in memory
      activity_strategy.to_processing_qty += batch_input_qty;
      activity_strategy.from_processing_qty += batch_output_qty;
      activity_strategy.loss_gain_qty += batch_allocated_loss;

      // Create the 'daily_strategy_processing' row object
      const newStrategyProcessRow = [
        new_process_id,
        strategy,
        batch_number,
        batch_input_qty,
        batch_output_qty,
        batch_allocated_loss
      ];
      strategy_processing_rows_to_insert.push(newStrategyProcessRow);
    }

    // 9. Batch insert all strategy rows for this process
    if (strategy_processing_rows_to_insert.length > 0) {
      try {
        const strategyInsertQuery = `
          INSERT INTO daily_strategy_processing (
            process_id, strategy, batch_number, input_qty, output_qty, processing_loss_gain_qty
          ) VALUES ?
        `;
        await query<ResultSetHeader>({
          query: strategyInsertQuery,
          values: [strategy_processing_rows_to_insert] // Pass as 3D array
        });
        console.log(`  -> Inserted ${strategy_processing_rows_to_insert.length} 'daily_strategy_processing' rows.`);
      } catch (error) {
        console.error(`[DEBIT/CREDIT] Failed to batch insert 'daily_strategy_processing' rows for process ID ${new_process_id}.`, error);
      }
    }
  }

  console.log("[DEBIT/CREDIT] Finished processing all processes.");
  
  // --- 10. Return the updated activity list object ---
  return new_activity_list;
}

export async function update_daily_summary(
    summary_id: number,
    processSummary: ProcessSummary,
    outbound_weight: number,
    inbound_weight: number,
    adjustment_weight: number,
    xbs_closing: number
): Promise<ResultSetHeader | undefined> {

    console.log(`Process summary: ${processSummary}`);

    const updateQuery = `
        UPDATE daily_stock_summaries
        SET
            total_to_processing_qty = ?,
            total_from_processing_qty = ?,
            total_loss_gain_qty = ?,
            total_inbound_qty = ?,
            total_outbound_qty = ?,
            total_stock_adjustment_qty = ?,
            total_xbs_closing_stock = ?,
            total_regrade_discrepancy = 0, -- Set to 0 per logic
            total_milling_loss_qty = ?
        WHERE
            id = ?
    `;

    const dbValues = [
        processSummary.total_input_quantity,
        processSummary.total_output_quantity,
        processSummary.total_processing_loss,
        inbound_weight,
        outbound_weight,
        adjustment_weight,
        xbs_closing,
        processSummary.total_milling_loss,
        summary_id // The WHERE clause ID
    ];

    try {
        const result = await query<ResultSetHeader>({
            query: updateQuery,
            values: dbValues
        });

        if (result) {
          console.log(`[UPDATE SUMMARY] Successfully updated summary ID: ${summary_id}. Rows affected: ${result.affectedRows}`);
          return result;
        }

        else{
          return;
        }
        
        

    } catch (error) {
        console.error(`[UPDATE SUMMARY] Error updating summary ID: ${summary_id}:`, error);
        throw error;
    }
}

/**
 * Helper function to update a single table with new strategies
 */
async function updateTable(
  tableName: string,
  strategyColumn: string,
  batchColumn: string,
  strategyMap: Map<string, string>
) {
  console.log(`[SYNC] Checking table: ${tableName}`);
  let updatedCount = 0;
  
  try {
    // 1. Find all rows in this table with an 'UNDEFINED' strategy
    const undefinedRows = await query<RowDataPacket[]>({
      query: `SELECT id, \`${batchColumn}\` FROM \`${tableName}\` WHERE \`${strategyColumn}\` = 'UNDEFINED'`,
      values: [],
    }) as UndefinedRow[]; // Cast to our expected type

    if (undefinedRows.length === 0) {
      console.log(`[SYNC] No 'UNDEFINED' strategies found in ${tableName}.`);
      return;
    }

    console.log(`[SYNC] Found ${undefinedRows.length} 'UNDEFINED' rows in ${tableName}. Checking against map...`);
    
    const updatePromises: Promise<any>[] = [];

    // 2. Loop through the rows that need fixing
    for (const row of undefinedRows) {
      if (!row.batch_number) continue; // Skip if batch number is null

      const batchNo = row.batch_number.toUpperCase();
      const newStrategy = strategyMap.get(batchNo); // Look up in our map

      // 3. If we found a match, create an update query
      if (newStrategy) {
        updatedCount++;
        updatePromises.push(
          query<ResultSetHeader>({
            query: `UPDATE \`${tableName}\` SET \`${strategyColumn}\` = ? WHERE id = ?`,
            values: [newStrategy, row.id],
          })
        );
      }
    }

    // 4. Run all updates in parallel
    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }
    
    console.log(`[SYNC] Successfully updated ${updatedCount} rows in ${tableName}.`);

  } catch (error) {
    console.error(`[SYNC] Error updating ${tableName}:`, error);
    // Continue to the next table
  }
}


/**
 * Reads a list of stock files and updates 'UNDEFINED' strategies
 * across multiple database tables.
 * @param files An array of File objects (Excel and CSV)
 */
export async function updateUndefinedStrategies(files: File[]): Promise<void> {
  console.log(`[SYNC] Starting to update undefined strategies using ${files.length} files...`);

  // --- 1. Build Master Strategy Lookup Map ---
  const strategyMap = new Map<string, string>();
  console.log('[SYNC] Building strategy lookup map from files...');

  for (const file of files) {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'buffer' });

      // Loop through every sheet in the file
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) continue;

        let rows: StrategyRow[] = [];
        
        // Use specified header row based on file type
        if (file.name.toLowerCase().endsWith('.csv')) {
          rows = XLSX.utils.sheet_to_json<StrategyRow>(worksheet, { range: 0 }); // Header on row 1
        } else if (file.name.toLowerCase().endsWith('.xlsx')) {
          rows = XLSX.utils.sheet_to_json<StrategyRow>(worksheet, { range: 1 }); // Header on row 2
        } else {
          continue; // Skip unsupported files
        }

        // Add rows to our master map
        for (const row of rows) {
          const batchNo = row['Batch No.']?.toString().toUpperCase();
          const strategy = row['Position Strategy Allocation']?.toString();
          
          if (batchNo && strategy) {
            // Overwrite existing entries, assuming later files are newer
            strategyMap.set(batchNo, strategy);
          }
        }
      }
      console.log(`[SYNC] Processed file: ${file.name}`);
    } catch (error) {
      console.error(`[SYNC] Failed to read file ${file.name}:`, error);
    }
  }
  console.log(`[SYNC] Strategy map built successfully with ${strategyMap.size} unique entries.`);

  // --- 2. Update Database Tables ---
  await updateTable(
    'daily_outbounds', 
    'dispatched_strategy', 
    'batch_number', 
    strategyMap
  );

  await updateTable(
    'daily_strategy_processing', 
    'strategy', 
    'batch_number', 
    strategyMap
  );

  await updateTable(
    'instructed_batches', 
    'strategy', 
    'batch_number', 
    strategyMap
  );

  await updateTable(
    'stock_adjustment', 
    'strategy', 
    'batch_number', 
    strategyMap
  );

  console.log('[SYNC] Finished updating all tables.');
}


/**
 * Calculates all daily stock movements for new grade activities based on transaction tables,
 * determines opening and closing stock, calculates discrepancy, and saves the final records.
 *
 * @param new_activities The initialized activity records containing the list of grades to calculate.
 * @param stocksdata The stocks data including the current xbs_closing_stock values.
 * @param summary_id The ID linking the activities to the parent daily summary.
 */
export async function update_grade_stock_movements(
  new_activities: InitializedActivityRecords,
  stocksdata: StockData,
  summary_id: number,
): Promise<void> {
  const { new_grade_activity } = new_activities;
  const todayDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  if (new_grade_activity.length === 0) {
    console.log('No new grade activities to process.');
    return;
  }

  // --- 1. Fetch Aggregated Transaction Data (Efficiency Improvement) ---

  // 1a. Processing (to_processing_qty, from_processing_qty, loss_gain_qty)
  const processingQuery = `
    SELECT
        dgp.grade,
        SUM(dgp.input_qty) AS total_to_processing,
        SUM(dgp.output_qty) AS total_from_processing,
        SUM(dgp.processing_loss_gain_qty) AS total_loss_gain
    FROM daily_processes dp
    JOIN daily_grade_processing dgp ON dp.id = dgp.process_id
    WHERE dp.summary_id = ?
    GROUP BY dgp.grade
  `;
  const processingResults = (await query<GradeProcessingTotals[]>({
    query: processingQuery,
    values: [summary_id],
  })) || [];
  const processingMap = new Map(
    processingResults.map((row) => [row.grade, row]),
  );

  // 1b. Inbound (inbound_qty)
  const inboundQuery = `
    SELECT
        grade,
        SUM(delivered_qty) AS total_inbound
    FROM instructed_batches
    WHERE summary_id = ?
    GROUP BY grade
  `;
  const inboundResults = (await query<GradeInboundTotals[]>({
    query: inboundQuery,
    values: [summary_id],
  })) || [];
  const inboundMap = new Map(inboundResults.map((row) => [row.grade, row.total_inbound]));

  // 1c. Outbound (outbound_qty)
  const outboundQuery = `
    SELECT
        dispatched_grade,
        SUM(dispatched_quantity) AS total_outbound
    FROM daily_outbounds
    WHERE summary_id = ?
    GROUP BY dispatched_grade
  `;
  const outboundResults = (await query<GradeOutboundTotals[]>({
    query: outboundQuery,
    values: [summary_id],
  })) || [];
  const outboundMap = new Map(
    outboundResults.map((row) => [row.dispatched_grade, row.total_outbound]),
  );

  // 1d. Stock Adjustment (stock_adjustment_qty)
  const adjustmentQuery = `
    SELECT
        grade,
        SUM(adjusted_quantity) AS total_adjustment
    FROM stock_adjustment
    WHERE summary_id = ?
    GROUP BY grade
  `;
  const adjustmentResults = (await query<GradeAdjustmentTotals[]>({
    query: adjustmentQuery,
    values: [summary_id],
  })) || [];
  const adjustmentMap = new Map(
    adjustmentResults.map((row) => [row.grade, row.total_adjustment]),
  );


  // --- 2. Iterate, Calculate, and Update Each Activity Record ---

  for (const activity of new_grade_activity) {
    const grade = activity.grade;

    // Set defaults and metadata
    activity.date = todayDate;
    activity.summary_id = summary_id;

    // 2a. Apply Aggregated Transaction Quantities
    const procData = processingMap.get(grade);
    // FIX: Use Number() to ensure all transaction quantities are numeric before calculation.
    activity.to_processing_qty = Number(procData?.total_to_processing) || 0;
    activity.from_processing_qty = Number(procData?.total_from_processing) || 0;
    activity.loss_gain_qty = Number(procData?.total_loss_gain) || 0;
    
    activity.inbound_qty = Number(inboundMap.get(grade)) || 0;
    activity.outbound_qty = Number(outboundMap.get(grade)) || 0;
    activity.stock_adjustment_qty = Number(adjustmentMap.get(grade)) || 0;

    // 2b. xbs_closing_stock (From Stocks Data)
    // FIX: Ensure closing stock is also numeric
    activity.xbs_closing_stock = Number(stocksdata.grades_closing_balances[grade]) || 0;

    // 2c. opening_qty (From Previous Day's Closing Stock)
    const openingQtyQuery = `
      SELECT xbs_closing_stock
      FROM daily_grade_activities
      WHERE grade = ?
      ORDER BY date DESC
      LIMIT 1
    `;
    const prevStockResult = (await query<PreviousClosingStock[]>({
      query: openingQtyQuery,
      values: [grade],
    })) || [];

    // FIX: Ensure previous day's closing stock is numeric
    activity.opening_qty = Number(prevStockResult[0]?.xbs_closing_stock) || 0;

    // 2d. regrade_discrepancy (Final Calculation)
    // Formula: xbs_closing_stock - ((opening_qty + from_processing_qty + loss_gain_qty + inbound_qty + stock_adjustment_qty) - (to_processing_qty + outbound_qty ))
    
    const additions =
      activity.opening_qty +
      activity.from_processing_qty +
      activity.loss_gain_qty +
      activity.inbound_qty +
      activity.stock_adjustment_qty;

    const subtractions =
      activity.to_processing_qty +
      activity.outbound_qty;

    const calculatedClosing = additions - subtractions;

    activity.regrade_discrepancy = activity.xbs_closing_stock - calculatedClosing;
  }

  // --- 3. Save All Updated Records (Bulk Insert) ---

  const gradeFields = [
    'summary_id', 'date', 'grade', 'opening_qty', 'to_processing_qty',
    'from_processing_qty', 'loss_gain_qty', 'inbound_qty', 'outbound_qty',
    'stock_adjustment_qty', 'xbs_closing_stock', 'regrade_discrepancy',
  ];

  const valuesPlaceholder = new_grade_activity.map(() => `(${gradeFields.map(() => '?').join(', ')})`).join(', ');
  
  const allValues: (string | number)[] = new_grade_activity.flatMap((activity) => [
    activity.summary_id, activity.date, activity.grade, activity.opening_qty, activity.to_processing_qty,
    activity.from_processing_qty, activity.loss_gain_qty, activity.inbound_qty, activity.outbound_qty,
    activity.stock_adjustment_qty, activity.xbs_closing_stock, activity.regrade_discrepancy,
  ]);
  
  const insertQuery = `
    INSERT INTO daily_grade_activities (${gradeFields.join(', ')})
    VALUES ${valuesPlaceholder}
  `;

  try {
    const result = await query<ResultSetHeader>({
      query: insertQuery,
      values: allValues,
    });
    console.log(`Successfully inserted ${result?.affectedRows} grade activity records.`);
  } catch (error) {
    console.error('Failed to insert daily_grade_activities:', error);
    throw new Error('Database insertion failed for grade activities.');
  }

  // NOTE: Logic for daily_strategy_activities was not provided and is skipped.
}



/**
 * Calculates all daily stock movements for new strategy activities based on transaction tables,
 * determines opening and closing stock, calculates discrepancy, and saves the final records.
 *
 * @param new_activities The initialized activity records containing the list of strategy to calculate.
 * @param stocksdata The stocks data including the current xbs_closing_stock values.
 * @param summary_id The ID linking the activities to the parent daily summary.
 */
export async function update_strategy_stock_movements(
  new_activities: InitializedActivityRecords,
  stocksdata: StockData,
  summary_id: number,
): Promise<void> {
  const { new_strategy_activity } = new_activities;
  const todayDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  if (new_strategy_activity.length === 0) {
    console.log('No new strategy activities to process.');
    return;
  }


  // 1a. Processing (to_processing_qty, from_processing_qty, loss_gain_qty)
  const processingQuery = `
    SELECT
        dsp.strategy,
        SUM(dsp.input_qty) AS total_to_processing,
        SUM(dsp.output_qty) AS total_from_processing,
        SUM(dsp.processing_loss_gain_qty) AS total_loss_gain
    FROM daily_processes dp
    JOIN daily_strategy_processing dsp ON dp.id = dsp.process_id
    WHERE dp.summary_id = ?
    GROUP BY dsp.strategy
  `;
  const processingResults = (await query<StrategyProcessingTotals[]>({
    query: processingQuery,
    values: [summary_id],
  })) || [];
  const processingMap = new Map(
    processingResults.map((row) => [row.strategy, row]),
  );

  // 1b. Inbound (inbound_qty)
  const inboundQuery = `
    SELECT
        strategy,
        SUM(delivered_qty) AS total_inbound
    FROM instructed_batches
    WHERE summary_id = ?
    GROUP BY strategy
  `;
  const inboundResults = (await query<StrategyInboundTotals[]>({
    query: inboundQuery,
    values: [summary_id],
  })) || [];
  const inboundMap = new Map(inboundResults.map((row) => [row.strategy, row.total_inbound]));

  // 1c. Outbound (outbound_qty)
  const outboundQuery = `
    SELECT
        dispatched_strategy,
        SUM(dispatched_quantity) AS total_outbound
    FROM daily_outbounds
    WHERE summary_id = ?
    GROUP BY dispatched_strategy
  `;
  const outboundResults = (await query<StrategyOutboundTotals[]>({
    query: outboundQuery,
    values: [summary_id],
  })) || [];
  const outboundMap = new Map(
    outboundResults.map((row) => [row.dispatched_strategy, row.total_outbound]),
  );

  // 1d. Stock Adjustment (stock_adjustment_qty)
  const adjustmentQuery = `
    SELECT
        strategy,
        SUM(adjusted_quantity) AS total_adjustment
    FROM stock_adjustment
    WHERE summary_id = ?
    GROUP BY strategy
  `;
  const adjustmentResults = (await query<StrategyAdjustmentTotals[]>({
    query: adjustmentQuery,
    values: [summary_id],
  })) || [];
  const adjustmentMap = new Map(
    adjustmentResults.map((row) => [row.strategy, row.total_adjustment]),
  );


  // --- 2. Iterate, Calculate, and Update Each Activity Record ---

  for (const activity of new_strategy_activity) {
    const strategy = activity.strategy;

    // Set defaults and metadata
    activity.date = todayDate;
    activity.summary_id = summary_id;

    // 2a. Apply Aggregated Transaction Quantities
    const procData = processingMap.get(strategy);
    // FIX: Use Number() to ensure all transaction quantities are numeric before calculation.
    activity.to_processing_qty = Number(procData?.total_to_processing) || 0;
    activity.from_processing_qty = Number(procData?.total_from_processing) || 0;
    activity.loss_gain_qty = Number(procData?.total_loss_gain) || 0;
    
    activity.inbound_qty = Number(inboundMap.get(strategy)) || 0;
    activity.outbound_qty = Number(outboundMap.get(strategy)) || 0;
    activity.stock_adjustment_qty = Number(adjustmentMap.get(strategy)) || 0;

    // 2b. xbs_closing_stock (From Stocks Data)
    // FIX: Ensure closing stock is also numeric
    activity.xbs_closing_stock = Number(stocksdata.strategies_closing_balances[strategy]) || 0;

    // 2c. opening_qty (From Previous Day's Closing Stock)
    const openingQtyQuery = `
      SELECT xbs_closing_stock
      FROM daily_strategy_activities
      WHERE strategy = ?
      ORDER BY date DESC
      LIMIT 1
    `;
    const prevStockResult = (await query<PreviousClosingStock[]>({
      query: openingQtyQuery,
      values: [strategy],
    })) || [];

    // FIX: Ensure previous day's closing stock is numeric
    activity.opening_qty = Number(prevStockResult[0]?.xbs_closing_stock) || 0;

    // 2d. regrade_discrepancy (Final Calculation)
    // Formula: xbs_closing_stock - ((opening_qty + from_processing_qty + loss_gain_qty + inbound_qty + stock_adjustment_qty) - (to_processing_qty + outbound_qty ))
    
    const additions =
      activity.opening_qty +
      activity.from_processing_qty +
      activity.loss_gain_qty +
      activity.inbound_qty +
      activity.stock_adjustment_qty;

    const subtractions =
      activity.to_processing_qty +
      activity.outbound_qty;

    const calculatedClosing = additions - subtractions;

    activity.regrade_discrepancy = activity.xbs_closing_stock - calculatedClosing;
  }

  // --- 3. Save All Updated Records (Bulk Insert) ---

  const strategyFields = [
    'summary_id', 'date', 'strategy', 'opening_qty', 'to_processing_qty',
    'from_processing_qty', 'loss_gain_qty', 'inbound_qty', 'outbound_qty',
    'stock_adjustment_qty', 'xbs_closing_stock', 'regrade_discrepancy',
  ];

  const valuesPlaceholder = new_strategy_activity.map(() => `(${strategyFields.map(() => '?').join(', ')})`).join(', ');
  
  const allValues: (string | number)[] = new_strategy_activity.flatMap((activity) => [
    activity.summary_id, activity.date, activity.strategy, activity.opening_qty, activity.to_processing_qty,
    activity.from_processing_qty, activity.loss_gain_qty, activity.inbound_qty, activity.outbound_qty,
    activity.stock_adjustment_qty, activity.xbs_closing_stock, activity.regrade_discrepancy,
  ]);
  
  const insertQuery = `
    INSERT INTO daily_strategy_activities (${strategyFields.join(', ')}) VALUES ${valuesPlaceholder} `;

  try {
    const result = await query<ResultSetHeader>({
      query: insertQuery,
      values: allValues,
    });
    console.log(`Successfully inserted ${result?.affectedRows} strategy activity records.`);
  } catch (error) {
    console.error('Failed to insert daily_strategy_activities:', error);
    throw new Error('Database insertion failed for strategy activities.');
  }

  // NOTE: Logic for daily_strategy_activities was not provided and is skipped.
}