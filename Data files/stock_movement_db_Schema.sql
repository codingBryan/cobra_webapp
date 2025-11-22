-- ------------------------------------------
-- 1. DATABASE CREATION AND SELECTION
-- ------------------------------------------
DROP DATABASE stock_movement_db;
-- Create the database if it doesn't already exist
CREATE DATABASE IF NOT EXISTS stock_movement_db;

-- Select the newly created database for subsequent operations
USE stock_movement_db;

-- ------------------------------------------
-- 2. CORE SUMMARY TABLE (Parent for Activities, Processes, and Outbounds)
-- ------------------------------------------

-- Table: daily_stock_summaries
-- Tracks overall daily stock position metrics.
CREATE TABLE daily_stock_summaries (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary Key for the daily summary.',
    date DATE NOT NULL COMMENT 'The date of the stock summary.',

    -- Core Quantity Metrics (DECIMAL(10, 2) for precision)
    total_opening_qty DECIMAL(10, 2) NOT NULL,
    total_to_processing_qty DECIMAL(10, 2) NOT NULL,
    total_from_processing_qty DECIMAL(10, 2) NOT NULL,
    total_loss_gain_qty DECIMAL(10, 2) NOT NULL,
    total_milling_loss_qty DECIMAL(10, 2) NOT NULL,
    total_inbound_qty DECIMAL(10, 2) NOT NULL,
    total_outbound_qty DECIMAL(10, 2) NOT NULL,
    total_b4p_qty DECIMAL(10, 2) NOT NULL DEFAULT 0,
    total_wip_qty DECIMAL(10, 2) NOT NULL DEFAULT 0,
    total_stock_adjustment_qty DECIMAL(10, 2) NOT NULL,
    total_xbs_closing_stock DECIMAL(10, 2) NOT NULL,
    total_regrade_discrepancy DECIMAL(10, 2) NOT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uk_summary_date (date) -- Ensure only one summary per day
) ENGINE=InnoDB;


-- ------------------------------------------
-- 3. ACTIVITY DETAIL TABLES (Children of daily_stock_summaries)
-- ------------------------------------------

-- Table: daily_grade_activities
-- Tracks daily stock movements broken down by grade.
CREATE TABLE daily_grade_activities (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary Key for the grade activity record.',
    summary_id INT UNSIGNED NOT NULL COMMENT 'Foreign Key linking to the parent daily summary.',
    date DATE NOT NULL COMMENT 'The date of the activity (redundant, but requested).',
    grade VARCHAR(255) NOT NULL COMMENT 'The specific product grade.',

    opening_qty DECIMAL(10, 2) NOT NULL,
    to_processing_qty DECIMAL(10, 2) NOT NULL,
    from_processing_qty DECIMAL(10, 2) NOT NULL,
    loss_gain_qty DECIMAL(10, 2) NOT NULL,
    inbound_qty DECIMAL(10, 2) NOT NULL,
    outbound_qty DECIMAL(10, 2) NOT NULL,
    stock_adjustment_qty DECIMAL(10, 2) NOT NULL,
    xbs_closing_stock DECIMAL(10, 2) NOT NULL,
    regrade_discrepancy DECIMAL(10, 2) NOT NULL,

    PRIMARY KEY (id),
    -- Foreign Key Constraint
    FOREIGN KEY (summary_id)
        REFERENCES daily_stock_summaries(id)
        ON DELETE CASCADE -- If the summary is deleted, delete associated activities
) ENGINE=InnoDB;


-- Table: daily_strategy_activities
-- Tracks daily stock movements broken down by strategy.
CREATE TABLE daily_strategy_activities (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary Key for the strategy activity record.',
    summary_id INT UNSIGNED NOT NULL COMMENT 'Foreign Key linking to the parent daily summary.',
    date DATE NOT NULL COMMENT 'The date of the activity (redundant, but requested).',
    strategy VARCHAR(255) NOT NULL COMMENT 'The specific strategy code.',

    opening_qty DECIMAL(10, 2) NOT NULL,
    to_processing_qty DECIMAL(10, 2) NOT NULL,
    from_processing_qty DECIMAL(10, 2) NOT NULL,
    loss_gain_qty DECIMAL(10, 2) NOT NULL,
    inbound_qty DECIMAL(10, 2) NOT NULL,
    outbound_qty DECIMAL(10, 2) NOT NULL,
    stock_adjustment_qty DECIMAL(10, 2) NOT NULL,
    xbs_closing_stock DECIMAL(10, 2) NOT NULL,
    regrade_discrepancy DECIMAL(10, 2) NOT NULL,

    PRIMARY KEY (id),
    -- Foreign Key Constraint
    FOREIGN KEY (summary_id)
        REFERENCES daily_stock_summaries(id)
        ON DELETE CASCADE
) ENGINE=InnoDB;


-- ------------------------------------------
-- 4. DAILY PROCESSES AND THEIR DETAIL TABLES
-- ------------------------------------------

-- Table: daily_processes (Child of daily_stock_summaries, Parent for processing details)
-- Tracks individual processing events.
CREATE TABLE daily_processes (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary Key for the process record.',
    summary_id INT UNSIGNED NOT NULL COMMENT 'Foreign Key linking to the parent daily summary.',
    processing_date DATE NOT NULL COMMENT 'The date the processing took place.',
    process_type VARCHAR(100) NOT NULL COMMENT 'e.g., Milling, Sorting.',
    process_number VARCHAR(100) NOT NULL COMMENT 'Unique identifier for the process.',
    input_qty DECIMAL(10, 2) NOT NULL,
    output_qty DECIMAL(10, 2) NOT NULL,
    milling_loss DECIMAL(10, 2) NOT NULL,
    processing_loss_gain_qty DECIMAL(10, 2) NOT NULL,
    trade_variables_updated BOOLEAN DEFAULT FALSE,

    PRIMARY KEY (id),
    -- Foreign Key Constraint (daily_stock_summaries -> daily_processes)
    FOREIGN KEY (summary_id)
        REFERENCES daily_stock_summaries(id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- Table: daily_grade_processing (Child of daily_processes)
-- Tracks the grades involved in a specific process.
CREATE TABLE daily_grade_processing (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary Key for the grade processing record.',
    process_id INT UNSIGNED NOT NULL COMMENT 'Foreign Key linking to the parent daily process.',
    grade VARCHAR(255) NOT NULL COMMENT 'The grade being processed.',
    input_qty DECIMAL(10, 2) NOT NULL,
    output_qty DECIMAL(10, 2) NOT NULL,
    processing_loss_gain_qty DECIMAL(10, 2) NOT NULL,

    PRIMARY KEY (id),
    -- Foreign Key Constraint (daily_processes -> daily_grade_processing)
    FOREIGN KEY (process_id)
        REFERENCES daily_processes(id)
        ON DELETE CASCADE
) ENGINE=InnoDB;


-- Table: daily_strategy_processing (Child of daily_processes)
-- Tracks the strategies involved in a specific process.
CREATE TABLE daily_strategy_processing (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary Key for the strategy processing record.',
    process_id INT UNSIGNED NOT NULL COMMENT 'Foreign Key linking to the parent daily process.',
    strategy VARCHAR(255) NULL DEFAULT 'UNDEFINED',
    batch_number VARCHAR(255) NOT NULL COMMENT 'The batch number of the lot(Output or Input).',
    input_qty DECIMAL(10, 2) NOT NULL,
    output_qty DECIMAL(10, 2) NOT NULL,
    processing_loss_gain_qty DECIMAL(10, 2) NOT NULL,
    input_differential DECIMAL(10, 2) NULL,
    output_differential DECIMAL(10, 2) NULL,
    input_hedge_level_usc_lb DECIMAL(10, 2) NULL,
    input_cost_usd_50 DECIMAL(10, 2) NULL,
    output_cost_usd_50 DECIMAL(10, 2) NULL,

    PRIMARY KEY (id),
    -- Foreign Key Constraint (daily_processes -> daily_strategy_processing)
    FOREIGN KEY (process_id)
        REFERENCES daily_processes(id)
        ON DELETE CASCADE
) ENGINE=InnoDB;


CREATE TABLE catalogue_summary (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary Key for the catalogue summary record.',
    sale_type VARCHAR(255) NOT NULL COMMENT 'Type of sale.',
    sale_number VARCHAR(255) NOT NULL COMMENT 'Unique sale identifier.',
    outturn VARCHAR(255) NULL,
	grower_mark VARCHAR(255) NULL COMMENT 'Unique sale identifier.',
    lot_number VARCHAR(255) NOT NULL COMMENT 'Lot identifier.',
    weight DECIMAL(10, 2) NOT NULL,
    grade VARCHAR(255) NOT NULL COMMENT 'Coffee grade.',
    season VARCHAR(255) NOT NULL COMMENT 'Crop season.',
    certification VARCHAR(255) NULL COMMENT 'Certification status.',
    batch_number VARCHAR(255) NOT NULL COMMENT 'Specific batch identifier.',
    cost_usd_50 DECIMAL(10, 2) NULL,
    hedge_usc_lb DECIMAL(10, 2)  NULL,
    diff_usc_lb DECIMAL(10, 2) NULL,
    trade_month VARCHAR(255) NULL COMMENT 'trade month.',

    PRIMARY KEY (id),
    UNIQUE KEY (batch_number) -- Added unique constraint here
    -- Foreign Key Constraint (optional, commented out)
) ENGINE=InnoDB;

-- Table: daily_pnl_history
-- Tracks daily stock movements broken down by grade.
CREATE TABLE daily_pnl_history (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary Key for the grade activity record.',
    date DATE NOT NULL COMMENT 'The date the pnl was generated',
    pnl DECIMAL(10, 2),
    PRIMARY KEY (id)

) ENGINE=InnoDB;

CREATE TABLE post_stack (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    date DATE NOT NULL COMMENT 'The date of update',
    stack_type VARCHAR(255) NOT NULL COMMENT 'Type of stack.',
    diff_usc_lb DECIMAL(10, 2) NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL,
    price_usd_50 DECIMAL(10, 2) NOT NULL,
    
    PRIMARY KEY (id) -- <--- PRIMARY KEY constraint is added here
) ENGINE=InnoDB;

CREATE TABLE post_stack_batches (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    stack_id INT UNSIGNED NOT NULL,
    batch_number VARCHAR(255) NOT NULL,
    diff_usc_lb DECIMAL(10, 2) NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL,
    price_usd_50 DECIMAL(10, 2) NOT NULL,
    
    PRIMARY KEY (id),
   -- Foreign Key Constraint (post_stack -> post_stack_batches)
    FOREIGN KEY (stack_id)
        REFERENCES post_stack(id)
        ON DELETE CASCADE

) ENGINE=InnoDB;

CREATE TABLE post_stack_history (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    date DATE NOT NULL COMMENT 'The date of update',
    stack_id INT UNSIGNED NOT NULL,
    diff_usc_lb DECIMAL(10, 2) NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL,
    price_usd_50 DECIMAL(10, 2) NOT NULL,
    
    PRIMARY KEY (id),
   -- Foreign Key Constraint (post_stack -> post_stack_history)
    FOREIGN KEY (stack_id)
        REFERENCES post_stack(id)
        ON DELETE CASCADE

) ENGINE=InnoDB;

-- ------------------------------------------
-- 5. STOCK TRANSFER INSTRUCTIONS
-- ------------------------------------------

-- Table: stock_transfer_instructions (New Parent Table)
-- Tracks high-level transfer instructions (STIs).
CREATE TABLE stock_transfer_instructions (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary Key for the STI.',
    summary_id INT UNSIGNED NOT NULL,
    sti_number VARCHAR(100) NOT NULL COMMENT 'Stock Transfer Instruction number.',
    instructed_date DATE NOT NULL COMMENT 'Date the STI was created.',
    instructed_qty DECIMAL(10, 2) NOT NULL COMMENT 'Total quantity instructed for transfer.',
    delivered_qty DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT 'Total quantity delivered (calculated).',
    loss_gain DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT 'Overall loss/gain for the STI.',
    status VARCHAR(50) NOT NULL DEFAULT "Open",

    PRIMARY KEY (id),
    UNIQUE KEY uk_sti_number (sti_number), -- Ensure STI numbers are unique
    FOREIGN KEY (summary_id)
        REFERENCES daily_stock_summaries(id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- Table: instructed_batches (Renamed from daily_inbounds, now a Child of STI)
-- Tracks the individual batches/deliveries against an STI.
CREATE TABLE instructed_batches (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary Key for the inbound batch.',
    sti_id INT UNSIGNED NOT NULL COMMENT 'Foreign Key linking to the parent STI.',
    summary_id INT UNSIGNED NOT NULL,
    grade VARCHAR(255) NOT NULL COMMENT 'The grade of the batch.',
    strategy VARCHAR(255) NOT NULL DEFAULT  "UNDEFINED",
    instructed_qty DECIMAL(10, 2) NOT NULL,
    delivered_qty DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    balance_to_transfer DECIMAL(10, 2) NOT NULL,
    loss_gain_qty DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending' COMMENT 'e.g., Pending, Completed',
    from_location VARCHAR(255) NULL,
    due_date DATE NULL,
    arrival_date DATE NOT NULL COMMENT 'Actual arrival date of the batch.',
    transaction_number VARCHAR(100) NOT NULL COMMENT 'Transaction number (e.g., GRN).',
    batch_number VARCHAR(100) NOT NULL,

    PRIMARY KEY (id),
    -- Foreign Key Constraint (stock_transfer_instructions -> instructed_batches)
    FOREIGN KEY (sti_id)
        REFERENCES stock_transfer_instructions(id)
        ON DELETE CASCADE,
	FOREIGN KEY (summary_id)
        REFERENCES daily_stock_summaries(id)
        ON DELETE CASCADE
) ENGINE=InnoDB;


-- ------------------------------------------
-- 6. DAILY OUTBOUNDS TABLE
-- ------------------------------------------

-- Table: daily_outbounds (Child of daily_stock_summaries)
-- Tracks the details of outgoing stock dispatches.
CREATE TABLE daily_outbounds (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary Key for the outbound dispatch.',
    summary_id INT UNSIGNED NOT NULL,
    dispatch_date DATE NOT NULL,
    dispatch_dc_numbers VARCHAR(255) COMMENT 'A string of DC numbers.',
    dispatch_number VARCHAR(100),
    dispatched_grade VARCHAR(255),
    dispatched_quantity DECIMAL(10, 2),
    dispatched_strategy VARCHAR(255) NULL,
    batch_number VARCHAR(50),
    ticket_numbers VARCHAR(255) COMMENT 'A string of ticket numbers.',
    PRIMARY KEY (id),
    FOREIGN KEY (summary_id)
        REFERENCES daily_stock_summaries(id)
        ON DELETE CASCADE

    
) ENGINE=InnoDB;

-- Table: stock adjustment
-- Tracks the details of stock stock adjustments.
CREATE TABLE stock_adjustment (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary Key for the outbound dispatch.',
	summary_id INT UNSIGNED NOT NULL,
    adjustment_date DATE NOT NULL,
    grade VARCHAR(255),
    adjusted_quantity DECIMAL(10, 2),
    strategy VARCHAR(255) NULL,
    batch_number VARCHAR(50),
    reason VARCHAR(50),

    PRIMARY KEY (id),
    FOREIGN KEY (summary_id)
        REFERENCES daily_stock_summaries(id)
        ON DELETE CASCADE
) ENGINE=InnoDB;