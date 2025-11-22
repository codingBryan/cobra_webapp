import React, { useState, useRef, useCallback } from 'react';
import type { SVGProps } from 'react';
// TypeScript declaration to tell the compiler that XLSX exists globally
import * as XLSX from 'xlsx';

// --- INTERFACE DEFINITIONS ---

/**
 * Defines the structure for a single batch item (row data) from the DS Sheet.
 */
interface BatchItem {
    mark: string | number | null;
    grade: string | number | null;
    cost: string | number | null; // Source for cost_usd_50
    differential: string | number | null; // Source for diff_usc_lb
}

/**
 * Defines the structure for the data extracted from a single 'DS' sheet.
 */
interface SheetData {
    fileName: string; 
    sheetName: string;
    hegde_level: string | number | null; // Source for hedge_usc_lb
    date: string | number | null; // Source for trade_month
    batch_list: BatchItem[];
}

/**
 * New interface for rows filtered from the "Database" sheet.
 */
interface DatabaseBatchItem {
    lot: string | number | null;
    grade: string | number | null;
    price: string | number | null;      // Source for cost_usd_50
    market_level: string | number | null; // Source for hedge_usc_lb
    differential: string | number | null; // Source for diff_usc_lb
    cert: string | number | null;       // Source for certification
}

/**
 * New interface for the Database Sheet summary, including its filtered list.
 */
interface DatabaseSheetData {
    fileName: string;
    cost_usd_50_db: string | number | null;
    database_batch_list: DatabaseBatchItem[];
}

/**
 * New combined structure for all purchase sheet data, which will be passed to the Catalogue processor.
 */
interface ProcessedPurchaseFile {
    ds_sheets: SheetData[];
    database_sheet: DatabaseSheetData | null;
}

/**
 * Defines the structure for a single database record from a Catalogue Summary row.
 */
interface CatalogueRecord {
    sale_type: string;
    sale_number: string | number | null;
    outturn: string | number | null;
    grower_mark: string | number | null;
    lot_number: string | number | null;
    weight: string | number | null;
    grade: string | number | null;
    season: string | number | null;
    certification: string | number | null;
    batch_number: string | number | null;
    cost_usd_50: string | number | null;
    hedge_usc_lb: string | number | null;
    diff_usc_lb: string | number | null;
    trade_month: string | number | null;
}

// --- UTILITY FUNCTIONS ---

type ClassValue = string | number | boolean | null | undefined | { [key: string]: boolean | undefined | null };

function cn(...inputs: ClassValue[]): string {
  const classes: string[] = [];
  inputs.forEach((input) => {
    if (!input) return;
    if (typeof input === 'string' || typeof input === 'number') {
      classes.push(String(input));
    } else if (typeof input === 'object' && !Array.isArray(input)) {
      Object.keys(input).forEach((key) => {
        if (input[key]) classes.push(key);
      });
    }
  });
  return classes.join(' ');
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// --- ICON/COMPONENT DEFINITIONS (Omitted for brevity, assumed unchanged) ---
// ... (UploadCloud, FileText, X, Card, CardContent, Button definitions remain the same) ...

const UploadCloud: React.FC<SVGProps<SVGSVGElement>> = ({ className, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    className={cn('lucide lucide-upload-cloud', className)} {...props}>
    <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
    <path d="M12 12v9" /><path d="m16 16-4-4-4 4" />
  </svg>
);
const FileText: React.FC<SVGProps<SVGSVGElement>> = ({ className, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    className={cn('lucide lucide-file-text', className)} {...props}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" />
  </svg>
);
const X: React.FC<SVGProps<SVGSVGElement>> = ({ className, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    className={cn('lucide lucide-x', className)} {...props}>
    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
  </svg>
);

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('rounded-lg border border-zinc-200 bg-white text-zinc-950 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50', className)} {...props}/>
));
Card.displayName = 'Card';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline';
  size?: 'default' | 'sm';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:ring-offset-zinc-950 dark:focus-visible:ring-zinc-300',
        {
          'bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-50/90': variant === 'default',
          'border border-zinc-200 bg-white hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-zinc-50': variant === 'outline',
        },
        { 'h-10 px-4 py-2': size === 'default', 'h-9 rounded-md px-3': size === 'sm', },
        className,
      )}
      {...props}
    />
));
Button.displayName = 'Button';
// --- END ICON/COMPONENT DEFINITIONS ---


/**
 * Converts a date value (Excel number or "dd.mm.yy" string) to "Month-Year" (e.g., "Feb-2025").
 */
function convertDateToTradeMonth(dateValue: string | number | null): string | null {
    if (dateValue === null || dateValue === undefined) return null;

    let date: Date;
    const monthNames = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    if (typeof dateValue === 'number') {
        try {
            const parsedDate = XLSX.SSF.parse_date_code(dateValue);
            date = new Date(parsedDate.y, parsedDate.m - 1, parsedDate.d);
        } catch (e) {
            return null;
        }
    } else if (typeof dateValue === 'string') {
        const parts = dateValue.split('.');
        if (parts.length < 3) return null;
        
        try {
            const year = parseInt(parts[2].length === 2 ? `20${parts[2]}` : parts[2]);
            const month = parseInt(parts[1]) - 1; 
            const day = parseInt(parts[0]);
            date = new Date(year, month, day);
        } catch (e) {
            return null;
        }
    } else {
        return null;
    }
    
    if (isNaN(date.getTime())) return null;

    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();

    return `${month}-${year}`;
}

/**
 * Reads data from relevant sheets in an Excel file buffer/Uint8Array.
 * This is the updated function that handles both DS sheets and the Database sheet.
 */
function processPurchaseFileContent(excelFileArrayBuffer: Uint8Array, fileName: string): ProcessedPurchaseFile {
    if (typeof XLSX === 'undefined') {
        console.error("XLSX library not found. Cannot process file.");
        return { ds_sheets: [], database_sheet: null };
    }
    const workbook = XLSX.read(excelFileArrayBuffer, { type: 'array' });
    
    const processedFile: ProcessedPurchaseFile = {
        ds_sheets: [],
        database_sheet: null,
    };

    const dsSheetNames = workbook.SheetNames.filter((name: string) => name.includes('DS'));
    const dbSheetName = workbook.SheetNames.find((name: string) => name.includes('Database'));


    // --- 1. Process 'DS' Sheets (Original Logic) ---
    for (const sheetName of dsSheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) continue;

        const sheetResult: SheetData = {
            fileName,
            sheetName,
            hegde_level: worksheet['G2'] ? worksheet['G2'].v : null,
            date: worksheet['A3'] ? worksheet['A3'].v : null, 
            batch_list: []
        };

        const sheetDataArray: unknown[] = XLSX.utils.sheet_to_json(worksheet, {
            header: 1, 
            range: 6,  // Start reading from the 7th row (0-indexed: 6)
            defval: null 
        });

        if (sheetDataArray.length < 1) continue;
        
        const headerRow = (sheetDataArray[0] as any[]).map((h: string) => (h && typeof h === 'string' ? h.trim().toUpperCase() : h));
        const dataRows = sheetDataArray.slice(1) as any[];

        const COL_MAP: { [key: string]: string } = {
            'MARK': 'mark',
            'GRADE': 'grade',
            'CPRICE': 'cost',
            'DIFFERENTIAL': 'differential',
            'LOT': 'lot' 
        };
        
        const colIndices: { [key: string]: number } = {};
        Object.keys(COL_MAP).forEach(excelHeader => {
            const index = headerRow.indexOf(excelHeader);
            if (index !== -1) {
                colIndices[excelHeader] = index;
            }
        });

        for (const row of dataRows) {
            const lotValue = colIndices['LOT'] !== undefined ? row[colIndices['LOT']] : null;
            if (lotValue === null || (typeof lotValue === 'string' && String(lotValue).trim() === '')) {
                break;
            }

            const batchItem: BatchItem = {
                mark: colIndices['MARK'] !== undefined ? row[colIndices['MARK']] : null,
                grade: colIndices['GRADE'] !== undefined ? row[colIndices['GRADE']] : null,
                cost: colIndices['CPRICE'] !== undefined ? row[colIndices['CPRICE']] : null,
                differential: colIndices['DIFFERENTIAL'] !== undefined ? row[colIndices['DIFFERENTIAL']] : null,
            };
            
            sheetResult.batch_list.push(batchItem);
        }

        processedFile.ds_sheets.push(sheetResult);
    }


    // --- 2. Process 'Database' Sheet (New Logic) ---
    if (dbSheetName) {
        const worksheet = workbook.Sheets[dbSheetName];
        if (worksheet) {
            
            const db_cost_usd_50 = worksheet['H2'] ? worksheet['H2'].v : null;

            // Read starting from the 5th row (range: 4)
            const sheetDataArray: unknown[] = XLSX.utils.sheet_to_json(worksheet, {
                header: 1, 
                range: 4,  // Start reading from the 5th row (0-indexed: 4)
                defval: null 
            });

            if (sheetDataArray.length > 1) {
                const headerRow = (sheetDataArray[0] as any[]).map((h: string) => (h && typeof h === 'string' ? h.trim().toUpperCase() : h));
                const dataRows = sheetDataArray.slice(1) as any[];

                const DB_COL_MAP: { [key: string]: keyof DatabaseBatchItem | 'SALE' } = {
                    'LOT': 'lot',
                    'GRADE': 'grade',
                    'PRICE': 'price',
                    'MARKET LEVEL': 'market_level',
                    'DIFFERENTIAL': 'differential',
                    'CERT': 'cert',
                    'SALE': 'SALE' // For filtering
                };

                const dbColIndices: { [key: string]: number } = {};
                Object.keys(DB_COL_MAP).forEach(excelHeader => {
                    const index = headerRow.indexOf(excelHeader);
                    if (index !== -1) {
                        dbColIndices[excelHeader] = index;
                    }
                });

                const filteredBatchList: DatabaseBatchItem[] = [];

                for (const row of dataRows) {
                    const saleValue = dbColIndices['SALE'] !== undefined ? String(row[dbColIndices['SALE']] || '').trim().toUpperCase() : null;

                    // Filter condition: SALE value is exactly "DS"
                    if (saleValue === 'DS') {
                        const dbItem: DatabaseBatchItem = {
                            lot: dbColIndices['LOT'] !== undefined ? row[dbColIndices['LOT']] : null,
                            grade: dbColIndices['GRADE'] !== undefined ? row[dbColIndices['GRADE']] : null,
                            price: dbColIndices['PRICE'] !== undefined ? row[dbColIndices['PRICE']] : null,
                            market_level: dbColIndices['MARKET LEVEL'] !== undefined ? row[dbColIndices['MARKET LEVEL']] : null,
                            differential: dbColIndices['DIFFERENTIAL'] !== undefined ? row[dbColIndices['DIFFERENTIAL']] : null,
                            cert: dbColIndices['CERT'] !== undefined ? row[dbColIndices['CERT']] : null,
                        };
                        filteredBatchList.push(dbItem);
                    }
                }

                processedFile.database_sheet = {
                    fileName: fileName,
                    cost_usd_50_db: db_cost_usd_50,
                    database_batch_list: filteredBatchList,
                };
            }
        }
    }


    return processedFile;
}

/**
 * Reads the Catalogue Summary file and generates records with conditional lookups.
 * Updated to handle the two-tier lookup using the new ProcessedPurchaseFile structure.
 */
function processCatalogueSummary(
    excelFileArrayBuffer: Uint8Array, 
    fileName: string, 
    processedPurchaseData: ProcessedPurchaseFile
): CatalogueRecord[] {
    if (typeof XLSX === 'undefined') {
        console.error("XLSX library not found. Cannot process file.");
        return [];
    }
    const workbook = XLSX.read(excelFileArrayBuffer, { type: 'array' });
    const records: CatalogueRecord[] = [];
    
    // Assume data is in the FIRST sheet.
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) return records;

    const rawData: unknown[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
    if (rawData.length === 0) return records;

    const headerRow = (rawData[0] as string[]).map((h: string) => (h && typeof h === 'string' ? h.trim() : h));
    const dataRows = rawData.slice(1) as any[]; 

    const COL_MAP: { [key: string]: string } = {
        'Sale No.': 'sale_number', 'Outturn': 'outturn', 'Grower Marks': 'grower_mark', 
        'Lot No.': 'lot_number', 'Kilos': 'weight', 'Grade': 'grade', 'Season': 'season', 
        'Certification': 'certification', 'Batch No.': 'batch_number', 'Costs': 'cost_usd_50', 
        'Hedge(USC/LB)': 'hedge_usc_lb', 'Diff(USC/LB)': 'diff_usc_lb', 'Trade Month': 'trade_month',
    };

    const colIndices: { [key: string]: number } = {};
    Object.keys(COL_MAP).forEach(excelHeader => {
        const index = headerRow.indexOf(excelHeader);
        if (index !== -1) colIndices[excelHeader] = index;
    });
    
    const getCellValue = (row: any[], excelHeader: string) => {
        const index = colIndices[excelHeader];
        return index !== undefined ? row[index] : null;
    };

    for (const row of dataRows) {
        const currentRow = row as any[];
        
        const csTradeMonth = getCellValue(currentRow, 'Trade Month');
        const csOutturn = String(getCellValue(currentRow, 'Outturn') || '').toUpperCase();
        const csGrade = String(getCellValue(currentRow, 'Grade') || '').toUpperCase();
        const csLotNumber = String(getCellValue(currentRow, 'Lot No.') || '').toUpperCase();
        const csBatchNumber = getCellValue(currentRow, 'Batch No.');

        if (!csBatchNumber) continue; 

        let record: CatalogueRecord = {
            sale_type: "Auction", 
            sale_number: getCellValue(currentRow, 'Sale No.'),
            outturn: getCellValue(currentRow, 'Outturn'),
            grower_mark: getCellValue(currentRow, 'Grower Marks'),
            lot_number: getCellValue(currentRow, 'Lot No.'),
            weight: getCellValue(currentRow, 'Kilos'),
            grade: getCellValue(currentRow, 'Grade'),
            season: getCellValue(currentRow, 'Season'),
            certification: getCellValue(currentRow, 'Certification'),
            batch_number: csBatchNumber,
            cost_usd_50: null,
            hedge_usc_lb: null,
            diff_usc_lb: null,
            trade_month: null,
        };

        if (csTradeMonth) {
            // Case 1: 'Trade Month' is NOT null - use existing values
            record.cost_usd_50 = getCellValue(currentRow, 'Costs');
            record.hedge_usc_lb = getCellValue(currentRow, 'Hedge(USC/LB)');
            record.diff_usc_lb = getCellValue(currentRow, 'Diff(USC/LB)');
            
            record.trade_month = typeof csTradeMonth === 'number' 
                ? convertDateToTradeMonth(csTradeMonth) 
                : csTradeMonth;

        } else {
            // Case 2: 'Trade Month' IS null - perform two-tier lookup
            let matchFound = false;

            // --- TIER 1 LOOKUP: DS Sheets ---
            for (const psSheet of processedPurchaseData.ds_sheets) {
                const psTradeMonth = convertDateToTradeMonth(psSheet.date);

                for (const batchItem of psSheet.batch_list) {
                    const psMark = String(batchItem.mark || '').toUpperCase();
                    const psGrade = String(batchItem.grade || '').toUpperCase();

                    // Lookup: PS mark contains CS outturn AND PS grade matches CS grade
                    if (psMark.includes(csOutturn) && psGrade === csGrade) {
                        record.cost_usd_50 = batchItem.cost;
                        record.diff_usc_lb = batchItem.differential;
                        record.hedge_usc_lb = psSheet.hegde_level;
                        record.trade_month = psTradeMonth; 
                        matchFound = true;
                        break;
                    }
                }
                if (matchFound) break; 
            }
            
            // --- TIER 2 LOOKUP: Database Sheet (Fallback) ---
            if (!matchFound && processedPurchaseData.database_sheet) {
                const dbSheet = processedPurchaseData.database_sheet;
                
                for (const dbItem of dbSheet.database_batch_list) {
                    const dbLot = String(dbItem.lot || '').toUpperCase();
                    const dbGrade = String(dbItem.grade || '').toUpperCase();

                    // Lookup: DB lot matches CS Lot No. AND DB grade matches CS grade
                    if (dbLot === csLotNumber && dbGrade === csGrade) {
                        record.cost_usd_50 = dbItem.price;
                        record.hedge_usc_lb = dbItem.market_level;
                        record.diff_usc_lb = dbItem.differential;
                        record.certification = dbItem.cert;
                        // Trade Month remains null if not found in Tier 1
                        matchFound = true;
                        break;
                    }
                }
            }
        }
        
        records.push(record);
    }

    return records;
}

/**
 * Reads a single File object asynchronously and returns its contents as a Uint8Array.
 */
function readFileAsArrayBuffer(file: File): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const arrayBuffer = e.target?.result as ArrayBuffer;
            const uint8Array = new Uint8Array(arrayBuffer); 
            resolve(uint8Array);
        };
        reader.onerror = (e) => {
            reject(new Error(`Failed to read file ${file.name}: ${e.target?.error?.name}`));
        };
        reader.readAsArrayBuffer(file);
    });
}

// --- Main Aggregation and Handling Logic ---

/**
 * Aggregates all DS sheets and the first found Database sheet data from all purchase files.
 */
async function aggregatePurchaseData(files: File[]): Promise<ProcessedPurchaseFile> {
    const finalData: ProcessedPurchaseFile = {
        ds_sheets: [],
        database_sheet: null, // Only store the first valid database sheet found
    };

    for (const file of files) {
        if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) continue;

        try {
            const excelFileArrayBuffer = await readFileAsArrayBuffer(file);
            const fileData = processPurchaseFileContent(excelFileArrayBuffer, file.name);

            // Aggregate DS sheets from all files
            finalData.ds_sheets.push(...fileData.ds_sheets);

            // Take the first valid Database sheet found
            if (!finalData.database_sheet && fileData.database_sheet) {
                finalData.database_sheet = fileData.database_sheet;
            }
        } catch (error) {
            console.error(`❌ Error reading or processing purchase file ${file.name}:`, error);
        }
    }
    return finalData;
}


// --- Main App Component ---

const ALLOWED_FILE_TYPES: Record<string, string[]> = {
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
};
const allowedTypesString = ".xls, .xlsx";

interface MultiFileDropzoneProps {
  value: File[];
  onChange: (files: File[]) => void;
  className?: string;
  title: string;
  subtitle: string;
}

const MultiFileDropzone: React.FC<MultiFileDropzoneProps> = ({
  value,
  onChange,
  className,
  title,
  subtitle,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const validateAndSetFiles = (files: FileList) => {
    const accepted: File[] = [];
    Array.from(files).forEach((file) => {
      if (ALLOWED_FILE_TYPES[file.type] || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        accepted.push(file);
      }
    });
    onChange?.([...accepted]); 
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files) validateAndSetFiles(files);
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) validateAndSetFiles(files);
  };

  const removeFile = (index: number) => {
    if (!value) return;
    const newFiles = value.filter((_, i) => i !== index);
    onChange?.(newFiles);
  };

  return (
    <Card
      className={cn(
        'border-2 border-dashed border-zinc-300 dark:border-zinc-700 transition-colors w-full h-full min-h-[350px] flex flex-col',
        isDragging && 'border-blue-500 dark:border-blue-400',
        className,
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <CardContent className="flex flex-col items-center justify-center p-6 pt-6 grow">
        <UploadCloud className="h-12 w-12 text-zinc-400" />
        <div className="space-y-2 text-center mt-3">
          <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50">{title}</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {subtitle}
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={allowedTypesString}
          className="hidden"
          onChange={handleFileSelect}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => fileInputRef.current?.click()}
        >
          Or browse
        </Button>
      </CardContent>

      {value && value.length > 0 && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 p-4 w-full">
          <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-50 mb-2">
            Files ({value.length}):
          </h4>
          <ul className="space-y-2 max-h-40 overflow-y-auto">
            {value.map((file, index) => (
              <li
                key={index}
                className="flex items-center justify-between space-x-2 rounded-lg border border-zinc-200 dark:border-zinc-800 p-2"
              >
                <div className="flex items-center space-x-2 min-w-0">
                  <FileText className="h-5 w-5 shrink-0 text-zinc-500" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="p-1 rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                  aria-label="Remove file"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
};


export default function FileDropZone() {
    const [purchaseFiles, setPurchaseFiles] = useState<File[]>([]);
    const [catalogueFiles, setCatalogueFiles] = useState<File[]>([]);
    
    // Updated state to hold the new complex purchase data structure
    const [purchaseData, setPurchaseData] = useState<ProcessedPurchaseFile | null>(null);
    const [catalogueRecords, setCatalogueRecords] = useState<CatalogueRecord[] | null>(null);

    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [uploadSuccess, setUploadSuccess] = useState<boolean>(false); 
    
    const totalFiles = purchaseFiles.length + catalogueFiles.length;

    // Combined processing function
    const handleAllProcessing = async () => {
        if (totalFiles === 0) return;

        setIsProcessing(true);
        setError(null);
        setUploadSuccess(false); 
        setPurchaseData(null);
        setCatalogueRecords(null);
        
        try {
            let processedPurchaseData: ProcessedPurchaseFile = { ds_sheets: [], database_sheet: null };
            
            // STEP 1: Process and Aggregate all Purchase Sheets (if any were uploaded)
            if (purchaseFiles.length > 0) {
                processedPurchaseData = await aggregatePurchaseData(purchaseFiles);
                setPurchaseData(processedPurchaseData);
            }

            // STEP 2: Process Catalogue Summary Files and Generate Records
            let recordsToInsert: CatalogueRecord[] = [];
            if (catalogueFiles.length > 0) {
                for (const file of catalogueFiles) {
                    const excelFileArrayBuffer = await readFileAsArrayBuffer(file);
                    // Process one catalogue file at a time, using the consolidated purchase data
                    const fileRecords = processCatalogueSummary(
                        excelFileArrayBuffer, 
                        file.name, 
                        processedPurchaseData
                    );
                    recordsToInsert.push(...fileRecords);
                }
                setCatalogueRecords(recordsToInsert);
            }

            // STEP 3: Handle API Insertion
            if (recordsToInsert.length > 0) {
                console.log(`Attempting to insert ${recordsToInsert.length} records via API...`);
                
                // API Call: Send the fully prepared JSON array to the Next.js API route
                const apiResponse = await fetch('/api/catalogue_summary', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(recordsToInsert)
                });

                if (!apiResponse.ok) {
                    let errorBody = await apiResponse.text();
                    try {
                        const jsonError = JSON.parse(errorBody);
                        errorBody = jsonError.message || JSON.stringify(jsonError);
                    } catch {
                        // Use the plain text if JSON parsing fails
                    }
                    throw new Error(`Insertion failed (Status: ${apiResponse.status}). Details: ${errorBody}`);
                }
                
                
                setUploadSuccess(true);

            } else if (catalogueFiles.length > 0) {
                 setError("No valid records were generated from the uploaded Catalogue Summary files.");
            }

            
            
            console.log("✅ Processing and Insertion attempt complete.");

        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "An unknown error occurred during processing.";
            setError(errorMessage);
            console.error("Error during batch processing:", e);
        } finally {
            setIsProcessing(false);
        }
    };


    return (
        <div className="bg-zinc-50 dark:bg-zinc-900 min-h-auto p-8 flex flex-col items-center">
            
            
            <div className="flex flex-col  gap-6 w-full max-w-5xl mb-6">
                {/* Purchase Sheet Dropzone */}
                <MultiFileDropzone
                    value={purchaseFiles}
                    onChange={setPurchaseFiles}
                    title="Purchase Sheets"
                    subtitle="Drag and Drop Purchase sheet file"
                    className="w-full"
                />

                {/* Catalogue Summary Dropzone */}
                <MultiFileDropzone
                    value={catalogueFiles}
                    onChange={setCatalogueFiles}
                    title="2. Catalogue Summaries (Target Data)"
                    subtitle="Drag and Drop Catalogue Summaries here."
                    className="w-full"
                />
            </div>
            
            <Button className="mt-4 w-full max-w-xs" onClick={handleAllProcessing}disabled={totalFiles === 0 || isProcessing}>
                {isProcessing ? (
                    <span className="flex items-center">
                        <svg className="animate-spin h-5 w-5 mr-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Syncing...
                    </span>
                ) : (
                    `Sync`
                )}
            </Button>

            {/* Status Messages */}
            {uploadSuccess && (
                <div className="mt-4 w-full max-w-2xl bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative">
                    <strong className="font-bold">Success! </strong>
                    <span className="block sm:inline">Catalogue Summary Update succesfully.</span>
                </div>
            )}

            {error && (
                <div className="mt-4 w-full max-w-2xl bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
                    <strong className="font-bold">Error: </strong>
                    <span className="block sm:inline">{error}</span>
                </div>
            )}
            
        </div>
    );
}