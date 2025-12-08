import { RowDataPacket } from "mysql2";
import { query } from "./stock_movement_db";

// Interfaces for Type Safety
interface PendingBatch extends RowDataPacket {
  id: number;
  sti_number: string;
  balance_to_transfer: number;
  rent_cost: number;
  status: string;
  from_location:string;
}

interface AggregateResult extends RowDataPacket {
  val: number;
}

interface DashboardData {
  pendingBatches: PendingBatch[];
  partiallyPendingVolume: number;
  fullyPendingVolume: number;
  totalRentCosts: number;
  instructed: {
    lastWeek: number;
    overall: number;
  };
  delivered: {
    lastWeek: number;
    overall: number;
  };
  lossGain: {
    lastWeek: number;
    overall: number;
  };
  recentPnl: number;
  recentStockSummary: any; // Replace with specific interface if available
  recentGradeActivities: any[];
  recentStrategyActivities: any[];
}

// export async function getInventoryDashboard(fromDate?: string, toDate?: string): Promise<DashboardData> {
//   const isRange = !!(fromDate && toDate);
//   const rangeParams = isRange ? [fromDate, toDate] : [];
//   // For snapshots, we want the state at the END of the requested period
//   const snapshotParam = isRange ? [toDate] : [];

//   // 1. Prepare Queries
//   // We utilize MySQL's YEARWEEK(date, 1) to strictly respect Monday-Sunday weeks.
//   // We calculate Rent Cost directly in SQL to save JS processing time.
  
//   const pendingBatchesQuery = `
//     SELECT 
//       ib.*, 
//       sti.sti_number,
//       -- Calculate Rent Cost: (Today - DueDate) * (Balance/50) * 0.45
//       COALESCE(
//         (GREATEST(DATEDIFF(CURDATE(), ib.due_date), 0) * (ib.balance_to_transfer / 50) * 0.45), 
//         0
//       ) as rent_cost
//     FROM instructed_batches ib
//     JOIN stock_transfer_instructions sti ON ib.sti_id = sti.id
//     WHERE ib.status != 'Completed'
//     ${isRange ? 'AND sti.instructed_date BETWEEN ? AND ?' : ''}
//   `;

//   // STI Aggregates: If range, sum within range. If not, default LastWeek vs Overall logic.
//   const stiAggregatesQuery = isRange 
//     ? `SELECT 0 as last_week, SUM(instructed_qty) as overall FROM stock_transfer_instructions WHERE instructed_date BETWEEN ? AND ?`
//     : `SELECT
//         SUM(CASE WHEN YEARWEEK(instructed_date, 1) = YEARWEEK(CURDATE() - INTERVAL 1 WEEK, 1) THEN instructed_qty ELSE 0 END) as last_week,
//         SUM(instructed_qty) as overall
//        FROM stock_transfer_instructions`;

//   // Batch Aggregates: If range, sum within range (Arrival Date).
//   const batchAggregatesQuery = isRange
//     ? `SELECT 
//          0 as delivered_last_week, 
//          SUM(delivered_qty) as delivered_overall, 
//          0 as loss_last_week, 
//          SUM(loss_gain_qty) as loss_overall 
//        FROM instructed_batches 
//        WHERE arrival_date BETWEEN ? AND ?`
//     : `SELECT
//         SUM(CASE WHEN YEARWEEK(arrival_date, 1) = YEARWEEK(CURDATE() - INTERVAL 1 WEEK, 1) THEN delivered_qty ELSE 0 END) as delivered_last_week,
//         SUM(delivered_qty) as delivered_overall,
//         SUM(CASE WHEN YEARWEEK(arrival_date, 1) = YEARWEEK(CURDATE() - INTERVAL 1 WEEK, 1) THEN loss_gain_qty ELSE 0 END) as loss_last_week,
//         SUM(loss_gain_qty) as loss_overall
//        FROM instructed_batches`;

//   // PnL: If range, sum PnL over range. If not, sum PnL for the most recent single processing date.
//   const recentPnlQuery = isRange
//     ? `SELECT SUM(pnl) as total_pnl FROM daily_processes WHERE processing_date BETWEEN ? AND ?`
//     : `SELECT SUM(pnl) as total_pnl FROM daily_processes WHERE processing_date = (SELECT MAX(processing_date) FROM daily_processes)`;

//   // Snapshots: If range, get snapshot for the date <= toDate (End of period status). If not, get absolute MAX date.
//   const recentStockSummaryQuery = isRange
//     ? `SELECT * FROM daily_stock_summaries WHERE date = (SELECT MAX(date) FROM daily_stock_summaries WHERE date <= ?) LIMIT 1`
//     : `SELECT * FROM daily_stock_summaries WHERE date = (SELECT MAX(date) FROM daily_stock_summaries) LIMIT 1`;

//   const recentGradeActivitiesQuery = isRange
//     ? `SELECT * FROM daily_grade_activities WHERE date = (SELECT MAX(date) FROM daily_grade_activities WHERE date <= ?)`
//     : `SELECT * FROM daily_grade_activities WHERE date = (SELECT MAX(date) FROM daily_grade_activities)`;

//   const recentStrategyActivitiesQuery = isRange
//     ? `SELECT * FROM daily_strategy_activities WHERE date = (SELECT MAX(date) FROM daily_strategy_activities WHERE date <= ?)`
//     : `SELECT * FROM daily_strategy_activities WHERE date = (SELECT MAX(date) FROM daily_strategy_activities)`;

//   try {
//     // 2. Execute all queries in PARALLEL for maximum time efficiency
//     // We pass the appropriate params array based on whether isRange is true
//     const [
//       pendingBatchesRes,
//       stiStatsRes,
//       batchStatsRes,
//       pnlRes,
//       summaryRes,
//       gradeRes,
//       strategyRes
//     ] = await Promise.all([
//       query<PendingBatch[]>({ query: pendingBatchesQuery, values: rangeParams }),
//       query<RowDataPacket[]>({ query: stiAggregatesQuery, values: rangeParams }),
//       query<RowDataPacket[]>({ query: batchAggregatesQuery, values: rangeParams }),
//       query<RowDataPacket[]>({ query: recentPnlQuery, values: isRange ? rangeParams : [] }),
//       query<RowDataPacket[]>({ query: recentStockSummaryQuery, values: snapshotParam }),
//       query<RowDataPacket[]>({ query: recentGradeActivitiesQuery, values: snapshotParam }),
//       query<RowDataPacket[]>({ query: recentStrategyActivitiesQuery, values: snapshotParam })
//     ]);

//     // 3. Process Pending Batches Data in Memory
//     // (Faster to do one pass loop here than multiple Group By queries)
//     const pendingBatches = pendingBatchesRes || [];
    
//     let partiallyPendingVolume = 0;
//     let fullyPendingVolume = 0;
//     let totalRentCosts = 0;

//     for (const batch of pendingBatches) {
//       // Sum Rent Costs
//       totalRentCosts += Number(batch.rent_cost || 0);

//       // Group Volumes based on status string
//       // Normalizing string to lower case for safety, adjust key based on exact DB string
//       const status = batch.status.toLowerCase();
//       const balance = Number(batch.balance_to_transfer);

//       if (status.includes('partially')) {
//         partiallyPendingVolume += balance;
//       } else {
//         // Assuming if not completed and not partially, it is fully pending (or just 'Pending')
//         fullyPendingVolume += balance;
//       }
//     }

//     // 4. Extract Aggregates
//     const stiStats = stiStatsRes?.[0] || { last_week: 0, overall: 0 };
//     const batchStats = batchStatsRes?.[0] || { delivered_last_week: 0, delivered_overall: 0, loss_last_week: 0, loss_overall: 0 };
//     const pnlStats = pnlRes?.[0];

//     // 5. Construct Final Object
//     return {
//       pendingBatches,
//       partiallyPendingVolume,
//       fullyPendingVolume,
//       totalRentCosts,
//       instructed: {
//         lastWeek: Number(stiStats.last_week || 0),
//         overall: Number(stiStats.overall || 0)
//       },
//       delivered: {
//         lastWeek: Number(batchStats.delivered_last_week || 0),
//         overall: Number(batchStats.delivered_overall || 0)
//       },
//       lossGain: {
//         lastWeek: Number(batchStats.loss_last_week || 0),
//         overall: Number(batchStats.loss_overall || 0)
//       },
//       recentPnl: Number(pnlStats?.total_pnl || 0),
//       recentStockSummary: summaryRes?.[0] || null,
//       recentGradeActivities: gradeRes || [],
//       recentStrategyActivities: strategyRes || []
//     };

//   } catch (error) {
//     console.error("Failed to fetch dashboard data", error);
//     throw error;
//   }
// }
export async function getInventoryDashboard(fromDate?: string, toDate?: string): Promise<DashboardData> {
  const isRange = !!(fromDate && toDate);
  const rangeParams = isRange ? [fromDate, toDate] : [];
  // For snapshots, if range is selected, we fetch the range to aggregate. 
  // If no range, we look for the absolute latest date.
  const snapshotParam = isRange ? [fromDate, toDate] : [];

  // 1. Prepare Queries
  const pendingBatchesQuery = `
    SELECT 
      ib.*, 
      sti.sti_number,
      COALESCE(
        (GREATEST(DATEDIFF(CURDATE(), ib.due_date), 0) * (ib.balance_to_transfer / 50) * 0.45), 
        0
      ) as rent_cost
    FROM instructed_batches ib
    JOIN stock_transfer_instructions sti ON ib.sti_id = sti.id
    WHERE ib.status != 'Completed'
    ${isRange ? 'AND sti.instructed_date BETWEEN ? AND ?' : ''}
  `;

  // STI Aggregates
  const stiAggregatesQuery = isRange 
    ? `SELECT 0 as last_week, SUM(instructed_qty) as overall FROM stock_transfer_instructions WHERE instructed_date BETWEEN ? AND ?`
    : `SELECT
        SUM(CASE WHEN YEARWEEK(instructed_date, 1) = YEARWEEK(CURDATE() - INTERVAL 1 WEEK, 1) THEN instructed_qty ELSE 0 END) as last_week,
        SUM(instructed_qty) as overall
       FROM stock_transfer_instructions`;

  // Batch Aggregates
  const batchAggregatesQuery = isRange
    ? `SELECT 
         0 as delivered_last_week, 
         SUM(delivered_qty) as delivered_overall, 
         0 as loss_last_week, 
         SUM(loss_gain_qty) as loss_overall 
       FROM instructed_batches 
       WHERE arrival_date BETWEEN ? AND ?`
    : `SELECT
        SUM(CASE WHEN YEARWEEK(arrival_date, 1) = YEARWEEK(CURDATE() - INTERVAL 1 WEEK, 1) THEN delivered_qty ELSE 0 END) as delivered_last_week,
        SUM(delivered_qty) as delivered_overall,
        SUM(CASE WHEN YEARWEEK(arrival_date, 1) = YEARWEEK(CURDATE() - INTERVAL 1 WEEK, 1) THEN loss_gain_qty ELSE 0 END) as loss_last_week,
        SUM(loss_gain_qty) as loss_overall
       FROM instructed_batches`;

  // PnL
  const recentPnlQuery = isRange
    ? `SELECT SUM(pnl) as total_pnl FROM daily_processes WHERE processing_date BETWEEN ? AND ?`
    : `SELECT SUM(pnl) as total_pnl FROM daily_processes WHERE processing_date = (SELECT MAX(processing_date) FROM daily_processes)`;

  // --- UPDATED LOGIC: Fetch Range for Summaries if isRange is true ---
  
  const recentStockSummaryQuery = isRange
    ? `SELECT * FROM daily_stock_summaries WHERE date BETWEEN ? AND ? ORDER BY date ASC`
    : `SELECT * FROM daily_stock_summaries WHERE date = (SELECT MAX(date) FROM daily_stock_summaries) LIMIT 1`;

  const recentGradeActivitiesQuery = isRange
    ? `SELECT * FROM daily_grade_activities WHERE date BETWEEN ? AND ? ORDER BY date ASC`
    : `SELECT * FROM daily_grade_activities WHERE date = (SELECT MAX(date) FROM daily_grade_activities)`;

  const recentStrategyActivitiesQuery = isRange
    ? `SELECT * FROM daily_strategy_activities WHERE date BETWEEN ? AND ? ORDER BY date ASC`
    : `SELECT * FROM daily_strategy_activities WHERE date = (SELECT MAX(date) FROM daily_strategy_activities)`;

  try {
    const [
      pendingBatchesRes,
      stiStatsRes,
      batchStatsRes,
      pnlRes,
      summaryRes,
      gradeRes,
      strategyRes
    ] = await Promise.all([
      query<PendingBatch[]>({ query: pendingBatchesQuery, values: rangeParams }),
      query<RowDataPacket[]>({ query: stiAggregatesQuery, values: rangeParams }),
      query<RowDataPacket[]>({ query: batchAggregatesQuery, values: rangeParams }),
      query<RowDataPacket[]>({ query: recentPnlQuery, values: isRange ? rangeParams : [] }),
      query<RowDataPacket[]>({ query: recentStockSummaryQuery, values: snapshotParam }),
      query<RowDataPacket[]>({ query: recentGradeActivitiesQuery, values: snapshotParam }),
      query<RowDataPacket[]>({ query: recentStrategyActivitiesQuery, values: snapshotParam })
    ]);

    // --- AGGREGATION LOGIC ---

    // 1. Process Stock Summary
    let finalStockSummary = null;
    if (summaryRes && summaryRes.length > 0) {
        if (!isRange) {
            finalStockSummary = summaryRes[0];
        } else {
            // Aggregate: Opening from First, Closing from Last, Sum others
            const first = summaryRes[0];
            const last = summaryRes[summaryRes.length - 1];
            
            finalStockSummary = {
                ...last, // Inherit dates/ids from last
                date: last.date, // Show end date
                total_opening_qty: first.total_opening_qty, // Opening from START
                total_xbs_closing_stock: last.total_xbs_closing_stock, // Closing from END
                // Sum Flows
                total_inbound_qty: summaryRes.reduce((acc, r) => acc + Number(r.total_inbound_qty || 0), 0),
                total_outbound_qty: summaryRes.reduce((acc, r) => acc + Number(r.total_outbound_qty || 0), 0),
                total_stock_adjustment_qty: summaryRes.reduce((acc, r) => acc + Number(r.total_stock_adjustment_qty || 0), 0),
            };
        }
    }

    // 2. Process Activities (Grade & Strategy)
    const processActivities = (rows: any[], key: string) => {
        if (!isRange || !rows || rows.length === 0) return rows || [];
        
        const grouped: Record<string, any[]> = {};
        rows.forEach(r => {
            if(!grouped[r[key]]) grouped[r[key]] = [];
            grouped[r[key]].push(r);
        });

        return Object.values(grouped).map(group => {
            // Ensure sorted by date (already done in SQL, but safe to check)
            // group.sort(...) 
            const first = group[0];
            const last = group[group.length - 1];

            return {
                ...first,
                date: last.date,
                opening_qty: first.opening_qty, // First Opening
                xbs_closing_stock: last.xbs_closing_stock, // Last Closing
                // Sum Flows
                to_processing_qty: group.reduce((sum, r) => sum + Number(r.to_processing_qty || 0), 0),
                from_processing_qty: group.reduce((sum, r) => sum + Number(r.from_processing_qty || 0), 0),
                loss_gain_qty: group.reduce((sum, r) => sum + Number(r.loss_gain_qty || 0), 0),
                inbound_qty: group.reduce((sum, r) => sum + Number(r.inbound_qty || 0), 0),
                outbound_qty: group.reduce((sum, r) => sum + Number(r.outbound_qty || 0), 0),
                stock_adjustment_qty: group.reduce((sum, r) => sum + Number(r.stock_adjustment_qty || 0), 0),
                regrade_discrepancy: group.reduce((sum, r) => sum + Number(r.regrade_discrepancy || 0), 0),
            };
        });
    };

    const finalGradeActivities = processActivities(gradeRes || [], 'grade');
    const finalStrategyActivities = processActivities(strategyRes || [], 'strategy');

    // 3. Process Pending Batches Data in Memory
    const pendingBatches = pendingBatchesRes || [];
    
    let partiallyPendingVolume = 0;
    let fullyPendingVolume = 0;
    let totalRentCosts = 0;

    for (const batch of pendingBatches) {
      totalRentCosts += Number(batch.rent_cost || 0);
      const status = batch.status.toLowerCase();
      const balance = Number(batch.balance_to_transfer);

      if (status.includes('partially')) {
        partiallyPendingVolume += balance;
      } else {
        fullyPendingVolume += balance;
      }
    }

    const stiStats = stiStatsRes?.[0] || { last_week: 0, overall: 0 };
    const batchStats = batchStatsRes?.[0] || { delivered_last_week: 0, delivered_overall: 0, loss_last_week: 0, loss_overall: 0 };
    const pnlStats = pnlRes?.[0];

    return {
      pendingBatches,
      partiallyPendingVolume,
      fullyPendingVolume,
      totalRentCosts,
      instructed: {
        lastWeek: Number(stiStats.last_week || 0),
        overall: Number(stiStats.overall || 0)
      },
      delivered: {
        lastWeek: Number(batchStats.delivered_last_week || 0),
        overall: Number(batchStats.delivered_overall || 0)
      },
      lossGain: {
        lastWeek: Number(batchStats.loss_last_week || 0),
        overall: Number(batchStats.loss_overall || 0)
      },
      recentPnl: Number(pnlStats?.total_pnl || 0),
      recentStockSummary: finalStockSummary,
      recentGradeActivities: finalGradeActivities,
      recentStrategyActivities: finalStrategyActivities
    };

  } catch (error) {
    console.error("Failed to fetch dashboard data", error);
    throw error;
  }
}

export interface DailyProcess extends RowDataPacket {
  id: number;
  summary_id: number;
  processing_date: Date;
  process_type: string;
  process_number: string;
  input_qty: number;
  output_qty: number;
  milling_loss: number;
  processing_loss_gain_qty: number;
  input_value: number;
  output_value: number;
  pnl: number;
}

// Interfaces for the detailed breakdowns
export interface StrategyProcessing extends RowDataPacket {
  id: number;
  process_id: number;
  strategy: string;
  input_qty: number;
  output_qty: number;
  // Add other fields as necessary
}

export interface GradeProcessing extends RowDataPacket {
  id: number;
  process_id: number;
  grade: string;
  input_qty: number;
  output_qty: number;
  // Add other fields as necessary
}

export async function getDailyProcesses(fromDate?: string, toDate?: string): Promise<DailyProcess[]> {
  // If dates are provided, use them. 
  // If not, default to the first day of current month -> last day of current month.
  const isRange = !!(fromDate && toDate);
  
  const sql = `
    SELECT * FROM daily_processes 
    WHERE processing_date BETWEEN 
      ${isRange ? '?' : "DATE_FORMAT(CURDATE(), '%Y-%m-01')"} 
      AND 
      ${isRange ? '?' : "LAST_DAY(CURDATE())"}
    ORDER BY processing_date DESC
  `;

  const values = isRange ? [fromDate, toDate] : [];

  try {
    const results = await query<DailyProcess[]>({ query: sql, values });
    return results || [];
  } catch (error) {
    console.error("Failed to fetch daily processes", error);
    throw error;
  }
}

export async function getProcessingDetails(processId: number) {
  const strategyQuery = "SELECT * FROM daily_strategy_processing WHERE process_id = ?";
  const gradeQuery = "SELECT * FROM daily_grade_processing WHERE process_id = ?";

  try {
    // Execute both queries in parallel for maximum efficiency
    const [strategies, grades] = await Promise.all([
      query<StrategyProcessing[]>({ query: strategyQuery, values: [processId] }),
      query<GradeProcessing[]>({ query: gradeQuery, values: [processId] })
    ]);

    return {
      strategies: strategies || [],
      grades: grades || []
    };
  } catch (error) {
    console.error(`Failed to fetch details for process ${processId}`, error);
    throw error;
  }
}