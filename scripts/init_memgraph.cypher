// ==============================================================================
// SQL Ginny - Memgraph Knowledge Graph Schema & Topology
// Nodes: PostgreSQL tables/views/mviews & MongoDB collections
// Edges: MUST_JOIN, CONDITIONAL_JOIN, OPTIONAL_JOIN
// ==============================================================================

// Clear existing topology
MATCH (n) DETACH DELETE n;

// 1. Create PostgreSQL Table & View Nodes
CREATE (c:Entity:Table {
    name: "customers",
    system: "PostgreSQL",
    type: "table",
    primary_key: "id",
    description: "Registered customer master profiles with contact, location and segmentation",
    fields: ["id", "customer_code", "first_name", "last_name", "email", "phone", "segment", "city", "country", "created_at"]
});

CREATE (o:Entity:Table {
    name: "orders",
    system: "PostgreSQL",
    type: "table",
    primary_key: "id",
    description: "Customer purchasing orders with monetary totals, statuses and timestamps",
    fields: ["id", "order_number", "customer_id", "order_date", "status", "currency", "total_amount", "discount_amount", "shipping_city"]
});

CREATE (oi:Entity:Table {
    name: "order_items",
    system: "PostgreSQL",
    type: "table",
    primary_key: "id",
    description: "Granular line items linking orders with specific products, quantities and unit pricing",
    fields: ["id", "order_id", "product_id", "quantity", "unit_price", "subtotal"]
});

CREATE (p:Entity:Table {
    name: "products",
    system: "PostgreSQL",
    type: "table",
    primary_key: "id",
    description: "Product catalog items with SKU, categories, prices and stock inventory",
    fields: ["id", "sku", "title", "category", "base_price", "stock_qty", "is_active", "created_at"]
});

CREATE (pay:Entity:Table {
    name: "payments",
    system: "PostgreSQL",
    type: "table",
    primary_key: "id",
    description: "Payment transaction receipts linked to orders via payment gateways",
    fields: ["id", "order_id", "payment_method", "transaction_ref", "amount", "status", "paid_at"]
});

CREATE (s:Entity:Table {
    name: "shipments",
    system: "PostgreSQL",
    type: "table",
    primary_key: "id",
    description: "Logistics carrier assignments and parcel delivery milestones",
    fields: ["id", "order_id", "carrier", "tracking_number", "status", "dispatched_at", "delivered_at"]
});

CREATE (v_aco:Entity:View {
    name: "active_customer_orders_view",
    system: "PostgreSQL",
    type: "view",
    primary_key: "order_id",
    description: "Pre-joined view of customer and in-progress order details",
    fields: ["customer_id", "customer_name", "email", "segment", "order_id", "order_number", "order_date", "order_status", "total_amount"]
});

CREATE (mv_rev:Entity:MaterializedView {
    name: "monthly_revenue_summary_mv",
    system: "PostgreSQL",
    type: "materialized_view",
    primary_key: "order_month",
    description: "Aggregated monthly revenue, gross order counts and average basket metrics",
    fields: ["order_month", "total_orders", "gross_revenue", "average_order_value"]
});

CREATE (bs:Entity:Table {
    name: "business_structs",
    system: "PostgreSQL",
    type: "table",
    primary_key: "id",
    description: "RAG domain knowledge, embedding vectors, metric definitions and join recipes",
    fields: ["id", "struct_name", "struct_type", "target_entities", "description", "sql_expression", "metadata", "embedding"]
});

// 2. Create MongoDB Collection Nodes
CREATE (m_cp:Entity:Collection {
    name: "customer_profiles",
    system: "MongoDB",
    type: "collection",
    primary_key: "customer_code",
    description: "Unstructured customer profiles, loyalty tier points and communication channel preferences",
    fields: ["customer_code", "email", "loyalty_points", "membership_tier", "interests", "account_status", "preferences", "lifetime_ltv_score"]
});

CREATE (m_pr:Entity:Collection {
    name: "product_reviews",
    system: "MongoDB",
    type: "collection",
    primary_key: "review_id",
    description: "Customer product reviews, 1-5 star ratings, feedback text and tags",
    fields: ["review_id", "sku", "author_email", "rating", "headline", "content", "verified_purchase", "helpful_votes", "tags"]
});

CREATE (m_cal:Entity:Collection {
    name: "customer_activity_logs",
    system: "MongoDB",
    type: "collection",
    primary_key: "session_id",
    description: "Streaming telemetry of page views, searches and cart abandonments",
    fields: ["session_id", "customer_code", "event_type", "search_query", "sku", "duration_seconds", "device", "timestamp"]
});

CREATE (m_st:Entity:Collection {
    name: "support_tickets",
    system: "MongoDB",
    type: "collection",
    primary_key: "ticket_id",
    description: "Customer support tickets, dispute logs and agent conversations",
    fields: ["ticket_id", "order_number", "customer_code", "issue_category", "status", "priority", "resolution_time_hours", "messages"]
});

// 3. Create Edge Relationships: MUST_JOIN, CONDITIONAL_JOIN, OPTIONAL_JOIN

// MUST_JOIN: Essential relational integrity for transactional coherence
MATCH (c:Entity {name: "customers"}), (o:Entity {name: "orders"})
CREATE (c)-[:MUST_JOIN {
    from_field: "id",
    to_field: "customer_id",
    relationship: "1:N",
    description: "Orders must link to customers via customers.id = orders.customer_id"
}]->(o);

MATCH (o:Entity {name: "orders"}), (oi:Entity {name: "order_items"})
CREATE (o)-[:MUST_JOIN {
    from_field: "id",
    to_field: "order_id",
    relationship: "1:N",
    description: "Line items must link to orders via orders.id = order_items.order_id"
}]->(oi);

MATCH (oi:Entity {name: "order_items"}), (p:Entity {name: "products"})
CREATE (oi)-[:MUST_JOIN {
    from_field: "product_id",
    to_field: "id",
    relationship: "N:1",
    description: "Order items must link to products catalog via order_items.product_id = products.id"
}]->(p);

// CONDITIONAL_JOIN: Join applies when specific business criteria / flags are met
MATCH (o:Entity {name: "orders"}), (pay:Entity {name: "payments"})
CREATE (o)-[:CONDITIONAL_JOIN {
    from_field: "id",
    to_field: "order_id",
    condition: "orders.status IN ('COMPLETED', 'PENDING')",
    relationship: "1:N",
    description: "Payments exist primarily for completed or pending orders"
}]->(pay);

MATCH (o:Entity {name: "orders"}), (s:Entity {name: "shipments"})
CREATE (o)-[:CONDITIONAL_JOIN {
    from_field: "id",
    to_field: "order_id",
    condition: "orders.status = 'COMPLETED'",
    relationship: "1:1",
    description: "Shipment dispatch records created when order status is COMPLETED"
}]->(s);

MATCH (o:Entity {name: "orders"}), (st:Entity {name: "support_tickets"})
CREATE (o)-[:CONDITIONAL_JOIN {
    from_field: "order_number",
    to_field: "order_number",
    condition: "orders.status IN ('REFUNDED', 'CANCELLED', 'PENDING')",
    relationship: "1:N",
    description: "Cross-DB Join: Support tickets are generated for problematic orders"
}]->(st);

// OPTIONAL_JOIN: Optional enrichments / outer joins
MATCH (c:Entity {name: "customers"}), (cp:Entity {name: "customer_profiles"})
CREATE (c)-[:OPTIONAL_JOIN {
    from_field: "customer_code",
    to_field: "customer_code",
    relationship: "1:1",
    description: "Cross-DB Join: Enriches relational customer with MongoDB loyalty and preference attributes"
}]->(cp);

MATCH (c:Entity {name: "customers"}), (cal:Entity {name: "customer_activity_logs"})
CREATE (c)-[:OPTIONAL_JOIN {
    from_field: "customer_code",
    to_field: "customer_code",
    relationship: "1:N",
    description: "Cross-DB Join: Enriches customer with real-time web telemetry and clickstream behavior"
}]->(cal);

MATCH (p:Entity {name: "products"}), (pr:Entity {name: "product_reviews"})
CREATE (p)-[:OPTIONAL_JOIN {
    from_field: "sku",
    to_field: "sku",
    relationship: "1:N",
    description: "Cross-DB Join: Enriches catalog product with customer reviews, ratings and sentiment"
}]->(pr);

MATCH (c:Entity {name: "customers"}), (st:Entity {name: "support_tickets"})
CREATE (c)-[:OPTIONAL_JOIN {
    from_field: "customer_code",
    to_field: "customer_code",
    relationship: "1:N",
    description: "Cross-DB Join: Links all historical support tickets initiated by a customer"
}]->(st);

// ==============================================================================
// 3. New PostgreSQL Table Nodes (10 Tables)
// ==============================================================================
CREATE (sup:Entity:Table {
    name: "suppliers",
    system: "PostgreSQL",
    type: "table",
    primary_key: "id",
    description: "Vendor and supplier master records with contacts, cities and ratings",
    fields: ["id", "supplier_code", "company_name", "contact_name", "email", "phone", "city", "country", "rating", "created_at"]
});

CREATE (wh:Entity:Table {
    name: "warehouses",
    system: "PostgreSQL",
    type: "table",
    primary_key: "id",
    description: "Physical distribution fulfillment centers and capacity metrics",
    fields: ["id", "warehouse_code", "warehouse_name", "city", "state", "capacity_sqft", "is_active", "created_at"]
});

CREATE (pi:Entity:Table {
    name: "product_inventory",
    system: "PostgreSQL",
    type: "table",
    primary_key: "id",
    description: "Stock levels, reserved quantities and reorder thresholds across warehouses",
    fields: ["id", "product_id", "warehouse_id", "quantity_on_hand", "quantity_reserved", "reorder_threshold", "last_restocked_at"]
});

CREATE (po:Entity:Table {
    name: "purchase_orders",
    system: "PostgreSQL",
    type: "table",
    primary_key: "id",
    description: "Procurement purchase orders placed with suppliers for warehouse replenishment",
    fields: ["id", "po_number", "supplier_id", "warehouse_id", "order_date", "status", "total_cost"]
});

CREATE (poi:Entity:Table {
    name: "purchase_order_items",
    system: "PostgreSQL",
    type: "table",
    primary_key: "id",
    description: "Granular line items for purchase orders detailing product quantities and unit costs",
    fields: ["id", "po_id", "product_id", "quantity", "unit_cost", "subtotal"]
});

CREATE (dp:Entity:Table {
    name: "discounts_promotions",
    system: "PostgreSQL",
    type: "table",
    primary_key: "id",
    description: "Marketing coupons, seasonal promotional campaigns and discount thresholds",
    fields: ["id", "promo_code", "promo_name", "discount_type", "discount_value", "min_order_value", "max_discount", "is_active", "valid_until"]
});

CREATE (ret:Entity:Table {
    name: "order_returns",
    system: "PostgreSQL",
    type: "table",
    primary_key: "id",
    description: "Return merchandise authorizations (RMA) with reasons and refund amounts",
    fields: ["id", "return_number", "order_id", "customer_id", "reason", "status", "refund_amount", "requested_at"]
});

CREATE (rt:Entity:Table {
    name: "refund_transactions",
    system: "PostgreSQL",
    type: "table",
    primary_key: "id",
    description: "Financial refund settlements processed back to customer payment channels",
    fields: ["id", "return_id", "payment_id", "refund_reference", "amount", "refund_channel", "status", "processed_at"]
});

CREATE (ca:Entity:Table {
    name: "customer_addresses",
    system: "PostgreSQL",
    type: "table",
    primary_key: "id",
    description: "Saved delivery and billing addresses for registered customers",
    fields: ["id", "customer_id", "address_type", "street_line", "city", "state", "postal_code", "is_default"]
});

CREATE (al:Entity:Table {
    name: "audit_logs",
    system: "PostgreSQL",
    type: "table",
    primary_key: "id",
    description: "Audit trail recording administrative actions, status transitions and system jobs",
    fields: ["id", "actor", "action_type", "target_entity", "target_id", "details", "logged_at"]
});

// ==============================================================================
// 4. New MongoDB Collection Nodes (10 Collections)
// ==============================================================================
CREATE (m_rec:Entity:Collection {
    name: "product_recommendations",
    system: "MongoDB",
    type: "collection",
    primary_key: "recommendation_id",
    description: "AI-driven product recommendations and collaborative affinity scores",
    fields: ["recommendation_id", "customer_code", "recommended_skus", "algorithm", "confidence_score", "category_affinity", "generated_at"]
});

CREATE (m_cart:Entity:Collection {
    name: "cart_sessions",
    system: "MongoDB",
    type: "collection",
    primary_key: "cart_id",
    description: "Live and abandoned shopping cart telemetry with SKU lists and coupons",
    fields: ["cart_id", "customer_code", "items", "device_type", "applied_coupon", "is_abandoned", "updated_at"]
});

CREATE (m_srch:Entity:Collection {
    name: "search_telemetry",
    system: "MongoDB",
    type: "collection",
    primary_key: "search_id",
    description: "User search queries, result hit counts, clicked SKUs and latency metrics",
    fields: ["search_id", "customer_code", "query_text", "results_count", "clicked_sku", "filters", "latency_ms", "timestamp"]
});

CREATE (m_frd:Entity:Collection {
    name: "fraud_evaluations",
    system: "MongoDB",
    type: "collection",
    primary_key: "evaluation_id",
    description: "Risk evaluation scores, triggered fraud detection rules and review decisions",
    fields: ["evaluation_id", "order_number", "customer_code", "risk_score", "risk_level", "triggers", "decision", "timestamp"]
});

CREATE (m_notif:Entity:Collection {
    name: "notification_dispatches",
    system: "MongoDB",
    type: "collection",
    primary_key: "dispatch_id",
    description: "Multichannel transactional delivery logs across WhatsApp, Email and SMS",
    fields: ["dispatch_id", "customer_code", "channel", "template", "destination", "status", "sent_at"]
});

CREATE (m_srv:Entity:Collection {
    name: "customer_feedback_surveys",
    system: "MongoDB",
    type: "collection",
    primary_key: "survey_id",
    description: "Post-purchase customer satisfaction CSAT ratings, NPS scores and comments",
    fields: ["survey_id", "customer_code", "order_number", "nps_score", "csat_score", "feedback_text", "channel", "submitted_at"]
});

CREATE (m_ctr:Entity:Collection {
    name: "vendor_contracts",
    system: "MongoDB",
    type: "collection",
    primary_key: "contract_id",
    description: "Supplier Master Agreements, SLA delivery parameters and penalty clauses",
    fields: ["contract_id", "supplier_code", "title", "sla_lead_time_days", "minimum_order_qty", "penalty_rate_percent", "valid_until", "status"]
});

CREATE (m_dev:Entity:Collection {
    name: "device_fingerprints",
    system: "MongoDB",
    type: "collection",
    primary_key: "device_id",
    description: "Security device fingerprinting, browser, operating system and geolocation",
    fields: ["device_id", "customer_code", "browser", "os", "ip_address", "location", "is_trusted", "last_active_at"]
});

CREATE (m_soc:Entity:Collection {
    name: "social_sentiment_mentions",
    system: "MongoDB",
    type: "collection",
    primary_key: "mention_id",
    description: "Social media buzz, user sentiment scores and community discussions per SKU",
    fields: ["mention_id", "sku", "platform", "sentiment", "sentiment_score", "snippet", "likes_count", "recorded_at"]
});

CREATE (m_iot:Entity:Collection {
    name: "warehouse_iot_telemetry",
    system: "MongoDB",
    type: "collection",
    primary_key: "sensor_id",
    description: "IoT environmental sensors logging warehouse temperature, humidity and alert flags",
    fields: ["sensor_id", "warehouse_code", "sensor_type", "reading_value", "unit", "alert_status", "timestamp"]
});

// ==============================================================================
// 5. Connect New Relational MUST_JOIN & CONDITIONAL_JOIN Edges
// ==============================================================================
MATCH (sup:Entity {name: "suppliers"}), (po:Entity {name: "purchase_orders"})
CREATE (sup)-[:MUST_JOIN {
    from_field: "id",
    to_field: "supplier_id",
    relationship: "1:N",
    description: "Foreign Key: Suppliers issue purchase orders"
}]->(po);

MATCH (wh:Entity {name: "warehouses"}), (po:Entity {name: "purchase_orders"})
CREATE (wh)-[:MUST_JOIN {
    from_field: "id",
    to_field: "warehouse_id",
    relationship: "1:N",
    description: "Foreign Key: Purchase orders are delivered to designated warehouses"
}]->(po);

MATCH (po:Entity {name: "purchase_orders"}), (poi:Entity {name: "purchase_order_items"})
CREATE (po)-[:MUST_JOIN {
    from_field: "id",
    to_field: "po_id",
    relationship: "1:N",
    description: "Foreign Key: Purchase order line items"
}]->(poi);

MATCH (p:Entity {name: "products"}), (poi:Entity {name: "purchase_order_items"})
CREATE (p)-[:MUST_JOIN {
    from_field: "id",
    to_field: "product_id",
    relationship: "1:N",
    description: "Foreign Key: Products procured in purchase orders"
}]->(poi);

MATCH (p:Entity {name: "products"}), (pi:Entity {name: "product_inventory"})
CREATE (p)-[:MUST_JOIN {
    from_field: "id",
    to_field: "product_id",
    relationship: "1:N",
    description: "Foreign Key: Products tracked in inventory"
}]->(pi);

MATCH (wh:Entity {name: "warehouses"}), (pi:Entity {name: "product_inventory"})
CREATE (wh)-[:MUST_JOIN {
    from_field: "id",
    to_field: "warehouse_id",
    relationship: "1:N",
    description: "Foreign Key: Warehouse inventory balances"
}]->(pi);

MATCH (o:Entity {name: "orders"}), (ret:Entity {name: "order_returns"})
CREATE (o)-[:MUST_JOIN {
    from_field: "id",
    to_field: "order_id",
    relationship: "1:N",
    description: "Foreign Key: Orders that initiated return merchandise authorizations"
}]->(ret);

MATCH (c:Entity {name: "customers"}), (ret:Entity {name: "order_returns"})
CREATE (c)-[:MUST_JOIN {
    from_field: "id",
    to_field: "customer_id",
    relationship: "1:N",
    description: "Foreign Key: Customers requesting returns"
}]->(ret);

MATCH (ret:Entity {name: "order_returns"}), (rt:Entity {name: "refund_transactions"})
CREATE (ret)-[:MUST_JOIN {
    from_field: "id",
    to_field: "return_id",
    relationship: "1:N",
    description: "Foreign Key: Approved returns generate refund transactions"
}]->(rt);

MATCH (pay:Entity {name: "payments"}), (rt:Entity {name: "refund_transactions"})
CREATE (pay)-[:CONDITIONAL_JOIN {
    from_field: "id",
    to_field: "payment_id",
    condition: "refund_transactions.status = 'SUCCESS'",
    relationship: "1:1",
    description: "Settled refunds reference the original payment receipt"
}]->(rt);

MATCH (c:Entity {name: "customers"}), (ca:Entity {name: "customer_addresses"})
CREATE (c)-[:MUST_JOIN {
    from_field: "id",
    to_field: "customer_id",
    relationship: "1:N",
    description: "Foreign Key: Customer saved shipping and billing addresses"
}]->(ca);

// ==============================================================================
// 6. Connect New Cross-DB OPTIONAL_JOIN Edges (PostgreSQL <-> MongoDB)
// ==============================================================================
MATCH (c:Entity {name: "customers"}), (m_rec:Entity {name: "product_recommendations"})
CREATE (c)-[:OPTIONAL_JOIN {
    from_field: "customer_code",
    to_field: "customer_code",
    relationship: "1:1",
    description: "Cross-DB Join: Connects customer with AI-generated product recommendations"
}]->(m_rec);

MATCH (c:Entity {name: "customers"}), (m_cart:Entity {name: "cart_sessions"})
CREATE (c)-[:OPTIONAL_JOIN {
    from_field: "customer_code",
    to_field: "customer_code",
    relationship: "1:N",
    description: "Cross-DB Join: Connects customer with active or abandoned shopping carts"
}]->(m_cart);

MATCH (c:Entity {name: "customers"}), (m_srch:Entity {name: "search_telemetry"})
CREATE (c)-[:OPTIONAL_JOIN {
    from_field: "customer_code",
    to_field: "customer_code",
    relationship: "1:N",
    description: "Cross-DB Join: Connects customer with search queries and search telemetry"
}]->(m_srch);

MATCH (o:Entity {name: "orders"}), (m_frd:Entity {name: "fraud_evaluations"})
CREATE (o)-[:OPTIONAL_JOIN {
    from_field: "order_number",
    to_field: "order_number",
    relationship: "1:1",
    description: "Cross-DB Join: Connects orders with automated risk scoring and fraud evaluations"
}]->(m_frd);

MATCH (c:Entity {name: "customers"}), (m_notif:Entity {name: "notification_dispatches"})
CREATE (c)-[:OPTIONAL_JOIN {
    from_field: "customer_code",
    to_field: "customer_code",
    relationship: "1:N",
    description: "Cross-DB Join: Connects customer with transactional notifications across channels"
}]->(m_notif);

MATCH (o:Entity {name: "orders"}), (m_srv:Entity {name: "customer_feedback_surveys"})
CREATE (o)-[:OPTIONAL_JOIN {
    from_field: "order_number",
    to_field: "order_number",
    relationship: "1:1",
    description: "Cross-DB Join: Connects order shipments with CSAT and NPS survey feedback"
}]->(m_srv);

MATCH (sup:Entity {name: "suppliers"}), (m_ctr:Entity {name: "vendor_contracts"})
CREATE (sup)-[:OPTIONAL_JOIN {
    from_field: "supplier_code",
    to_field: "supplier_code",
    relationship: "1:1",
    description: "Cross-DB Join: Connects suppliers with digital vendor contracts and SLAs"
}]->(m_ctr);

MATCH (c:Entity {name: "customers"}), (m_dev:Entity {name: "device_fingerprints"})
CREATE (c)-[:OPTIONAL_JOIN {
    from_field: "customer_code",
    to_field: "customer_code",
    relationship: "1:N",
    description: "Cross-DB Join: Connects customer with security device fingerprints and login IPs"
}]->(m_dev);

MATCH (p:Entity {name: "products"}), (m_soc:Entity {name: "social_sentiment_mentions"})
CREATE (p)-[:OPTIONAL_JOIN {
    from_field: "sku",
    to_field: "sku",
    relationship: "1:N",
    description: "Cross-DB Join: Connects product SKUs with social media sentiment mentions"
}]->(m_soc);

MATCH (wh:Entity {name: "warehouses"}), (m_iot:Entity {name: "warehouse_iot_telemetry"})
CREATE (wh)-[:OPTIONAL_JOIN {
    from_field: "warehouse_code",
    to_field: "warehouse_code",
    relationship: "1:N",
    description: "Cross-DB Join: Connects warehouse facilities with live IoT sensor telemetry"
}]->(m_iot);

