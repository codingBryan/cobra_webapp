import * as XLSX from 'xlsx';

// Define the structure of an aggregated process object for type safety
interface ProcessDetail {
  process_number: string;
  process_type: string;
  issue_date: Date | null;
  processing_date: Date | null;
  input_item_names: Record<string, number>;
  input_strategies: Record<string, number>;
  output_item_names: Record<string, number>;
  output_strategies: Record<string, number>;
}

// Define the structure of a single row read from the Excel sheet
interface ProcessRow {
  'Process No.': string;
  'Process Name': string;
  'Issue Date': number | string | Date; // Excel date can be number or string
  'Receipt Date': number | string | Date; // Excel date can be number or string
  'Item Name': string;
  'Qty.': number;
  'Position Strategy Allocation': string;
  'Item Name_1': string;
  'Batch No._1': string;
  'Qty._1': number;
  [key: string]: any; // Allow other properties
}


/**
 * Converts an Excel serial date number to a JavaScript Date object.
 * Returns null if the input is not a positive number or results in an invalid date.
 * @param excelSerial The Excel date serial number.
 * @returns A Date object or null.
 */
function convertExcelDate(excelSerial: number | string): Date | null {
  // Ensure we are working with a positive number
  if (typeof excelSerial !== 'number' || excelSerial <= 0) {
    return null;
  }
  
  // 25569 is the number of days between the Excel epoch (1899-12-30) and JS epoch (1970-01-01).
  const daysSinceEpoch = excelSerial - 25569;
  
  // 86400000 is the number of milliseconds in a day.
  const milliseconds = daysSinceEpoch * 86400000;
  const date = new Date(milliseconds);

  // Check for validity
  return isNaN(date.getTime()) ? null : date;
}


/**
 * Reads and processes the uploaded 'processing_analysis_file'.
 * * @param sinceDate The Date object to filter data after (e.g., last daily run date).
 * @param uploadedFile The browser's File object for the 'processing_analysis_file'.
 * @returns A promise that resolves to an array of aggregated ProcessDetail objects.
 */
export async function getProcessDetails(sinceDate: Date,uploadedFile: File): Promise<ProcessDetail[]> {
  try {
    if (!uploadedFile) {
      console.warn("No 'processing_analysis_file' was provided.");
      return [];
    }

    // --- STEP 1: Read the file using SheetJS in a browser-compatible way ---
    const buffer = await uploadedFile.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const sheetName = 'Processing Analysis';
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      throw new Error(`Worksheet "${sheetName}" not found in the Excel file. Please check the sheet name for exact spelling and case.`);
    }

    // --- STEP 2: Convert sheet to an array of objects ---
    const allRows: ProcessRow[] = XLSX.utils.sheet_to_json<ProcessRow>(worksheet, { range: 1 });

    if (allRows.length === 0) {
      console.warn(`Worksheet "${sheetName}" is empty or headers could not be read.`);
      return [];
    }

    // --- STEP 3: Filter data by 'Receipt Date' ---
    let checkedDateFilter = false;
    const dateFilteredRows = allRows.filter((row: ProcessRow) => {
      const receiptDateValue = row['Receipt Date'];
      let dateForComparison: Date | null = null;

      // Handle Excel serial number date
      if (typeof receiptDateValue === 'number') {
        dateForComparison = convertExcelDate(receiptDateValue);
      }
      // Handle date string (fallback)
      else if (typeof receiptDateValue === 'string') {
        const parsedDate = new Date(receiptDateValue);
        dateForComparison = isNaN(parsedDate.getTime()) ? null : parsedDate;
      }
      // Handle pre-existing Date object
      else if (receiptDateValue instanceof Date) {
        dateForComparison = receiptDateValue;
      }

      // --- NEW: Diagnostic logging (runs once) ---
      if (!checkedDateFilter && allRows.length > 0) {
        console.log(`\n--- Date Filter Diagnostic ---`);
        console.log(`Checking against sinceDate: ${sinceDate.toISOString()}`);
        console.log(`Original 'Receipt Date' in file:`, receiptDateValue);
        console.log(`Converted 'Receipt Date':`, dateForComparison ? dateForComparison.toISOString() : dateForComparison);
        console.log(`------------------------------\n`);
        checkedDateFilter = true;
      }
      // --- END NEW ---

      // Check if it's a valid date object and meets the filter criteria
      return dateForComparison instanceof Date && dateForComparison > sinceDate;
    });

    // --- STEP 4: Get unique 'Process No.' values ---
    const uniqueProcessNumbers = [...new Set(dateFilteredRows.map(row => row['Process No.'].toString()))];

    if (uniqueProcessNumbers.length === 0) {
      console.warn('No processes found matching the date filter.');
      return [];
    }

    const processObjectsList: ProcessDetail[] = [];

    // --- STEP 5: Loop for each unique process number ---
    for (const processNo of uniqueProcessNumbers) {
      if (!processNo) continue;

      // Filter rows that have been date-filtered
      const matchingRows = dateFilteredRows.filter(row => row['Process No.'].toString() === processNo);

      if (matchingRows.length === 0) {
        continue;
      }

      const firstRow = matchingRows[0];

      // 6. Create the base process object
      const issueDateValue = firstRow['Issue Date'];
      const processingDateValue = firstRow['Receipt Date'];

      const process_object: ProcessDetail = {
        process_number: firstRow['Process No.'].toString(),
        process_type: firstRow['Process Name'],
        // Convert dates, expecting null if it's not a number
        issue_date: typeof issueDateValue === 'number' ? convertExcelDate(issueDateValue) : null,
        processing_date: typeof processingDateValue === 'number' ? convertExcelDate(processingDateValue) : null,
        input_item_names: {},
        input_strategies: {},
        output_item_names: {},
        output_strategies: {}
      };

      // 7. Loop through all matching rows to aggregate data
      for (const row of matchingRows) {
        // --- Process Inputs ---
        // Ensure Qty. is treated as a number
        const inputQty = parseFloat(row['Qty.'].toString() || '0');
        if (!isNaN(inputQty) && inputQty > 0) {
          // A. Aggregate input_item_names
          const inputItemName = row['Item Name'];
          if (inputItemName) {
            process_object.input_item_names[inputItemName] = (process_object.input_item_names[inputItemName] || 0) + inputQty;
          }

          // B. Aggregate input_strategies
          const inputStrategy = row['Position Strategy Allocation'];
          if (inputStrategy) {
            process_object.input_strategies[inputStrategy] = (process_object.input_strategies[inputStrategy] || 0) + inputQty;
          }
        }

        // --- Process Outputs ---
        // Ensure Qty._1 is treated as a number
        const outputQty = parseFloat(row['Qty._1']?.toString() || '0');

        if (!isNaN(outputQty) && outputQty > 0) {
          // C. Aggregate output_item_names
          const outputItemName = row['Item Name_1'];
          if (outputItemName) {
            process_object.output_item_names[outputItemName] = (process_object.output_item_names[outputItemName] || 0) + outputQty;
          }

          // D. Aggregate output_strategies
          const outputBatchNumber = row['Batch No._1'];
          if (outputBatchNumber) {
            process_object.output_strategies[outputBatchNumber] = (process_object.output_strategies[outputBatchNumber] || 0) + outputQty;
          }
        }
      }

      // 8. Add the completed object to the list
      processObjectsList.push(process_object);
    }

    // 9. Return the final list
    return processObjectsList;

  } catch (error) {
    console.error(`Error in getProcessDetails: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}