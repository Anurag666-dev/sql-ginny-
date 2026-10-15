-- ==============================================================================
-- SQL Ginny - PostgreSQL Database Initialization Script with pgvector
-- ==============================================================================

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create Core E-Commerce & Financial Schemas & Tables
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS customer_addresses CASCADE;
DROP TABLE IF EXISTS refund_transactions CASCADE;
DROP TABLE IF EXISTS order_returns CASCADE;
DROP TABLE IF EXISTS discounts_promotions CASCADE;
DROP TABLE IF EXISTS purchase_order_items CASCADE;
DROP TABLE IF EXISTS purchase_orders CASCADE;
DROP TABLE IF EXISTS product_inventory CASCADE;
DROP TABLE IF EXISTS warehouses CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS shipments CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS business_structs CASCADE;

-- Customers Table
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    customer_code VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    segment VARCHAR(50) DEFAULT 'Standard', -- 'VIP', 'Standard', 'Wholesale'
    city VARCHAR(100),
    country VARCHAR(100) DEFAULT 'India',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Products Table
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    base_price NUMERIC(12, 2) NOT NULL,
    stock_qty INT NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Orders Table
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(100) UNIQUE NOT NULL,
    customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    order_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, COMPLETED, CANCELLED, REFUNDED
    currency VARCHAR(10) DEFAULT 'INR',
    total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(12, 2) DEFAULT 0.00,
    shipping_city VARCHAR(100),
    shipping_country VARCHAR(100) DEFAULT 'India'
);

-- Order Items Table
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id),
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL,
    subtotal NUMERIC(14, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);

-- Payments Table
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    payment_method VARCHAR(50) NOT NULL, -- UPI, CREDIT_CARD, NET_BANKING, COD
    transaction_ref VARCHAR(100) UNIQUE,
    amount NUMERIC(14, 2) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'SUCCESS', -- SUCCESS, FAILED, PENDING
    paid_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Shipments Table
CREATE TABLE shipments (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    carrier VARCHAR(100) NOT NULL, -- BlueDart, Delhivery, FedEx
    tracking_number VARCHAR(100) UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'IN_TRANSIT', -- IN_TRANSIT, DELIVERED, RETURNED
    dispatched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP WITH TIME ZONE
);

-- 3. Business Structs Table for RAG & Domain Knowledge (pgvector)
CREATE TABLE business_structs (
    id SERIAL PRIMARY KEY,
    struct_name VARCHAR(255) NOT NULL UNIQUE,
    struct_type VARCHAR(100) NOT NULL, -- 'domain_rule', 'kpi_metric', 'join_recipe', 'schema_glossary'
    target_entities TEXT[] NOT NULL DEFAULT '{}', -- e.g. ['customers', 'orders', 'mongo:customer_activity_logs']
    description TEXT NOT NULL,
    sql_expression TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    embedding vector(384), -- 384-dimensional dense vectors
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on vector embeddings for fast approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS business_structs_embedding_idx ON business_structs USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);

-- 4. Create Standard Views & Materialized Views
CREATE OR REPLACE VIEW active_customer_orders_view AS
SELECT 
    c.id AS customer_id,
    c.first_name || ' ' || c.last_name AS customer_name,
    c.email,
    c.segment,
    o.id AS order_id,
    o.order_number,
    o.order_date,
    o.status AS order_status,
    o.total_amount
FROM customers c
JOIN orders o ON c.id = o.customer_id
WHERE o.status IN ('PENDING', 'COMPLETED');

CREATE OR REPLACE VIEW high_value_orders_view AS
SELECT 
    o.id AS order_id,
    o.order_number,
    c.email AS customer_email,
    o.total_amount,
    p.payment_method,
    p.transaction_ref
FROM orders o
JOIN customers c ON o.customer_id = c.id
LEFT JOIN payments p ON o.id = p.order_id
WHERE o.total_amount >= 5000;

-- Materialized View for monthly sales analytics
DROP MATERIALIZED VIEW IF EXISTS monthly_revenue_summary_mv;
CREATE MATERIALIZED VIEW monthly_revenue_summary_mv AS
SELECT 
    DATE_TRUNC('month', order_date) AS order_month,
    COUNT(id) AS total_orders,
    SUM(total_amount) AS gross_revenue,
    AVG(total_amount) AS average_order_value
FROM orders
WHERE status = 'COMPLETED'
GROUP BY DATE_TRUNC('month', order_date)
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_rev_month ON monthly_revenue_summary_mv (order_month);

-- 5. Seed Core Tables with Rich Dummy Data
INSERT INTO customers (customer_code, first_name, last_name, email, phone, segment, city, country) VALUES
('CUST-1001', 'Aarav', 'Sharma', 'aarav.sharma@example.com', '+91-9876543210', 'VIP', 'Bengaluru', 'India'),
('CUST-1002', 'Priya', 'Verma', 'priya.verma@example.com', '+91-9876543211', 'Standard', 'Mumbai', 'India'),
('CUST-1003', 'Rohan', 'Iyer', 'rohan.iyer@example.com', '+91-9876543212', 'VIP', 'Chennai', 'India'),
('CUST-1004', 'Ananya', 'Patel', 'ananya.patel@example.com', '+91-9876543213', 'Standard', 'Ahmedabad', 'India'),
('CUST-1005', 'Vikram', 'Malhotra', 'vikram.m@example.com', '+91-9876543214', 'Wholesale', 'Delhi', 'India'),
('CUST-1006', 'Sneha', 'Nair', 'sneha.nair@example.com', '+91-9876543215', 'Standard', 'Kochi', 'India');

INSERT INTO products (sku, title, category, base_price, stock_qty) VALUES
('PROD-LAPTOP-01', 'ThinkBook Ultra 16', 'Electronics', 84999.00, 45),
('PROD-PHONE-02', 'Nexus Quantum 5G', 'Electronics', 42999.00, 120),
('PROD-DESK-03', 'ErgoLift Standing Desk', 'Furniture', 22500.00, 30),
('PROD-CHAIR-04', 'AeroMesh Executive Chair', 'Furniture', 14999.00, 60),
('PROD-HEADSET-05', 'AcousticPro ANC Headphones', 'Audio', 8999.00, 200),
('PROD-MONITOR-06', 'UltraView 34-inch Curved', 'Electronics', 35999.00, 25);

INSERT INTO orders (order_number, customer_id, order_date, status, total_amount, discount_amount, shipping_city) VALUES
('ORD-2026-001', 1, '2026-09-01 10:30:00+05:30', 'COMPLETED', 93998.00, 0.00, 'Bengaluru'),
('ORD-2026-002', 2, '2026-09-03 14:15:00+05:30', 'COMPLETED', 42999.00, 1000.00, 'Mumbai'),
('ORD-2026-003', 1, '2026-09-10 18:45:00+05:30', 'COMPLETED', 8999.00, 0.00, 'Bengaluru'),
('ORD-2026-004', 3, '2026-09-15 11:20:00+05:30', 'COMPLETED', 37499.00, 500.00, 'Chennai'),
('ORD-2026-005', 4, '2026-10-01 09:10:00+05:30', 'PENDING', 84999.00, 2000.00, 'Ahmedabad'),
('ORD-2026-006', 5, '2026-10-05 16:00:00+05:30', 'COMPLETED', 170997.00, 5000.00, 'Delhi'),
('ORD-2026-007', 6, '2026-10-12 12:40:00+05:30', 'REFUNDED', 8999.00, 0.00, 'Kochi');

INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
(1, 1, 1, 84999.00),
(1, 5, 1, 8999.00),
(2, 2, 1, 42999.00),
(3, 5, 1, 8999.00),
(4, 3, 1, 22500.00),
(4, 4, 1, 14999.00),
(5, 1, 1, 84999.00),
(6, 1, 1, 84999.00),
(6, 6, 1, 35999.00),
(6, 2, 1, 42999.00),
(7, 5, 1, 8999.00);

INSERT INTO payments (order_id, payment_method, transaction_ref, amount, status) VALUES
(1, 'UPI', 'UPI-TXN-90928301', 93998.00, 'SUCCESS'),
(2, 'CREDIT_CARD', 'CC-AUTH-77382910', 41999.00, 'SUCCESS'),
(3, 'UPI', 'UPI-TXN-11223344', 8999.00, 'SUCCESS'),
(4, 'NET_BANKING', 'NB-REF-66554433', 36999.00, 'SUCCESS'),
(5, 'CREDIT_CARD', 'CC-AUTH-99001122', 82999.00, 'PENDING'),
(6, 'NET_BANKING', 'NB-REF-77889900', 165997.00, 'SUCCESS'),
(7, 'UPI', 'UPI-TXN-55443322', 8999.00, 'FAILED');

INSERT INTO shipments (order_id, carrier, tracking_number, status, delivered_at) VALUES
(1, 'BlueDart', 'BD-IN-987123', 'DELIVERED', '2026-09-04 15:30:00+05:30'),
(2, 'Delhivery', 'DL-IN-445566', 'DELIVERED', '2026-09-06 17:00:00+05:30'),
(3, 'BlueDart', 'BD-IN-123456', 'DELIVERED', '2026-09-12 11:00:00+05:30'),
(4, 'FedEx', 'FDX-IN-778899', 'DELIVERED', '2026-09-18 16:45:00+05:30'),
(6, 'Delhivery', 'DL-IN-990011', 'IN_TRANSIT', NULL);

-- 7. Additional Enterprise PostgreSQL Tables (10 Tables)

-- Table 1: Suppliers
CREATE TABLE suppliers (
    id SERIAL PRIMARY KEY,
    supplier_code VARCHAR(50) UNIQUE NOT NULL,
    company_name VARCHAR(150) NOT NULL,
    contact_name VARCHAR(100),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    city VARCHAR(100),
    country VARCHAR(100) DEFAULT 'India',
    rating NUMERIC(3, 2) DEFAULT 4.5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table 2: Warehouses
CREATE TABLE warehouses (
    id SERIAL PRIMARY KEY,
    warehouse_code VARCHAR(50) UNIQUE NOT NULL,
    warehouse_name VARCHAR(150) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100),
    capacity_sqft INT DEFAULT 50000,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table 3: Product Inventory
CREATE TABLE product_inventory (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    warehouse_id INT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    quantity_on_hand INT NOT NULL DEFAULT 0,
    quantity_reserved INT NOT NULL DEFAULT 0,
    reorder_threshold INT NOT NULL DEFAULT 10,
    last_restocked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table 4: Purchase Orders
CREATE TABLE purchase_orders (
    id SERIAL PRIMARY KEY,
    po_number VARCHAR(100) UNIQUE NOT NULL,
    supplier_id INT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    warehouse_id INT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    order_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'APPROVED', -- 'DRAFT', 'APPROVED', 'RECEIVED', 'CANCELLED'
    total_cost NUMERIC(14, 2) NOT NULL DEFAULT 0.00
);

-- Table 5: Purchase Order Items
CREATE TABLE purchase_order_items (
    id SERIAL PRIMARY KEY,
    po_id INT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id),
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC(12, 2) NOT NULL,
    subtotal NUMERIC(14, 2) GENERATED ALWAYS AS (quantity * unit_cost) STORED
);

-- Table 6: Discounts & Promotions
CREATE TABLE discounts_promotions (
    id SERIAL PRIMARY KEY,
    promo_code VARCHAR(50) UNIQUE NOT NULL,
    promo_name VARCHAR(150) NOT NULL,
    discount_type VARCHAR(50) DEFAULT 'PERCENTAGE', -- 'PERCENTAGE', 'FLAT'
    discount_value NUMERIC(10, 2) NOT NULL,
    min_order_value NUMERIC(12, 2) DEFAULT 0.00,
    max_discount NUMERIC(12, 2),
    is_active BOOLEAN DEFAULT TRUE,
    valid_until TIMESTAMP WITH TIME ZONE
);

-- Table 7: Order Returns
CREATE TABLE order_returns (
    id SERIAL PRIMARY KEY,
    return_number VARCHAR(100) UNIQUE NOT NULL,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    reason VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING', -- 'REQUESTED', 'APPROVED', 'COMPLETED', 'REJECTED'
    refund_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table 8: Refund Transactions
CREATE TABLE refund_transactions (
    id SERIAL PRIMARY KEY,
    return_id INT NOT NULL REFERENCES order_returns(id) ON DELETE CASCADE,
    payment_id INT REFERENCES payments(id),
    refund_reference VARCHAR(100) UNIQUE NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    refund_channel VARCHAR(50) DEFAULT 'UPI', -- 'UPI', 'ORIGINAL_PAYMENT', 'STORE_CREDIT'
    status VARCHAR(50) DEFAULT 'SUCCESS',
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table 9: Customer Addresses
CREATE TABLE customer_addresses (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    address_type VARCHAR(50) DEFAULT 'SHIPPING', -- 'SHIPPING', 'BILLING', 'OFFICE'
    street_line VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    is_default BOOLEAN DEFAULT FALSE
);

-- Table 10: Audit Logs
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    actor VARCHAR(100) NOT NULL,
    action_type VARCHAR(100) NOT NULL,
    target_entity VARCHAR(100) NOT NULL,
    target_id INT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    logged_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed Data for 10 New Tables
INSERT INTO suppliers (supplier_code, company_name, contact_name, email, phone, city, country, rating) VALUES
('SUP-101', 'SiliconTech Components Ltd', 'Rajesh Kulkarni', 'orders@silicontech.in', '+91-9988776655', 'Bengaluru', 'India', 4.8),
('SUP-102', 'ErgoCraft Woodworks', 'Deepak Mehta', 'sales@ergocraft.co.in', '+91-9988776656', 'Jodhpur', 'India', 4.6),
('SUP-103', 'AcousticWave Labs', 'Anita Deshmukh', 'procurement@acousticwave.io', '+91-9988776657', 'Pune', 'India', 4.9),
('SUP-104', 'VisionDisplay Optronics', 'Karthik Raja', 'supply@visiondisplay.com', '+91-9988776658', 'Chennai', 'India', 4.4),
('SUP-105', 'Apex Fabricators & Mesh', 'Manoj Bansal', 'contact@apexfab.in', '+91-9988776659', 'Surat', 'India', 4.5);

INSERT INTO warehouses (warehouse_code, warehouse_name, city, state, capacity_sqft, is_active) VALUES
('WH-BLR-01', 'Bengaluru Central Distribution Hub', 'Bengaluru', 'Karnataka', 85000, TRUE),
('WH-BOM-02', 'Bhiwandi Western Logistics Center', 'Mumbai', 'Maharashtra', 120000, TRUE),
('WH-DEL-03', 'NCR North Fulfillment Hub', 'Gurugram', 'Haryana', 95000, TRUE),
('WH-MAA-04', 'Chennai Coastal Depot', 'Chennai', 'Tamil Nadu', 60000, TRUE);

INSERT INTO product_inventory (product_id, warehouse_id, quantity_on_hand, quantity_reserved, reorder_threshold) VALUES
(1, 1, 35, 5, 10),
(1, 2, 20, 2, 8),
(2, 1, 80, 10, 25),
(2, 3, 50, 5, 20),
(3, 1, 25, 3, 5),
(3, 4, 15, 2, 5),
(4, 2, 40, 5, 10),
(4, 4, 30, 4, 8),
(5, 1, 120, 15, 30),
(5, 3, 90, 8, 25),
(6, 1, 18, 2, 5),
(6, 2, 12, 1, 5);

INSERT INTO purchase_orders (po_number, supplier_id, warehouse_id, order_date, status, total_cost) VALUES
('PO-2026-101', 1, 1, '2026-08-15 09:00:00+05:30', 'RECEIVED', 420000.00),
('PO-2026-102', 2, 1, '2026-08-20 14:30:00+05:30', 'RECEIVED', 150000.00),
('PO-2026-103', 3, 3, '2026-09-05 11:15:00+05:30', 'RECEIVED', 95000.00),
('PO-2026-104', 4, 1, '2026-10-02 16:45:00+05:30', 'APPROVED', 280000.00);

INSERT INTO purchase_order_items (po_id, product_id, quantity, unit_cost) VALUES
(1, 1, 10, 42000.00),
(2, 3, 15, 10000.00),
(3, 5, 50, 1900.00),
(4, 6, 10, 28000.00);

INSERT INTO discounts_promotions (promo_code, promo_name, discount_type, discount_value, min_order_value, max_discount, is_active, valid_until) VALUES
('FESTIVE10', 'Grand Festive Discount 10%', 'PERCENTAGE', 10.00, 5000.00, 2000.00, TRUE, '2026-11-30 23:59:59+05:30'),
('VIPBONUS', 'VIP Privilege Flat Rs 1500', 'FLAT', 1500.00, 20000.00, 1500.00, TRUE, '2026-12-31 23:59:59+05:30'),
('SUMMERSALE', 'Midsummer Electronics Sale', 'PERCENTAGE', 15.00, 10000.00, 3000.00, FALSE, '2026-06-30 23:59:59+05:30'),
('FREESHIP', 'Free Express Courier Voucher', 'FLAT', 250.00, 1000.00, 250.00, TRUE, '2026-12-31 23:59:59+05:30'),
('DIWALI2026', 'Diwali Bumper Savings 20%', 'PERCENTAGE', 20.00, 15000.00, 5000.00, TRUE, '2026-11-15 23:59:59+05:30');

INSERT INTO order_returns (return_number, order_id, customer_id, reason, status, refund_amount) VALUES
('RET-2026-001', 7, 6, 'Bluetooth connectivity stutter near transport hubs', 'COMPLETED', 8999.00),
('RET-2026-002', 5, 4, 'Accidental duplicate payment during gateway timeout', 'APPROVED', 2000.00);

INSERT INTO refund_transactions (return_id, payment_id, refund_reference, amount, refund_channel, status) VALUES
(1, 7, 'REF-TXN-88192', 8999.00, 'UPI', 'SUCCESS'),
(2, 5, 'REF-TXN-99201', 2000.00, 'ORIGINAL_PAYMENT', 'SUCCESS');

INSERT INTO customer_addresses (customer_id, address_type, street_line, city, state, postal_code, is_default) VALUES
(1, 'SHIPPING', '42, 100 Feet Road, Indiranagar', 'Bengaluru', 'Karnataka', '560038', TRUE),
(1, 'BILLING', 'Level 4, Prestige Tech Park', 'Bengaluru', 'Karnataka', '560103', FALSE),
(2, 'SHIPPING', 'Flat 802, Ocean Breeze, Bandra West', 'Mumbai', 'Maharashtra', '400050', TRUE),
(3, 'SHIPPING', '17/4, G.N. Chetty Road, T. Nagar', 'Chennai', 'Tamil Nadu', '600017', TRUE),
(4, 'SHIPPING', 'B-12, Shanti Sadan, Navrangpura', 'Ahmedabad', 'Gujarat', '380009', TRUE),
(5, 'SHIPPING', '24, Barakhamba Road, Connaught Place', 'Delhi', 'Delhi', '110001', TRUE),
(6, 'SHIPPING', 'SeaView Heights, Panampilly Nagar', 'Kochi', 'Kerala', '682036', TRUE);

INSERT INTO audit_logs (actor, action_type, target_entity, target_id, details) VALUES
('system_worker', 'INVENTORY_REORDER_TRIGGER', 'product_inventory', 1, '{"trigger": "Stock fell below reorder threshold", "product_id": 1}'::jsonb),
('admin@sqlginny.com', 'RETURN_AUTHORIZATION', 'order_returns', 1, '{"return_number": "RET-2026-001", "decision": "APPROVED", "refund_method": "UPI"}'::jsonb),
('system_worker', 'DISCOUNT_VOUCHER_EXPIRED', 'discounts_promotions', 3, '{"promo_code": "SUMMERSALE", "expired_at": "2026-06-30"}'::jsonb),
('billing_agent@sqlginny.com', 'REFUND_SETTLEMENT', 'refund_transactions', 1, '{"amount": 8999.0, "status": "SUCCESS", "ref": "REF-TXN-88192"}'::jsonb);

-- Refresh Materialized View
REFRESH MATERIALIZED VIEW monthly_revenue_summary_mv;

-- 6. Setup Restricted Credentials for AI Query Executor (Requirement 5)
-- User: ginny_app_user
-- Permissions:
--  - WRITE (INSERT, UPDATE, DELETE) ONLY on business_structs
--  - READ-ONLY (SELECT) on ALL other tables, views, materialized views, sequences
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'ginny_app_user') THEN
        CREATE USER ginny_app_user WITH PASSWORD 'ginny_secure_pass_456';
    ELSE
        ALTER USER ginny_app_user WITH PASSWORD 'ginny_secure_pass_456';
    END IF;
END $$;

-- Connect and Schema privileges
GRANT CONNECT ON DATABASE sql_ginny_db TO ginny_app_user;
GRANT USAGE ON SCHEMA public TO ginny_app_user;

-- Grant SELECT on all existing and future tables, views, materialized views
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ginny_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ginny_app_user;

-- Revoke all write permissions on the schema by default
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM ginny_app_user;

-- Specifically GRANT full read/write to 'business_structs' only
GRANT ALL PRIVILEGES ON TABLE business_structs TO ginny_app_user;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE business_structs_id_seq TO ginny_app_user;
