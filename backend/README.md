# SQL Ginny — Backend & FastMCP Gateway ⚡

FastAPI-powered autonomous cross-database intelligence backend and Model Context Protocol (MCP) server. Orchestrates real-time querying, pattern discovery, and knowledge graph relational reasoning across **PostgreSQL (with pgvector)**, **MongoDB**, **Memgraph**, and **Redis**.

---

## 🏗️ Architecture & Data Systems

| System | Port | Role & Purpose |
| :--- | :--- | :--- |
| **PostgreSQL (pgvector)** | `5433` | Relational tables, views, materialized views, and dense vector embeddings table (`business_structs`) |
| **MongoDB** | `27017` | NoSQL document collections, telemetry logs, and customer support tickets |
| **Memgraph** | `7687` | Relational knowledge graph indexing table topologies, foreign keys, and join conditions |
| **Redis** | `6379` | High-speed query result cache with 10-minute TTL and preview verification |
| **FastAPI Backend** | `8000` | REST API, SSE streaming endpoints (`/api/chat/stream`), and FastMCP transports (`/mcp`, `/sse`) |

---

## 🔒 Security & Role-Based Permissions

SQL Ginny enforces strict credential isolation:
- **`postgres` (Superuser)**: Used strictly for database migrations and schema initialization.
- **`ginny_app_user` (AI Executor Role)**:
  - **`SELECT` Only (Read-Only)**: Across all application schemas, tables, views, and materialized views.
  - **`INSERT`, `UPDATE`, `DELETE` (Write Access)**: Strictly restricted to the `business_structs` pgvector table for Business RAG domain rule maintenance.
  - All raw queries from LLM or dynamic query engine execute under this restricted user to guarantee zero risk of data mutation.

---

## 🧠 Autonomous Dynamic Query Engine (Zero Hardcoding)

Located at `app/services/dynamic_query_engine.py`:
1. **Targeted On-Demand Schema Resolution (Scales to 1,000+ Tables)**:
   - Instead of downloading the full database catalog upfront, extracts candidate entity/column keywords and generates morphological stems.
   - Executes parameterized `ILIKE ANY(%s)` searches across `information_schema.tables` and `pg_matviews` across ALL user schemas (`public`, `crm`, `sales`, etc.).
   - Fetches columns from `information_schema.columns` **strictly for the matched candidate tables**, keeping memory minimal and queries sub-5ms.
   - Performs targeted keyword matching against MongoDB collection names, sampling documents only for candidate collections.
2. **Single-Table vs. Multi-Table Routing**:
   - **Single-Table**: If requested attributes belong to one table, graph traversal is bypassed and a clean `SELECT` query is formulated directly.
   - **Multi-Table**: When attributes span multiple tables/collections, Memgraph BFS shortest-path or DFS multi-path traversal discovers required intermediate bridge tables and join keys.
3. **Two-Pass Column Projection**:
   - **Pass 1 (Exact & Spaced)**: Matches exact column names, snake_case with spaces (`first name`, `total amount`), and concatenated tokens (`firstname`).
   - **Pass 2 (Sub-word Resolution)**: Matches distinguishing parts (`price` &rarr; `base_price`, `stock` &rarr; `stock_qty`), while strictly protecting foreign keys (`_id`) and entity stems.
   - **Identifying Column Injection**: When an entity is queried with a secondary attribute (e.g. *"customers and their city"*), the engine prepends the entity's identifying columns (`first_name, last_name, city`) so rows remain identifiable. Strict keywords like `"only city"` preserve single-column projections.
4. **Order Preservation**:
   - Projected SQL columns strictly match the sequence in which the user requested them in natural language.

---

## 🛠️ FastMCP Tools Specification (11 Built-in Tools)

The backend exposes 11 native Model Context Protocol (MCP) tools at `/mcp` (Streamable HTTP) and `/sse` (Server-Sent Events):

1. **`retrieve_query_context(user_query, top_k)`**:
   - Performs semantic vector search over `business_structs` using pgvector cosine distance (`<=>`) to retrieve KPI formulas and privacy rules.
2. **`add_or_update_business_context(struct_name, struct_type, description, target_entities, sql_expression, metadata)`**:
   - Computes 384-dimensional dense embeddings (`sentence-transformers/all-MiniLM-L6-v2`) and persists domain rules in PostgreSQL.
3. **`delete_business_context(struct_id)`**:
   - Removes a domain rule from `business_structs`.
4. **`run_postgres_raw_query(sql_query)`**:
   - Executes read-only SQL on PostgreSQL, caches full result in Redis with a 10-minute TTL, and returns top-5 preview records with a `result_id`.
5. **`run_mongo_raw_query(collection_name, filter_json, projection_json, limit)`**:
   - Executes NoSQL queries against MongoDB with optional field projections and Redis 10-minute preview caching.
6. **`cross_db_query_and_join(postgres_query, mongo_collection, pg_join_key, mongo_join_key, join_type, secondary_joins, exclude_columns)`**:
   - Performs in-memory hash joins between PostgreSQL query records and MongoDB documents.
7. **`bfs_find_shortest_join_path(start_entity, target_entity, max_hops)`**:
   - Computes the shortest relational path between two entities in Memgraph, returning bridge tables, edge types, and ready SQL join templates.
8. **`dfs_explore_all_join_paths(start_entity, target_entity, max_hops)`**:
   - Explores all feasible relational paths between two entities.
9. **`get_entity_relationships(entity_name)`**:
   - Returns 1-hop inbound and outbound neighbors, conditions, and relationship types.
10. **`get_database_metadata(target_system)`**:
    - Discovers all tables, views, columns, and MongoDB collections.
11. **`get_current_datetime()`**:
    - Returns current system date, time, timezone, and ISO timestamps.

---

## 🌐 API Endpoints

### 1. AI Chat & Streaming (`/api/chat`)
- `POST /api/chat/stream`: Real-time SSE streaming assistant supporting multi-turn tool calling over OpenRouter models (Nemotron, Claude, GPT-4o, etc.) with autonomous fallback.
- `GET /api/chat/models`: Returns available models categorized by free/paid with context lengths.

### 2. Query Previews & Redis Cache (`/api/preview`)
- `GET /api/preview/{result_id}`: Retrieves cached query preview and total row count.
- `GET /api/preview/{result_id}/download?format=csv|json`: Downloads full dataset.
- `POST /api/preview/{result_id}/invalidate`: Clears Redis cache upon user feedback/correction.

### 3. Knowledge Graph Topology (`/api/graph`)
- `GET /api/graph/topology`: Returns all nodes (tables/collections) and edges (`MUST_JOIN`, `CONDITIONAL_JOIN`, `OPTIONAL_JOIN`).
- `POST /api/graph/path`: Finds BFS shortest path between two nodes.
- `POST /api/graph/paths-all`: Finds all DFS pathways.

### 4. Business RAG (`/api/meta`)
- `GET /api/meta/business-structs`: Lists all domain rules and KPI metrics.
- `POST /api/meta/business-structs`: Creates or updates a domain rule with pgvector embeddings.
- `DELETE /api/meta/business-structs/{id}`: Deletes a domain rule.
- `POST /api/meta/business-structs/test-similarity`: Tests vector semantic similarity against an input query.

### 5. System Health & MCP Transports
- `GET /health`: Backend and transport health status.
- `GET /docs`: Interactive Swagger UI.
- `GET /sse` & `POST /messages`: FastMCP SSE Transport.
- `POST /mcp`: FastMCP Streamable HTTP Transport.

---

## 🚀 Setup & Local Execution

### Prerequisites
- Python 3.10+ (or Python 3.12/3.14 with `uv`)
- Docker & Docker Compose (for PostgreSQL, MongoDB, Redis, Memgraph)

### 1. Virtual Environment & Dependencies
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Environment Configuration
Ensure `.env` in the repository root or `backend/.env` is configured:
```ini
OPENROUTER_API_KEY=your_key_here  # Optional: leave blank for autonomous local engine
OPENROUTER_MODEL=nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free

POSTGRES_HOST=localhost
POSTGRES_PORT=5433
POSTGRES_DB=sql_ginny_db
POSTGRES_USER=postgres
POSTGRES_APP_USER=ginny_app_user

MONGO_HOST=localhost
MONGO_PORT=27017
MONGO_DB=sql_ginny_mongo

REDIS_HOST=localhost
REDIS_PORT=6379

MEMGRAPH_HOST=localhost
MEMGRAPH_PORT=7687

BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
```

### 3. Start the Backend Server
```bash
# Using uvicorn directly
venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Or from project root using uv
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
API Documentation will be available at [http://localhost:8000/docs](http://localhost:8000/docs).
