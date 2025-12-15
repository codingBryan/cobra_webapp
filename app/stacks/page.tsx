"use client"
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  Calculator, 
  FlaskConical, 
  Search, 
  ChevronDown, 
  ChevronRight, 
  ArrowRight, 
  Download, 
  TrendingUp, 
  AlertCircle, 
  X,
  History,
  Archive,
  PackageCheck,
  PieChart,
  Check,
  Upload,
  CloudUpload,
  FileSpreadsheet,
  File as FileIcon,
  Trash2,
  Ban, // Icon for Blocked Lots
  Filter,
  DollarSign,
  Pencil,
  BarChart3,
  Cog
} from 'lucide-react';
import { Batch, LastUpdateDates, SaleRecord, StrategyAggregate } from '@/custom_utilities/custom_types';
import * as XLSX from 'xlsx';
import { useRouter } from 'next/navigation';



// --- Constants & Types ---
const KG_TO_LB = 2.2046;

type Unit = 'kg' | 'bag' | 'mt';
type OverrideMode = 'outright' | 'diff';

// Define the specific sort order
const SORT_ORDER_SUFFIXES = [
  "NATURAL",
  "17 UP TOP",
  "16 TOP",
  "15 TOP",
  "PB - TOP",
  "17 UP PLUS",
  "FAQ PLUS",
  "FAQ MINUS",
  "16 PLUS",
  "15 PLUS",
  "14 PLUS",
  "PB - PLUS",
  "17 UP FAQ",
  "16 FAQ",
  "15 FAQ",
  "14 FAQ",
  "PB - FAQ",
  "GRINDER BOLD",
  "GRINDER LIGHT",
  "MH",
  "ML",
  "REJECTS S",
  "REJECTS P"
];

interface NavButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}

// --- CATALOGUE UPLOAD INTERFACES & HELPERS ---

interface BatchItem {
    mark: string | number | null;
    grade: string | number | null;
    cost: string | number | null;
    differential: string | number | null;
}

interface SheetData {
    fileName: string; 
    sheetName: string;
    hegde_level: string | number | null;
    date: string | number | null;
    batch_list: BatchItem[];
}

interface DatabaseBatchItem {
    lot: string | number | null;
    grade: string | number | null;
    price: string | number | null;      
    market_level: string | number | null; 
    differential: string | number | null; 
    cert: string | number | null;       
}

interface DatabaseSheetData {
    fileName: string;
    cost_usd_50_db: string | number | null;
    database_batch_list: DatabaseBatchItem[];
}

interface ProcessedPurchaseFile {
    ds_sheets: SheetData[];
    database_sheet: DatabaseSheetData | null;
}

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

function convertDateToTradeMonth(dateValue: string | number | null): string | null {
    if (dateValue === null || dateValue === undefined) return null;
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let date: Date;

    if (typeof dateValue === 'number') {
        try {
            const parsedDate = XLSX.SSF.parse_date_code(dateValue);
            date = new Date(parsedDate.y, parsedDate.m - 1, parsedDate.d);
        } catch (e) { return null; }
    } else if (typeof dateValue === 'string') {
        const parts = dateValue.split('.');
        if (parts.length < 3) return null;
        try {
            const year = parseInt(parts[2].length === 2 ? `20${parts[2]}` : parts[2]);
            const month = parseInt(parts[1]) - 1; 
            const day = parseInt(parts[0]);
            date = new Date(year, month, day);
        } catch (e) { return null; }
    } else { return null; }
    
    if (isNaN(date.getTime())) return null;
    return `${monthNames[date.getMonth()]}-${date.getFullYear()}`;
}

function readFileAsArrayBuffer(file: File): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(new Uint8Array(e.target?.result as ArrayBuffer));
        reader.onerror = (e) => reject(new Error(`Failed to read file ${file.name}`));
        reader.readAsArrayBuffer(file);
    });
}

function processPurchaseFileContent(excelFileArrayBuffer: Uint8Array, fileName: string): ProcessedPurchaseFile {
    const workbook = XLSX.read(excelFileArrayBuffer, { type: 'array' });
    const processedFile: ProcessedPurchaseFile = { ds_sheets: [], database_sheet: null };

    const dsSheetNames = workbook.SheetNames.filter((name: string) => name.includes('DS'));
    const dbSheetName = workbook.SheetNames.find((name: string) => name.includes('Database'));

    // 1. Process 'DS' Sheets
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
        const sheetDataArray: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 6, defval: null });
        if (sheetDataArray.length < 1) continue;
        
        const headerRow = (sheetDataArray[0] as any[]).map((h: string) => (h && typeof h === 'string' ? h.trim().toUpperCase() : h));
        const dataRows = sheetDataArray.slice(1);
        const colIndices: any = {};
        ['MARK', 'GRADE', 'CPRICE', 'DIFFERENTIAL', 'LOT'].forEach(h => {
            const idx = headerRow.indexOf(h);
            if (idx !== -1) colIndices[h] = idx;
        });

        for (const row of dataRows) {
            if (!row[colIndices['LOT']]) break;
            sheetResult.batch_list.push({
                mark: row[colIndices['MARK']] ?? null,
                grade: row[colIndices['GRADE']] ?? null,
                cost: row[colIndices['CPRICE']] ?? null,
                differential: row[colIndices['DIFFERENTIAL']] ?? null,
            });
        }
        processedFile.ds_sheets.push(sheetResult);
    }

    // 2. Process 'Database' Sheet
    if (dbSheetName) {
        const worksheet = workbook.Sheets[dbSheetName];
        const sheetDataArray: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 4, defval: null });
        if (sheetDataArray.length > 1) {
            const headerRow = (sheetDataArray[0] as any[]).map((h: string) => (h && typeof h === 'string' ? h.trim().toUpperCase() : h));
            const dataRows = sheetDataArray.slice(1);
            const dbColIndices: any = {};
            ['LOT', 'GRADE', 'PRICE', 'MARKET LEVEL', 'DIFFERENTIAL', 'CERT', 'SALE'].forEach(h => {
                const idx = headerRow.indexOf(h);
                if (idx !== -1) dbColIndices[h] = idx;
            });

            const filteredBatchList: DatabaseBatchItem[] = [];
            for (const row of dataRows) {
                if (String(row[dbColIndices['SALE']] || '').trim().toUpperCase() === 'DS') {
                    filteredBatchList.push({
                        lot: row[dbColIndices['LOT']] ?? null,
                        grade: row[dbColIndices['GRADE']] ?? null,
                        price: row[dbColIndices['PRICE']] ?? null,
                        market_level: row[dbColIndices['MARKET LEVEL']] ?? null,
                        differential: row[dbColIndices['DIFFERENTIAL']] ?? null,
                        cert: row[dbColIndices['CERT']] ?? null,
                    });
                }
            }
            processedFile.database_sheet = {
                fileName,
                cost_usd_50_db: worksheet['H2'] ? worksheet['H2'].v : null,
                database_batch_list: filteredBatchList,
            };
        }
    }
    return processedFile;
}

function processCatalogueSummary(excelFileArrayBuffer: Uint8Array, fileName: string, processedPurchaseData: ProcessedPurchaseFile): CatalogueRecord[] {
    const workbook = XLSX.read(excelFileArrayBuffer, { type: 'array' });
    const records: CatalogueRecord[] = [];
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!worksheet) return records;

    const rawData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
    if (rawData.length === 0) return records;

    const headerRow = (rawData[0] as string[]).map(h => (h && typeof h === 'string' ? h.trim() : h));
    const dataRows = rawData.slice(1);
    const colIndices: any = {};
    const COL_MAP: any = {
        'Sale No.': 'sale_number', 'Outturn': 'outturn', 'Grower Marks': 'grower_mark', 
        'Lot No.': 'lot_number', 'Kilos': 'weight', 'Grade': 'grade', 'Season': 'season', 
        'Certification': 'certification', 'Batch No.': 'batch_number', 'Costs': 'cost_usd_50', 
        'Hedge(USC/LB)': 'hedge_usc_lb', 'Diff(USC/LB)': 'diff_usc_lb', 'Trade Month': 'trade_month',
    };
    Object.keys(COL_MAP).forEach(k => {
        const idx = headerRow.indexOf(k);
        if (idx !== -1) colIndices[k] = idx;
    });

    const getVal = (row: any[], key: string) => {
        const idx = colIndices[key];
        return idx !== undefined ? row[idx] : null;
    };

    for (const row of dataRows) {
        const batchNum = getVal(row, 'Batch No.');
        if (!batchNum) continue;

        const csTradeMonth = getVal(row, 'Trade Month');
        const csOutturn = String(getVal(row, 'Outturn') || '').toUpperCase();
        const csGrade = String(getVal(row, 'Grade') || '').toUpperCase();
        const csLotNumber = String(getVal(row, 'Lot No.') || '').toUpperCase();

        let record: CatalogueRecord = {
            sale_type: "Auction",
            sale_number: getVal(row, 'Sale No.'),
            outturn: getVal(row, 'Outturn'),
            grower_mark: getVal(row, 'Grower Marks'),
            lot_number: getVal(row, 'Lot No.'),
            weight: getVal(row, 'Kilos'),
            grade: getVal(row, 'Grade'),
            season: getVal(row, 'Season'),
            certification: getVal(row, 'Certification'),
            batch_number: batchNum,
            cost_usd_50: null, hedge_usc_lb: null, diff_usc_lb: null, trade_month: null,
        };

        if (csTradeMonth) {
            record.cost_usd_50 = getVal(row, 'Costs');
            record.hedge_usc_lb = getVal(row, 'Hedge(USC/LB)');
            record.diff_usc_lb = getVal(row, 'Diff(USC/LB)');
            record.trade_month = typeof csTradeMonth === 'number' ? convertDateToTradeMonth(csTradeMonth) : csTradeMonth;
        } else {
            // Tier 1 Lookup (DS Sheets)
            let matchFound = false;
            for (const psSheet of processedPurchaseData.ds_sheets) {
                for (const batchItem of psSheet.batch_list) {
                    const psMark = String(batchItem.mark || '').toUpperCase();
                    const psGrade = String(batchItem.grade || '').toUpperCase();
                    if (psMark.includes(csOutturn) && psGrade === csGrade) {
                        record.cost_usd_50 = batchItem.cost;
                        record.diff_usc_lb = batchItem.differential;
                        record.hedge_usc_lb = psSheet.hegde_level;
                        record.trade_month = convertDateToTradeMonth(psSheet.date);
                        matchFound = true;
                        break;
                    }
                }
                if (matchFound) break;
            }
            // Tier 2 Lookup (Database Sheet)
            if (!matchFound && processedPurchaseData.database_sheet) {
                for (const dbItem of processedPurchaseData.database_sheet.database_batch_list) {
                    if (String(dbItem.lot||'').toUpperCase() === csLotNumber && String(dbItem.grade||'').toUpperCase() === csGrade) {
                        record.cost_usd_50 = dbItem.price;
                        record.hedge_usc_lb = dbItem.market_level;
                        record.diff_usc_lb = dbItem.differential;
                        record.certification = dbItem.cert;
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

// --- HELPER FUNCTIONS ---
const toUSClb = (price50kg: number): number => {
  const pricePerKg = price50kg / 50;
  const pricePerLb = pricePerKg / KG_TO_LB;
  return pricePerLb * 100; 
};

const to50kg = (priceUSClb: number): number => {
  const pricePerLb = priceUSClb / 100;
  const pricePerKg = pricePerLb * KG_TO_LB;
  return pricePerKg * 50;
};

const convertQty = (kg: number, unit: Unit): number => {
  if (unit === 'bag') return kg / 60;
  if (unit === 'mt') return kg / 1000;
  return kg;
};

const formatNumber = (num: number, decimals = 2) => {
  if (num === undefined || num === null || isNaN(num)) return "0.00";
  return new Intl.NumberFormat('en-US', { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  }).format(num);
};

const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
    });
};

// --- Components ---
const Card = ({ children, className = "", variant = "default" }: { children: React.ReactNode; className?: string, variant?: "default" | "dark" }) => {
  const bgClass = variant === "dark" ? "bg-[#51534a] text-white border-none" : "bg-white border border-[#968C83]/20";
  return (
    <div className={`rounded-xl shadow-sm ${bgClass} ${className}`}>
      {children}
    </div>
  );
};

// ... FilterTabs, MultiSelect, FileDropZone, FileUploadModal ...
const FilterTabs = ({ active, onChange }: { active: string, onChange: (val: string) => void }) => {
  const filters = ['PRE', 'IN', 'POST', 'FINISHED', 'OLD'];
  return (
    <div className="flex gap-2 pb-2">
      {filters.map(f => (
        <button
          key={f}
          onClick={() => onChange(f)}
          className={`px-3 py-1 text-xs font-bold rounded-full border transition-all ${
            active === f 
              ? 'bg-[#007680] text-white border-[#007680]' 
              : 'bg-white text-[#968C83] border-[#D6D2C4] hover:border-[#007680] hover:text-[#007680]'
          }`}
        >
          {f}
        </button>
      ))}
    </div>
  );
};

function MultiSelect({ 
    options, 
    selected, 
    onChange, 
    placeholder, 
    searchable = false 
}: { 
    options: string[], 
    selected: string[], 
    onChange: (val: string[]) => void, 
    placeholder: string,
    searchable?: boolean 
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOption = (option: string) => {
        if (selected.includes(option)) {
            onChange(selected.filter(s => s !== option));
        } else {
            onChange([...selected, option]);
        }
    };

    const filteredOptions = options.filter(opt => 
        opt.toLowerCase().includes(search.toLowerCase())
    );

    const isAllSelected = selected.length === options.length;
    const toggleAll = () => {
        if (isAllSelected) onChange([]);
        else onChange(options);
    };

    return (
        <div className="relative w-full md:w-48" ref={containerRef}>
            <div 
                className="bg-white border border-[#D6D2C4] rounded px-3 py-1.5 text-sm cursor-pointer flex justify-between items-center text-[#51534a] focus:border-[#007680] h-8"
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className="truncate">
                    {selected.length === 0 
                        ? placeholder 
                        : selected.length === options.length 
                            ? `All ${placeholder}` 
                            : `${selected.length} selected`}
                </span>
                <ChevronDown size={14} className="text-[#968C83]" />
            </div>

            {isOpen && (
                <div className="absolute top-full left-0 w-64 bg-white border border-[#D6D2C4] shadow-lg rounded-lg mt-1 z-50 max-h-60 overflow-hidden flex flex-col">
                    {searchable && (
                        <div className="p-2 border-b border-[#D6D2C4]">
                            <div className="relative">
                                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#968C83]" />
                                <input 
                                    type="text" 
                                    className="w-full pl-8 pr-2 py-1 text-xs border border-[#D6D2C4] rounded outline-none focus:border-[#007680]"
                                    placeholder="Search..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    autoFocus
                                />
                            </div>
                        </div>
                    )}
                    <div className="overflow-y-auto flex-1 p-1">
                        <div 
                            className="px-2 py-1.5 hover:bg-[#D6D2C4]/20 cursor-pointer flex items-center gap-2 text-xs font-bold text-[#007680] border-b border-[#D6D2C4]/30 mb-1"
                            onClick={toggleAll}
                        >
                            <div className={`w-3 h-3 border rounded flex items-center justify-center ${isAllSelected ? 'bg-[#007680] border-[#007680]' : 'border-[#968C83]'}`}>
                                {isAllSelected && <Check size={10} className="text-white" />}
                            </div>
                            Select All
                        </div>
                        {filteredOptions.length > 0 ? filteredOptions.map(opt => {
                            const isSelected = selected.includes(opt);
                            return (
                                <div 
                                    key={opt} 
                                    className="px-1 py-1.5 hover:bg-[#D6D2C4]/20 cursor-pointer flex items-center space-between gap-2 text-xs text-[#51534a]"
                                    onClick={() => toggleOption(opt)}>
                                    <div className={`w-3 h-3 border rounded flex items-center justify-center ${isSelected ? 'bg-[#007680] border-[#007680]' : 'border-[#968C83]'}`}>
                                        {isSelected && <Check size={10} className="text-white" />}
                                    </div>
                                    <span className="truncate">{opt}</span>
                                </div>
                            )
                        }) : (
                            <div className="px-2 py-2 text-xs text-[#968C83] text-center italic">No results</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

const FileDropZone = ({ 
  label, 
  accept, 
  files, 
  onFilesAdded, 
  onRemoveFile, 
  multiple = false, 
  required = false 
}: { 
  label: string, 
  accept: string, 
  files: File[], 
  onFilesAdded: (f: File[]) => void, 
  onRemoveFile: (idx: number) => void,
  multiple?: boolean,
  required?: boolean
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files);
      if (!multiple) {
        onFilesAdded([newFiles[0]]);
      } else {
        onFilesAdded(newFiles);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      onFilesAdded(newFiles);
    }
  };

  return (
    <div className="flex flex-col gap-1 w-full">
      <label className="text-[10px] font-bold text-[#968C83] uppercase tracking-wider flex justify-between items-center h-4">
        <span className="truncate pr-2" title={label}>{label}</span>
        {required && <span className="text-[#B9975B] text-[8px] bg-[#B9975B]/10 px-1 rounded shrink-0">Req</span>}
      </label>
      
      <div 
        className={`border border-dashed rounded p-2 transition-colors text-center cursor-pointer min-h-24 flex flex-col items-center justify-center ${isDragging ? 'border-[#007680] bg-[#007680]/5' : 'border-[#D6D2C4] hover:border-[#007680]/50'}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input 
          ref={inputRef}
          type="file" 
          accept={accept} 
          multiple={multiple} 
          className="hidden" 
          onChange={handleChange}
        />
        {files.length === 0 ? (
          <>
            <CloudUpload size={16} className="text-[#968C83] mb-1" />
            <span className="text-[10px] text-[#51534a] leading-tight">
              Click or Drag
            </span>
          </>
        ) : (
          <div className="w-full flex flex-col gap-1">
            {files.map((file, idx) => (
              <div key={idx} className="flex items-center justify-between bg-white border border-[#D6D2C4] px-1.5 py-0.5 rounded text-[10px]">
                <div className="flex items-center gap-1 overflow-hidden">
                  <FileSpreadsheet size={10} className="text-[#007680] shrink-0" />
                  <span className="truncate text-[#51534a] max-w-32">{file.name}</span>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFile(idx);
                  }}
                  className="text-[#968C83] hover:text-[#B9975B] transition-colors"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};


const FileUploadModal = ({ onClose }: { onClose: () => void }) => {
  // --- Section 1 State ---
  const [purchaseFiles, setPurchaseFiles] = useState<File[]>([]);
  const [catalogueFiles, setCatalogueFiles] = useState<File[]>([]);
  // NEW: Loading State for Catalogue Logic
  const [isProcessingCatalogue, setIsProcessingCatalogue] = useState(false);
  
  // --- NEW: State for Failed Batches Modal ---
  // Using any[] to allow both strings and objects {batch, grade, qty}
  const [failedBatches, setFailedBatches] = useState<any[]>([]); 
  const [showFailedBatches, setShowFailedBatches] = useState(false);

  // --- Section 2 State ---
  const [stockReportFile, setStockReportFile] = useState<File[]>([]);
  const [analysisFile, setAnalysisFile] = useState<File[]>([]);
  const [transferFile, setTransferFile] = useState<File[]>([]);
  const [dispatchFile, setDispatchFile] = useState<File[]>([]);
  const [adjustmentFile, setAdjustmentFile] = useState<File[]>([]);
  const [testDetailsFile, setTestDetailsFile] = useState<File[]>([]);

  // --- Section 3 State ---
  const [blockedLotsFile, setBlockedLotsFile] = useState<File[]>([]);
  const [isUploadingBlocked, setIsUploadingBlocked] = useState(false);
  
  // --- MODIFIED: State for Logic Control ---
  const [isUploadingStock, setIsUploadingStock] = useState(false);
  const [overwriteModalOpen, setOverwriteModalOpen] = useState(false);
  const [existingSummaryId, setExistingSummaryId] = useState<number>(0);

  // Handlers Section 1: Catalogue Upload
  const handleUploadCatalogue = async () => {
    if (purchaseFiles.length === 0 && catalogueFiles.length === 0) {
        alert("Please select files to upload.");
        return;
    }

    setIsProcessingCatalogue(true);

    try {
        let processedPurchaseData: ProcessedPurchaseFile = { ds_sheets: [], database_sheet: null };

        // 1. Process Purchase Sheets
        if (purchaseFiles.length > 0) {
            for (const file of purchaseFiles) {
                if (!file.name.match(/\.xls(x)?$/)) continue;
                try {
                    const buffer = await readFileAsArrayBuffer(file);
                    const fileData = processPurchaseFileContent(buffer, file.name);
                    processedPurchaseData.ds_sheets.push(...fileData.ds_sheets);
                    if (!processedPurchaseData.database_sheet && fileData.database_sheet) {
                        processedPurchaseData.database_sheet = fileData.database_sheet;
                    }
                } catch (err) { console.error(`Error processing ${file.name}`, err); }
            }
        }

        // 2. Process Catalogue Summaries & Lookup Data
        let recordsToInsert: CatalogueRecord[] = [];
        if (catalogueFiles.length > 0) {
            for (const file of catalogueFiles) {
                const buffer = await readFileAsArrayBuffer(file);
                const fileRecords = processCatalogueSummary(buffer, file.name, processedPurchaseData);
                recordsToInsert.push(...fileRecords);
            }
        }

        // 3. API Insertion
        if (recordsToInsert.length > 0) {
            const apiResponse = await fetch('/api/catalogue_summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(recordsToInsert)
            });

            const result = await apiResponse.json();

            if (!apiResponse.ok) {
                throw new Error(`API Error: ${result.error || result.message || apiResponse.statusText}`);
            }

            if (result.success) {
                setPurchaseFiles([]);
                setCatalogueFiles([]);

                // Check for failed batches and trigger modal if they exist
                if (result.failedBatchNumbers && result.failedBatchNumbers.length > 0) {
                    setFailedBatches(result.failedBatchNumbers);
                    setShowFailedBatches(true);
                } else {
                    // Only show alert if there are NO failures
                    alert(result.message || `Success! ${recordsToInsert.length} records processed.`);
                }
            }
        } else {
            alert("No valid catalogue records generated.");
        }

    } catch (e: any) {
        console.error("Upload failed", e);
        alert(`Error: ${e.message}`);
    } finally {
        setIsProcessingCatalogue(false);
    }
  };

  // --- CORE LOGIC: The Actual Stock Processing Function ---
  const executeStockUpload = async () => {
    
    let last_update_dates: LastUpdateDates = await fetch('/api/last_update_dates', { method: 'GET'}).then(r => r.json());
    console.log(last_update_dates);
    
    setIsUploadingStock(true);
    // Hardcoded date as per provided logic
    const since_date: Date = new Date(2024, 0, 1);
    let summary_id: number = 0;

    try {
        console.log("Initializing summary...");
        // 1. Initialize Summary
        const initResponse = await fetch('/api/create_summary', { method: 'GET' });
        const initResult = await initResponse.json();
        
        if (!initResponse.ok || initResult === 0) {
            throw new Error(initResult.error || "Failed to Initialize daily summary.");
        }
        summary_id = initResult.summary_id;

        // 2. Prepare FormData
        const formData = new FormData();

        formData.append("summary_id", summary_id.toString());
        formData.append("targetDate", since_date.toISOString());
        
        // formData.append("last_adjustment_date", last_update_dates.last_sta.toString());      
        // formData.append("last_outbound_date", last_update_dates.last_outbound.toString());  
           
        // formData.append("last_processing_date", last_update_dates.last_process.toString());      
 
        if (last_update_dates.last_sta) {
          formData.append("last_adjustment_date", last_update_dates.last_sta.toString()); 
        } 

        if (last_update_dates.last_process) {
          formData.append("last_processing_date", last_update_dates.last_process.toString()); 
        } 

        if (last_update_dates.last_sti) {
          formData.append("last_inbound_date", last_update_dates.last_sti.toString()); 
        } 

        if (last_update_dates.last_outbound) {
          formData.append("last_outbound_date", last_update_dates.last_outbound.toString()); 
        } 
        formData.append("stiFile", transferFile[0]);      
        formData.append("gdiFile", dispatchFile[0]);  
        formData.append("staFile", adjustmentFile[0]);     
        formData.append("current_stock", stockReportFile[0]); 
        formData.append("processing_analysis_file", analysisFile[0]); 
        formData.append("test_details_summary_file", testDetailsFile[0]); 

        console.log("Processing files in parallel...");

        // 3. Processing Phase (Parallelized for efficiency)
        const [stiResult, gdiResult, staResult, stockResult, paResult] = await Promise.all([
            fetch('/api/process_sti', { method: 'POST', body: formData }).then(r => r.json()),
            fetch('/api/process_gdi', { method: 'POST', body: formData }).then(r => r.json()),
            fetch('/api/process_sta', { method: 'POST', body: formData }).then(r => r.json()),
            fetch('/api/stock_movement', { method: 'POST', body: formData }).then(r => r.json()),
            fetch('/api/process_pa', { method: 'POST', body: formData }).then(r => r.json())
        ]);

        // 4. Extract Data
        const inbound_weight = stiResult.total_delivered_qty;
        const outbound_weight = gdiResult.groupedData?.totalOutbound;
        const adjustment_weight = staResult.totalAdjustment;
        const xbs_current_stock_report = stockResult['current_stock_summary'];
        const processing_summary_object = paResult;

        // Check for integrity
        if (!processing_summary_object || outbound_weight === undefined || inbound_weight === undefined || !xbs_current_stock_report) {
            throw new Error("Missing crucial daily summary data points from file processing.");
        }

        console.log("Files processed successfully. Creating final summary...");

        // 5. Create Final Summary
        const summaryResponse = await fetch('/api/create_summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                summary_id: summary_id,
                targetDate: since_date,
                process_summary: processing_summary_object,
                inbound_weight: inbound_weight, 
                outbound_weight: outbound_weight,
                adjustment_weight: adjustment_weight,
                xbs_current_stock_report: xbs_current_stock_report,
            }),
        });

        const new_activity = await summaryResponse.json();
        if (!summaryResponse.ok) {
            throw new Error("Summary creation or Activity initialization failed");
        }

        // 6. Update Stock Activities
        const dataToSend: any = {
            summary_id: summary_id,
            stock_data: xbs_current_stock_report,
            new_activities_data: new_activity || undefined
        };

        const updateActivitiesResponse = await fetch('/api/update_stock_activities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataToSend),
        });

        if (!updateActivitiesResponse.ok) {
            throw new Error("Failed to update stock activities.");
        }

        console.log("Updating post-process strategies...");

        // 7. Final Updates (Parallel)
        await Promise.all([
            fetch('/api/update_undefined_strategies', { method: 'POST', body: formData }),
            fetch('/api/update_post_stacks', { method: 'POST', body: formData })
        ]);

        alert("Stock Movement Uploaded and Processed Successfully!");
        setOverwriteModalOpen(false); 

    } catch (error: any) {
        console.error("Error in executeStockUpload:", error);
        alert(`Error: ${error.message || "An unknown error occurred during processing."}`);
    } finally {
        setIsUploadingStock(false);
    }
  };

  // --- NEW: Entry Point Handler ---
  const handleUploadStock = async () => {
    // 1. Validation
    if (
      !stockReportFile.length ||
      !analysisFile.length ||
      !transferFile.length ||
      !dispatchFile.length ||
      !adjustmentFile.length ||
      !testDetailsFile.length
    ) {
        alert("Please select all required files (Stock, Analysis, Transfer, Dispatch, Adjustment, Test Details).");
        return;
    }

    setIsUploadingStock(true);

    try {
        // 2. Check for existing summary
        const checkResponse = await fetch('/api/movement_summary');
        const { id } = await checkResponse.json();

        if (id && id !== 0) {
            setExistingSummaryId(id);
            setIsUploadingStock(false); 
            setOverwriteModalOpen(true); 
            return;
        }

        // 3. If ID is 0, proceed normally
        await executeStockUpload();

    } catch (error) {
        console.error("Error checking daily summary:", error);
        alert("Failed to check for existing daily summaries.");
        setIsUploadingStock(false);
    }
  };

  // --- NEW: Overwrite "Yes" Handler ---
  const handleOverwriteConfirm = async () => {
    if (!existingSummaryId) return;
    setOverwriteModalOpen(false);
    setIsUploadingStock(true); 
    try {
        const deleteResponse = await fetch(`/api/movement_summary?id=${existingSummaryId}`, {
            method: 'DELETE'
        });

        if (!deleteResponse.ok) {
            throw new Error("Failed to delete the existing summary.");
        }

        await executeStockUpload();

    } catch (error: any) {
        alert(`Error during overwrite: ${error.message}`);
        setIsUploadingStock(false);
        setOverwriteModalOpen(false);
    }
  };

  // --- NEW: Overwrite "No" Handler ---
  const handleOverwriteCancel = () => {
    setOverwriteModalOpen(false);
    setExistingSummaryId(0);
    setIsUploadingStock(false);
  };

  // Handlers Section 3 (NEW)
  const handleUploadBlockedLots = async () => {
    if (blockedLotsFile.length === 0) {
      alert("Please select a file to upload.");
      return;
    }

    setIsUploadingBlocked(true);
    const formData = new FormData();
    formData.append('file', blockedLotsFile[0]);

    try {
      const response = await fetch('/api/sale_records', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        alert("Blocked Lots file processed successfully!");
        setBlockedLotsFile([]); 
      } else {
        const errorData = await response.json();
        alert(`Error uploading file: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error("Upload failed:", error);
      alert("An error occurred while uploading the file.");
    } finally {
      setIsUploadingBlocked(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-[#EFEFE9] w-full max-w-5xl rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] relative">
        
        {/* --- NEW: Failed Batches Modal Overlay --- */}
        {showFailedBatches && (
            <div className="absolute h-[40%] inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[2px] overflow-scroll">
                <div className="bg-white p-6 rounded-lg shadow-xl border border-red-200 max-w-md w-full animate-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
                    <div className="flex flex-col items-center text-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                            <AlertCircle size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-[#51534a]">Upload Completed with Issues</h3>
                        <p className="text-sm text-[#968C83]">
                            The following batches could not be processed (duplicates or invalid data):
                        </p>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto border border-[#D6D2C4] rounded bg-[#F5F5F3] p-3 mb-4 w-full">
                        <ul className="text-xs text-[#51534a] space-y-1">
                            {failedBatches.map((item, i) => (
                                <li key={i} className="flex items-center gap-2 font-mono border-b border-[#D6D2C4]/30 pb-1 last:border-0">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0"></span>
                                    {/* FIX: Handle Object vs String rendering */}
                                    {typeof item === 'object' && item !== null ? (
                                        <div className="flex flex-col">
                                            <span className="font-bold">{item.batch}</span>
                                            <span className="text-[10px] text-[#968C83]">
                                                Grade: {item.grade} {item.qty ? `| Qty: ${item.qty}` : ''}
                                            </span>
                                        </div>
                                    ) : (
                                        <span>{item}</span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <button 
                        onClick={() => setShowFailedBatches(false)}
                        className="w-full px-4 py-2 rounded bg-[#51534a] text-white text-sm font-bold hover:bg-[#51534a]/90 shadow-sm transition-all"
                    >
                        Close
                    </button>
                </div>
            </div>
        )}

        {/* --- NEW: Overwrite Confirmation Overlay --- */}
        {overwriteModalOpen && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
                <div className="bg-white p-6 rounded-lg shadow-xl border border-[#B9975B] max-w-sm w-full animate-in zoom-in-95 duration-200">
                    <div className="flex flex-col items-center text-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#B9975B]/10 flex items-center justify-center text-[#B9975B]">
                            <AlertCircle size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-[#51534a]">Summary Exists</h3>
                        <p className="text-sm text-[#968C83]">
                            A daily summary already exists for today (ID: {existingSummaryId}). 
                            Do you want to overwrite it?
                        </p>
                        <div className="flex gap-3 w-full mt-2">
                            <button 
                                onClick={handleOverwriteCancel}
                                className="flex-1 px-4 py-2 rounded border border-[#D6D2C4] text-[#51534a] text-sm hover:bg-[#F5F5F3]"
                            >
                                No, Cancel
                            </button>
                            <button 
                                onClick={handleOverwriteConfirm}
                                className="flex-1 px-4 py-2 rounded bg-[#B9975B] text-white text-sm font-bold hover:bg-[#B9975B]/90 shadow-sm"
                            >
                                Yes, Overwrite
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#D6D2C4] bg-white shrink-0">
          <h2 className="text-base font-bold text-[#51534a] flex items-center gap-2">
            <div className="w-6 h-6 bg-[#007680] rounded flex items-center justify-center text-white">
              <Upload size={14} />
            </div>
            File Upload Center
          </h2>
          <button onClick={onClose} className="text-[#968C83] hover:text-[#51534a] p-1.5 rounded-full hover:bg-[#D6D2C4]/30 transition-all">
            <X size={18} />
          </button>
        </div>

        {/* Compact Body - Using Grid to fit all in view */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#F5F5F3]">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">
            
            {/* Left Column: Catalogue + Blocked (Stacked) */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              
              {/* Section 1: Update Catalogue Summary */}
              <section className="bg-white p-3 rounded-lg border border-[#D6D2C4] shadow-sm flex flex-col gap-3">
                <div className="flex justify-between items-center border-b border-[#D6D2C4]/50 pb-1.5">
                  <h3 className="font-bold text-[#51534a] text-xs flex items-center gap-2">
                    <FileIcon size={14} className="text-[#007680]"/>
                    Update Catalogue
                  </h3>
                  <button 
                    onClick={handleUploadCatalogue}
                    disabled={isProcessingCatalogue}
                    className="bg-[#51534a] text-white px-2 py-1 rounded text-[10px] font-medium hover:bg-[#51534a]/90 transition-all flex items-center gap-1 disabled:opacity-50"
                  >
                    <Upload size={10} /> {isProcessingCatalogue ? 'Processing...' : 'Upload'}
                  </button>
                </div>
                
                <div className="space-y-3">
                  <FileDropZone 
                    label="Purchase Sheets" 
                    accept=".xlsx,.xls,.csv" 
                    files={purchaseFiles}
                    multiple={true}
                    onFilesAdded={(newFiles) => setPurchaseFiles(prev => [...prev, ...newFiles])}
                    onRemoveFile={(idx) => setPurchaseFiles(prev => prev.filter((_, i) => i !== idx))}
                  />
                  <FileDropZone 
                    label="Catalogue Summary" 
                    accept=".xlsx,.xls,.csv" 
                    files={catalogueFiles}
                    multiple={true}
                    onFilesAdded={(newFiles) => setCatalogueFiles(prev => [...prev, ...newFiles])}
                    onRemoveFile={(idx) => setCatalogueFiles(prev => prev.filter((_, i) => i !== idx))}
                  />
                </div>
              </section>

              {/* Section 3: Update Blocked Lots */}
              <section className="bg-white p-3 rounded-lg border border-[#D6D2C4] shadow-sm flex-1 flex flex-col gap-3">
                <div className="flex justify-between items-center border-b border-[#D6D2C4]/50 pb-1.5">
                  <h3 className="font-bold text-[#51534a] text-xs flex items-center gap-2">
                    <Ban size={14} className="text-[#B9975B]"/>
                    Update Blocked Lots
                  </h3>
                  <button 
                    onClick={handleUploadBlockedLots}
                    disabled={isUploadingBlocked}
                    className="bg-[#B9975B] text-white px-2 py-1 rounded text-[10px] font-medium hover:bg-[#B9975B]/90 transition-all flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Upload size={10} /> {isUploadingBlocked ? 'Uploading...' : 'Upload'}
                  </button>
                </div>

                <div className="flex-1">
                  <FileDropZone 
                    label="Blocked Lots (Excel)" 
                    accept=".xlsx,.xls" 
                    required
                    files={blockedLotsFile}
                    onFilesAdded={(f) => setBlockedLotsFile(f)}
                    onRemoveFile={() => setBlockedLotsFile([])}
                  />
                </div>
              </section>

            </div>

            {/* Right Column: Daily Stock Movement (Larger) */}
            <div className="lg:col-span-8">
              <section className="bg-white p-3 rounded-lg border border-[#D6D2C4] shadow-sm h-full flex flex-col">
                <div className="flex justify-between items-center mb-3 border-b border-[#D6D2C4]/50 pb-1.5 shrink-0">
                  <h3 className="font-bold text-[#51534a] text-xs flex items-center gap-2">
                    <TrendingUp size={14} className="text-[#007680]"/>
                    Update Daily Stock Movement
                  </h3>
                  <button 
                    onClick={handleUploadStock}
                    disabled={isUploadingStock}
                    className="bg-[#007680] text-white px-3 py-1.5 rounded text-[10px] font-medium hover:bg-[#007680]/90 transition-all flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Upload size={12} /> {isUploadingStock ? 'Processing...' : 'Upload All Movement Files'}
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-3 flex-1 overflow-y-auto content-start">
                  <FileDropZone 
                    label="Current Stock (CSV)" 
                    accept=".csv" 
                    required
                    files={stockReportFile}
                    onFilesAdded={(f) => setStockReportFile(f)}
                    onRemoveFile={() => setStockReportFile([])}
                  />
                  <FileDropZone 
                    label="Processing Analysis" 
                    accept=".xlsx,.xls" 
                    required
                    files={analysisFile}
                    onFilesAdded={(f) => setAnalysisFile(f)}
                    onRemoveFile={() => setAnalysisFile([])}
                  />
                  <FileDropZone 
                    label="Stock Transfer" 
                    accept=".xlsx,.xls" 
                    files={transferFile}
                    onFilesAdded={(f) => setTransferFile(f)}
                    onRemoveFile={() => setTransferFile([])}
                  />
                  <FileDropZone 
                    label="Goods Dispatch" 
                    accept=".xlsx,.xls" 
                    required
                    files={dispatchFile}
                    onFilesAdded={(f) => setDispatchFile(f)}
                    onRemoveFile={() => setDispatchFile([])}
                  />
                  <FileDropZone 
                    label="Stock Adjustment" 
                    accept=".xlsx,.xls" 
                    required
                    files={adjustmentFile}
                    onFilesAdded={(f) => setAdjustmentFile(f)}
                    onRemoveFile={() => setAdjustmentFile([])}
                  />
                  <FileDropZone 
                    label="Test Details" 
                    accept=".xlsx,.xls" 
                    files={testDetailsFile}
                    onFilesAdded={(f) => setTestDetailsFile(f)}
                    onRemoveFile={() => setTestDetailsFile([])}
                  />
                </div>
              </section>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default function EffectivePriceTool() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'strategic' | 'batch' | 'history' | 'client_analysis'>('inventory');
  const [unit, setUnit] = useState<Unit>('kg');
  
  // STATE for Data
  const [activeBatches, setActiveBatches] = useState<Batch[]>([]);
  // REMOVED: historyBatches state
  const [loading, setLoading] = useState(true);
  
  // STATE for Upload Modal
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // FETCH DATA on Mount
  useEffect(() => {
    async function loadData() {
        try {
            const res = await fetch('/api/batches');
            if (res.ok) {
                const data = await res.json();
                setActiveBatches(data.activeBatches || []);
            } else {
                console.error("Failed to fetch batch data");
            }
        } catch (e) {
            console.error("Error loading batch data:", e);
        } finally {
            setLoading(false);
        }
    }
    loadData();
  }, []);
  
  // Data Processing (Aggregates)
  const processedData = useMemo(() => {
    const grouped: Record<string, Batch[]> = {};
    
    activeBatches.forEach(item => {
      // --- OPTIMIZATION: STRICT ACTIVE FILTER ---
      if (item.status !== 'active') return;

      const strat = item.strategy || 'Unassigned';
      if (!grouped[strat]) grouped[strat] = [];
      grouped[strat].push(item);
    });

    const aggregates: StrategyAggregate[] = Object.keys(grouped).map(strategyName => {
      const batches = grouped[strategyName];
      const totalKg = batches.reduce((sum, b) => sum + b.quantityKg, 0);
      
      let totalValueUSClb = 0;
      let totalHedgeVal = 0;

      batches.forEach(b => {
        const valUSClb = toUSClb(b.outrightPrice50kg);
        totalValueUSClb += valUSClb * b.quantityKg;
        totalHedgeVal += b.hedgeLevelUSClb * b.quantityKg;
      });

      const wAvgOutrightUSClb = totalKg ? totalValueUSClb / totalKg : 0;
      const wAvgHedgeUSClb = totalKg ? totalHedgeVal / totalKg : 0;
      const wAvgDiffUSClb = wAvgOutrightUSClb - wAvgHedgeUSClb;
      const wAvgOutright50kg = to50kg(wAvgOutrightUSClb);

      return {
        name: strategyName,
        totalKg,
        wAvgOutright50kg,
        wAvgHedgeUSClb,
        wAvgDiffUSClb,
        batches
      };
    });

    return aggregates;
  }, [activeBatches]);

  if (loading) {
      return <div className="min-h-screen flex items-center justify-center bg-[#D6D2C4] text-[#51534a]">Loading Inventory Data...</div>;
  }

  return (
    <div className="min-h-screen bg-[#D6D2C4] font-sans text-[#51534a] md:p-1 relative">
      {/* Upload Modal */}
      {isUploadModalOpen && <FileUploadModal onClose={() => setIsUploadModalOpen(false)} />}

      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#51534a] flex items-center gap-2">
              <div className="w-8 h-8 bg-[#007680] rounded-lg flex items-center justify-center text-white">
                <Calculator size={18} />
              </div>
              Post Processing: Effective Price
            </h1>
            <p className="text-[#968C83] text-sm mt-1">Coffee Position & Blend Calculator</p>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Unit Toggles */}
            <div className="flex items-center bg-white p-1 rounded-lg border border-[#968C83]/20 shadow-sm">
              {(['kg', 'bag', 'mt'] as Unit[]).map((u) => (
                <button
                  key={u}
                  onClick={() => setUnit(u)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    unit === u 
                      ? 'bg-[#007680] text-white shadow-sm' 
                      : 'text-[#968C83] hover:bg-[#D6D2C4]/30'
                  }`}
                >
                  {u.toUpperCase()}
                </button>
              ))}
            </div>

            {/* File Upload Button */}
            <button 
              onClick={() => setIsUploadModalOpen(true)}
              className="flex items-center justify-center w-10 h-10 bg-[#51534a] text-white rounded-lg hover:bg-[#51534a]/90 transition-colors shadow-sm"
              title="Upload Data Files"
            >
              <Upload size={20} />
            </button>
          </div>
        </header>

        {/* Navigation */}
        <div className="flex gap-2 border-b border-[#968C83]/30 overflow-x-auto">

        
          <NavButton 
            active={activeTab === 'inventory'} 
            onClick={() => setActiveTab('inventory')} 
            icon={LayoutDashboard} 
            label="Inventory" 
          />

          <NavButton 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
            icon={BarChart3} 
            label="Stock Movement" 
          />
          <NavButton 
            active={activeTab === 'strategic'} 
            onClick={() => setActiveTab('strategic')} 
            icon={FlaskConical} 
            label="Strategic Blender" 
          />
          <NavButton 
            active={activeTab === 'batch'} 
            onClick={() => setActiveTab('batch')} 
            icon={Calculator} 
            label="Batch Blender" 
          />
          <NavButton 
            active={activeTab === 'client_analysis'} 
            onClick={() => setActiveTab('client_analysis')} 
            icon={History} 
            label="Client Analysis" 
          />

          <NavButton 
            active={activeTab === 'history'} 
            onClick={() => setActiveTab('history')} 
            icon={History} 
            label="Batch History" 
          />
          
        </div>


        <main>
          {activeTab === 'dashboard' && (
            <DashboardView unit={unit} />
          )}
          {activeTab === 'inventory' && (
            <InventoryView data={processedData} unit={unit} />
          )}
          {activeTab === 'strategic' && (
            <StrategicBlender data={processedData}  unit={unit}/>
          )}
          {activeTab === 'batch' && (
            <BatchBlender data={processedData} unit={unit} />
          )}
          {activeTab === 'history' && (
            <BatchHistoryView unit={unit} />
          )}
          {activeTab === 'client_analysis' && (
            <ClientAnalysisView unit={unit} />
          )}
        </main>

      </div>
    </div>
  );
}

// --- Sub-Components ---

function NavButton({ active, onClick, icon: Icon, label }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-4 transition-colors whitespace-nowrap ${
        active 
          ? 'border-[#007680] text-[#007680]' 
          : 'border-transparent text-[#968C83] hover:text-[#51534a] hover:border-[#968C83]/30'
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

function InventoryView({ data, unit }: { data: StrategyAggregate[], unit: Unit }) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [filter, setFilter] = useState('POST');

  const filteredData = useMemo(() => {
    const filtered = data.filter(d => d.name.toUpperCase().startsWith(filter));

    return filtered.sort((a, b) => {
        const getRank = (name: string) => {
            const cleanName = name.toUpperCase().replace(filter, '').trim().replace(/^[-_]/, '').trim(); 
            const idx = SORT_ORDER_SUFFIXES.indexOf(cleanName);
            if (idx === -1) {
                 return SORT_ORDER_SUFFIXES.findIndex(s => cleanName.includes(s));
            }
            return idx;
        };
        
        const rankA = getRank(a.name);
        const rankB = getRank(b.name);
        
        if (rankA === -1 && rankB === -1) return a.name.localeCompare(b.name); 
        if (rankA === -1) return 1; 
        if (rankB === -1) return -1; 
        
        return rankA - rankB; 
    });
  }, [data, filter]);

  const totalKg = filteredData.reduce((sum, d) => sum + d.totalKg, 0);
  const totalQty = convertQty(totalKg, unit);

  let totalOutrightVal = 0;
  let totalHedgeVal = 0;

  filteredData.forEach(d => {
    totalOutrightVal += toUSClb(d.wAvgOutright50kg) * d.totalKg;
    totalHedgeVal += d.wAvgHedgeUSClb * d.totalKg;
  });

  const globalAvgOutrightUSClb = totalKg ? totalOutrightVal / totalKg : 0;
  const globalAvgHedge = totalKg ? totalHedgeVal / totalKg : 0;
  const globalAvgDiff = globalAvgOutrightUSClb - globalAvgHedge;

  return (
    <div className="space-y-6">
      
      <div className="flex justify-between items-end">
        <FilterTabs active={filter} onChange={setFilter} />
        <div className="text-xs text-[#968C83] pb-2 italic">Showing {filter} strategies</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 border-l-4 border-l-[#007680]">
          <div className="text-[#968C83] text-xs font-uppercase font-bold tracking-wider">TOTAL INVENTORY</div>
          <div className="text-2xl font-bold text-[#51534a] mt-1">
            {formatNumber(totalQty, 0)} <span className="text-sm font-normal text-[#968C83]">{unit.toUpperCase()}</span>
          </div>
        </Card>
        <Card className="p-4 border-l-4 border-l-[#5B3427]">
          <div className="text-[#968C83] text-xs font-uppercase font-bold tracking-wider">GLOBAL W.AVG DIFF</div>
          <div className={`text-2xl font-bold mt-1 ${globalAvgDiff > 0 ? 'text-[#97D700]' : 'text-[#B9975B]'}`}>
            {globalAvgDiff > 0 ? '+' : ''}{formatNumber(globalAvgDiff)} <span className="text-sm font-normal text-[#968C83]">c/lb</span>
          </div>
        </Card>
        <Card className="p-4 border-l-4 border-l-[#007680]">
          <div className="text-[#968C83] text-xs font-uppercase font-bold tracking-wider">GLOBAL HEDGE LEVEL</div>
          <div className="text-2xl font-bold text-[#007680] mt-1">
            {formatNumber(globalAvgHedge)} <span className="text-sm font-normal text-[#968C83]">c/lb</span>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden border-none shadow-md">
        {/* SCROLLABLE TABLE (Max Height) */}
        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#51534a] text-white font-medium sticky top-0 z-10">
              <tr>
                <th className="py-3 px-4 w-8"></th>
                <th className="py-3 px-4">Position Strategy</th>
                <th className="py-3 px-4 text-right">Available ({unit.toUpperCase()})</th>
                <th className="py-3 px-4 text-right">Outright ($/50kg)</th>
                <th className="py-3 px-4 text-right">Hedge (USC/lb)</th>
                <th className="py-3 px-4 text-right">Diff (USC/lb)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D6D2C4]">
              {filteredData.length > 0 ? filteredData.map((row) => {
                // --- OPTIMIZATION: Calculate missing value metrics once ---
                // We define "missing value" as outrightPrice50kg being 0 or falsy
                const validBatchesKg = row.batches.reduce((sum, b) => (b.outrightPrice50kg ? sum + b.quantityKg : sum), 0);
                const hasMissingValues = validBatchesKg < row.totalKg;
                const coveragePct = row.totalKg > 0 ? (validBatchesKg / row.totalKg) * 100 : 100;

                return (
                <React.Fragment key={row.name}>
                  <tr 
                    className={`cursor-pointer transition-colors border-l-4 
                        ${expandedRow === row.name ? 'bg-[#D6D2C4]/30' : ''}
                        ${hasMissingValues ? 'bg-amber-50 border-l-amber-400 hover:bg-amber-100' : 'bg-white border-l-transparent hover:bg-[#D6D2C4]/20'}
                    `}
                    onClick={() => setExpandedRow(expandedRow === row.name ? null : row.name)}
                  >
                    <td className="py-3 px-4 text-[#968C83]">
                      {expandedRow === row.name ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </td>
                    <td className="py-3 px-4 font-medium text-[#007680]">
                        <div className="flex items-center gap-2">
                            {row.name}
                            {/* Percentage Badge for Missing Values */}
                            {hasMissingValues && (
                                <span className="text-[9px] font-bold bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full border border-amber-300" title="Percentage of weight with valid prices">
                                    {formatNumber(coveragePct, 1)}% Priced
                                </span>
                            )}
                        </div>
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-[#51534a]">{formatNumber(convertQty(row.totalKg, unit), 0)}</td>
                    <td className="py-3 px-4 text-right text-[#51534a]">{formatNumber(row.wAvgOutright50kg)}</td>
                    <td className="py-3 px-4 text-right text-[#968C83]">{formatNumber(row.wAvgHedgeUSClb)}</td>
                    <td className={`py-3 px-4 text-right font-medium ${row.wAvgDiffUSClb >= 0 ? 'text-[#6FA287]' : 'text-[#B9975B]'}`}>
                      {row.wAvgDiffUSClb > 0 ? '+' : ''}{formatNumber(row.wAvgDiffUSClb)}
                    </td>
                  </tr>
                  {expandedRow === row.name && (
                    <tr>
                      <td colSpan={6} className="bg-[#D6D2C4]/30 px-4 pb-4 pt-0">
                        <div className="bg-white rounded border border-[#D6D2C4] overflow-hidden mt-2">
                          <table className="w-full text-xs">
                            <thead className="bg-[#D6D2C4]/50 text-[#51534a]">
                              <tr>
                                <th className="py-2 px-4 text-left">Batch ID</th>
                                <th className="py-2 px-4 text-right">Qty ({unit})</th>
                                <th className="py-2 px-4 text-right">Price ($/50kg)</th>
                                <th className="py-2 px-4 text-right">Hedge (c/lb)</th>
                                <th className="py-2 px-4 text-right">Diff (c/lb)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#D6D2C4]/30">
                              {row.batches.map((batch, idx) => {
                                const isBatchMissing = !batch.outrightPrice50kg;
                                const batchDiff = toUSClb(batch.outrightPrice50kg) - batch.hedgeLevelUSClb;
                                return (
                                  <tr key={`${batch.id}-${idx}`} className={isBatchMissing ? 'bg-amber-50' : ''}> 
                                    <td className="py-2 px-4 font-mono text-[#007680] flex items-center gap-2">
                                        {batch.batch_number || batch.id}
                                        {isBatchMissing && <AlertCircle size={10} className="text-amber-500" />}
                                    </td>
                                    <td className="py-2 px-4 text-right text-[#51534a]">{formatNumber(convertQty(batch.quantityKg, unit), 0)}</td>
                                    <td className={`py-2 px-4 text-right ${isBatchMissing ? 'text-amber-600 font-bold' : 'text-[#51534a]'}`}>
                                        {isBatchMissing ? 'MISSING' : formatNumber(batch.outrightPrice50kg)}
                                    </td>
                                    <td className="py-2 px-4 text-right text-[#968C83]">{formatNumber(batch.hedgeLevelUSClb)}</td>
                                    <td className="py-2 px-4 text-right text-[#51534a]">{formatNumber(batchDiff)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )}) : (
                  <tr>
                      <td colSpan={6} className="py-8 text-center text-[#968C83] italic">
                          No {filter} strategies found.
                      </td>
                  </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}


function StrategicBlender({ data, unit }: { data: StrategyAggregate[], unit: Unit }) {
  const [strategicFilter, setStrategicFilter] = useState('POST');

  const filteredData = useMemo(() => {
    return data.filter(d => d.name.toUpperCase().startsWith(strategicFilter));
  }, [data, strategicFilter]);

  const [allocation, setAllocation] = useState<Record<string, number>>({});
  const [overrides, setOverrides] = useState<Record<string, { value: number, mode: OverrideMode }>>({});
  const [uiModes, setUiModes] = useState<Record<string, OverrideMode>>({});

  useEffect(() => {
    const init: Record<string, number> = {};
    filteredData.forEach(d => init[d.name] = 0);
    setAllocation(init);
  }, [filteredData]);

  const totalAllocation = Object.values(allocation).reduce((a, b) => a + b, 0);

  const handleSliderChange = (strategy: string, val: number) => {
    const currentVal = allocation[strategy] || 0;
    const otherAllocations = totalAllocation - currentVal;
    const maxAllowed = 100 - otherAllocations;

    let newVal = val;
    if (newVal > maxAllowed) {
        newVal = maxAllowed;
    }

    setAllocation(prev => ({ ...prev, [strategy]: newVal }));
  };

  const handleOverrideChange = (strategy: string, valStr: string, currentMode: OverrideMode) => {
    const val = parseFloat(valStr);
    setOverrides(prev => {
      const next = { ...prev };
      if (isNaN(val)) {
        delete next[strategy];
      } else {
        next[strategy] = { value: val, mode: currentMode };
      }
      return next;
    });
  };

  const getMode = (name: string) => overrides[name]?.mode || uiModes[name] || 'outright';
  
  const setMode = (name: string, mode: OverrideMode) => {
      setUiModes(prev => ({...prev, [name]: mode}));
      if (overrides[name]) {
          setOverrides(prev => {
              const next = { ...prev };
              delete next[name];
              return next;
          });
      }
  }

  const blendMetrics = useMemo(() => {
    let wAvgOutrightUSClb = 0;
    let wAvgHedgeUSClb = 0;

    filteredData.forEach(d => {
      const percent = (allocation[d.name] || 0) / 100;
      const override = overrides[d.name];
      
      let priceUSClb = 0;
      if (override) {
        if (override.mode === 'outright') {
            priceUSClb = toUSClb(override.value);
        } else {
            priceUSClb = d.wAvgHedgeUSClb + override.value;
        }
      } else {
        priceUSClb = toUSClb(d.wAvgOutright50kg);
      }
      
      wAvgOutrightUSClb += priceUSClb * percent;
      wAvgHedgeUSClb += d.wAvgHedgeUSClb * percent;
    });

    const wAvgDiff = wAvgOutrightUSClb - wAvgHedgeUSClb;
    const wAvgOutright50kg = to50kg(wAvgOutrightUSClb);

    return { wAvgOutright50kg, wAvgDiff, wAvgHedgeUSClb };
  }, [allocation, filteredData, overrides]);

  return (
    <div className="flex flex-col gap-6">
      
      <div className="flex justify-start">
        <FilterTabs active={strategicFilter} onChange={setStrategicFilter} />
      </div>

      <Card className="p-6 shadow-lg" variant="dark">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
            <div>
                <h3 className="text-[#D6D2C4] text-sm font-semibold uppercase tracking-wider mb-4">Estimated Pricing</h3>
                <div className="flex items-end gap-2">
                    <div className="text-5xl font-bold text-white">${formatNumber(blendMetrics.wAvgOutright50kg)}</div>
                    <div className="text-[#A7BDB1] mb-2 font-medium">/50kg</div>
                </div>
                <div className="text-[#D6D2C4] text-sm mt-1">Blended Outright Price</div>
            </div>

            <div className="flex gap-8 p-4 bg-[#5B3427] rounded-lg border border-[#968C83]/30 w-full md:w-auto">
                <div>
                    <div className="text-[#D6D2C4] text-xs mb-1 uppercase tracking-wide">Hedge Level</div>
                    <div className="text-2xl font-mono text-white">{formatNumber(blendMetrics.wAvgHedgeUSClb)}</div>
                    <div className="text-[10px] text-[#A7BDB1]">USC/LB</div>
                </div>
                <div className="w-px bg-[#968C83]/50 h-12"></div>
                <div>
                    <div className="text-[#D6D2C4] text-xs mb-1 uppercase tracking-wide">Differential</div>
                    <div className={`text-2xl font-mono ${blendMetrics.wAvgDiff > 0 ? 'text-[#97D700]' : 'text-[#CEB888]'}`}>
                    {blendMetrics.wAvgDiff > 0 ? '+' : ''}{formatNumber(blendMetrics.wAvgDiff)}
                    </div>
                    <div className="text-[10px] text-[#A7BDB1]">USC/LB</div>
                </div>
            </div>
        </div>
        
        {totalAllocation !== 100 ? (
            <div className="mt-6 flex items-center gap-2 text-[#CEB888] bg-[#CEB888]/10 p-3 rounded border border-[#CEB888]/20">
            <AlertCircle size={16} />
            <span className="text-xs">Allocations must sum to 100% for accurate pricing. Current: {totalAllocation}%</span>
            </div>
        ) : (
            <div className="mt-6 flex items-center gap-2 text-[#97D700] bg-[#97D700]/10 p-3 rounded border border-[#97D700]/20">
            <Check size={16} />
            <span className="text-xs font-bold">Allocation Complete (100%)</span>
            </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex justify-between items-center mb-6 border-b border-[#D6D2C4] pb-4">
            <h3 className="font-semibold text-lg text-[#51534a]">Blend Composition</h3>
            <div className="text-sm text-[#968C83]">
                Adjust percentages or override market prices
            </div>
        </div>
        
        {/* SCROLLABLE LIST (Max Height) */}
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
        {filteredData.map((d) => { 
            const mode = getMode(d.name);
            const hasOverride = !!overrides[d.name];
            // --- NEW: Highlight Condition ---
            const isLowVolume = d.totalKg < 9600;
            
            return (
            <div 
                key={d.name} 
                className={`transition-all ${isLowVolume ? 'bg-yellow-50 border border-yellow-200 rounded-lg p-3' : 'py-2 border-b border-[#D6D2C4]/30 last:border-0'}`}
            >
                <div className="flex flex-col xl:flex-row xl:items-center gap-4">
                    
                    {/* 1. Name & Info Stats (Left) */}
                    <div className="xl:w-1/4 min-w-[200px] shrink-0">
                        <div className="font-medium text-[#51534a] flex items-center gap-2">
                            {d.name}
                            {hasOverride && <span className="text-[10px] bg-[#CEB888]/20 text-[#CEB888] px-1.5 py-0.5 rounded">Manual</span>}
                            {isLowVolume && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-bold border border-yellow-200">Low Vol</span>}
                        </div>
                        <div className="text-[10px] text-[#968C83] mt-0.5 flex flex-wrap gap-x-2">
                            <span><b>{formatNumber(convertQty(d.totalKg, unit))}</b> {unit}</span>
                            <span className="text-[#D6D2C4]">|</span>
                            <span>Inv: ${formatNumber(d.wAvgOutright50kg)}</span>
                        </div>
                    </div>

                    {/* 2. Slider Controls (Middle - Grows) */}
                    <div className="flex-1 flex items-center gap-4">
                        <input 
                        type="range" 
                        min="0" 
                        max={100} 
                        value={allocation[d.name] || 0} 
                        onChange={(e) => handleSliderChange(d.name, parseInt(e.target.value))}
                        className={`flex-1 h-2 rounded-lg appearance-none cursor-pointer ${isLowVolume ? 'bg-yellow-200 accent-yellow-600' : 'bg-[#D6D2C4] accent-[#007680]'}`}
                        />
                        <div className="w-16 relative shrink-0">
                        <input 
                            type="number" 
                            value={allocation[d.name] || 0}
                            onChange={(e) => handleSliderChange(d.name, parseInt(e.target.value))}
                            className="w-full pl-2 pr-5 py-1.5 border border-[#D6D2C4] rounded text-right text-sm font-medium text-[#51534a] bg-white/60 focus:ring-1 focus:ring-[#007680] outline-none"
                        />
                        <span className="absolute right-2 top-2 text-[#968C83] text-xs">%</span>
                        </div>
                    </div>

                    {/* 3. Price Override Controls (Right) */}
                    <div className="flex items-center gap-2 w-full xl:w-auto shrink-0 justify-end">
                        <div className="flex items-center gap-2 bg-[#D6D2C4]/20 p-1 rounded-lg border border-[#D6D2C4]/50">
                            <button 
                                onClick={() => setMode(d.name, mode === 'outright' ? 'diff' : 'outright')}
                                className="text-[10px] font-bold uppercase tracking-wider px-2 py-1.5 rounded bg-white border border-[#D6D2C4] text-[#968C83] hover:text-[#007680] w-16 text-center transition-colors shadow-sm"
                            >
                                {mode === 'outright' ? '$/50kg' : 'Diff'}
                            </button>
                            <div className="relative w-24">
                                <input 
                                    type="number" 
                                    placeholder={mode === 'outright' ? formatNumber(d.wAvgOutright50kg) : formatNumber(d.wAvgDiffUSClb)}
                                    className={`w-full text-sm border rounded px-2 py-1 text-right focus:ring-2 focus:ring-[#007680] outline-none ${hasOverride ? 'border-[#CEB888] bg-[#CEB888]/10' : 'border-[#D6D2C4] bg-white'}`}
                                    onChange={(e) => handleOverrideChange(d.name, e.target.value, mode)}
                                />
                            </div>
                        </div>
                    </div>

                </div>
            </div>
            );
        })}
        </div>
      </Card>
    </div>
  );
}
function BatchBlender({ data, unit }: { data: StrategyAggregate[], unit: Unit }) {
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('POST');
    const [hideUnpriced, setHideUnpriced] = useState(false);
    
    // Hover state for Donut Chart
    const [hoveredSegment, setHoveredSegment] = useState<any | null>(null);
    
    const [selectedBatches, setSelectedBatches] = useState<{ batch: Batch, useKg: number }[]>([]);
    const [fobbingCost, setFobbingCost] = useState<number>(0); 
    const [salePriceDiff, setSalePriceDiff] = useState<number>(0);
    const [targetVolume, setTargetVolume] = useState<number>(0);
    const [targetClient, setTargetClient] = useState('');
    const [saleRef, setSaleRef] = useState('');
    const [validationMsg, setValidationMsg] = useState<string | null>(null);
  
    const allBatches = useMemo(() => data.flatMap(s => s.batches), [data]);
    
    const filteredBatches = allBatches.filter(b => {
      const matchesSearch = (b.batch_number?.toLowerCase() || b.id.toLowerCase()).includes(search.toLowerCase()) || 
                            b.strategy.toLowerCase().includes(search.toLowerCase());
      const matchesStrategy = b.strategy.toUpperCase().startsWith(filter);
      const matchesPrice = !hideUnpriced || (b.outrightPrice50kg && b.outrightPrice50kg > 0);

      return matchesStrategy && matchesSearch && matchesPrice;
    });
  
    const addToBlend = (batch: Batch) => {
      if (selectedBatches.find(s => s.batch.id === batch.id)) return;
      setSelectedBatches([...selectedBatches, { batch, useKg: batch.quantityKg }]);
    };
  
    const removeFromBlend = (batchId: string) => {
      setSelectedBatches(selectedBatches.filter(s => s.batch.id !== batchId));
    };
  
    const updateBatchQty = (batchId: string, qty: number) => {
      setSelectedBatches(prev => prev.map(s => s.batch.id === batchId ? { ...s, useKg: qty } : s));
    };
  
    // --- CALCULATIONS ---
  
    const blendStats = useMemo(() => {
      let totalKg = 0;
      let totalValUSClb = 0;
      let totalHedgeVal = 0;
  
      selectedBatches.forEach(item => {
        const valUSClb = toUSClb(item.batch.outrightPrice50kg);
        totalValUSClb += valUSClb * item.useKg;
        totalHedgeVal += item.batch.hedgeLevelUSClb * item.useKg;
        totalKg += item.useKg;
      });
  
      const avgOutrightUSClb = totalKg ? totalValUSClb / totalKg : 0;
      const avgHedge = totalKg ? totalHedgeVal / totalKg : 0;
      const avgDiff = avgOutrightUSClb - avgHedge;
      const finalCostDiff = avgDiff + fobbingCost;
      const pnlPerLb = salePriceDiff - finalCostDiff;
      
      const totalLbs = totalKg * KG_TO_LB;
      const totalPnLUSD = (pnlPerLb / 100) * totalLbs;
      
      return {
        totalKg,
        avgOutright50kg: to50kg(avgOutrightUSClb),
        avgHedge,
        avgDiff,
        finalCostDiff,
        pnl: pnlPerLb,
        totalPnLUSD
      };
    }, [selectedBatches, fobbingCost, salePriceDiff]);

    // --- STRATEGY DISTRIBUTION LOGIC ---
    const strategyDistribution = useMemo(() => {
        const counts: Record<string, number> = {};
        selectedBatches.forEach(b => {
            counts[b.batch.strategy] = (counts[b.batch.strategy] || 0) + b.useKg;
        });
        return Object.entries(counts)
            .map(([key, val]) => ({
                name: key,
                value: val,
                percentage: blendStats.totalKg ? (val / blendStats.totalKg) * 100 : 0
            }))
            .sort((a, b) => b.value - a.value);
    }, [selectedBatches, blendStats.totalKg]);
  
    const currentVolUnit = convertQty(blendStats.totalKg, unit);
    const targetProgress = targetVolume > 0 ? (currentVolUnit / targetVolume) * 100 : 0;
    const isTargetMet = targetVolume > 0 && currentVolUnit >= targetVolume;
  
    // --- EXPORT LOGIC ---
    const handleExport = () => {
      if (selectedBatches.length === 0) return;
  
      if (!targetClient.trim() || !saleRef.trim()) {
          setValidationMsg("Please enter Target Client and Sale Ref to export.");
          setTimeout(() => setValidationMsg(null), 3000);
          return;
      }
  
      const csvRows = [];
      
      csvRows.push('BLEND SUMMARY REPORT');
      csvRows.push(`Target Client, ${targetClient}`);
      csvRows.push(`Sale Ref, ${saleRef}`);
      csvRows.push(`Target Volume, ${targetVolume} ${unit}`);
      csvRows.push(`Actual Volume, ${formatNumber(currentVolUnit)} ${unit}`);
      csvRows.push(`W.Avg Diff (c/lb), ${formatNumber(blendStats.avgDiff)}`);
      csvRows.push(`Fobbing Cost (c/lb), ${fobbingCost}`);
      csvRows.push(`Sale Price Diff (c/lb), ${salePriceDiff}`);
      csvRows.push(`P&L (c/lb), ${formatNumber(blendStats.pnl)}`);
      // P&L USD Export: Kept as per existing page.tsx (Split into two cells via comma)
      csvRows.push(`P&L (USD), ${formatNumber(blendStats.totalPnLUSD)}`);
      csvRows.push('');
      
      // Add Distribution Section to CSV
      csvRows.push('POSITION STRATEGY DISTRIBUTION');
      csvRows.push(`Strategy,Weight (${unit}),% Share`);
      strategyDistribution.forEach(d => {
        csvRows.push(`${d.name},${formatNumber(convertQty(d.value, unit))},${formatNumber(d.percentage)}%`);
      });
      csvRows.push(''); 

      csvRows.push('DETAILED BATCH LIST');
      csvRows.push('Batch ID,Strategy,Weight (kg),% of Blend,Price ($/50kg),Hedge (c/lb),Diff (c/lb)');
      
      selectedBatches.forEach(({ batch, useKg }) => {
          const diff = toUSClb(batch.outrightPrice50kg) - batch.hedgeLevelUSClb;
          const pct = blendStats.totalKg > 0 ? (useKg / blendStats.totalKg) * 100 : 0;
          csvRows.push(
              `${batch.batch_number || batch.id},${batch.strategy},${useKg},${formatNumber(pct)}%,${batch.outrightPrice50kg},${batch.hedgeLevelUSClb},${formatNumber(diff)}`
          );
      });
  
      const csvString = csvRows.join('\n');
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      if (link.download !== undefined) {
          const url = URL.createObjectURL(blob);
          link.setAttribute('href', url);
          link.setAttribute('download', `blend_export_${saleRef}.csv`);
          link.style.visibility = 'hidden';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      }
    };
  
    // --- IMPACT ANALYSIS ---
    const impactAnalysis = useMemo(() => {
      const impactMap: Record<string, {
          diff: { original: number, new: number, change: number },
          hedge: { original: number, new: number, change: number },
          outright: { original: number, new: number, change: number }
      }> = {};
  
      const selectedByStrategy: Record<string, { kg: number, valOutright: number, valHedge: number }> = {};
      selectedBatches.forEach(s => {
          if (!selectedByStrategy[s.batch.strategy]) {
              selectedByStrategy[s.batch.strategy] = { kg: 0, valOutright: 0, valHedge: 0 };
          }
          const priceUSClb = toUSClb(s.batch.outrightPrice50kg);
          selectedByStrategy[s.batch.strategy].kg += s.useKg;
          selectedByStrategy[s.batch.strategy].valOutright += priceUSClb * s.useKg;
          selectedByStrategy[s.batch.strategy].valHedge += s.batch.hedgeLevelUSClb * s.useKg;
      });
  
      data.forEach(strat => {
        if (selectedByStrategy[strat.name]) {
          const removal = selectedByStrategy[strat.name];
          
          const origKg = strat.totalKg;
          const origAvgOutrightUSClb = toUSClb(strat.wAvgOutright50kg);
          const origAvgHedgeUSClb = strat.wAvgHedgeUSClb;
          const origAvgDiffUSClb = strat.wAvgDiffUSClb;
  
          const origTotalValOutright = origAvgOutrightUSClb * origKg;
          const origTotalValHedge = origAvgHedgeUSClb * origKg;
  
          const newKg = origKg - removal.kg;
          
          if (newKg > 0) {
              const newTotalValOutright = origTotalValOutright - removal.valOutright;
              const newTotalValHedge = origTotalValHedge - removal.valHedge;
              
              const newAvgOutrightUSClb = newTotalValOutright / newKg;
              const newAvgHedgeUSClb = newTotalValHedge / newKg;
              const newAvgDiffUSClb = newAvgOutrightUSClb - newAvgHedgeUSClb;
  
              impactMap[strat.name] = {
                  diff: {
                      original: origAvgDiffUSClb,
                      new: newAvgDiffUSClb,
                      change: newAvgDiffUSClb - origAvgDiffUSClb
                  },
                  hedge: {
                      original: origAvgHedgeUSClb,
                      new: newAvgHedgeUSClb,
                      change: newAvgHedgeUSClb - origAvgHedgeUSClb
                  },
                  outright: {
                      original: strat.wAvgOutright50kg,
                      new: to50kg(newAvgOutrightUSClb),
                      change: to50kg(newAvgOutrightUSClb) - strat.wAvgOutright50kg
                  }
              };
          } else {
               impactMap[strat.name] = {
                  diff: { original: origAvgDiffUSClb, new: 0, change: 0 },
                  hedge: { original: origAvgHedgeUSClb, new: 0, change: 0 },
                  outright: { original: strat.wAvgOutright50kg, new: 0, change: 0 }
              };
          }
        }
      });
      return impactMap;
    }, [selectedBatches, data]);
  
    // --- Helper for Donut Chart ---
    const donutSegments = useMemo(() => {
        let cumulativePercent = 0;
        const colors = ['#007680', '#97D700', '#B9975B', '#51534a', '#CEB888', '#A7BDB1'];
        
        return strategyDistribution.map((d, i) => {
            const startPercent = cumulativePercent;
            cumulativePercent += d.percentage;
            
            // Calculate SVG path
            const getCoordinatesForPercent = (percent: number) => {
                const x = Math.cos(2 * Math.PI * percent);
                const y = Math.sin(2 * Math.PI * percent);
                return [x, y];
            };

            const [startX, startY] = getCoordinatesForPercent(startPercent / 100);
            const [endX, endY] = getCoordinatesForPercent(cumulativePercent / 100);
            const largeArcFlag = d.percentage > 50 ? 1 : 0;
            
            // SVG Path command
            const pathData = [
                `M ${startX} ${startY}`, // Move to start
                `A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY}`, // Arc
                `L 0 0`, // Line to center
            ].join(' ');

            return { pathData, color: colors[i % colors.length], ...d };
        });
    }, [strategyDistribution]);

    return (
      <div className="flex gap-6 h-[90vh]">
        {/* Left Pane: Picker */}
        <div className="flex h-full overflow-hidden">
          <Card className="flex-1 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#D6D2C4] bg-white sticky top-0 z-10">
              {/* Filter Buttons */}
              <FilterTabs active={filter} onChange={setFilter} />
  
              <div className="relative mt-2 flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#968C83]" size={18} />
                    <input 
                    type="text"
                    placeholder="Search batches..."
                    className="w-full pl-10 pr-4 py-2 border border-[#D6D2C4] rounded-lg focus:ring-2 focus:ring-[#007680] outline-none"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                {/* Toggle Button for Unpriced Batches */}
                <button 
                    onClick={() => setHideUnpriced(!hideUnpriced)}
                    className={`px-3 py-1 text-xs font-bold rounded border transition-all flex flex-col items-center justify-center ${
                        hideUnpriced 
                        ? 'bg-[#007680] text-white border-[#007680]' 
                        : 'bg-white text-[#51534a] border-[#D6D2C4] hover:bg-[#F5F5F3]'
                    }`}
                    title={hideUnpriced ? "Show All Batches" : "Hide Unpriced Batches"}
                >
                    <span className="leading-none">Hide</span>
                    <span className="leading-none text-[8px] uppercase">Unpriced</span>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-[#D6D2C4]/20">
              {filteredBatches.length > 0 ? filteredBatches.map(batch => {
                const hasPrice = batch.outrightPrice50kg && batch.outrightPrice50kg > 0;
                
                return (
                <div 
                    key={batch.id} 
                    className={`p-2 rounded border hover:border-[#007680]/50 transition-all flex justify-between items-center group
                        ${hasPrice ? 'bg-white border-[#D6D2C4]' : 'bg-red-50 border-red-200'}
                    `}
                >
                  <div>
                    <div className="font-mono text-sm font-medium text-[#007680] flex items-center gap-2">
                        {batch.batch_number || batch.id}
                        {!hasPrice && <span className="text-[9px] bg-red-100 text-red-600 px-1 rounded font-bold">NO PRICE</span>}
                    </div>
                    <div className="text-xs text-[#968C83]">{batch.strategy} • {formatNumber(convertQty(batch.quantityKg, unit), 0)} {unit}</div>
                  </div>

                  <div>
                    <div className="flex justify-between">
                      <div className="text-right mr-4">
                        <div className={`text-sm font-medium ${hasPrice ? 'text-[#51534a]' : 'text-red-400'}`}>
                            {hasPrice ? `$${formatNumber(batch.outrightPrice50kg)}` : '---'}
                        </div>
                        <div className="text-[10px] text-[#968C83]">Hedge: {formatNumber(batch.hedgeLevelUSClb)}</div>
                        <div className="text-[10px] text-[#968C83]">
                            Diff: {hasPrice ? formatNumber(toUSClb(batch.outrightPrice50kg) - batch.hedgeLevelUSClb) : '---'}
                        </div>
                      </div>
                      <button 
                        onClick={() => addToBlend(batch)}
                        className="opacity-0 group-hover:opacity-100 bg-[#A4DBE8]/20 text-[#007680] p-2 rounded-full hover:bg-[#A4DBE8]/40 transition-all"
                      >
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </div>
                  
                </div>
              )}) : (
                <div className="text-center p-8 text-[#968C83] italic text-sm">
                  No batches found {hideUnpriced ? '(Unpriced Hidden)' : ''}
                </div>
              )}
            </div>
          </Card>
        </div>
        
       
  
        {/* Right Pane: The Blend */}
        <div className="flex h-full overflow-hidden">
              <div className="flex flex-col h-fulls relative rounded-xl overflow-hidden shadow-sm border border-[#968C83]/20 bg-white">
          
          {/* 1. HEADER: Consolidate Controls */}
          <div className="bg-white border-b border-[#D6D2C4] p-4 space-y-4">
              {/* Row 1: Title + Export */}
              <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-[#51534a] flex items-center gap-2">
                      <FlaskConical size={18} />
                      Current Blend ({selectedBatches.length})
                  </h3>
                  <div className="flex items-center gap-2">
                      {validationMsg && <span className="text-xs text-red-500 font-medium animate-pulse">{validationMsg}</span>}
                      <button 
                          onClick={handleExport}
                          className="text-xs text-[#007680] hover:text-[#007680]/80 font-medium flex items-center gap-1 bg-[#A4DBE8]/20 px-3 py-1.5 rounded border border-[#007680]/20 transition-all"
                      >
                      <Download size={14} /> Export CSV
                      </button>
                  </div>
              </div>
  
              {/* Row 2: All Inputs Grid */}
              <div className="flex">
                  <div className="flex flex-col">
                    <div className='flex-12'>
                    {/* Client */}
                    <div className="flex-6">
                        <label className="text-[10px] font-bold text-[#968C83] uppercase tracking-wider block mb-1">Client *</label>
                        <input 
                            type="text"
                            className={`w-full border rounded px-2 py-1 text-xs h-8 outline-none focus:border-[#007680] ${validationMsg && !targetClient ? 'border-red-400 bg-red-50' : 'border-[#D6D2C4]'}`}
                            placeholder="Starbucks"
                            value={targetClient}
                            onChange={(e) => setTargetClient(e.target.value)}
                        />
                    </div>
                    {/* Ref */}
                    <div className="flex-6">
                        <label className="text-[10px] font-bold text-[#968C83] uppercase tracking-wider block mb-1">Ref *</label>
                        <input 
                            type="text"
                            className={`w-full border rounded px-2 py-1 text-xs h-8 outline-none focus:border-[#007680] ${validationMsg && !saleRef ? 'border-red-400 bg-red-50' : 'border-[#D6D2C4]'}`}
                            placeholder="SSKE-"
                            value={saleRef}
                            onChange={(e) => setSaleRef(e.target.value)}
                        />
                    </div>
                  </div>

                  <div>
                      <label className="text-[10px] font-bold text-[#968C83] uppercase tracking-wider block mb-1">Costs & Pricing (c/lb)</label>
                      <div className="flex gap-2">
                          <div className="flex items-center border border-[#D6D2C4] rounded px-2 h-8 flex-1">
                              <span className="text-[10px] text-[#968C83] mr-2">FOB Cost:</span>
                              <input 
                                  type="number" 
                                  className="w-full bg-transparent border-none text-[#51534a] text-xs font-medium text-right outline-none"
                                  placeholder="0.00"
                                  value={fobbingCost || ''}
                                  onChange={e => setFobbingCost(parseFloat(e.target.value) || 0)}
                              />
                          </div>
                          <div className="flex items-center border border-[#D6D2C4] rounded px-2 h-8 flex-1">
                               <span className="text-[10px] text-[#968C83] mr-2">Sale Diff:</span>
                               <input 
                                  type="number" 
                                  className="w-full bg-transparent border-none text-[#51534a] text-xs font-medium text-right outline-none"
                                  placeholder="+0.00"
                                  value={salePriceDiff || ''}
                                  onChange={e => setSalePriceDiff(parseFloat(e.target.value) || 0)}
                              />
                          </div>
                      </div>
                  </div>
                  </div>
                  
                  {/* Target Vol + Donut Chart Area - UPDATED LAYOUT */}
                  <div className="col-span-2 flex gap-4 h-full items-center">
                      {/* DONUT CHART (Increased size w-48) */}
                      <div className="w-48 shrink-0 flex items-center justify-center relative">
                        {strategyDistribution.length > 0 ? (
                            <>
                                {/* Increased SVG size to w-40 h-40 */}
                                <svg viewBox="-1.2 -1.2 2.4 2.4" className="w-40 h-40 -rotate-90">
                                    {donutSegments.map((segment, i) => (
                                        <path 
                                            key={i}
                                            d={segment.pathData}
                                            fill={segment.color}
                                            stroke="white"
                                            strokeWidth="0.05"
                                            onMouseEnter={() => setHoveredSegment(segment)}
                                            onMouseLeave={() => setHoveredSegment(null)}
                                            className="transition-all duration-200 hover:opacity-80 cursor-pointer"
                                        />
                                    ))}
                                    {/* Donut Hole Background */}
                                    <circle cx="0" cy="0" r="0.6" fill="white" />
                                </svg>
                                
                                {/* Center Overlay (Tooltip/Info) */}
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    {hoveredSegment ? (
                                        <div className="flex flex-col items-center bg-white/90 p-1 rounded">
                                            <span className="text-[10px] font-bold text-[#51534a] text-center leading-tight max-w-[100px] truncate">{hoveredSegment.name}</span>
                                            <span className="text-xs font-bold text-[#007680]">{formatNumber(hoveredSegment.percentage, 1)}%</span>
                                        </div>
                                    ) : (
                                        // Default view when not hovering
                                        <div className="flex flex-col items-center opacity-50">
                                            <span className="text-[9px] text-[#968C83] italic">Distrib.</span>
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="w-32 h-32 rounded-full border-4 border-[#D6D2C4]/30 flex items-center justify-center text-[8px] text-[#968C83] italic">
                                No Data
                            </div>
                        )}
                      </div>

                      {/* TARGET VOL (Width reduced to w-36) */}
                      <div className="w-36 shrink-0 flex flex-col justify-end pb-1">
                          <div className="flex justify-between mb-1">
                               <label className="text-[10px] font-bold text-[#968C83] uppercase tracking-wider block">Target ({unit})</label>
                               <span className={`text-[10px] font-bold ${isTargetMet ? 'text-[#97D700]' : 'text-[#B9975B]'}`}>
                                  {formatNumber(targetProgress, 0)}%
                               </span>
                          </div>
                          <div className="relative">
                              <input 
                                  type="number"
                                  className="w-full border border-[#D6D2C4] rounded px-2 py-1 text-xs h-8 outline-none focus:border-[#007680]"
                                  placeholder="0"
                                  value={targetVolume || ''}
                                  onChange={(e) => setTargetVolume(parseFloat(e.target.value) || 0)}
                              />
                              <div className="absolute bottom-0 left-0 h-1 bg-[#D6D2C4] w-full rounded-b overflow-hidden">
                                  <div className={`h-full ${isTargetMet ? 'bg-[#97D700]' : 'bg-[#007680]'}`} style={{ width: `${Math.min(targetProgress, 100)}%` }} />
                              </div>
                          </div>
                      </div>
                  </div>
                  
                  {/* Fobbing */}
                  
              </div>
          </div>
          
          {/* 2. BODY: Scrollable List + Impact */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-[#D6D2C4]/10">
              {/* Batch List */}
              <div className="space-y-2">
                  {selectedBatches.length === 0 && (
                      <div className="py-8 text-center text-[#968C83] italic text-sm">
                          Select batches from the left to begin blending
                      </div>
                  )}
                  {selectedBatches.map((item) => {
                      // CALCULATE % OF BLEND
                      const percentOfBlend = blendStats.totalKg > 0 ? (item.useKg / blendStats.totalKg) * 100 : 0;
                      const hasPrice = item.batch.outrightPrice50kg > 0;
  
                      return (
                      <div key={item.batch.id} className={`p-3 rounded border shadow-sm relative flex justify-between items-center ${hasPrice ? 'bg-white border-[#D6D2C4]' : 'bg-red-50 border-red-200'}`}>
                          <div className="pr-4">
                              <div className="flex items-center gap-2">
                                  {/* Display Batch Number */}
                                  <span className="text-xs font-mono font-bold text-[#51534a]">{item.batch.batch_number || item.batch.id}</span>
                                  <span className="text-[10px] text-[#968C83] bg-[#D6D2C4]/30 px-1 rounded">{item.batch.strategy}</span>
                                  {!hasPrice && <span className="text-[8px] font-bold text-red-600 border border-red-300 px-1 rounded">NO PRICE</span>}
                              </div>
                              <div className="text-[10px] text-[#968C83] mt-1 flex gap-3">
                                  <span>Outright: {formatNumber(item.batch.outrightPrice50kg)}$/50</span>
                                  <span>Hedge: {formatNumber(item.batch.hedgeLevelUSClb)}</span>
                                  <span className={toUSClb(item.batch.outrightPrice50kg) - item.batch.hedgeLevelUSClb >= 0 ? 'text-[#6FA287]' : 'text-[#B9975B]'}>
                                      Diff: {formatNumber(toUSClb(item.batch.outrightPrice50kg) - item.batch.hedgeLevelUSClb)}
                                  </span>
                              </div>
                          </div>
                          
                          <div className="flex items-center gap-3">
                              {/* ADDED: Percentage Badge */}
                              <div className="text-[10px] font-bold text-[#007680] bg-[#A4DBE8]/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                                  <PieChart size={10} />
                                  {formatNumber(percentOfBlend, 1)}%
                              </div>
  
                              <div className="flex items-center border border-[#D6D2C4] rounded px-2 py-1 bg-[#D6D2C4]/10">
                                  <input 
                                      type="number" 
                                      className="w-16 text-xs bg-transparent text-right outline-none font-medium text-[#51534a]"
                                      value={convertQty(item.useKg, unit)}
                                      onChange={(e) => {
                                          // 4. Batch Blender: Cap Volume Logic
                                          let val = parseFloat(e.target.value);
                                          if (isNaN(val)) val = 0;
                                          
                                          // Calculate Max allowed in CURRENT UNIT
                                          const maxInUnit = convertQty(item.batch.quantityKg, unit);
                                          
                                          // Clamp values
                                          if (val < 0) val = 0;
                                          if (val > maxInUnit) val = maxInUnit;
  
                                          let newKg = val;
                                          if(unit === 'bag') newKg = val * 60;
                                          if(unit === 'mt') newKg = val * 1000;
                                          
                                          updateBatchQty(item.batch.id, newKg);
                                      }}
                                  />
                                  <span className="text-[10px] text-[#968C83] ml-1">{unit}</span>
                              </div>
                              <button 
                                  onClick={() => removeFromBlend(item.batch.id)}
                                  className="text-[#D6D2C4] hover:text-[#B9975B] p-1"
                              >
                                  <X size={14} />
                              </button>
                          </div>
                      </div>
                      );
                  })}
              </div>
  
              {/* Impact Analysis (Below list, but scrollable with it) */}
              {selectedBatches.length > 0 && (
              <div className="border-t border-[#D6D2C4] pt-4">
                  <h4 className="text-[10px] font-bold text-[#007680] uppercase tracking-wider mb-3 flex items-center gap-2">
                      <TrendingUp size={12} /> Inventory Impact (Price Change)
                  </h4>
                  <div className="space-y-2">
                  {Object.entries(impactAnalysis).map(([stratName, impact]) => (
                      <div key={stratName} className="bg-white p-2 rounded border border-[#D6D2C4] shadow-sm text-xs">
                          <div className="font-bold text-[#51534a] mb-1">{stratName}</div>
                          <div className="grid grid-cols-3 gap-2">
                               <div className="text-center border-r border-[#D6D2C4]/50 pr-2">
                                   <div className="text-[9px] text-[#968C83] uppercase">Diff</div>
                                   <div className={`font-bold ${impact.diff.change > 0 ? 'text-[#6FA287]' : 'text-[#B9975B]'}`}>
                                      {impact.diff.change > 0 ? '+' : ''}{formatNumber(impact.diff.change)}
                                   </div>
                                   <div className="text-[9px] text-[#968C83] mt-0.5 whitespace-nowrap">
                                      {formatNumber(impact.diff.original)} <span className="text-[#D6D2C4]">→</span> {formatNumber(impact.diff.new)}
                                   </div>
                               </div>
                               <div className="text-center border-r border-[#D6D2C4]/50 pr-2">
                                   <div className="text-[9px] text-[#968C83] uppercase">Hedge</div>
                                   <div className={`font-bold ${impact.hedge.change > 0 ? 'text-[#6FA287]' : 'text-[#B9975B]'}`}>
                                      {impact.hedge.change > 0 ? '+' : ''}{formatNumber(impact.hedge.change)}
                                   </div>
                                   <div className="text-[9px] text-[#968C83] mt-0.5 whitespace-nowrap">
                                      {formatNumber(impact.hedge.original)} <span className="text-[#D6D2C4]">→</span> {formatNumber(impact.hedge.new)}
                                   </div>
                               </div>
                               <div className="text-center">
                                   <div className="text-[9px] text-[#968C83] uppercase">Outright</div>
                                   <div className={`font-bold ${impact.outright.change > 0 ? 'text-[#6FA287]' : 'text-[#B9975B]'}`}>
                                      {impact.outright.change > 0 ? '+' : ''}{formatNumber(impact.outright.change)}
                                   </div>
                                   <div className="text-[9px] text-[#968C83] mt-0.5 whitespace-nowrap">
                                      {formatNumber(impact.outright.original)} <span className="text-[#D6D2C4]">→</span> {formatNumber(impact.outright.new)}
                                   </div>
                               </div>
                          </div>
                      </div>
                  ))}
                  </div>
              </div>
              )}
          </div>
  
          {/* 3. FOOTER: Sticky Summary Metrics */}
          <div className="bg-[#51534a] text-white p-4 border-t border-[#51534a] z-20">
               <div className="flex justify-between items-center mb-2">
                   <div className="text-[10px] text-[#D6D2C4] uppercase tracking-wider">W.Avg Diff</div>
                   <div className="font-mono font-bold text-lg">{formatNumber(blendStats.avgDiff)}</div>
               </div>
               <div className="flex justify-between items-center mb-2">
                   <div className="text-[10px] text-[#D6D2C4] uppercase tracking-wider">Total Cost (Diff+Fob)</div>
                   <div className="font-mono text-[#CEB888]">{formatNumber(blendStats.finalCostDiff)}</div>
               </div>
               <div className="h-px bg-white/10 my-2"></div>
               <div className="grid grid-cols-2 gap-4">
                   <div>
                      <div className="text-[10px] text-[#A7BDB1] uppercase tracking-wider">P&L (c/lb)</div>
                      <div className={`text-xl font-bold ${blendStats.pnl >= 0 ? 'text-[#97D700]' : 'text-[#B9975B]'}`}>
                          {blendStats.pnl > 0 ? '+' : ''}{formatNumber(blendStats.pnl)}
                      </div>
                   </div>
                   <div className="text-right">
                      <div className="text-[10px] text-[#A7BDB1] uppercase tracking-wider">Est. P&L ($)</div>
                      <div className={`text-xl font-bold ${blendStats.totalPnLUSD >= 0 ? 'text-[#97D700]' : 'text-[#B9975B]'}`}>
                          ${formatNumber(blendStats.totalPnLUSD, 0)}
                      </div>
                   </div>
               </div>
          </div>
  
        </div>
        </div>
        
      </div>
    );
  }

function BatchHistoryView({ unit }: { unit: Unit }) {
    const [search, setSearch] = useState('');
    const [result, setResult] = useState<Batch | null>(null);
    const [notFound, setNotFound] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSearch = async () => {
        if (!search.trim()) return;
        
        setLoading(true);
        setNotFound(false);
        setResult(null);

        try {
            const res = await fetch(`/api/batches/batch_history?id=${encodeURIComponent(search.trim())}`);
            if (res.ok) {
                const data = await res.json();
                setResult(data);
            } else {
                setNotFound(true);
            }
        } catch (e) {
            console.error("Search failed:", e);
            setNotFound(true);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Search Area */}
            <Card className="p-6">
                <div className="flex flex-col gap-2">
                    <h3 className="text-lg font-bold text-[#51534a] mb-2">Batch Lookup</h3>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#968C83]" size={20} />
                             <input 
                                type="text"
                                placeholder="Enter Batch ID (e.g. BLEND-2023-NOV-STARBUCKS)"
                                className="w-full pl-10 pr-4 py-3 border border-[#D6D2C4] rounded-lg focus:ring-2 focus:ring-[#007680] outline-none text-lg font-mono"
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setNotFound(false); // Clear error when typing
                                }}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                             />
                        </div>
                        <button 
                            onClick={handleSearch}
                            disabled={loading}
                            className="bg-[#007680] text-white px-6 rounded-lg font-medium hover:bg-[#007680]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Searching...' : 'Search'}
                        </button>
                    </div>
                    {notFound && (
                        <p className="text-sm text-[#B9975B] mt-2 flex items-center gap-2 font-medium">
                            <AlertCircle size={16} />
                            Batch "{search}" not found in history.
                        </p>
                    )}
                    <p className="text-xs text-[#968C83] mt-1">
                        Search archived history batches only.
                    </p>
                </div>
            </Card>

            {/* Result Area */}
            {result && (
                <div className="space-y-6">
                    {/* Summary Card */}
                    <Card className="p-6 shadow-lg" variant="dark">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <div className="flex items-center gap-3 mb-1">
                                    {/* Display batch_number */}
                                    <h2 className="text-2xl font-bold font-mono text-white">{result.batch_number || result.id}</h2>
                                    {result.status === 'active' ? (
                                        <span className="bg-[#007680] text-white text-[10px] uppercase font-bold px-2 py-1 rounded flex items-center gap-1">
                                            <PackageCheck size={12} /> Active
                                        </span>
                                    ) : (
                                        <span className="bg-[#968C83] text-white text-[10px] uppercase font-bold px-2 py-1 rounded flex items-center gap-1">
                                            <Archive size={12} /> Archived
                                        </span>
                                    )}
                                </div>
                                <div className="text-[#A7BDB1] text-sm">{result.strategy}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-3xl font-bold text-white">{formatNumber(convertQty(result.quantityKg, unit), 0)} <span className="text-sm font-normal text-[#A7BDB1]">{unit.toUpperCase()}</span></div>
                                <div className="text-[#D6D2C4] text-xs uppercase tracking-wider mt-1">Total Volume</div>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-4 border-t border-white/10 pt-4">
                             <div>
                                 <div className="text-[10px] text-[#A7BDB1] uppercase tracking-wider mb-1">Outright</div>
                                 <div className="text-xl font-bold text-white">${formatNumber(result.outrightPrice50kg)}</div>
                                 <div className="text-[10px] text-[#968C83]">/50kg</div>
                             </div>
                             <div>
                                 <div className="text-[10px] text-[#A7BDB1] uppercase tracking-wider mb-1">Hedge</div>
                                 <div className="text-xl font-bold text-white">{formatNumber(result.hedgeLevelUSClb)}</div>
                                 <div className="text-[10px] text-[#968C83]">c/lb</div>
                             </div>
                             <div>
                                 <div className="text-[10px] text-[#A7BDB1] uppercase tracking-wider mb-1">Differential</div>
                                 <div className={`text-xl font-bold ${toUSClb(result.outrightPrice50kg) - result.hedgeLevelUSClb >= 0 ? 'text-[#97D700]' : 'text-[#CEB888]'}`}>
                                    {toUSClb(result.outrightPrice50kg) - result.hedgeLevelUSClb > 0 ? '+' : ''}
                                    {formatNumber(toUSClb(result.outrightPrice50kg) - result.hedgeLevelUSClb)}
                                 </div>
                                 <div className="text-[10px] text-[#968C83]">c/lb</div>
                             </div>
                        </div>
                    </Card>

                    {/* Composition Table (If Blend) */}
                    {result.composition && result.composition.length > 0 ? (
                        <Card className="p-0 overflow-hidden">
                            <div className="p-4 bg-[#D6D2C4]/20 border-b border-[#D6D2C4] flex justify-between items-center">
                                <h3 className="font-bold text-[#51534a]">Composition Ingredients</h3>
                                <span className="text-xs text-[#968C83]">{result.composition.length} Batches</span>
                            </div>
                            <table className="w-full text-sm text-left">
                                <thead className="bg-[#51534a] text-white font-medium">
                                    <tr>
                                        <th className="py-3 px-4">Batch ID</th>
                                        <th className="py-3 px-4">Strategy</th>
                                        <th className="py-3 px-4 text-right">Weight ({unit})</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#D6D2C4]">
                                    {result.composition.map((comp, idx) => (
                                        <tr key={idx} className="hover:bg-[#D6D2C4]/10">
                                            <td className="py-3 px-4 font-mono text-[#007680] font-medium">{comp.batch_number}</td>
                                            <td className="py-3 px-4 text-[#51534a]">{comp.strategy}</td>
                                            <td className="py-3 px-4 text-right font-medium text-[#51534a]">{formatNumber(convertQty(comp.quantityKg, unit), 0)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Card>
                    ) : (
                         <div className="text-center p-8 border-2 border-dashed border-[#D6D2C4] rounded-xl text-[#968C83]">
                            <PackageCheck size={32} className="mx-auto mb-2 opacity-50" />
                            <p>This is a raw batch origin. No blend composition available.</p>
                         </div>
                    )}
                </div>
            )}
        </div>
    );
}

function ClientAnalysisView({ unit }: { unit: Unit }) {
    // Data State
    const [salesData, setSalesData] = useState<SaleRecord[]>([]);
    const [loading, setLoading] = useState(true);
    // State for editing
    const [editingId, setEditingId] = useState<string | null>(null);
    // State for the edited value
    const [editedDiff, setEditedDiff] = useState<number | string>('');

    const [selectedClients, setSelectedClients] = useState<string[]>([]);
    const [selectedSalesRefs, setSelectedSalesRefs] = useState<string[]>([]);
    const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]); 
    
    // New Date Range State
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    
    // Manual Fobbing Cost
    const [fobbingCost, setFobbingCost] = useState<number>(0);

    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: keyof SaleRecord | 'pnlTotal' | null, direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });

    // Fetch Data
    const fetchSales = async () => {
        try {
            const res = await fetch('/api/sale_records');
            if (res.ok) {
                const data = await res.json();
                setSalesData(data);
            } else {
                console.error("Failed to fetch sales data");
            }
        } catch (e) {
            console.error("Error loading sales data:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSales();
    }, []);

    // Extract unique options from loaded data
    const clients = useMemo(() => Array.from(new Set(salesData.map(s => s.client))), [salesData]);
    const salesRefs = useMemo(() => Array.from(new Set(salesData.map(s => s.contract_number))), [salesData]); // Changed to contract_number (sale_ref)
    const strategies = useMemo(() => Array.from(new Set(salesData.map(s => s.strategy))), [salesData]);

    const filteredData = useMemo(() => {
        return salesData.filter(item => {
            const matchClient = selectedClients.length === 0 || selectedClients.includes(item.client);
            const matchSalesRef = selectedSalesRefs.length === 0 || selectedSalesRefs.includes(item.contract_number);
            const matchStrat = selectedStrategies.length === 0 || selectedStrategies.includes(item.strategy);
            
            // Date Filter Logic
            const itemDate = new Date(item.date);
            let matchDate = true;
            if (startDate) {
                matchDate = matchDate && itemDate >= new Date(startDate);
            }
            if (endDate) {
                matchDate = matchDate && itemDate <= new Date(endDate);
            }

            return matchClient && matchSalesRef && matchStrat && matchDate;
        });
    }, [salesData, selectedClients, selectedSalesRefs, selectedStrategies, startDate, endDate]);

    // Sorting Logic
    const sortedData = useMemo(() => {
        let sortableItems = [...filteredData];
        if (sortConfig.key) {
            sortableItems.sort((a, b) => {
                let aValue: any = a[sortConfig.key as keyof SaleRecord];
                let bValue: any = b[sortConfig.key as keyof SaleRecord];

                // Handle calculated P&L sorting dynamically based on fobbing cost
                if (sortConfig.key === 'pnl_total') {
                    // Margin = Sale Diff - Cost Diff - Fobbing
                    const marginA = (a.is_sale_diff_null ? 0 : a.sale_fob_diff) - a.cost_diff - fobbingCost;
                    const marginB = (b.is_sale_diff_null ? 0 : b.sale_fob_diff) - b.cost_diff - fobbingCost;
                    // Note: This logic uses the dynamic margin, effectively overriding the pnl_total from backend for sorting purposes
                    aValue = (marginA / 100) * (a.quantity * KG_TO_LB);
                    bValue = (marginB / 100) * (b.quantity * KG_TO_LB);
                } 
                // Handle Margin sorting dynamically
                else if (sortConfig.key === 'pnl_per_lb') {
                     const valA = a.is_sale_diff_null ? 0 : a.sale_fob_diff;
                     const valB = b.is_sale_diff_null ? 0 : b.sale_fob_diff;
                     aValue = valA - a.cost_diff - fobbingCost;
                     bValue = valB - b.cost_diff - fobbingCost;
                }

                if (aValue < bValue) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [filteredData, sortConfig, fobbingCost]);

    const requestSort = (key: keyof SaleRecord | 'pnlTotal') => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIcon = (name: string) => {
        if (sortConfig.key === name) {
            return sortConfig.direction === 'asc' ? <ChevronDown size={14} className="inline ml-1" /> : <ChevronRight size={14} className="inline ml-1 rotate-180" />; 
        }
        return null;
    };
    
    // Handle Edit Start
    const handleEditClick = (record: SaleRecord) => {
        if (editingId === record.id) {
            setEditingId(null); // Cancel
            setEditedDiff('');
        } else {
            setEditingId(record.id);
            setEditedDiff(record.is_sale_diff_null ? '' : record.sale_fob_diff);
        }
    };

    // Handle Save Logic
    const handleSaveSaleDiff = async (id: string) => {
        if (editedDiff === '' || isNaN(Number(editedDiff))) {
            alert("Please enter a valid number for Sale Differential");
            return;
        }

        try {
            const response = await fetch('/api/sale_records', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ id, sale_differential: Number(editedDiff) }),
            });

            if (response.ok) {
                // Success - Refresh Data or Update Locally
                setEditingId(null);
                fetchSales(); // Reload data to reflect changes and re-calcs
            } else {
                alert("Failed to update sale differential");
            }
        } catch (error) {
            console.error("Update failed:", error);
            alert("An error occurred while updating.");
        }
    };

    // Aggregate KPI
    const summary = useMemo(() => {
        let totalKg = 0;
        let totalPnLUSD = 0;
        let totalMarginVal = 0;

        filteredData.forEach(item => {
            totalKg += item.quantity;
            
            // Re-calculate P&L with dynamic Fobbing Cost
            // Margin = Sale Diff - Cost Diff - Fobbing
            // If sale diff is null, treat sale diff as 0 for calculation (or margin as 0 depending on business logic)
            // Here assuming sale_fob_diff is 0 if null based on mapper
            
            // --- NEW: Only calc margin/pnl if NOT NULL ---
            if (!item.is_sale_diff_null) {
                 const saleDiff = item.sale_fob_diff;
                 const margin = saleDiff - item.cost_diff - fobbingCost;
                 const pnlUSD = (margin / 100) * (item.quantity * KG_TO_LB);
                 
                 totalPnLUSD += pnlUSD;
                 totalMarginVal += margin * item.quantity;
            }
        });
        
        const wAvgMargin = totalKg ? totalMarginVal / totalKg : 0;

        return { totalKg, totalPnLUSD, wAvgMargin, count: filteredData.length };
    }, [filteredData, fobbingCost]);

    if (loading) {
        return <div className="p-8 text-center text-[#968C83]">Loading Sales Data...</div>;
    }

    return (
        <div className="space-y-6">
            {/* Filter Bar */}
            <Card className="p-4 flex flex-col xl:flex-row gap-4 items-center justify-between">
                <div className="flex flex-col md:flex-row items-center gap-4 w-full xl:w-auto flex-wrap">
                    <div className="flex items-center gap-2 text-sm text-[#51534a] font-medium whitespace-nowrap">
                        <Filter size={16} className="text-[#007680]" />
                        Filters
                    </div>
                    <MultiSelect options={clients} selected={selectedClients} onChange={setSelectedClients} placeholder="Clients" searchable />
                    <MultiSelect options={salesRefs} selected={selectedSalesRefs} onChange={setSelectedSalesRefs} placeholder="Sales Refs" searchable />
                    <MultiSelect options={strategies} selected={selectedStrategies} onChange={setSelectedStrategies} placeholder="Strategies" searchable />
                    <div className="flex items-center gap-2 border-l border-[#D6D2C4] pl-4 w-full md:w-auto">
                        <span className="text-xs text-[#968C83] uppercase font-bold whitespace-nowrap">Exit Warehouse:</span>
                        <input type="date" className="bg-white border border-[#D6D2C4] rounded px-2 py-1 text-xs outline-none focus:border-[#007680] text-[#51534a] h-8" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                        <span className="text-[#968C83]">-</span>
                        <input type="date" className="bg-white border border-[#D6D2C4] rounded px-2 py-1 text-xs outline-none focus:border-[#007680] text-[#51534a] h-8" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    </div>
                    <div className="flex items-center gap-2 border-l border-[#D6D2C4] pl-4 w-full md:w-auto">
                        <span className="text-xs text-[#968C83] uppercase font-bold whitespace-nowrap">Fobbing (c/lb):</span>
                        <div className="flex items-center bg-white border border-[#D6D2C4] rounded px-2 py-1 w-24 h-8">
                            <DollarSign size={10} className="text-[#968C83]" />
                            <input type="number" className="w-full text-xs outline-none text-[#51534a] font-medium text-right" placeholder="0.00" value={fobbingCost || ''} onChange={(e) => setFobbingCost(parseFloat(e.target.value) || 0)} />
                        </div>
                    </div>
                </div>
                <div className="text-xs text-[#968C83] whitespace-nowrap self-end xl:self-center">
                    Showing {summary.count} records
                </div>
            </Card>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4 border-l-4 border-l-[#007680]">
                    <div className="text-[#968C83] text-xs font-uppercase font-bold tracking-wider">TOTAL VOLUME SOLD</div>
                    <div className="text-2xl font-bold text-[#51534a] mt-1">
                        {formatNumber(convertQty(summary.totalKg, unit), 0)} <span className="text-sm font-normal text-[#968C83]">{unit.toUpperCase()}</span>
                    </div>
                </Card>
                <Card className="p-4 border-l-4 border-l-[#5B3427]">
                    <div className="text-[#968C83] text-xs font-uppercase font-bold tracking-wider">AVG MARGIN (P&L)</div>
                    <div className={`text-2xl font-bold mt-1 ${summary.wAvgMargin >= 0 ? 'text-[#97D700]' : 'text-[#B9975B]'}`}>
                        {summary.wAvgMargin > 0 ? '+' : ''}{formatNumber(summary.wAvgMargin)} <span className="text-sm font-normal text-[#968C83]">c/lb</span>
                    </div>
                </Card>
                <Card className="p-4 border-l-4 border-l-[#007680]">
                    <div className="text-[#968C83] text-xs font-uppercase font-bold tracking-wider">TOTAL THEORETICAL P&L</div>
                    <div className={`text-2xl font-bold mt-1 ${summary.totalPnLUSD >= 0 ? 'text-[#007680]' : 'text-[#B9975B]'}`}>
                        ${formatNumber(summary.totalPnLUSD, 0)}
                    </div>
                </Card>
            </div>

            {/* Detailed Table */}
            <Card className="overflow-hidden border-none shadow-md">
                <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-[#51534a] text-white font-medium text-xs uppercase tracking-wider sticky top-0 z-10">
                            <tr>
                                <th className="py-3 px-4 cursor-pointer hover:bg-[#5B3427]/80 transition-colors" onClick={() => requestSort('date')}>Exit Date {getSortIcon('date')}</th>
                                <th className="py-3 px-4 cursor-pointer hover:bg-[#5B3427]/80 transition-colors" onClick={() => requestSort('contract_number')}>Sales Ref {getSortIcon('contract_number')}</th>
                                <th className="py-3 px-4 cursor-pointer hover:bg-[#5B3427]/80 transition-colors" onClick={() => requestSort('client')}>Client {getSortIcon('client')}</th>
                                <th className="py-3 px-4">Strategy</th>
                                <th className="py-3 px-4 text-right cursor-pointer hover:bg-[#5B3427]/80 transition-colors" onClick={() => requestSort('quantity')}>Vol ({unit}) {getSortIcon('quantity')}</th>
                                <th className="py-3 px-4 text-right bg-[#5B3427]">Hedge (c/lb)</th>
                                <th className="py-3 px-4 text-right bg-[#5B3427]">Cost Outright ($/50kg)</th>
                                <th className="py-3 px-4 text-right bg-[#5B3427]">Cost Diff (c/lb)</th>
                                <th className="py-3 px-4 text-right bg-[#007680]">Sale Diff (c/lb)</th>
                                <th className="py-3 px-4 text-right font-bold text-[#97D700] bg-[#51534a] cursor-pointer hover:bg-[#5B3427]/80 transition-colors" onClick={() => requestSort('pnl_per_lb')}>Margin (c/lb) {getSortIcon('pnl_per_lb')}</th>
                                <th className="py-3 px-4 text-right font-bold text-white bg-[#51534a] cursor-pointer hover:bg-[#5B3427]/80 transition-colors" onClick={() => requestSort('pnlTotal')}>Total P&L ($) {getSortIcon('pnlTotal')}</th>
                                <th className="py-3 px-4 w-10 bg-[#51534a]"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#D6D2C4]">
                            {sortedData.map((row) => {
                                const isNull = row.is_sale_diff_null;
                                const saleDiff = isNull ? 0 : row.sale_fob_diff;
                                const margin = saleDiff - row.cost_diff - fobbingCost;
                                const pnlUSD = (margin / 100) * (row.quantity * KG_TO_LB);
                                const isEditing = editingId === row.id;

                                return (
                                    <tr key={row.id} className="hover:bg-[#D6D2C4]/20 transition-colors">
                                        <td className="py-3 px-4 text-[#968C83] whitespace-nowrap text-xs">{formatDate(row.date)}</td>
                                        <td className="py-3 px-4 font-mono text-[#007680] font-medium text-xs">{row.contract_number}</td>
                                        <td className="py-3 px-4 text-[#51534a] font-medium text-xs max-w-60 truncate" title={row.client}>{row.client}</td>
                                        <td className="py-3 px-4 text-[#51534a] text-xs">{row.strategy}</td>
                                        <td className="py-3 px-4 text-right text-[#51534a] font-mono text-xs">{formatNumber(convertQty(row.quantity, unit), 0)}</td>
                                        <td className="py-3 px-4 text-right text-[#968C83] font-mono text-xs bg-[#D6D2C4]/10 border-l border-[#D6D2C4]">{formatNumber(row.hedge_level)}</td>
                                        <td className="py-3 px-4 text-right text-[#51534a] font-mono text-xs bg-[#D6D2C4]/10">${formatNumber(row.cost_usd_50)}</td>
                                        <td className="py-3 px-4 text-right text-[#51534a] font-mono text-xs bg-[#D6D2C4]/10">{formatNumber(row.cost_diff)}</td>
                                        <td className="py-3 px-4 text-right text-[#007680] font-mono text-xs font-bold bg-[#A4DBE8]/10 border-l border-[#D6D2C4]">
                                            {isEditing ? (
                                                <input 
                                                    type="number" 
                                                    className="w-16 text-right border border-[#007680] rounded px-1 py-0.5 text-xs outline-none"
                                                    value={editedDiff}
                                                    onChange={(e) => setEditedDiff(e.target.value)}
                                                    autoFocus
                                                />
                                            ) : (
                                                isNull ? '-' : formatNumber(row.sale_fob_diff)
                                            )}
                                        </td>
                                        <td className={`py-3 px-4 text-right font-bold text-xs border-l border-[#D6D2C4] ${margin >= 0 ? 'text-[#6FA287] bg-[#97D700]/10' : 'text-[#B9975B] bg-[#B9975B]/10'}`}>
                                            {isNull ? '-' : (margin > 0 ? '+' : '') + formatNumber(margin)}
                                        </td>
                                        <td className={`py-3 px-4 text-right font-bold text-xs ${pnlUSD >= 0 ? 'text-[#007680]' : 'text-[#B9975B]'}`}>
                                            {isNull ? '-' : '$' + formatNumber(pnlUSD, 0)}
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            {isEditing ? (
                                                <button onClick={() => handleSaveSaleDiff(row.id)} className="p-1 rounded hover:bg-[#97D700]/20 transition-colors text-[#97D700]" title="Save"><Check size={14} /></button>
                                            ) : (
                                                <button onClick={() => handleEditClick(row)} className="p-1 rounded hover:bg-[#D6D2C4]/40 transition-colors text-[#968C83]" title="Edit"><Pencil size={14} /></button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {sortedData.length === 0 && (
                                <tr>
                                    <td colSpan={12} className="py-8 text-center text-[#968C83] italic">No sales records found matching filters.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}

// --- Helper Component: Flow Bar Chart ---
const FlowBarChart = ({ data, height = "h-16" }: { data: { label: string, value: number }[], height?: string }) => {
    // Calculate max absolute value for scaling
    const maxVal = Math.max(...data.map(d => Math.abs(d.value))) || 1;
    
    return (
        <div className={`w-full flex items-end ${height} gap-0`}>
            {data.map((d, i) => {
                const val = d.value;
                const absVal = Math.abs(val);
                // Scaling: Max bar height is 40% of container height (leaving 10% buffer from center to top/bottom for text)
                const pct = (absVal / maxVal) * 40; 
                const isNeg = val < 0;
                
                // Color Logic: Positive = Teal (#007680), Negative = Coffee Brown (#5B3427)
                const colorClass = isNeg ? 'bg-[#5B3427]' : 'bg-[#007680]';

                return (
                    <div key={i} className="flex-1 h-full relative group min-w-0">
                        {/* Label at Bottom */}
                        <div className="absolute bottom-0 w-full text-[8px] text-[#968C83] text-center font-medium leading-tight truncate px-0.5" title={d.label}>
                            {d.label}
                        </div>
                        
                        {/* Chart Area (Above label) */}
                        {/* FIX: Removed 'relative' class which conflicted with 'absolute' */}
                        <div className="absolute top-0 bottom-4 w-full">
                            {/* Zero Line */}
                            <div className="absolute top-1/2 w-full border-t border-[#D6D2C4]/50 z-0"></div>
                            
                            {/* Bar */}
                            <div 
                                className={`absolute left-0.5 right-0.5 transition-all duration-500 z-10 ${colorClass} rounded-sm opacity-90 hover:opacity-100`}
                                style={{ 
                                    height: `${Math.max(pct, 1)}%`, // Ensure at least a sliver is visible
                                    [isNeg ? 'top' : 'bottom']: '50%',
                                }}
                            ></div>

                            {/* Value Text - Always Visible */}
                            {absVal > 0 && (
                                <div 
                                    className={`absolute w-full text-center text-[9px] font-bold leading-none z-20 overflow-hidden text-ellipsis px-0.5 ${isNeg ? 'text-[#5B3427]' : 'text-[#007680]'}`}
                                    style={{
                                        [isNeg ? 'top' : 'bottom']: `calc(50% + ${Math.max(pct, 1)}% + 3px)`
                                    }}
                                    title={formatNumber(absVal, 0)}
                                >
                                    {formatNumber(absVal, 0)}
                                </div>
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
    );
};

function DashboardView({ unit }: { unit: Unit }) {

  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Activity Inspector State
  const [selectedStrategy, setSelectedStrategy] = useState<string>('');
  const [selectedGrade, setSelectedGrade] = useState<string>('');
  const [activeMetricData, setActiveMetricData] = useState<any>(null);

  // Fetch Data
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const query = new URLSearchParams();
        if (fromDate) query.append('fromDate', fromDate);
        if (toDate) query.append('toDate', toDate);

        const res = await fetch(`/api/overall_summary?${query.toString()}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (e) {
        console.error("Failed to load dashboard", e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [fromDate, toDate]);

  // Handle Dropdown Logic
  const handleStrategyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedStrategy(val);
    setSelectedGrade('');
    if (val && data?.recentStrategyActivities) {
      const found = data.recentStrategyActivities.find((s: any) => s.strategy === val);
      setActiveMetricData(found);
    } else {
      setActiveMetricData(null);
    }
  };

  const handleGradeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedGrade(val);
    setSelectedStrategy('');
    if (val && data?.recentGradeActivities) {
      const found = data.recentGradeActivities.find((g: any) => g.grade === val);
      setActiveMetricData(found);
    } else {
      setActiveMetricData(null);
    }
  };

  // Process Pending Batches by Location
  const locationChartData = useMemo(() => {
    if (!data?.pendingBatches) return [];
    
    const groups: Record<string, number> = {};
    data.pendingBatches.forEach((b: any) => {
      const loc = b.from_location || 'Unknown';
      groups[loc] = (groups[loc] || 0) + Number(b.balance_to_transfer);
    });

    return Object.entries(groups)
      .map(([name, qty]) => ({ name, value: qty }))
      .sort((a, b) => b.value - a.value); 
  }, [data]);

  const getVal = (kg: number) => convertQty(Number(kg || 0), unit);

  // Initial Load State
  if (loading && !data) return <div className="p-8 text-center text-[#968C83]">Loading Dashboard...</div>;
  if (!data) return <div className="p-8 text-center text-[#B9975B]">Failed to load data.</div>;

  const stockSummary = data.recentStockSummary || {};
  
  // Highlight Logic
  const isDateRangeSelected = fromDate && toDate;

  // 1. Stock Summary Flow Data
  const stockFlowData = [
    { label: 'Inbound', value: getVal(stockSummary.total_inbound_qty) }, // Positive (Teal)
    { label: 'Outbound', value: -getVal(stockSummary.total_outbound_qty) }, // Negative (Brown)
    { label: 'Adjust', value: getVal(stockSummary.total_stock_adjustment_qty) } // Mixed
  ];

  // 2. Activity Flow Data (Dynamic based on selection)
  let activityFlowData: { label: string, value: number }[] = [];
  if (activeMetricData) {
      activityFlowData = [
          { label: 'Inbound', value: getVal(activeMetricData.inbound_qty) },
          { label: 'From Proc', value: getVal(activeMetricData.from_processing_qty) },
          { label: 'Loss/Gain', value: getVal(activeMetricData.loss_gain_qty) },
          { label: 'Adjust', value: getVal(activeMetricData.stock_adjustment_qty) },
          { label: 'To Proc', value: -getVal(activeMetricData.to_processing_qty) },
          { label: 'Outbound', value: -getVal(activeMetricData.outbound_qty) },
      ];
  }

  return (
    <div className={`space-y-4 animate-in fade-in duration-300 pb-10 ${loading ? 'opacity-60 transition-opacity' : ''}`}>
      
      {/* 1. STOCK SUMMARY CARD */}
      <Card className="p-4 bg-[#51534a] text-white border-none shadow-md">
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-white/10 pb-4 gap-4">
             <div className="flex flex-col">
                <h3 className="font-bold text-[#007680] flex items-center gap-2"><TrendingUp size={16}/> Stock Position</h3>
                
             </div>
             <div>
              <span className={`text-md mt-1 transition-colors ${!isDateRangeSelected ? 'text-[#97D700] font-bold' : 'text-[#A7BDB1]'}`}>
                    {stockSummary.date ? formatDate(stockSummary.date) : "Most Recent"}
              </span>
              
              {/* Date Range Filter */}
              <div className={`flex items-center gap-2 bg-[#F5F5F3] border rounded px-2 py-1 shadow-inner shrink-0 transition-all ${isDateRangeSelected ? 'border-[#97D700] ring-2 ring-[#97D700]/50' : 'border-[#D6D2C4]'}`}>
                  <Filter size={14} className="text-[#007680]" />
                  <span className="text-[10px] text-[#51534a] font-bold uppercase">Range:</span>
                  <input type="date" className="text-xs text-[#51534a] bg-transparent outline-none font-medium w-24" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                  <span className="text-[#51534a]">-</span>
                  <input type="date" className="text-xs text-[#51534a] bg-transparent outline-none font-medium w-24" value={toDate} onChange={e => setToDate(e.target.value)} />
                  {isDateRangeSelected && (
                      <button onClick={() => { setFromDate(''); setToDate(''); }} className="ml-1 text-[#B9975B] hover:text-[#968C83]"><X size={12} /></button>
                  )}
              </div>
             </div>
         </div>

         <div className="flex flex-col lg:flex-row gap-8">
            {/* Top Row: Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center flex-1">
                <div>
                    <div className="text-[9px] text-[#A7BDB1] uppercase tracking-wider mb-0.5">Opening</div>
                    <div className="text-lg font-bold text-[#007680]">{formatNumber(getVal(stockSummary.total_opening_qty), 0)}</div>
                </div>
                <div>
                    <div className="text-[9px] text-[#A7BDB1] uppercase tracking-wider mb-0.5">Inbound</div>
                    <div className="text-lg font-bold text-[#97D700]">{formatNumber(getVal(stockSummary.total_inbound_qty), 0)}</div>
                </div>
                <div>
                    <div className="text-[9px] text-[#A7BDB1] uppercase tracking-wider mb-0.5">Outbound</div>
                    <div className="text-lg font-bold text-[#B9975B]">{formatNumber(getVal(stockSummary.total_outbound_qty), 0)}</div>
                </div>
                <div>
                    <div className="text-[9px] text-[#A7BDB1] uppercase tracking-wider mb-0.5">Adjustments</div>
                    <div className="text-lg font-bold text-[#007680]">{formatNumber(getVal(stockSummary.total_stock_adjustment_qty), 0)}</div>
                </div>
                <div className="bg-white/10 rounded px-2 py-1 border border-white/20">
                    <div className="text-[9px] text-[#97D700] uppercase tracking-wider mb-0.5">Closing Stock</div>
                    <div className="text-xl font-bold text-[#007680]">{formatNumber(getVal(stockSummary.total_xbs_closing_stock), 0)} <span className="text-[9px] text-white/50 font-normal">{unit}</span></div>
                </div>
            </div>

            {/* Right Side: Movement Flow Chart */}
            <div className="lg:w-64 shrink-0 flex flex-col justify-end border-l border-white/10 pl-6">
                <div className="text-[9px] text-[#A7BDB1] mb-2 uppercase tracking-wider text-center">Net Flow Visualization</div>
                <FlowBarChart data={stockFlowData} height="h-12" />
            </div>
         </div>
      </Card>

      {/* 2. LAYOUT CHANGE: Activity Inspector + Processing P&L Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Activity Inspector (2/3) */}
        <Card className="lg:col-span-2 p-4 border-t-4 border-t-[#007680]">
            <div className="flex flex-col lg:flex-row gap-4 mb-4 justify-between items-start lg:items-center border-b border-[#D6D2C4]/50 pb-4">
                <h3 className="font-bold text-[#51534a] text-sm flex items-center gap-2">
                    <BarChart3 size={16} className="text-[#007680]" />
                    Strategy & Grade Flow
                </h3>
                <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto lg:flex-1 lg:justify-end">
                    <select className="border border-[#D6D2C4] rounded p-1.5 text-xs text-[#51534a] outline-none focus:border-[#007680] bg-white min-w-[150px]" value={selectedStrategy} onChange={handleStrategyChange}>
                        <option value="">-- Inspect Strategy --</option>
                        {data.recentStrategyActivities?.map((s: any) => <option key={s.id} value={s.strategy}>{s.strategy}</option>)}
                    </select>
                    <select className="border border-[#D6D2C4] rounded p-1.5 text-xs text-[#51534a] outline-none focus:border-[#007680] bg-white min-w-[150px]" value={selectedGrade} onChange={handleGradeChange}>
                        <option value="">-- Inspect Grade --</option>
                        {data.recentGradeActivities?.map((g: any) => <option key={g.id} value={g.grade}>{g.grade}</option>)}
                    </select>
                </div>
            </div>
            
            <div className="bg-[#F5F5F3] rounded-lg p-3 border border-[#D6D2C4] min-h-[120px] flex items-center justify-center relative overflow-hidden">
                {!activeMetricData ? (
                    <div className="text-[#968C83] italic text-xs flex items-center gap-2"><Search size={14} /> Select a Strategy or Grade above to view specific flow.</div>
                ) : (
                    <div className="w-full grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                        {/* Summary Numbers */}
                        <div className="md:col-span-4 flex flex-col gap-3 border-r border-[#D6D2C4] pr-4">
                            <div className="text-center mb-1"><span className="bg-[#007680] text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">{selectedStrategy || selectedGrade}</span></div>
                            <div className="flex justify-between items-center bg-white p-2 rounded shadow-sm border border-[#D6D2C4]">
                                <div className="text-[9px] text-[#968C83] uppercase">Opening</div>
                                <div className="font-bold text-[#51534a] text-sm">{formatNumber(getVal(activeMetricData.opening_qty), 0)}</div>
                            </div>
                            <div className="flex justify-between items-center bg-[#51534a] p-2 rounded shadow-sm border border-[#51534a]">
                                <div className="text-[9px] text-[#A7BDB1] uppercase">Closing</div>
                                <div className="font-bold text-white text-base">{formatNumber(getVal(activeMetricData.xbs_closing_stock), 0)}</div>
                            </div>
                        </div>

                        {/* Chart Visualization */}
                        <div className="md:col-span-8">
                            <div className="text-[9px] text-[#968C83] mb-2 uppercase tracking-wider text-center">Volume Movement Analysis</div>
                            <FlowBarChart data={activityFlowData} height="h-24" />
                        </div>
                    </div>
                )}
            </div>
        </Card>

        {/* Right: Processing P&L (1/3) - Moved here */}
        <Card className="p-4 flex flex-col justify-center gap-2 bg-[#51534a] text-white">
            <div className='w-full flex justify-between'>
                <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 bg-white/10 rounded-lg">
                        <FlaskConical size={20} className="text-[#97D700]" />
                    </div>
                    <div>
                        <h3 className="font-bold text-black">Processing P&L</h3>
                    </div>
                </div>
                <div>
                    <button 
                        onClick={() => router.push('/processing')}
                        className="bg-white p-2 rounded-lg border border-[#D6D2C4] shadow-sm text-[#51534a] hover:bg-[#F5F5F3] hover:text-[#007680] transition-all flex items-center justify-center"
                        title="Go to processes" >
                        <Cog size={18} />
                    </button>
                </div>
            </div>
            <div className="text-center py-4 border-y border-white/10 my-1">
                <div className={`text-3xl font-bold ${data.recentPnl >= 0 ? 'text-[#97D700]' : 'text-[#B9975B]'}`}>${formatNumber(data.recentPnl, 2)}</div>
                <div className="text-xs text-[#A7BDB1] mt-1">Net Profit/Loss</div>
            </div>
            <div className="text-center text-[10px] text-white/40">Calculated from daily processing records.</div>
        </Card>
      </div>

      {/* 3. LAYOUT CHANGE: Transfer Logistics Full Width Row */}
      <Card className="p-4 flex flex-col justify-between">
            <div className="flex justify-between items-center mb-3 border-b border-[#D6D2C4] pb-1"><h3 className="font-bold text-[#51534a] text-sm flex items-center gap-2"><CloudUpload size={16} className="text-[#007680]" /> Transfer Logistics</h3></div>
            <div className="grid grid-cols-3 gap-2 divide-x divide-[#D6D2C4]">
                <div className="px-1 text-center"><div className="text-[9px] text-[#968C83] uppercase font-bold tracking-wider mb-1">Instructed</div><div className="text-lg font-bold text-[#007680]">{formatNumber(getVal(data.instructed.overall), 0)}</div><div className="text-[9px] text-[#968C83]">{unit.toUpperCase()}</div>{!fromDate && (<div className="mt-1 text-[8px] bg-[#007680]/10 text-[#007680] px-1.5 py-0.5 rounded-full inline-block">Last Week: {formatNumber(getVal(data.instructed.lastWeek), 0)}</div>)}</div>
                <div className="px-1 text-center"><div className="text-[9px] text-[#968C83] uppercase font-bold tracking-wider mb-1">Delivered</div><div className="text-lg font-bold text-[#97D700]">{formatNumber(getVal(data.delivered.overall), 0)}</div><div className="text-[9px] text-[#968C83]">{unit.toUpperCase()}</div>{!fromDate && (<div className="mt-1 text-[8px] bg-[#97D700]/10 text-[#97D700] px-1.5 py-0.5 rounded-full inline-block">Last Week: {formatNumber(getVal(data.delivered.lastWeek), 0)}</div>)}</div>
                <div className="px-1 text-center"><div className="text-[9px] text-[#968C83] uppercase font-bold tracking-wider mb-1">Pending Rent</div><div className="text-lg font-bold text-[#B9975B]">${formatNumber(data.totalRentCosts, 0)}</div><div className="text-[9px] text-[#968C83]">USD (Est.)</div></div>
            </div>
      </Card>
      
      {/* 4. LAYOUT CHANGE: Pending Batches + Pending Variances (Old P&L Spot) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-4 flex flex-col h-64">
          <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-[#51534a] text-sm">Pending Batches by Location</h3><div className="text-[10px] text-[#968C83]">Total: {formatNumber(getVal(data.partiallyPendingVolume + data.fullyPendingVolume), 0)} {unit.toUpperCase()}</div></div>
          
          <div className="flex-1 flex gap-2 pb-2 overflow-x-auto custom-scrollbar">
            {locationChartData.length > 0 ? (
                locationChartData.map((item, idx) => {
                  const maxVal = Math.max(...locationChartData.map(d => getVal(d.value)));
                  const val = getVal(item.value);
                  const percent = maxVal > 0 ? (val / maxVal) * 100 : 0;
                  
                  return (
                    <div key={idx} className="flex flex-col items-center gap-1 group flex-1 min-w-[50px] h-full">
                        <div className="relative w-full flex justify-center items-end flex-1 bg-[#F5F5F3] rounded-t overflow-hidden">
                           <div 
                              className="w-full bg-[#007680] hover:bg-[#007680]/80 transition-all duration-500 rounded-t-sm relative group-hover:shadow-lg flex items-center justify-center overflow-hidden"
                              style={{ height: `${percent}%` }}
                           >
                               <span className="text-[9px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap select-none drop-shadow-sm px-1">
                                   {formatNumber(val, 0)}
                               </span>
                           </div>
                        </div>
                        <div className="text-[9px] text-[#51534a] font-medium text-center leading-tight h-6 flex items-center justify-center w-full break-words">
                            {item.name || "Unknown"}
                        </div>
                    </div>
                  );
                })
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[#968C83] italic text-xs">No pending stock data</div>
            )}
          </div>
        </Card>

        {/* Right: Pending & Variances (Moved here) */}
        <Card className="p-4 flex flex-col justify-between">
              <div className="flex justify-between items-center mb-3 border-b border-[#D6D2C4] pb-1"><h3 className="font-bold text-[#51534a] text-sm flex items-center gap-2"><AlertCircle size={16} className="text-[#B9975B]" /> Pending & Variances</h3></div>
              <div className="grid grid-cols-3 gap-2">
                  <div className="bg-[#F5F5F3] rounded p-2 text-center border border-[#D6D2C4]"><div className="text-[9px] text-[#968C83] uppercase font-bold tracking-wider mb-0.5">Fully</div><div className="text-base font-bold text-[#51534a]">{formatNumber(getVal(data.fullyPendingVolume), 0)}</div><div className="text-[8px] text-[#968C83]">{unit}</div></div>
                  <div className="bg-[#F5F5F3] rounded p-2 text-center border border-[#D6D2C4]"><div className="text-[9px] text-[#968C83] uppercase font-bold tracking-wider mb-0.5">Partially</div><div className="text-base font-bold text-[#007680]">{formatNumber(getVal(data.partiallyPendingVolume), 0)}</div><div className="text-[8px] text-[#968C83]">{unit}</div></div>
                  <div className={`rounded p-2 text-center border ${data.lossGain.overall >= 0 ? 'bg-[#97D700]/10 border-[#97D700]/30' : 'bg-[#B9975B]/10 border-[#B9975B]/30'}`}><div className="text-[9px] text-[#51534a] uppercase font-bold tracking-wider mb-0.5">Loss/Gain</div><div className={`text-base font-bold ${data.lossGain.overall >= 0 ? 'text-[#007680]' : 'text-[#B9975B]'}`}>{data.lossGain.overall > 0 ? '+' : ''}{formatNumber(getVal(data.lossGain.overall), 0)}</div><div className="text-[8px] text-[#51534a]">{unit}</div></div>
              </div>
        </Card>
      </div>

    </div>
  );
}

function KPICard({ title, value, subValue, unit, color }: any) {
    const colors: any = {
        blue: "border-l-[#007680] text-[#007680]",
        green: "border-l-[#97D700] text-[#97D700]",
        orange: "border-l-[#B9975B] text-[#B9975B]",
        red: "border-l-red-500 text-red-500",
    };

    return (
        <Card className={`p-4 border-l-4 ${colors[color] || colors.blue}`}>
            <div className="text-[#968C83] text-xs font-uppercase font-bold tracking-wider uppercase">{title}</div>
            <div className="text-2xl font-bold text-[#51534a] mt-1">
                {value} <span className="text-sm font-normal text-[#968C83]">{unit.toUpperCase()}</span>
            </div>
            {subValue && <div className="text-[10px] text-[#968C83] mt-1">{subValue}</div>}
        </Card>
    );
}