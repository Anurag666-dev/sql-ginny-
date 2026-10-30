import json
import asyncio
import re
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import httpx

from app.config import settings
from app.auth.security import get_current_user
from app.db.mongo import get_sync_mongo_db
from app.mcp.tools_business_rag import tool_retrieve_query_context, tool_add_or_update_business_context
from app.mcp.tools_graph import tool_bfs_shortest_join_path, tool_dfs_all_join_paths, tool_get_entity_relationships
from app.mcp.tools_postgres import tool_run_postgres_raw_query, tool_invalidate_query_cache
from app.mcp.tools_mongo import tool_run_mongo_raw_query
from app.mcp.tools_cross_db import tool_cross_db_query_and_join
from app.mcp.tools_datetime import tool_get_current_datetime
from app.mcp.tools_metadata import (
    tool_get_database_metadata,
    tool_identify_relational_schema,
    tool_identify_mongo_collections
)

router = APIRouter(prefix="/api/chat", tags=["AI Chat & Streaming Assistant"])

AVAILABLE_MODELS = [
    {
        "id": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
        "name": "NVIDIA: Nemotron 3 Nano Omni (free)",
        "provider": "NVIDIA",
        "description": "NVIDIA flagship high-speed reasoning model with native function calling and structured decomposition.",
        "context_length": 131072,
        "is_free": True
    },
    {
        "id": "nvidia/nemotron-3.5-lightning:free",
        "name": "NVIDIA: Nemotron 3.5 Lightning (free)",
        "provider": "NVIDIA",
        "description": "Ultra low latency high-throughput model optimized for quick tool calling.",
        "context_length": 131072,
        "is_free": True
    },
    {
        "id": "openrouter/free",
        "name": "OpenRouter Free Router (Auto)",
        "provider": "OpenRouter",
        "description": "Zero-cost automatic router that dynamically selects available free models.",
        "context_length": 128000,
        "is_free": True
    },
    {
        "id": "google/gemini-2.5-flash",
        "name": "Google: Gemini 2.5 Flash",
        "provider": "Google",
        "description": "Google's ultra-fast, high-intelligence model for multi-stage SQL reasoning.",
        "context_length": 1048576,
        "is_free": False
    },
    {
        "id": "google/gemini-3.5-flash-lite",
        "name": "Google: Gemini 3.5 Flash Lite",
        "provider": "Google",
        "description": "Next-gen lightweight multimodal and reasoning model with high speed and low cost.",
        "context_length": 1048576,
        "is_free": False
    },
    {
        "id": "anthropic/claude-sonnet-4.5",
        "name": "Anthropic: Claude Sonnet 4.5",
        "provider": "Anthropic",
        "description": "Anthropic's latest high-capability reasoning model for database schema synthesis.",
        "context_length": 200000,
        "is_free": False
    },
    {
        "id": "meta-llama/llama-3.3-70b-instruct",
        "name": "Meta: Llama 3.3 70B Instruct",
        "provider": "Meta",
        "description": "Flagship 70-billion parameter reasoning model with native function calling.",
        "context_length": 131072,
        "is_free": False
    },
    {
        "id": "openai/gpt-4o",
        "name": "OpenAI: GPT-4o",
        "provider": "OpenAI",
        "description": "OpenAI's premier omni model for complex database orchestration.",
        "context_length": 128000,
        "is_free": False
    },
    {
        "id": "deepseek/deepseek-chat",
        "name": "DeepSeek: DeepSeek V3",
        "provider": "DeepSeek",
        "description": "Powerful 671B MoE architecture with advanced SQL reasoning.",
        "context_length": 65536,
        "is_free": False
    }
]

SYSTEM_PROMPT = """You are SQL Ginny, an autonomous AI cross-database intelligence architect and query execution engine.
You possess real-time access to four live database systems:
1. PostgreSQL (with pgvector for dense embeddings) on port 5433: Live schemas, tables, views, materialized views, and the pgvector domain knowledge table 'business_structs'.
2. MongoDB on port 27017: Live NoSQL document collections and flexible JSON schemas.
3. Memgraph Knowledge Graph on port 7687: Relational knowledge graph storing topology edges (MUST_JOIN, CONDITIONAL_JOIN, OPTIONAL_JOIN).
4. Redis Result Cache with 10-Minute TTL on port 6379: In-memory query result caching and preview verification.

ZERO HARDCODING PRINCIPLE:
Never assume or hardcode table names, collection names, column names, or business logic. Always discover schemas dynamically using your live discovery tools and retrieve domain definitions from Business RAG.

DYNAMIC EXECUTION PROTOCOL:
Follow this disciplined multi-step methodology on every query:

STEP 1 — BUSINESS RAG RETRIEVAL (Domain Rules & Confidentiality):
- Call `retrieve_query_context` with the user's natural language query to retrieve domain definitions, metric formulas, and privacy policies from the Business RAG table 'business_structs'.
- STRICTLY apply any rules, privacy restrictions, or column omissions retrieved from Business RAG (such as omitting identifiers, sensitive fields, or applying specific KPI formulas).

STEP 2 — TARGETED ON-DEMAND SCHEMA RESOLUTION:
- Extract candidate entity/table/collection keywords from the user prompt (e.g. 'customer', 'orders', 'products', 'tickets').
- Call `identify_relational_schema` passing these specific keywords. This triggers a fast, targeted ILIKE search across ALL PostgreSQL schemas (public, sales, crm, etc.) and returns column definitions ONLY for candidate tables without scanning the full catalog.
- Call `identify_mongo_collections` with the keywords to discover matching MongoDB collections on-demand.

STEP 3 — SINGLE TABLE vs. MULTI-TABLE JOIN DECISION:
- Check whether the user query involves a SINGLE entity/table or MULTIPLE entities:
  * SINGLE-TABLE QUERY: If all requested columns and filter conditions belong to ONE PostgreSQL table or view (e.g. "return sku, title, price of products" or "get customer first_name and email"):
    - DO NOT call graph traversal (`bfs_find_shortest_join_path`).
    - Directly formulate a clean single-table SELECT query and execute via `run_postgres_raw_query`.
  * SINGLE-COLLECTION MONGO QUERY: If all requested attributes belong to ONE MongoDB collection:
    - DO NOT call graph traversal.
    - Directly execute via `run_mongo_raw_query` with `projection_json`.
  * MULTI-TABLE / CROSS-DB QUERY: Only when the requested columns or filter criteria span across TWO OR MORE tables/collections:
    - Call `bfs_find_shortest_join_path` (or `dfs_explore_all_join_paths`) over Memgraph to discover the shortest relational join path, required bridge tables, and foreign keys.

STEP 4 — COLUMN SELECTION & QUERY COMPOSITION (CRITICAL):
- STRICT USER COLUMN PROJECTION:
  * If the user specifies or asks for specific columns/attributes/fields (e.g. 'return title, sku and price', 'show first_name, last_name, order_number'):
    - Inspect the schema from `identify_relational_schema` and match the user's requested attributes to exact column names.
    - In your SQL `SELECT` statement (`run_postgres_raw_query` or `cross_db_query_and_join`), project ONLY the requested columns (e.g., `SELECT p.sku, p.title, p.base_price FROM products p`).
    - NEVER use `SELECT *` when specific columns are requested or implied.
    - Always use table aliases with column names (e.g., `SELECT c.first_name, c.last_name, o.order_number FROM customers c JOIN orders o ON c.id = o.customer_id`).
  * ENTITY + ATTRIBUTE QUERIES (e.g. 'show me customers and their city', 'products and their price', 'orders and their status'):
    - When an entity is requested alongside a specific attribute, ALWAYS include the entity's primary identifying column(s) (such as first_name & last_name for customers, title & sku for products, order_number for orders) together with the requested attribute.
    - Never return just an isolated attribute like city or price alone without identifying which entity it belongs to, unless the user explicitly requests 'only city' or 'just city'.
  * CONCATENATION & MATH IN PROMPTS (e.g. 'name(first_name + last_name)', 'first_name + last_name'):
    - Treat `+` between names as concatenation. Project both columns (`c.first_name, c.last_name`) or use SQL concatenation (`c.first_name || ' ' || c.last_name AS full_name`).
    - NEVER treat `+`, `-`, or concatenation symbols as WHERE filter criteria!
  * Cross-Database Queries (PostgreSQL + MongoDB):
    - In `cross_db_query_and_join`, formulate `postgres_query` to select the requested PostgreSQL columns PLUS the join key (`pg_join_key`).
    - Apply `exclude_columns` to prune any confidential or omitted fields.
  * MongoDB Queries:
    - In `run_mongo_raw_query`, populate `projection_json` with the requested fields (e.g., `{"sku": 1, "rating": 1, "_id": 0}`).

STEP 5 — EXECUTION & SYNTHESIS:
- Execute the formulated query using `run_postgres_raw_query`, `run_mongo_raw_query`, or `cross_db_query_and_join`.
- Explain what was discovered:
  1. Business RAG rules and policies applied.
  2. Discovered schemas, tables, and collections.
  3. Relational join path sequence and bridge tables from Memgraph (if multi-table).
  4. Dynamic SQL/Mongo executed and Redis 10-minute cache confirmation with result preview.
"""

# OpenAPI Tools definition for LLM tool calling
MCP_TOOLS_SPEC = [
    {
        "type": "function",
        "function": {
            "name": "bfs_find_shortest_join_path",
            "description": "Finds the shortest relational join path between two database entities using BFS over the Memgraph topology. Only use when joining two different entities. Returns exact intermediate tables, foreign keys, and edge types.",
            "parameters": {
                "type": "object",
                "properties": {
                    "start_entity": {"type": "string", "description": "Starting table/collection (e.g. 'customers')"},
                    "target_entity": {"type": "string", "description": "Destination table/collection (e.g. 'product_reviews')"},
                    "max_hops": {"type": "integer", "description": "Maximum hops to search", "default": 5}
                },
                "required": ["start_entity", "target_entity"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "dfs_explore_all_join_paths",
            "description": "Explores all possible relational pathways between two database entities using DFS over the Memgraph graph.",
            "parameters": {
                "type": "object",
                "properties": {
                    "start_entity": {"type": "string", "description": "Starting entity"},
                    "target_entity": {"type": "string", "description": "Destination entity"},
                    "max_hops": {"type": "integer", "description": "Max traversal depth", "default": 5}
                },
                "required": ["start_entity", "target_entity"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "run_postgres_raw_query",
            "description": "Executes a SELECT query on PostgreSQL. When the user specifies specific columns to return (e.g. 'return sku, title, price' or 'first_name, order_number'), the sql_query MUST select ONLY those requested columns with table aliases, NEVER SELECT *. Stores result in Redis with 10m TTL.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sql_query": {"type": "string", "description": "Valid SELECT SQL statement with projected columns"}
                },
                "required": ["sql_query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "run_mongo_raw_query",
            "description": "Executes a query against a MongoDB collection. Populate projection_json with requested fields (e.g. '{\"sku\": 1, \"rating\": 1, \"_id\": 0}') when specific fields are requested. Results stored in Redis (10m TTL).",
            "parameters": {
                "type": "object",
                "properties": {
                    "collection_name": {"type": "string", "description": "Name of MongoDB collection"},
                    "filter_json": {"type": "string", "description": "JSON filter criteria (e.g. '{\"membership_tier\": \"GOLD\"}')", "default": "{}"},
                    "projection_json": {"type": "string", "description": "Optional fields to project (e.g. '{\"field1\": 1, \"field2\": 1, \"_id\": 0}')"},
                    "limit": {"type": "integer", "description": "Max documents to fetch", "default": 50}
                },
                "required": ["collection_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "cross_db_query_and_join",
            "description": "Performs an in-memory hash join between PostgreSQL query results and MongoDB collection documents. In postgres_query, select only the columns requested by the user plus the pg_join_key. Results cached in Redis with 10m TTL.",
            "parameters": {
                "type": "object",
                "properties": {
                    "postgres_query": {"type": "string", "description": "SQL SELECT query on PostgreSQL"},
                    "mongo_collection": {"type": "string", "description": "MongoDB collection name"},
                    "mongo_filter_json": {"type": "string", "description": "JSON filter for MongoDB", "default": "{}"},
                    "pg_join_key": {"type": "string", "description": "Column in PostgreSQL query to join on"},
                    "mongo_join_key": {"type": "string", "description": "Field in MongoDB collection to join on"},
                    "join_type": {"type": "string", "enum": ["INNER", "LEFT"], "default": "INNER"},
                    "secondary_joins": {"type": "array", "description": "Optional secondary Mongo collections to join"},
                    "exclude_columns": {"type": "array", "description": "Optional columns to exclude for privacy/confidentiality"}
                },
                "required": ["postgres_query", "mongo_collection", "pg_join_key", "mongo_join_key"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "retrieve_query_context",
            "description": "Performs dense semantic vector search with pgvector over 'business_structs' to retrieve KPIs, business metrics, and domain rules.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Natural language query to match business rules"},
                    "top_k": {"type": "integer", "description": "Number of domain rules to retrieve", "default": 3}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_database_metadata",
            "description": "Returns discovered tables, views, materialized views, columns, and Mongo collections.",
            "parameters": {
                "type": "object",
                "properties": {
                    "target_system": {"type": "string", "enum": ["ALL", "POSTGRESQL", "MONGODB"], "default": "ALL"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_current_datetime",
            "description": "Returns current system date, time, timezone, and ISO timestamps.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "identify_relational_schema",
            "description": "Inspects live PostgreSQL database schema to identify matching database.schema.table, view, or materialized view names based on search terms or query intent. Returns matched table names, column definitions, data types, and primary keys from live PostgreSQL information_schema.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search terms or entity keywords (e.g. 'orders', 'customers', 'sales')"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "identify_mongo_collections",
            "description": "Inspects live MongoDB database to identify matching collection names based on search terms or query intent. Returns matching collection names, sample document keys, and field types from live MongoDB.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search terms or collection keywords (e.g. 'reviews', 'tickets', 'telemetry')"}
                }
            }
        }
    }
]

def execute_tool_by_name(tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    """Dispatches tool call to the live FastMCP tool implementation."""
    try:
        if tool_name == "bfs_find_shortest_join_path":
            return tool_bfs_shortest_join_path(
                start_entity=arguments.get("start_entity", ""),
                target_entity=arguments.get("target_entity", ""),
                max_hops=arguments.get("max_hops", 5)
            )
        elif tool_name == "dfs_explore_all_join_paths":
            return tool_dfs_all_join_paths(
                start_entity=arguments.get("start_entity", ""),
                target_entity=arguments.get("target_entity", ""),
                max_hops=arguments.get("max_hops", 5)
            )
        elif tool_name == "run_postgres_raw_query":
            return tool_run_postgres_raw_query(
                query=arguments.get("sql_query", ""),
                exclude_columns=arguments.get("exclude_columns")
            )
        elif tool_name == "run_mongo_raw_query":
            return tool_run_mongo_raw_query(
                collection_name=arguments.get("collection_name", ""),
                filter_json=arguments.get("filter_json", "{}"),
                projection_json=arguments.get("projection_json"),
                limit=arguments.get("limit", 50)
            )
        elif tool_name == "cross_db_query_and_join":
            return tool_cross_db_query_and_join(
                postgres_query=arguments.get("postgres_query", ""),
                mongo_collection=arguments.get("mongo_collection", ""),
                mongo_filter_json=arguments.get("mongo_filter_json", "{}"),
                pg_join_key=arguments.get("pg_join_key", ""),
                mongo_join_key=arguments.get("mongo_join_key", ""),
                join_type=arguments.get("join_type", "INNER"),
                secondary_joins=arguments.get("secondary_joins"),
                exclude_columns=arguments.get("exclude_columns")
            )
        elif tool_name == "retrieve_query_context":
            user_q = arguments.get("user_query") or arguments.get("query", "")
            return tool_retrieve_query_context(
                user_query=user_q,
                top_k=arguments.get("top_k", 4)
            )
        elif tool_name == "get_database_metadata":
            return tool_get_database_metadata(target_system=arguments.get("target_system", "ALL"))
        elif tool_name == "identify_relational_schema":
            return tool_identify_relational_schema(query=arguments.get("query", ""))
        elif tool_name == "identify_mongo_collections":
            return tool_identify_mongo_collections(query=arguments.get("query", ""))
        elif tool_name == "get_current_datetime":
            return tool_get_current_datetime()
        else:
            return {"error": f"Unknown tool: {tool_name}"}
    except Exception as e:
        return {"error": f"Tool execution failed: {str(e)}"}

def safe_json_dumps(obj: Any) -> str:
    from datetime import datetime, date
    from decimal import Decimal
    def default_serializer(o):
        if isinstance(o, (datetime, date)):
            return o.isoformat()
        if isinstance(o, Decimal):
            return float(o)
        return str(o)
    return json.dumps(obj, default=default_serializer)

class Message(BaseModel):
    role: str
    content: str

class StreamChatRequest(BaseModel):
    messages: List[Message]
    model: Optional[str] = None
    api_key: Optional[str] = None
    temperature: Optional[float] = 0.2
    system_prompt: Optional[str] = None

_MODELS_CACHE = {"timestamp": 0.0, "data": []}

@router.get("/models")
async def list_available_models():
    """Returns available AI models categorized by free/paid with default selection (LibreChat style)."""
    import time
    now = time.time()
    
    # Return from cache if recent (10 minutes)
    if _MODELS_CACHE["data"] and (now - _MODELS_CACHE["timestamp"] < 600):
        return {
            "models": _MODELS_CACHE["data"],
            "default_model": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
            "has_server_key": bool(settings.OPENROUTER_API_KEY)
        }

    models_list = [dict(m) for m in AVAILABLE_MODELS]
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            res = await client.get("https://openrouter.ai/api/v1/models")
            if res.status_code == 200:
                api_models = res.json().get("data", [])
                known_ids = {m["id"] for m in models_list}
                for m in api_models:
                    mid = m.get("id")
                    if mid and mid not in known_ids:
                        pricing = m.get("pricing", {})
                        try:
                            prompt_p = float(pricing.get("prompt", 0) or 0)
                            comp_p = float(pricing.get("completion", 0) or 0)
                        except Exception:
                            prompt_p, comp_p = 0.0, 0.0
                        is_free = (prompt_p == 0 and comp_p == 0) or mid.endswith(":free") or "/free" in mid
                        
                        # Only include models with description or reputable providers
                        provider = mid.split("/")[0].title() if "/" in mid else "OpenRouter"
                        desc = m.get("description", "") or f"{m.get('name', mid)} AI language model."
                        if len(desc) > 130:
                            desc = desc[:127] + "..."
                        
                        models_list.append({
                            "id": mid,
                            "name": m.get("name") or mid,
                            "provider": provider,
                            "description": desc,
                            "context_length": m.get("context_length", 32768),
                            "is_free": is_free
                        })
                _MODELS_CACHE["data"] = models_list
                _MODELS_CACHE["timestamp"] = now
    except Exception:
        pass

    final_models = _MODELS_CACHE["data"] if _MODELS_CACHE["data"] else models_list
    return {
        "models": final_models,
        "default_model": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
        "has_server_key": bool(settings.OPENROUTER_API_KEY)
    }

@router.post("/stream")
async def stream_chat(req: StreamChatRequest):
    """
    Real-time SSE streaming chat endpoint with function-calling over live FastMCP tools.
    Supports multi-turn tool calling (Call 1 RAG -> Call 2 Graph -> Call 3 Query Execution).
    """
    api_key = req.api_key.strip() if req.api_key else settings.OPENROUTER_API_KEY
    model = req.model or settings.OPENROUTER_MODEL or "google/gemini-3.5-flash-lite"

    async def event_generator():
        yield f"data: {safe_json_dumps({'type': 'init', 'model': model})}\n\n"

        captured_result_ids = []
        latest_prompt = req.messages[-1].content if req.messages else ""
        prompt_lower = latest_prompt.strip().lower()

        # 1. Greetings
        if prompt_lower in ["hi", "hello", "hey", "hola", "greetings", "hi ginny", "hello ginny"]:
            greeting = (
                "Hello! I am **SQL Ginny**, your cross-database AI intelligence assistant.\n\n"
                "I am connected to your live databases:\n"
                "- 🐘 **PostgreSQL (Port 5433)**: Live tables, views, pgvector business_structs\n"
                "- 🍃 **MongoDB (Port 27017)**: Live collections & documents\n"
                "- 🕸️ **Memgraph (Port 7687)**: Live knowledge graph with BFS/DFS join path discovery\n"
                "- ⚡ **Redis (Port 6379)**: 10-minute query result caching & verification\n\n"
                "What would you like to investigate? Try asking me:\n"
                "- *'show me the last item sent from warehouse of Bhiwandi Western'*\n"
                "- *'hey show me last product sent from each of the warehouses'*\n"
                "- *'who is the last customer who made recent purchase'*"
            )
            yield f"data: {safe_json_dumps({'type': 'content', 'delta': greeting})}\n\n"

        # 2. Database Discovery / Metadata
        elif any(k in prompt_lower for k in ["table", "schema", "metadata", "collection", "discover", "all tables", "all collections"]):
            m_res = await asyncio.to_thread(execute_tool_by_name, "get_database_metadata", {"target_system": "ALL"})
            pg_tbls = [t["table_name"] for t in m_res.get("postgresql", {}).get("tables_and_views", [])]
            m_colls = list(m_res.get("mongodb", {}).keys())
            reply_text = (
                f"### Discovered Database Schemas:\n\n"
                f"- **PostgreSQL Tables & Views ({len(pg_tbls)})**:\n  " + ", ".join(f"`{t}`" for t in pg_tbls) + "\n\n"
                f"- **MongoDB Collections ({len(m_colls)})**:\n  " + ", ".join(f"`{c}`" for c in m_colls) + "\n\n"
                f"- **Memgraph Knowledge Graph (Port 7687)**: Indexed with `MUST_JOIN`, `CONDITIONAL_JOIN`, and `OPTIONAL_JOIN` topologies.\n\n"
                f"Ask me to find join paths or query any of these entities!"
            )
            yield f"data: {safe_json_dumps({'type': 'content', 'delta': reply_text})}\n\n"

        # 3. Pure Multi-Stage AI Pipeline
        else:
            # Step A: Retrieve RAG Domain Context via pgvector (top_k=4)
            yield f"data: {safe_json_dumps({'type': 'tool_start', 'tool': 'retrieve_query_context', 'args': {'user_query': latest_prompt, 'top_k': 4}})}\n\n"
            r_res = await asyncio.to_thread(execute_tool_by_name, "retrieve_query_context", {"user_query": latest_prompt, "top_k": 4})
            yield f"data: {safe_json_dumps({'type': 'tool_result', 'tool': 'retrieve_query_context', 'result': r_res})}\n\n"
            matched_rag = r_res.get("matched_contexts", [])

            # Step B: Autonomous Schema-Driven Planning with Live Schemas & RAG Rules (run in worker thread so FastAPI event loop never blocks)
            from app.services.dynamic_query_engine import plan_dynamic_query
            try:
                plan = await asyncio.to_thread(plan_dynamic_query, latest_prompt, matched_rag, api_key, model)
            except Exception as e:
                err_msg = f"AI Planning Error: {str(e)}"
                yield f"data: {safe_json_dumps({'type': 'error', 'message': err_msg})}\n\n"
                yield f"data: {safe_json_dumps({'type': 'done', 'result_ids': []})}\n\n"
                return

            # Emit AI Schema Grounding tool result
            yield f"data: {safe_json_dumps({'type': 'tool_start', 'tool': 'identify_relational_schema', 'args': {'query': latest_prompt}})}\n\n"
            yield f"data: {safe_json_dumps({'type': 'tool_result', 'tool': 'identify_relational_schema', 'result': {'status': 'success', 'ai_step1_intent': plan.get('step1_intent'), 'matched_entities': plan.get('matched_entities')}})}\n\n"

            # Step C: Graph Traversal over Memgraph
            start_ent = plan["path_sequence"][0]
            target_ent = plan["path_sequence"][-1]
            hops = plan["hops"]

            if hops > 0:
                cand_paths = plan.get("all_candidate_paths", [])
                yield f"data: {safe_json_dumps({'type': 'tool_start', 'tool': 'dfs_explore_all_join_paths', 'args': {'start_entity': start_ent, 'target_entity': target_ent}})}\n\n"
                yield f"data: {safe_json_dumps({'type': 'tool_result', 'tool': 'dfs_explore_all_join_paths', 'result': {'total_paths_discovered': len(cand_paths), 'selected_semantic_path': plan['path_sequence'], 'all_candidate_paths': cand_paths, 'rationale': plan.get('path_selection_rationale')}})}\n\n"

            # Step D: Execution
            if plan["is_cross_db"]:
                t_mongo = plan["target_mongo_collection"]
                pg_k, mg_k = plan["cross_join_key"] or ("sku", "sku")
                m_filter_json = json.dumps(plan["mongo_filter"])
                secondary_joins = plan.get("secondary_joins", [])
                exclude_columns = plan.get("exclude_columns", [])

                tool_args = {
                    "postgres_query": plan["generated_sql"],
                    "mongo_collection": t_mongo,
                    "mongo_filter_json": m_filter_json,
                    "pg_join_key": pg_k,
                    "mongo_join_key": mg_k,
                    "join_type": "LEFT",
                    "secondary_joins": secondary_joins,
                    "exclude_columns": exclude_columns
                }

                yield f"data: {safe_json_dumps({'type': 'tool_start', 'tool': 'cross_db_query_and_join', 'args': tool_args})}\n\n"
                exec_res = await asyncio.to_thread(execute_tool_by_name, "cross_db_query_and_join", tool_args)
                yield f"data: {safe_json_dumps({'type': 'tool_result', 'tool': 'cross_db_query_and_join', 'result': exec_res})}\n\n"
                res_id = exec_res.get("result_id")
                if res_id:
                    captured_result_ids.append(res_id)

                reply_text = (
                    f"### 🕸️ Cross-Database Traversal & Execution\n\n"
                    f"1. **Graph Traversal (Memgraph Port 7687):**\n"
                    f"   - **Shortest Join Path ({hops} hops):** `{' ➔ '.join(plan['path_sequence'])}`\n"
                    f"   - **Intermediate bridge tables:** {', '.join(f'`{b}`' for b in plan.get('intermediate_entities', [])) or 'None (Direct)'}\n\n"
                    f"2. **Cross-Database Hash Join:**\n"
                    f"   - **PostgreSQL (Port 5433):** Executed relational path query\n"
                    f"   - **MongoDB Primary (Port 27017):** Linked `{t_mongo}` on `{pg_k} = {mg_k}`\n"
                )
                if secondary_joins:
                    reply_text += f"   - **MongoDB Secondary Joins:** " + ", ".join(f"`{s['mongo_collection']}` on `{s['pg_join_key']} = {s['mongo_join_key']}`" for s in secondary_joins) + "\n"
                if exclude_columns:
                    reply_text += f"   - **RAG Governance Applied (Excluded Columns):** {', '.join(f'`{c}`' for c in exclude_columns)}\n"
                reply_text += (
                    f"   - **Total Matched Records:** {exec_res.get('total_joined_records', 0)}\n\n"
                    f"3. **Dynamic SQL Executed:**\n"
                    f"```sql\n{plan['generated_sql']}\n```\n"
                )
                if matched_rag:
                    reply_text += f"\n4. **Domain Context (pgvector):**\n"
                    for m in matched_rag:
                        reply_text += f"- **{m.get('struct_name')}**: {m.get('description')}\n"

                reply_text += (
                    f"\n⚡ **Result Cached in Redis (10m TTL):**\n"
                    f"Review the top rows below and download the full dataset as CSV or JSON."
                )
                yield f"data: {safe_json_dumps({'type': 'content', 'delta': reply_text})}\n\n"

            else:
                # Pure PostgreSQL query
                exclude_columns = plan.get("exclude_columns", [])
                pg_args = {"sql_query": plan["generated_sql"], "exclude_columns": exclude_columns}
                yield f"data: {safe_json_dumps({'type': 'tool_start', 'tool': 'run_postgres_raw_query', 'args': pg_args})}\n\n"
                exec_res = await asyncio.to_thread(execute_tool_by_name, "run_postgres_raw_query", pg_args)
                yield f"data: {safe_json_dumps({'type': 'tool_result', 'tool': 'run_postgres_raw_query', 'result': exec_res})}\n\n"
                res_id = exec_res.get("result_id")
                if res_id:
                    captured_result_ids.append(res_id)

                if exec_res.get("error"):
                    reply_text = (
                        f"### ❌ Query Execution Error\n\n"
                        f"**SQL Attempted:**\n```sql\n{plan['generated_sql']}\n```\n\n"
                        f"**Error Details:** `{exec_res.get('error')}`"
                    )
                else:
                    cand_count = len(plan.get("all_candidate_paths", []))
                    if hops > 0:
                        reply_text = f"### 🕸️ Relational Join Execution ({hops} hops)\n\n"
                        if cand_count > 1:
                            reply_text += f"- **Evaluated Candidate Pathways:** {cand_count} multi-hop pathways discovered in Memgraph\n"
                        reply_text += f"- **Selected Semantic Join Path:** `{' ➔ '.join(plan['path_sequence'])}`\n\n"
                    else:
                        reply_text = f"### 📊 Direct Table Query (`{start_ent}`)\n\n"

                    reply_text += (
                        f"**AI Reasoning & Plan:** {plan.get('explanation', '')}\n\n"
                        f"**Dynamic SQL Executed:**\n```sql\n{plan['generated_sql']}\n```\n\n"
                        f"Results cached in Redis with a **10-minute TTL**. Please verify the top rows below."
                    )
                yield f"data: {safe_json_dumps({'type': 'content', 'delta': reply_text})}\n\n"

        # Signal completion
        yield f"data: {safe_json_dumps({'type': 'done', 'result_ids': captured_result_ids})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


class SaveConversationsRequest(BaseModel):
    conversations: List[Dict[str, Any]]
    active_convo_id: Optional[str] = None


@router.get("/conversations")
async def get_user_conversations(current_user: dict = Depends(get_current_user)):
    """
    Fetches all saved chat conversations for the authenticated user from MongoDB ('chats' collection).
    Strictly isolated by user_id from the verified JWT token.
    """
    user_id = current_user.get("id")
    user_email = current_user.get("sub")
    try:
        db = get_sync_mongo_db()
        coll = db["chats"]
        doc = coll.find_one({"user_id": user_id}, {"_id": 0})
        if not doc and user_email:
            doc = coll.find_one({"user_email": user_email}, {"_id": 0})
        if doc:
            return {
                "user_id": user_id,
                "conversations": doc.get("conversations", []),
                "active_convo_id": doc.get("active_convo_id")
            }
        return {
            "user_id": user_id,
            "conversations": [],
            "active_convo_id": None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load chats from MongoDB: {str(e)}")


@router.put("/conversations")
async def save_user_conversations(
    req: SaveConversationsRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Upserts the authenticated user's multiple chat conversations into MongoDB ('chats' collection)
    linked strictly to their user_id.
    """
    user_id = current_user.get("id")
    user_email = current_user.get("sub")
    try:
        db = get_sync_mongo_db()
        coll = db["chats"]
        coll.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    "user_id": user_id,
                    "user_email": user_email,
                    "conversations": req.conversations,
                    "active_convo_id": req.active_convo_id,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            },
            upsert=True
        )
        return {
            "status": "saved",
            "user_id": user_id,
            "count": len(req.conversations)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save chats to MongoDB: {str(e)}")


@router.delete("/conversations/{convo_id}")
async def delete_user_conversation(
    convo_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Deletes a specific conversation by ID from the authenticated user's document in the MongoDB 'chats' collection.
    """
    user_id = current_user.get("id")
    try:
        db = get_sync_mongo_db()
        coll = db["chats"]
        coll.update_one(
            {"user_id": user_id},
            {
                "$pull": {"conversations": {"id": convo_id}},
                "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
            }
        )
        return {"status": "deleted", "convo_id": convo_id, "user_id": user_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete chat from MongoDB: {str(e)}")

