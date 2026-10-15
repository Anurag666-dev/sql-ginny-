// ==============================================================================
// SQL Ginny - MongoDB Initialization & Dummy Data Seed Script
// ==============================================================================

const dbName = 'sql_ginny_mongo';
const db = db.getSiblingDB(dbName);

print(`[MongoDB Init] Initializing database: ${dbName}...`);

// 1. Customer Profiles Collection
db.customer_profiles.drop();
db.customer_profiles.insertMany([
  {
    customer_code: "CUST-1001",
    email: "aarav.sharma@example.com",
    loyalty_points: 3450,
    membership_tier: "Platinum",
    interests: ["High-end Computing", "Audio Equipment", "Ergonomics"],
    account_status: "ACTIVE",
    preferences: {
      newsletter: true,
      preferred_channel: "EMAIL",
      delivery_instruction: "Leave at door security desk"
    },
    lifetime_ltv_score: 9.4,
    created_at: new Date("2025-01-15T09:00:00Z")
  },
  {
    customer_code: "CUST-1002",
    email: "priya.verma@example.com",
    loyalty_points: 820,
    membership_tier: "Silver",
    interests: ["Mobile Technology", "Photography"],
    account_status: "ACTIVE",
    preferences: {
      newsletter: false,
      preferred_channel: "SMS",
      delivery_instruction: "Call before arrival"
    },
    lifetime_ltv_score: 6.8,
    created_at: new Date("2025-03-22T14:30:00Z")
  },
  {
    customer_code: "CUST-1003",
    email: "rohan.iyer@example.com",
    loyalty_points: 4200,
    membership_tier: "Diamond",
    interests: ["Workplace Ergonomics", "Standing Desks", "Minimalism"],
    account_status: "ACTIVE",
    preferences: {
      newsletter: true,
      preferred_channel: "WHATSAPP",
      delivery_instruction: "Deliver between 10 AM and 2 PM"
    },
    lifetime_ltv_score: 9.8,
    created_at: new Date("2024-11-10T11:15:00Z")
  },
  {
    customer_code: "CUST-1004",
    email: "ananya.patel@example.com",
    loyalty_points: 500,
    membership_tier: "Bronze",
    interests: ["Laptops", "Productivity Software"],
    account_status: "ACTIVE",
    preferences: {
      newsletter: true,
      preferred_channel: "EMAIL",
      delivery_instruction: "Gate pass required"
    },
    lifetime_ltv_score: 5.5,
    created_at: new Date("2026-02-01T08:00:00Z")
  },
  {
    customer_code: "CUST-1005",
    email: "vikram.m@example.com",
    loyalty_points: 12500,
    membership_tier: "Corporate Partner",
    interests: ["Bulk Electronics", "Office Furniture", "Enterprise IT"],
    account_status: "ACTIVE",
    preferences: {
      newsletter: false,
      preferred_channel: "PHONE",
      delivery_instruction: "Unload at loading dock 2"
    },
    lifetime_ltv_score: 9.9,
    created_at: new Date("2024-05-18T10:00:00Z")
  }
]);

// 2. Product Reviews Collection
db.product_reviews.drop();
db.product_reviews.insertMany([
  {
    review_id: "REV-901",
    sku: "PROD-LAPTOP-01",
    author_email: "aarav.sharma@example.com",
    rating: 5,
    headline: "Unbelievable build quality and thermal efficiency",
    content: "The ThinkBook Ultra 16 handled all heavy machine learning compiles without throttling. Screen is gorgeous.",
    verified_purchase: true,
    helpful_votes: 38,
    tags: ["build-quality", "screen", "performance"],
    created_at: new Date("2026-09-08T11:20:00Z")
  },
  {
    review_id: "REV-902",
    sku: "PROD-PHONE-02",
    author_email: "priya.verma@example.com",
    rating: 4,
    headline: "Great camera, battery life could be slightly better",
    content: "Daylight shots are crisp and optical stabilization works well. Charges rapidly to 80%.",
    verified_purchase: true,
    helpful_votes: 12,
    tags: ["camera", "battery"],
    created_at: new Date("2026-09-12T16:45:00Z")
  },
  {
    review_id: "REV-903",
    sku: "PROD-DESK-03",
    author_email: "rohan.iyer@example.com",
    rating: 5,
    headline: "Smooth motor and memory presets work like a charm",
    content: "Heavy steel frame, zero wobble at maximum height. Absolutely worth every rupee.",
    verified_purchase: true,
    helpful_votes: 45,
    tags: ["ergonomics", "sturdy", "motor"],
    created_at: new Date("2026-09-22T09:10:00Z")
  },
  {
    review_id: "REV-904",
    sku: "PROD-HEADSET-05",
    author_email: "sneha.nair@example.com",
    rating: 2,
    headline: "Connection dropouts in crowded spaces",
    content: "The ANC is decent but Bluetooth stuttered near metro stations. Requested a return.",
    verified_purchase: true,
    helpful_votes: 9,
    tags: ["bluetooth", "return"],
    created_at: new Date("2026-10-13T14:00:00Z")
  }
]);

// 3. Customer Activity Logs Collection (Event stream)
db.customer_activity_logs.drop();
db.customer_activity_logs.insertMany([
  {
    session_id: "SESS-88192-A",
    customer_code: "CUST-1001",
    event_type: "SEARCH_PRODUCT",
    search_query: "curved monitor 34 inch",
    device: "Desktop - Chrome 129",
    ip_country: "IN",
    timestamp: new Date("2026-10-13T10:14:00Z")
  },
  {
    session_id: "SESS-88192-A",
    customer_code: "CUST-1001",
    event_type: "VIEW_ITEM",
    sku: "PROD-MONITOR-06",
    duration_seconds: 142,
    device: "Desktop - Chrome 129",
    ip_country: "IN",
    timestamp: new Date("2026-10-13T10:17:00Z")
  },
  {
    session_id: "SESS-99301-B",
    customer_code: "CUST-1004",
    event_type: "CART_ABANDONED",
    sku: "PROD-LAPTOP-01",
    potential_value: 84999.00,
    device: "Mobile - Safari iOS 18",
    ip_country: "IN",
    timestamp: new Date("2026-10-14T08:30:00Z")
  }
]);

// 4. Support Tickets Collection
db.support_tickets.drop();
db.support_tickets.insertMany([
  {
    ticket_id: "TICK-7701",
    order_number: "ORD-2026-007",
    customer_code: "CUST-1006",
    issue_category: "REFUND_STATUS",
    status: "RESOLVED",
    priority: "HIGH",
    resolution_time_hours: 3.5,
    messages: [
      { sender: "customer", text: "Headphone returned, when will refund reflect?", timestamp: new Date("2026-10-12T13:00:00Z") },
      { sender: "agent", text: "Refund of Rs 8999 credited back to UPI handle.", timestamp: new Date("2026-10-12T16:30:00Z") }
    ]
  },
  {
    ticket_id: "TICK-7702",
    order_number: "ORD-2026-005",
    customer_code: "CUST-1004",
    issue_category: "PAYMENT_CONFIRMATION",
    status: "OPEN",
    priority: "MEDIUM",
    messages: [
      { sender: "customer", text: "Card deducted amount but order status shows pending.", timestamp: new Date("2026-10-14T09:15:00Z") }
    ]
  }
]);

// Create indexes
db.customer_profiles.createIndex({ customer_code: 1 }, { unique: true });
db.customer_profiles.createIndex({ email: 1 });
db.product_reviews.createIndex({ sku: 1 });
db.product_reviews.createIndex({ author_email: 1 });
db.customer_activity_logs.createIndex({ customer_code: 1, timestamp: -1 });
db.support_tickets.createIndex({ order_number: 1 });

print(`[MongoDB Init] Initialized 4 collections with indexes and rich seed documents.`);
