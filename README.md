# SQL Ginny ⚡
> **Autonomous Cross-Database AI Intelligence, Knowledge Graph Relational Routing, and Enterprise Semantic Data Catalog**

SQL Ginny bridges **PostgreSQL (with pgvector)**, **MongoDB**, **Redis**, and **Memgraph** through a **FastAPI + FastMCP (Model Context Protocol)** backend, integrated with an autonomous **multi-stage AI query engine** and a modern **React + TypeScript + Tailwind CSS** interface.

---

## 🏗️ System Architecture

```
+---------------------------------------------------------------------------------------------------+
|                                      USER / CHAT CLIENT                                           |
|                   React 18 + TypeScript + Tailwind CSS + Lucide Icons + Vite                      |
|       [AI Chat Stream]      [Schema & Knowledge Studio]      [3D Knowledge Graph Visualizer]      |
+-------------------------------------------------+-------------------------------------------------+
                                                  | HTTP REST / Server-Sent Events (SSE)
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                FASTAPI + FASTMCP INTELLIGENCE GATEWAY                             |
|                                                                                                   |
|  +---------------------------------------------------------------------------------------------+  |
|  |                             AUTONOMOUS 5-STAGE AI ENGINE                                    |  |
|  |                                                                                             |  |
|  |  [Stage 1] pgvector Context Retrieval                                                        |  |
|  |            Cosine similarity search (<=>) on business_structs for enterprise policies.      |  |
|  |                                                                                             |  |
|  |  [Stage 2] Schema Grounding & Validation                                                     |  |
|  |            Introspects live information_schema and MongoDB collection catalogs.             |  |
|  |                                                                                             |  |
|  |  [Stage 3] Semantic Graph Endpoint Discovery                                                |  |
|  |            AI determines start/end entities; executes BFS & DFS over Memgraph topology.     |  |
|  |                                                                                             |  |
|  |  [Stage 4] Semantic Data Dictionary Injection                                               |  |
|  |            Extracts exact column data-types and business comments from Memgraph nodes.      |  |
|  |                                                                                             |  |
|  |  [Stage 5] Query Synthesis & Partitioning                                                   |  |
|  |            Formulates pure SQL, pure Mongo, or Cross-DB query configuration.                 |  |
|  +---------------------------------------------------------------------------------------------+  |
|                                                  |                                                |
|  +-----------------------------------------------+---------------------------------------------+  |
|  |                            IN-MEMORY CROSS-DATABASE JOINER                                  |  |
|  |   - Executes relational SQL on PostgreSQL (projects join key e.g. sku / customer_code)      |  |
|  |   - Fetches matching document sets from MongoDB                                             |  |
|  |   - Performs O(N+M) in-memory Hash Join (INNER / LEFT / FULL)                               |  |
|  |   - Enforces privacy rules (pruning customer IDs, sensitive fields)                          |  |
|  +-----------------------------------------------+---------------------------------------------+  |
+--------------------+-----------------------------+-----------------------+------------------------+
                     |                             |                       |
                     v                             v                       v
         +-----------------------+     +-----------------------+  +------------------+
         |  PostgreSQL + pgvector|     |       MongoDB         |  |     Memgraph     |
         |      (Port 5433)      |     |     (Port 27017)      |  |    (Port 7687)   |
         |                       |     |                       |  |                  |
         | Relational Tables:    |     | Document Collections: |  | Knowledge Graph: |
         | - customers           |     | - product_reviews     |  | - Nodes: Entities|
         | - orders, order_items |     | - customer_activity   |  | - MUST_JOIN      |
         | - products, inventory |     | - customer_feedback   |  | - CONDITIONAL    |
         | - warehouses          |     | - cart_sessions       |  | - OPTIONAL_JOIN  |
         | - business_structs    |     | - support_tickets     |  | - Data Dictionary|
         +-----------------------+     +-----------------------+  +------------------+
                     |                             |                       |
                     +-----------------------------+-----------------------+
                                                   |
                                                   v
                                       +-----------------------+
                                       |      Redis Cache      |
                                       |      (Port 6379)      |
                                       | 10-Minute TTL Cache   |
                                       | CSV & JSON Exports    |
                                       +-----------------------+
```

---

## 🌟 Key Capabilities

### 1. Pure Multi-Stage AI Reasoning Pipeline
Unlike naive text-to-SQL systems that blindly pass an entire database schema into a prompt, SQL Ginny executes a **5-stage deterministic pipeline**:
1. **RAG Context Retrieval (`pgvector`)**: Matches user intent with stored organizational rules (e.g., customer confidentiality, order completion filters).
2. **Schema Grounding**: Validates candidate tables and collections against live database catalogs (`information_schema.tables` and MongoDB collections). System authentication tables (`app_users`) are quarantined away from domain business entities.
3. **Knowledge Graph Traversal (Memgraph)**: Discovers candidate relational paths between entities via live BFS and DFS pathfinding.
4. **Semantic Dictionary Grounding**: Pulls exact column data-types and human business meanings from Memgraph, eliminating hallucinations on cryptic column names.
5. **Execution & Caching**: Emits SSE tool events, runs queries through restricted roles, and caches results in Redis with a 10-minute TTL.

### 2. In-Memory Polyglot Cross-Database Hash Join
When queries span both PostgreSQL and MongoDB (such as *"Show customer orders and their MongoDB feedback reviews"*):
- PostgreSQL queries relational tables (`customers ➔ orders ➔ order_items ➔ products`), projecting the join key (`p.sku`).
- MongoDB queries the `product_reviews` collection.
- FastMCP performs an in-memory hash join on `sku = sku`, merging relational rows and document fields into a unified schema.

### 3. Schema Studio & Semantic Data Catalog
Enterprise databases often use cryptic legacy names (e.g. `tbl_cst_mstr`, `c_flg_01`). Schema Studio allows data architects to:
- Register tables, views, materialized views, and MongoDB collections.
- Define column/field data types and business semantics (e.g. `c_flg_01` = `1: Active, 0: Churned`).
- Define graph join edges:
  - 🔴 **`MUST_JOIN`**: Enforced primary/foreign key dependency.
  - 🟡 **`CONDITIONAL_JOIN`**: Predicate-based joins (e.g. `WHERE status = 'ACTIVE'`).
  - 🟢 **`OPTIONAL_JOIN`**: Cross-database dimension joins.
- Auto-introspect live database tables to pre-populate column names and types with one click.

---

## 🚀 Setup & Reproduction Guide

### Prerequisites
- Python 3.11+
- Node.js 18+ and npm
- Docker (for database engines)

---

### Step 1: Start Databases (Standalone Docker Commands)

Run each database container directly using standard Docker:

```bash
# 1. PostgreSQL 16 with pgvector extension (Port 5433)
docker run -d \
  --name ginny_postgres \
  -p 5433:5432 \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres_password_123 \
  -e POSTGRES_DB=sql_ginny_db \
  pgvector/pgvector:pg16

# 2. MongoDB 7.0 (Port 27017)
docker run -d \
  --name ginny_mongo \
  -p 27017:27017 \
  mongo:7.0

# 3. Redis 7 (Port 6379)
docker run -d \
  --name ginny_redis \
  -p 6379:6379 \
  redis:7-alpine

# 4. Memgraph Platform with MAGE graph algorithms (Ports 7687 & 3000)
docker run -d \
  --name ginny_memgraph \
  -p 7687:7687 \
  -p 3000:3000 \
  memgraph/memgraph-platform:latest
```

---

### Step 2: Environment Configuration

Copy the example environment configuration:
```bash
cp .env.example .env
```

Open `.env` and configure your API key:
```env
OPENROUTER_API_KEY=sk-or-v1-your_openrouter_api_key_here
OPENROUTER_MODEL=google/gemini-3.5-flash-lite
```

---

### Step 3: Seed Database Schemas & Knowledge Graph

Run the automated seeder script. This script sets up relational tables, indexes, MongoDB documents, and Memgraph topology:

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run full multi-database seed script
python ../scripts/seed_all.py
```

The seed script initializes:
- **PostgreSQL**: `customers`, `orders`, `order_items`, `products`, `warehouses`, `product_inventory`, `business_structs` (with 384-dimensional vector embeddings), and restricted role `ginny_app_user`.
- **MongoDB**: `product_reviews`, `customer_activity_logs`, `customer_feedback_surveys`, `warehouse_iot_telemetry`, `support_tickets`.
- **Memgraph**: 30+ relational entities and 30+ directed join edges with data dictionaries.

---

### Step 4: Run Backend & Frontend

#### Backend (FastAPI + FastMCP):
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### Frontend (React + Vite):
```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

- **Frontend Application**: [http://localhost:5173](http://localhost:5173)
- **FastAPI Interactive Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **FastMCP Streamable Transport**: `http://localhost:8000/mcp`
- **FastMCP SSE Transport**: `http://localhost:8000/sse`
- **Memgraph Lab UI**: [http://localhost:3000](http://localhost:3000)

---

## 🛠️ FastMCP Tool Specification

SQL Ginny exposes 11 native MCP tools over HTTP/SSE:

| Tool Name | Transport | Purpose |
| :--- | :--- | :--- |
| `run_postgres_raw_query` | SQL Execution | Restricted execution of relational SELECT queries with Redis caching. |
| `run_mongo_raw_query` | Document Query | Executes JSON filters and projections against MongoDB collections. |
| `cross_db_query_and_join` | Hash Join | Executes parallel queries and merges PostgreSQL + MongoDB in memory. |
| `bfs_find_shortest_join_path`| Graph Traversal | Finds the shortest relational path between two entities in Memgraph. |
| `dfs_explore_all_join_paths` | Graph Discovery | Discovers all alternative multi-hop join paths across tables and documents. |
| `retrieve_query_context` | Vector RAG | Cosine distance search over `business_structs` embeddings. |
| `add_or_update_business_context`| RAG Management | Inserts dense semantic vectors and domain policies. |
| `delete_business_context` | RAG Management | Deletes stored business context rules. |
| `get_database_metadata` | Introspection | Introspects live tables, columns, and MongoDB collections. |
| `invalidate_query_cache` | Cache Management | Clears cached Redis query results upon user request. |
| `get_current_datetime` | Temporal Grounding | Returns system time and UTC timestamp for recency queries. |

---

## 🔐 Security & Access Control

- **Restricted Database Role (`ginny_app_user`)**: The AI execution engine operates using a restricted PostgreSQL user with `SELECT` privileges only. Write operations are restricted strictly to `business_structs`.
- **Zero Raw Key Leakage**: API keys and environment variables are strictly isolated in `.env` and loaded at runtime via Pydantic settings.
- **Data Confidentiality Enforcement**: Automated column exclusion filters out sensitive attributes (e.g. `customer_id`, customer codes) from final outputs when organizational privacy rules match.

---

## 📄 License
MIT License. Free for enterprise and personal development.
