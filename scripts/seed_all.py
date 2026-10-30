#!/usr/bin/env python3
"""
SQL Ginny - Comprehensive Database & Graph Seeding Script
Populates PostgreSQL (with pgvector), MongoDB, and Memgraph with schemas, dummy data,
and initial business context structures.
"""
import os
import sys
import json
import time
import math
import hashlib
from typing import List

# Ensure parent path and backend are in sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, PROJECT_DIR)
sys.path.insert(0, os.path.join(PROJECT_DIR, "backend"))
sys.path.insert(0, SCRIPT_DIR)

from app.services.embeddings import get_text_embedding

def seed_postgres(host="localhost", port=5433, db="sql_ginny_db", user="postgres", password="postgres_password_123"):
    print(f"[PostgreSQL] Connecting to {host}:{port}/{db} as {user}...")
    try:
        import psycopg2
        conn = psycopg2.connect(host=host, port=port, dbname=db, user=user, password=password)
        conn.autocommit = True
        cur = conn.cursor()
        
        sql_file = os.path.join(SCRIPT_DIR, "init_postgres.sql")
        with open(sql_file, "r") as f:
            sql_statements = f.read()
        
        cur.execute(sql_statements)
        print("[PostgreSQL] Tables, views, and dummy data successfully initialized.")
        
        # Populate initial business structures with vector embeddings
        initial_structs = [
            {
                "struct_name": "customer_lifetime_value_rule",
                "struct_type": "kpi_metric",
                "target_entities": ["customers", "orders", "payments"],
                "description": "Customer Lifetime Value (LTV) represents the cumulative sum of all completed order payments made by a customer across all historical periods.",
                "sql_expression": "SELECT c.id, c.email, COALESCE(SUM(p.amount), 0) AS lifetime_value FROM customers c JOIN orders o ON c.id = o.customer_id JOIN payments p ON o.id = p.order_id WHERE p.status = 'SUCCESS' GROUP BY c.id, c.email;",
                "metadata": {"business_unit": "Growth", "priority": "CRITICAL"}
            },
            {
                "struct_name": "cross_db_support_risk_correlation",
                "struct_type": "domain_rule",
                "target_entities": ["orders", "mongo:support_tickets", "payments"],
                "description": "Identifies orders that have failed payments or pending statuses coupled with high priority customer support tickets in MongoDB.",
                "sql_expression": "Cross-join Postgres orders with Mongo support_tickets on order_number WHERE status = 'PENDING' AND ticket.priority = 'HIGH'",
                "metadata": {"cross_db": True, "risk_level": "HIGH"}
            },
            {
                "struct_name": "abandoned_cart_recovery_intent",
                "struct_type": "join_recipe",
                "target_entities": ["customers", "products", "mongo:customer_activity_logs"],
                "description": "Matches customer cart abandoned telemetry in MongoDB with inventory stock in Postgres products to trigger automated re-engagement notifications.",
                "sql_expression": "Join mongo.customer_activity_logs (sku) to postgres.products (sku) where stock_qty > 0",
                "metadata": {"use_case": "retargeting"}
            },
            {
                "struct_name": "vip_segment_threshold",
                "struct_type": "domain_rule",
                "target_entities": ["customers"],
                "description": "VIP customers are defined as either having segment = 'VIP' or holding more than 3000 loyalty points in MongoDB customer profiles.",
                "sql_expression": "SELECT id, customer_code FROM customers WHERE segment = 'VIP'",
                "metadata": {"category": "segmentation"}
            }
        ]
        
        for item in initial_structs:
            emb = get_text_embedding(item["description"] + " " + item["struct_name"])
            cur.execute("""
                INSERT INTO business_structs (struct_name, struct_type, target_entities, description, sql_expression, metadata, embedding)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (struct_name) DO UPDATE 
                SET description = EXCLUDED.description,
                    sql_expression = EXCLUDED.sql_expression,
                    metadata = EXCLUDED.metadata,
                    embedding = EXCLUDED.embedding,
                    updated_at = CURRENT_TIMESTAMP;
            """, (
                item["struct_name"],
                item["struct_type"],
                item["target_entities"],
                item["description"],
                item["sql_expression"],
                json.dumps(item["metadata"]),
                emb
            ))
        print(f"[PostgreSQL] Inserted {len(initial_structs)} business structs with 384-dim embeddings.")
        cur.close()
        conn.close()
        return True
    except Exception as e:
        print(f"[PostgreSQL] Error seeding database: {e}")
        return False

async def seed_mongo_async(mongo_uri="mongodb://localhost:27017/sql_ginny_mongo"):
    print(f"[MongoDB Motor] Connecting to {mongo_uri}...")
    try:
        from motor.motor_asyncio import AsyncIOMotorClient
        from scripts.init_mongo import init_mongo
        await init_mongo()
        return True
    except Exception as e:
        print(f"[MongoDB Motor] Error running motor init: {e}")
        return False

def seed_mongo(mongo_uri="mongodb://localhost:27017/sql_ginny_mongo"):
    import asyncio
    return asyncio.run(seed_mongo_async(mongo_uri))


def seed_memgraph(host="localhost", port=7687, user="", password=""):
    print(f"[Memgraph] Connecting to Bolt {host}:{port}...")
    try:
        from neo4j import GraphDatabase
        uri = f"bolt://{host}:{port}"
        auth = (user, password) if user else None
        driver = GraphDatabase.driver(uri, auth=auth)
        
        cypher_file = os.path.join(SCRIPT_DIR, "init_memgraph.cypher")
        with open(cypher_file, "r") as f:
            cypher_content = f.read()
            
        queries = [q.strip() for q in cypher_content.split(";") if q.strip()]
        with driver.session() as session:
            for q in queries:
                session.run(q)
                
        print(f"[Memgraph] Executed {len(queries)} Cypher queries. Graph topology active.")
        driver.close()
        return True
    except Exception as e:
        print(f"[Memgraph] Error seeding graph database: {e}")
        return False

if __name__ == "__main__":
    print("=== SQL Ginny Master Seeder ===")
    pg_host = os.getenv("POSTGRES_HOST", "localhost")
    mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017/sql_ginny_mongo")
    mem_host = os.getenv("MEMGRAPH_HOST", "localhost")
    
    seed_postgres(host=pg_host)
    seed_mongo(mongo_uri=mongo_uri)
    seed_memgraph(host=mem_host)
    print("=== Seeding Process Finished ===")
