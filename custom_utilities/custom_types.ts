import { RowDataPacket } from "mysql2/promise";

export interface StockSummary {
    total_opening_quantity: number,
    total_to_processing_qty:number,
    total_from_processing_qty:number,
    total_loss_gain_qty:number,
    total_outbound_qty:number,
    total_regrade_discrepancy:number,
    total_inbound_qty:number,
    milling_loss:number,
    total_stock_adjustment_qty:number,
    total_xbs_closing_stock:number
}

/**
 * Interface for a row from the Stock Adjustment (STA) file.
 * Based on columns used in `processAdjustments`.
 */
export interface StaRow {
  'SA Date'?: Date | string | number;
  'Batch No.'?: string;
  'Item Name'?: string;
  'Qty.'?: string | number;
  Reason?: string;
  // Add other columns as needed
  [key: string]: any;
}

/**
 * Interface for the `stock_adjustment` table in the database.
 */
export interface StockAdjustment {
  id: number;
  adjustment_date: Date;
  grade: string;
  adjusted_quantity: number; // Corrected from `calc`
  strategy: string;
  batch_number: string;
  reason: string;
}


/**
 * Represents a row from the GDI (Outbound) Excel file.
 * Column names are based on the user's description.
 */
export interface GdiRow {
  'DC Date'?: Date | string;
  'Ticket No.'?: string | number;
  'GDI No'?: string | number;
  'DC No.'?: string | number;
  'Item Code_1'?: string;
  'Item Name'?: string;
  'Qty.'?: number;
  'Batch No.'?: string;
}

/**
 * Represents the schema for the `daily_outbounds` table.
 */
export interface DailyOutbound {
  id?: number;
  summary_id: number;
  dispatch_date: Date;
  dispatch_dc_numbers: string;
  dispatch_number: string;
  dispatched_grade: string;
  dispatched_quantity: number;
  dispatched_strategy: string;
  ticket_numbers: string;
  batch_number: string;
}


/**
 * Defines the structure of the data object returned by getStockDataframe.
 */
export interface StockData {
  blocked_for_processing_quantity: number;
  work_in_progress_quantity: number;
  total_closing_balance: number; // Spelling as requested
  grades_closing_balances: Record<string, number>;
  strategies_closing_balances: Record<string, number>;
}

// The new return type for the function
export interface ProcessSummary {
  processes: ProcessDetails[];
  total_input_quantity: number;
  total_output_quantity: number;
  total_milling_loss: number;
  total_processing_loss: number;
}


// Row from 'Processing Analysis' sheet
export type ProcessingAnalysisRow = {
  'Receipt Date'?: any;
  'Process No.'?: string | number;
  'Process Name'?: string;
  'Issue Date'?: any;
  'Item Name'?: string;
  'Batch No.'?: string;
  'Qty.'?: string | number;
  'Item Name_1'?: string;
  'Batch No._1'?: string;
  'Qty._1'?: string | number;
  'Loss/Gain'?: string | number;
  'Milling Loss'?: string | number;
  InputStrategy?: string;
  OutputStrategy?: string;
};

export type CurrentStockRow = {
  'Batch No.'?: string;
  'Position Strategy Allocation'?: string;
};


export interface BatchDetails {
  strategy: string;
  quantity: number;
}


export type OutboundRow = {
  dispatch_date: Date;
  dispatch_dc_numbers: string;
  dispatch_number: string;
  dispatched_grade: string;
  dispatched_quantity: number;
  dispatched_strategy: string;
  ticket_numbers: string;
  batch_number: string;
};

// Interface for a single process
export interface ProcessDetails {
  process_number: string | number;
  milling_loss: string | number;
  processing_loss: string | number;
  process_type: string;
  issue_date: Date | null;
  processing_date: Date | null;
  input_item_names: Record<string, number>;
  // --- MODIFIED: Changed to store BatchDetails object ---
  input_batches: Record<string, BatchDetails>;
  output_item_names: Record<string, number>;
  // --- MODIFIED: Changed to store BatchDetails object ---
  output_batches: Record<string, BatchDetails>;
}

/**
 * Interface for a raw row read from the 'Stock' file (CSV or Excel).
 */
export interface StockRow {
  'Qty.'?: string | number;
  'Type'?: string;
  'Item Name'?: string;
  'Position Strategy Allocation'?: string;
  [key: string]: any; // Allow other properties
}



// Interface for the Grade activity record
export interface DailyGradeActivity {
  summary_id: number;
  date: string;
  grade: string;
  opening_qty: number;
  to_processing_qty: number;
  from_processing_qty: number;
  loss_gain_qty: number;
  inbound_qty: number;
  outbound_qty: number;
  stock_adjustment_qty: number;
  xbs_closing_stock: number;
  regrade_discrepancy: number;
}

// Interface for the Strategy activity record
export interface DailyStrategyActivity {
  summary_id: number;
  date: string;
  strategy: string;
  opening_qty: number;
  to_processing_qty: number;
  from_processing_qty: number;
  loss_gain_qty: number;
  inbound_qty: number;
  outbound_qty: number;
  stock_adjustment_qty: number;
  xbs_closing_stock: number;
  regrade_discrepancy: number;
}

// The return type for the new function
export interface InitializedActivityRecords {
  new_grade_activity: DailyGradeActivity[];
  new_strategy_activity: DailyStrategyActivity[];
}

/**
 * Interface for the raw data read from the STI Excel file (header on row 2).
 */
export interface StiRow {
  'Transaction Date_1'?: number | string;
  // 'STI Number'?: string | number;
  'Number'?: string | number; // Assumed to be the STI number for aggregation
  'Qty.'?: number | string; // Instructed Qty
  'Qty._2'?: number | string; // Delivered Qty
  'Qty._3'?: number | string; // Loss/Gain Qty
  'Qty._5'?: number | string; // Balance to Transfer
  'Date'?: number | string; // Instructed Date
  'Batch No.'?: string | number;
  'Transaction No.'?: string | number;
  'Item Name'?: string; // Grade
  'Stock Transfer Status'?: 'Pending' | 'Completed' | string;
  'From Warehouse - Zone': string;
  'Due Date'?: number | string;
  [key: string]: any; // Allow other properties
}

/**
 * Interface mirroring the `stock_transfer_instructions` table.
 */
export interface StockTransferInstruction extends RowDataPacket {
  id: number;
  sti_number: string;
  instructed_date: Date;
  instructed_qty: number;
  delivered_qty: number;
  loss_gain: number;
  status: boolean;
}

/**
 * Interface mirroring the `instructed_batches` table (for inserts).
 * `id` is omitted as it's an auto-increment primary key.
 */
export interface InstructedBatch {
  sti_id: number;
  grade: string;
  strategy: string;
  instructed_qty: number;
  delivered_qty: number;
  balance_to_transfer: number;
  loss_gain_qty: number;
  status: string; // 'fully_pending', 'partially_delivered', 'completed'
  from_location: string;
  due_date: Date | null;
  arrival_date: Date;
  transaction_number: string;
  batch_number: string;
}
export interface DailyStrategyRow extends RowDataPacket {
    id: number;
    strategy: string;
    batch_number: string; // Use as ID? Or use DB ID? Prompt said "id of the row cast to string"
    output_differential: number;
    output_qty: number;
    output_hedge_level_usc_lb: number;
}

export type StrategyRow = {
  'Batch No.'?: string | number;
  'Position Strategy Allocation'?: string;
};

// This type is returned by the DB query
export type UndefinedRow = {
  id: number;
  batch_number: string;
};


export interface Ingredient {
    batchId: string;
    batch_number:string;
    strategy: string;
    quantityKg: number;
}

export interface Batch {
  id: string;
  batch_number:string;
  strategy: string;
  outrightPrice50kg: number; // $/50kg
  quantityKg: number;
  hedgeLevelUSClb: number; // USC/lb
  composition?: Ingredient[];
  status?: 'active' | 'archived'; 
}

export interface StrategyAggregate {
  name: string;
  totalKg: number;
  wAvgOutright50kg: number;
  wAvgHedgeUSClb: number;
  wAvgDiffUSClb: number;
  batches: Batch[];
}



export interface PostStackBatchRow extends RowDataPacket {
    id: number;
    batch_number: string;
    stack_type: string; // From joined post_stack table
    price_usd_50: number;
    quantity: number;
    hedge_level: string; // Note: Schema says VARCHAR, frontend expects number. Need to parse.
    diff_usc_lb: number;
}

export interface DailyProcessRow extends RowDataPacket { 
    id: number;
    summary_id: number;
    processing_date: string;
    process_type: string;
    process_number: string;
    input_qty: number;
    output_qty: number;
    milling_loss: number;
    processing_loss_gain_qty: number;
    trade_variables_updated: boolean;
}

/**
 * Defines the structure for a single record received from the frontend, 
 * matching the CatalogueRecord interface in the React component.
 */
export interface CatalogueRecord {
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


export interface GradeProcessingTotals extends RowDataPacket {
  grade: string;
  total_to_processing: number;
  total_from_processing: number;
  total_loss_gain: number;
}

export interface StrategyProcessingTotals extends RowDataPacket {
  strategy: string;
  total_to_processing: number;
  total_from_processing: number;
  total_loss_gain: number;
}

export interface GradeInboundTotals extends RowDataPacket {
  grade: string;
  total_inbound: number;
}

export interface StrategyInboundTotals extends RowDataPacket {
  strategy: string;
  total_inbound: number;
}

export interface GradeOutboundTotals extends RowDataPacket {
  dispatched_grade: string;
  total_outbound: number;
}


export interface StrategyOutboundTotals extends RowDataPacket {
  dispatched_strategy: string;
  total_outbound: number;
}

export interface GradeAdjustmentTotals extends RowDataPacket {
  grade: string;
  total_adjustment: number;
}


export interface StrategyAdjustmentTotals extends RowDataPacket {
  strategy: string;
  total_adjustment: number;
}

export interface PreviousClosingStock extends RowDataPacket {
  xbs_closing_stock: number;
}

export interface SaleRecord {
    id: string; 
    contract_number:string;
    date: string; 
    client: string;
    batch_number: string;
    strategy: string;
    packing: string;
    quantity: number;
    sale_fob_diff: number; // Sale FOB_Dif. - This minus the batch diff is the margin
    cost_diff: number; // W.Avg Diff from daily_strategy_processing
    hedge_level: number;
    cost_usd_50: number; // From daily strategy processing
    pnl_per_lb: number;
    pnl_total: number;
    is_sale_diff_null:Boolean;
}




export interface LastUpdateDates {
  last_sti: Date;
  last_sta: Date;
  last_process: Date;
  last_outbound: Date;
}



