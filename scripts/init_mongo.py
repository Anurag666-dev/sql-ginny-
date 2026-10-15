#!/usr/bin/env python3
"""
SQL Ginny - MongoDB Initialization Script using Motor (Async Python Driver)
Populates MongoDB collections, documents, nested subdocuments, and indexes.
"""
import os
import asyncio
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/sql_ginny_mongo")
DB_NAME = os.getenv("MONGO_DB", "sql_ginny_mongo")

async def init_mongo():
    print(f"[Motor Mongo Init] Connecting to {MONGO_URI}...")
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]

    # Ping to check connectivity
    try:
        await client.admin.command('ping')
        print("[Motor Mongo Init] Successfully connected to MongoDB.")
    except Exception as e:
        print(f"[Motor Mongo Init] Connection warning/error: {e}")

    # 1. Customer Profiles
    print("[Motor Mongo Init] Seeding customer_profiles collection...")
    await db.customer_profiles.drop()
    customer_profiles_data = [
        {
            "customer_code": "CUST-1001",
            "email": "aarav.sharma@example.com",
            "loyalty_points": 3450,
            "membership_tier": "Platinum",
            "interests": ["High-end Computing", "Audio Equipment", "Ergonomics"],
            "account_status": "ACTIVE",
            "preferences": {
                "newsletter": True,
                "preferred_channel": "EMAIL",
                "delivery_instruction": "Leave at door security desk"
            },
            "lifetime_ltv_score": 9.4,
            "created_at": datetime(2025, 1, 15, 9, 0, 0, tzinfo=timezone.utc)
        },
        {
            "customer_code": "CUST-1002",
            "email": "priya.verma@example.com",
            "loyalty_points": 820,
            "membership_tier": "Silver",
            "interests": ["Mobile Technology", "Photography"],
            "account_status": "ACTIVE",
            "preferences": {
                "newsletter": False,
                "preferred_channel": "SMS",
                "delivery_instruction": "Call before arrival"
            },
            "lifetime_ltv_score": 6.8,
            "created_at": datetime(2025, 3, 22, 14, 30, 0, tzinfo=timezone.utc)
        },
        {
            "customer_code": "CUST-1003",
            "email": "rohan.iyer@example.com",
            "loyalty_points": 4200,
            "membership_tier": "Diamond",
            "interests": ["Workplace Ergonomics", "Standing Desks", "Minimalism"],
            "account_status": "ACTIVE",
            "preferences": {
                "newsletter": True,
                "preferred_channel": "WHATSAPP",
                "delivery_instruction": "Deliver between 10 AM and 2 PM"
            },
            "lifetime_ltv_score": 9.8,
            "created_at": datetime(2024, 11, 10, 11, 15, 0, tzinfo=timezone.utc)
        },
        {
            "customer_code": "CUST-1004",
            "email": "ananya.patel@example.com",
            "loyalty_points": 500,
            "membership_tier": "Bronze",
            "interests": ["Laptops", "Productivity Software"],
            "account_status": "ACTIVE",
            "preferences": {
                "newsletter": True,
                "preferred_channel": "EMAIL",
                "delivery_instruction": "Gate pass required"
            },
            "lifetime_ltv_score": 5.5,
            "created_at": datetime(2026, 2, 1, 8, 0, 0, tzinfo=timezone.utc)
        },
        {
            "customer_code": "CUST-1005",
            "email": "vikram.m@example.com",
            "loyalty_points": 12500,
            "membership_tier": "Corporate Partner",
            "interests": ["Bulk Electronics", "Office Furniture", "Enterprise IT"],
            "account_status": "ACTIVE",
            "preferences": {
                "newsletter": False,
                "preferred_channel": "PHONE",
                "delivery_instruction": "Unload at loading dock 2"
            },
            "lifetime_ltv_score": 9.9,
            "created_at": datetime(2024, 5, 18, 10, 0, 0, tzinfo=timezone.utc)
        }
    ]
    await db.customer_profiles.insert_many(customer_profiles_data)
    await db.customer_profiles.create_index("customer_code", unique=True)
    await db.customer_profiles.create_index("email")

    # 2. Product Reviews
    print("[Motor Mongo Init] Seeding product_reviews collection...")
    await db.product_reviews.drop()
    product_reviews_data = [
        {
            "review_id": "REV-901",
            "sku": "PROD-LAPTOP-01",
            "author_email": "aarav.sharma@example.com",
            "rating": 5,
            "headline": "Unbelievable build quality and thermal efficiency",
            "content": "The ThinkBook Ultra 16 handled all heavy machine learning compiles without throttling. Screen is gorgeous.",
            "verified_purchase": True,
            "helpful_votes": 38,
            "tags": ["build-quality", "screen", "performance"],
            "created_at": datetime(2026, 9, 8, 11, 20, 0, tzinfo=timezone.utc)
        },
        {
            "review_id": "REV-902",
            "sku": "PROD-PHONE-02",
            "author_email": "priya.verma@example.com",
            "rating": 4,
            "headline": "Great camera, battery life could be slightly better",
            "content": "Daylight shots are crisp and optical stabilization works well. Charges rapidly to 80%.",
            "verified_purchase": True,
            "helpful_votes": 12,
            "tags": ["camera", "battery"],
            "created_at": datetime(2026, 9, 12, 16, 45, 0, tzinfo=timezone.utc)
        },
        {
            "review_id": "REV-903",
            "sku": "PROD-DESK-03",
            "author_email": "rohan.iyer@example.com",
            "rating": 5,
            "headline": "Smooth motor and memory presets work like a charm",
            "content": "Heavy steel frame, zero wobble at maximum height. Absolutely worth every rupee.",
            "verified_purchase": True,
            "helpful_votes": 45,
            "tags": ["ergonomics", "sturdy", "motor"],
            "created_at": datetime(2026, 9, 22, 9, 10, 0, tzinfo=timezone.utc)
        },
        {
            "review_id": "REV-904",
            "sku": "PROD-HEADSET-05",
            "author_email": "sneha.nair@example.com",
            "rating": 2,
            "headline": "Connection dropouts in crowded spaces",
            "content": "The ANC is decent but Bluetooth stuttered near metro stations. Requested a return.",
            "verified_purchase": True,
            "helpful_votes": 9,
            "tags": ["bluetooth", "return"],
            "created_at": datetime(2026, 10, 13, 14, 0, 0, tzinfo=timezone.utc)
        }
    ]
    await db.product_reviews.insert_many(product_reviews_data)
    await db.product_reviews.create_index("sku")
    await db.product_reviews.create_index("author_email")

    # 3. Customer Activity Logs
    print("[Motor Mongo Init] Seeding customer_activity_logs collection...")
    await db.customer_activity_logs.drop()
    activity_logs_data = [
        {
            "session_id": "SESS-88192-A",
            "customer_code": "CUST-1001",
            "event_type": "SEARCH_PRODUCT",
            "search_query": "curved monitor 34 inch",
            "device": "Desktop - Chrome 129",
            "ip_country": "IN",
            "timestamp": datetime(2026, 10, 13, 10, 14, 0, tzinfo=timezone.utc)
        },
        {
            "session_id": "SESS-88192-A",
            "customer_code": "CUST-1001",
            "event_type": "VIEW_ITEM",
            "sku": "PROD-MONITOR-06",
            "duration_seconds": 142,
            "device": "Desktop - Chrome 129",
            "ip_country": "IN",
            "timestamp": datetime(2026, 10, 13, 10, 17, 0, tzinfo=timezone.utc)
        },
        {
            "session_id": "SESS-99301-B",
            "customer_code": "CUST-1004",
            "event_type": "CART_ABANDONED",
            "sku": "PROD-LAPTOP-01",
            "potential_value": 84999.00,
            "device": "Mobile - Safari iOS 18",
            "ip_country": "IN",
            "timestamp": datetime(2026, 10, 14, 8, 30, 0, tzinfo=timezone.utc)
        }
    ]
    await db.customer_activity_logs.insert_many(activity_logs_data)
    await db.customer_activity_logs.create_index([("customer_code", 1), ("timestamp", -1)])

    # 4. Support Tickets
    print("[Motor Mongo Init] Seeding support_tickets collection...")
    await db.support_tickets.drop()
    support_tickets_data = [
        {
            "ticket_id": "TICK-7701",
            "order_number": "ORD-2026-007",
            "customer_code": "CUST-1006",
            "issue_category": "REFUND_STATUS",
            "status": "RESOLVED",
            "priority": "HIGH",
            "resolution_time_hours": 3.5,
            "messages": [
                {"sender": "customer", "text": "Headphone returned, when will refund reflect?", "timestamp": datetime(2026, 10, 12, 13, 0, 0, tzinfo=timezone.utc)},
                {"sender": "agent", "text": "Refund of Rs 8999 credited back to UPI handle.", "timestamp": datetime(2026, 10, 12, 16, 30, 0, tzinfo=timezone.utc)}
            ]
        },
        {
            "ticket_id": "TICK-7702",
            "order_number": "ORD-2026-005",
            "customer_code": "CUST-1004",
            "issue_category": "PAYMENT_CONFIRMATION",
            "status": "OPEN",
            "priority": "MEDIUM",
            "messages": [
                {"sender": "customer", "text": "Card deducted amount but order status shows pending.", "timestamp": datetime(2026, 10, 14, 9, 15, 0, tzinfo=timezone.utc)}
            ]
        }
    ]
    await db.support_tickets.insert_many(support_tickets_data)
    await db.support_tickets.create_index("order_number")
    await db.support_tickets.create_index("customer_code")

    # 5. Product Recommendations (AI & Vector Recommendation Engine)
    print("[Motor Mongo Init] Seeding product_recommendations collection...")
    await db.product_recommendations.drop()
    recommendations_data = [
        {
            "recommendation_id": "REC-501",
            "customer_code": "CUST-1001",
            "recommended_skus": ["PROD-MONITOR-06", "PROD-HEADSET-05"],
            "algorithm": "pgvector_collaborative_similarity",
            "confidence_score": 0.94,
            "category_affinity": "Electronics & Audio",
            "generated_at": datetime(2026, 10, 14, 6, 0, 0, tzinfo=timezone.utc),
            "expires_at": datetime(2026, 10, 21, 6, 0, 0, tzinfo=timezone.utc)
        },
        {
            "recommendation_id": "REC-502",
            "customer_code": "CUST-1003",
            "recommended_skus": ["PROD-CHAIR-04", "PROD-DESK-03"],
            "algorithm": "ergonomic_bundle_rule",
            "confidence_score": 0.98,
            "category_affinity": "Furniture",
            "generated_at": datetime(2026, 10, 14, 7, 30, 0, tzinfo=timezone.utc),
            "expires_at": datetime(2026, 10, 21, 7, 30, 0, tzinfo=timezone.utc)
        },
        {
            "recommendation_id": "REC-503",
            "customer_code": "CUST-1006",
            "recommended_skus": ["PROD-LAPTOP-01"],
            "algorithm": "churn_prevention_offer",
            "confidence_score": 0.82,
            "category_affinity": "Electronics",
            "generated_at": datetime(2026, 10, 14, 8, 15, 0, tzinfo=timezone.utc),
            "expires_at": datetime(2026, 10, 21, 8, 15, 0, tzinfo=timezone.utc)
        }
    ]
    await db.product_recommendations.insert_many(recommendations_data)
    await db.product_recommendations.create_index("customer_code")
    await db.product_recommendations.create_index("recommendation_id", unique=True)

    # 6. Cart Sessions (Telemetry & Abandoned Cart)
    print("[Motor Mongo Init] Seeding cart_sessions collection...")
    await db.cart_sessions.drop()
    cart_sessions_data = [
        {
            "cart_id": "CART-9910",
            "customer_code": "CUST-1001",
            "items": [
                {"sku": "PROD-MONITOR-06", "quantity": 1, "unit_price": 35999.00, "added_at": datetime(2026, 10, 13, 10, 15, 0, tzinfo=timezone.utc)}
            ],
            "device_type": "Desktop",
            "applied_coupon": "FESTIVE10",
            "is_abandoned": False,
            "updated_at": datetime(2026, 10, 13, 10, 20, 0, tzinfo=timezone.utc)
        },
        {
            "cart_id": "CART-9911",
            "customer_code": "CUST-1004",
            "items": [
                {"sku": "PROD-LAPTOP-01", "quantity": 1, "unit_price": 84999.00, "added_at": datetime(2026, 10, 14, 8, 25, 0, tzinfo=timezone.utc)}
            ],
            "device_type": "Mobile",
            "applied_coupon": None,
            "is_abandoned": True,
            "updated_at": datetime(2026, 10, 14, 8, 30, 0, tzinfo=timezone.utc)
        }
    ]
    await db.cart_sessions.insert_many(cart_sessions_data)
    await db.cart_sessions.create_index("cart_id", unique=True)
    await db.cart_sessions.create_index("customer_code")

    # 7. Search Telemetry
    print("[Motor Mongo Init] Seeding search_telemetry collection...")
    await db.search_telemetry.drop()
    search_telemetry_data = [
        {
            "search_id": "SRCH-4001",
            "customer_code": "CUST-1001",
            "query_text": "curved monitor ultra wide",
            "results_count": 3,
            "clicked_sku": "PROD-MONITOR-06",
            "filters": {"category": "Electronics"},
            "latency_ms": 42,
            "timestamp": datetime(2026, 10, 13, 10, 14, 0, tzinfo=timezone.utc)
        },
        {
            "search_id": "SRCH-4002",
            "customer_code": "CUST-1003",
            "query_text": "motorized height adjustable desk",
            "results_count": 2,
            "clicked_sku": "PROD-DESK-03",
            "filters": {"category": "Furniture"},
            "latency_ms": 38,
            "timestamp": datetime(2026, 10, 12, 14, 20, 0, tzinfo=timezone.utc)
        },
        {
            "search_id": "SRCH-4003",
            "customer_code": "CUST-1006",
            "query_text": "noise cancelling headphones bluetooth",
            "results_count": 5,
            "clicked_sku": "PROD-HEADSET-05",
            "filters": {"category": "Audio"},
            "latency_ms": 55,
            "timestamp": datetime(2026, 10, 10, 9, 30, 0, tzinfo=timezone.utc)
        }
    ]
    await db.search_telemetry.insert_many(search_telemetry_data)
    await db.search_telemetry.create_index("search_id", unique=True)
    await db.search_telemetry.create_index("customer_code")

    # 8. Fraud Evaluations
    print("[Motor Mongo Init] Seeding fraud_evaluations collection...")
    await db.fraud_evaluations.drop()
    fraud_evaluations_data = [
        {
            "evaluation_id": "FRD-201",
            "order_number": "ORD-2026-001",
            "customer_code": "CUST-1001",
            "risk_score": 12,
            "risk_level": "LOW",
            "triggers": ["Trusted Device", "Normal Billing-Shipping Match"],
            "decision": "APPROVED",
            "timestamp": datetime(2026, 9, 1, 10, 31, 0, tzinfo=timezone.utc)
        },
        {
            "evaluation_id": "FRD-202",
            "order_number": "ORD-2026-006",
            "customer_code": "CUST-1005",
            "risk_score": 28,
            "risk_level": "LOW",
            "triggers": ["High Basket Value Wholesale (> 1.5 Lakhs)", "Verified Corporate GST"],
            "decision": "APPROVED",
            "timestamp": datetime(2026, 10, 5, 16, 0, 30, tzinfo=timezone.utc)
        },
        {
            "evaluation_id": "FRD-203",
            "order_number": "ORD-2026-005",
            "customer_code": "CUST-1004",
            "risk_score": 68,
            "risk_level": "HIGH",
            "triggers": ["Payment Gateway Timeout", "Retry from Different IP"],
            "decision": "MANUAL_REVIEW",
            "timestamp": datetime(2026, 10, 1, 9, 12, 0, tzinfo=timezone.utc)
        }
    ]
    await db.fraud_evaluations.insert_many(fraud_evaluations_data)
    await db.fraud_evaluations.create_index("evaluation_id", unique=True)
    await db.fraud_evaluations.create_index("order_number")

    # 9. Notification Dispatches
    print("[Motor Mongo Init] Seeding notification_dispatches collection...")
    await db.notification_dispatches.drop()
    notification_dispatches_data = [
        {
            "dispatch_id": "DISP-801",
            "customer_code": "CUST-1001",
            "channel": "WHATSAPP",
            "template": "ORDER_CONFIRMATION",
            "destination": "+91-9876543210",
            "status": "DELIVERED",
            "sent_at": datetime(2026, 9, 1, 10, 35, 0, tzinfo=timezone.utc)
        },
        {
            "dispatch_id": "DISP-802",
            "customer_code": "CUST-1001",
            "channel": "EMAIL",
            "template": "DELIVERY_OUT_FOR_DELIVERY",
            "destination": "aarav.sharma@example.com",
            "status": "OPENED",
            "sent_at": datetime(2026, 9, 4, 8, 30, 0, tzinfo=timezone.utc)
        },
        {
            "dispatch_id": "DISP-803",
            "customer_code": "CUST-1006",
            "channel": "SMS",
            "template": "REFUND_INITIATED",
            "destination": "+91-9876543215",
            "status": "DELIVERED",
            "sent_at": datetime(2026, 10, 12, 17, 0, 0, tzinfo=timezone.utc)
        }
    ]
    await db.notification_dispatches.insert_many(notification_dispatches_data)
    await db.notification_dispatches.create_index("dispatch_id", unique=True)
    await db.notification_dispatches.create_index("customer_code")

    # 10. Customer Feedback Surveys
    print("[Motor Mongo Init] Seeding customer_feedback_surveys collection...")
    await db.customer_feedback_surveys.drop()
    surveys_data = [
        {
            "survey_id": "SRV-301",
            "customer_code": "CUST-1001",
            "order_number": "ORD-2026-001",
            "nps_score": 10,
            "csat_score": 5,
            "feedback_text": "Delivery was extraordinarily fast, packaging was pristine.",
            "channel": "WEB_POPUP",
            "submitted_at": datetime(2026, 9, 5, 14, 0, 0, tzinfo=timezone.utc)
        },
        {
            "survey_id": "SRV-302",
            "customer_code": "CUST-1006",
            "order_number": "ORD-2026-007",
            "nps_score": 4,
            "csat_score": 2,
            "feedback_text": "Product had Bluetooth issues but support team handled refund courteously.",
            "channel": "EMAIL_LINK",
            "submitted_at": datetime(2026, 10, 13, 18, 0, 0, tzinfo=timezone.utc)
        }
    ]
    await db.customer_feedback_surveys.insert_many(surveys_data)
    await db.customer_feedback_surveys.create_index("survey_id", unique=True)
    await db.customer_feedback_surveys.create_index("order_number")

    # 11. Vendor Contracts
    print("[Motor Mongo Init] Seeding vendor_contracts collection...")
    await db.vendor_contracts.drop()
    vendor_contracts_data = [
        {
            "contract_id": "CTR-101",
            "supplier_code": "SUP-101",
            "title": "Master Silicon Supply Agreement 2026",
            "sla_lead_time_days": 7,
            "minimum_order_qty": 5,
            "penalty_rate_percent": 2.5,
            "valid_until": datetime(2027, 8, 31, 23, 59, 59, tzinfo=timezone.utc),
            "status": "ACTIVE"
        },
        {
            "contract_id": "CTR-102",
            "supplier_code": "SUP-102",
            "title": "Ergonomic Furniture Timber & Mechanism SLA",
            "sla_lead_time_days": 14,
            "minimum_order_qty": 10,
            "penalty_rate_percent": 1.8,
            "valid_until": datetime(2027, 12, 31, 23, 59, 59, tzinfo=timezone.utc),
            "status": "ACTIVE"
        },
        {
            "contract_id": "CTR-103",
            "supplier_code": "SUP-103",
            "title": "Acoustic Drivers Quality Assurance Protocol",
            "sla_lead_time_days": 5,
            "minimum_order_qty": 20,
            "penalty_rate_percent": 3.0,
            "valid_until": datetime(2027, 6, 30, 23, 59, 59, tzinfo=timezone.utc),
            "status": "ACTIVE"
        }
    ]
    await db.vendor_contracts.insert_many(vendor_contracts_data)
    await db.vendor_contracts.create_index("contract_id", unique=True)
    await db.vendor_contracts.create_index("supplier_code")

    # 12. Device Fingerprints
    print("[Motor Mongo Init] Seeding device_fingerprints collection...")
    await db.device_fingerprints.drop()
    device_fingerprints_data = [
        {
            "device_id": "DEV-7701",
            "customer_code": "CUST-1001",
            "browser": "Chrome 129.0",
            "os": "macOS 15.0 Sequoia",
            "ip_address": "49.207.210.45",
            "location": {"city": "Bengaluru", "country": "India", "lat": 12.9716, "lon": 77.5946},
            "is_trusted": True,
            "last_active_at": datetime(2026, 10, 13, 10, 20, 0, tzinfo=timezone.utc)
        },
        {
            "device_id": "DEV-7702",
            "customer_code": "CUST-1002",
            "browser": "Safari iOS 18.1",
            "os": "iOS 18",
            "ip_address": "152.58.12.98",
            "location": {"city": "Mumbai", "country": "India", "lat": 19.0760, "lon": 72.8777},
            "is_trusted": True,
            "last_active_at": datetime(2026, 10, 11, 19, 45, 0, tzinfo=timezone.utc)
        },
        {
            "device_id": "DEV-7703",
            "customer_code": "CUST-1006",
            "browser": "Firefox 131.0",
            "os": "Windows 11",
            "ip_address": "117.218.44.12",
            "location": {"city": "Kochi", "country": "India", "lat": 9.9312, "lon": 76.2673},
            "is_trusted": True,
            "last_active_at": datetime(2026, 10, 13, 14, 5, 0, tzinfo=timezone.utc)
        }
    ]
    await db.device_fingerprints.insert_many(device_fingerprints_data)
    await db.device_fingerprints.create_index("device_id", unique=True)
    await db.device_fingerprints.create_index("customer_code")

    # 13. Social Sentiment Mentions
    print("[Motor Mongo Init] Seeding social_sentiment_mentions collection...")
    await db.social_sentiment_mentions.drop()
    social_sentiment_data = [
        {
            "mention_id": "SOC-901",
            "sku": "PROD-LAPTOP-01",
            "platform": "Twitter/X",
            "sentiment": "POSITIVE",
            "sentiment_score": 0.88,
            "snippet": "The ThinkBook Ultra 16 is easily the best developer laptop this year. Compiles are insane.",
            "likes_count": 240,
            "recorded_at": datetime(2026, 9, 15, 12, 0, 0, tzinfo=timezone.utc)
        },
        {
            "mention_id": "SOC-902",
            "sku": "PROD-DESK-03",
            "platform": "Reddit - r/battlestations",
            "sentiment": "POSITIVE",
            "sentiment_score": 0.92,
            "snippet": "ErgoLift standing desk setup complete! Dual motor is completely silent.",
            "likes_count": 510,
            "recorded_at": datetime(2026, 9, 25, 18, 30, 0, tzinfo=timezone.utc)
        },
        {
            "mention_id": "SOC-903",
            "sku": "PROD-HEADSET-05",
            "platform": "YouTube Tech Reviews",
            "sentiment": "NEUTRAL",
            "sentiment_score": 0.15,
            "snippet": "AcousticPro ANC review: Great soundstage and isolation, but firmware update needed for crowded Bluetooth.",
            "likes_count": 1200,
            "recorded_at": datetime(2026, 10, 5, 16, 0, 0, tzinfo=timezone.utc)
        }
    ]
    await db.social_sentiment_mentions.insert_many(social_sentiment_data)
    await db.social_sentiment_mentions.create_index("mention_id", unique=True)
    await db.social_sentiment_mentions.create_index("sku")

    # 14. Warehouse IoT Telemetry
    print("[Motor Mongo Init] Seeding warehouse_iot_telemetry collection...")
    await db.warehouse_iot_telemetry.drop()
    iot_telemetry_data = [
        {
            "sensor_id": "IOT-SN-01",
            "warehouse_code": "WH-BLR-01",
            "sensor_type": "TEMPERATURE",
            "reading_value": 22.4,
            "unit": "CELSIUS",
            "alert_status": "NORMAL",
            "timestamp": datetime(2026, 10, 14, 10, 0, 0, tzinfo=timezone.utc)
        },
        {
            "sensor_id": "IOT-SN-02",
            "warehouse_code": "WH-BLR-01",
            "sensor_type": "HUMIDITY",
            "reading_value": 48.2,
            "unit": "PERCENT",
            "alert_status": "NORMAL",
            "timestamp": datetime(2026, 10, 14, 10, 0, 0, tzinfo=timezone.utc)
        },
        {
            "sensor_id": "IOT-SN-03",
            "warehouse_code": "WH-BOM-02",
            "sensor_type": "HUMIDITY",
            "reading_value": 62.8,
            "unit": "PERCENT",
            "alert_status": "WARNING",
            "timestamp": datetime(2026, 10, 14, 10, 0, 0, tzinfo=timezone.utc)
        },
        {
            "sensor_id": "IOT-SN-04",
            "warehouse_code": "WH-DEL-03",
            "sensor_type": "TEMPERATURE",
            "reading_value": 24.1,
            "unit": "CELSIUS",
            "alert_status": "NORMAL",
            "timestamp": datetime(2026, 10, 14, 10, 0, 0, tzinfo=timezone.utc)
        }
    ]
    await db.warehouse_iot_telemetry.insert_many(iot_telemetry_data)
    await db.warehouse_iot_telemetry.create_index("sensor_id", unique=True)
    await db.warehouse_iot_telemetry.create_index("warehouse_code")

    print("[Motor Mongo Init] All 14 collections and documents seeded successfully via Motor async driver.")
    client.close()

if __name__ == "__main__":
    asyncio.run(init_mongo())
