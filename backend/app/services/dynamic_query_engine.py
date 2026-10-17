import re
import json
import httpx
from typing import Dict, Any, List, Optional
from app.services.graph_traversal import bfs_paths, dfs_paths
from app.db.memgraph_client import run_cypher
from app.db.postgres import execute_readonly_query
from app.db.mongo import get_sync_mongo_db
from app.config import settings

_RESOLVED_KEYS: Dict[str, str] = {}

def get_effective_inference_key(key: str) -> str:
    """Ensures key is an inference key; converts management/provisioning keys automatically."""
    k = (key or settings.OPENROUTER_API_KEY or "").strip()
    if not k:
        return ""
    if k in _RESOLVED_KEYS:
        return _RESOLVED_KEYS[k]

    try:
        with httpx.Client(timeout=5.0) as client:
            auth_res = client.get("https://openrouter.ai/api/v1/auth/key", headers={"Authorization": f"Bearer {k}"})
            if auth_res.status_code == 200:
                data = auth_res.json().get("data", {})
                if data.get("is_management_key") or data.get("is_provisioning_key"):
                    create_res = client.post(
                        "https://openrouter.ai/api/v1/keys",
                        headers={"Authorization": f"Bearer {k}", "Content-Type": "application/json"},
                        json={"name": "sql-ginny-auto"}
                    )
                    if create_res.status_code in (200, 201):
                        inf_key = create_res.json().get("key")
                        if inf_key:
                            _RESOLVED_KEYS[k] = inf_key
                            return inf_key
    except Exception:
        pass

    _RESOLVED_KEYS[k] = k
    return k

def call_openrouter(messages: List[Dict[str, str]], api_key: str, model: str, temperature: float = 0.1) -> str:
    """Helper to execute an OpenRouter LLM call and return text content with auto-retry and key resolution."""
    effective_key = get_effective_inference_key(api_key)
    effective_model = (model or settings.OPENROUTER_MODEL or "google/gemini-3.5-flash-lite").strip()

    headers = {
        "Authorization": f"Bearer {effective_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "SQL Ginny"
    }
    payload = {
        "model": effective_model,
        "messages": messages,
        "temperature": temperature
    }
    with httpx.Client(timeout=25.0) as client:
        res = client.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload)
        if res.status_code == 401 and settings.OPENROUTER_API_KEY and effective_key != settings.OPENROUTER_API_KEY:
            # Fallback to server inference key
            headers["Authorization"] = f"Bearer {settings.OPENROUTER_API_KEY}"
            res = client.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload)
        res.raise_for_status()
        choice = res.json().get("choices", [{}])[0]
        return choice.get("message", {}).get("content", "").strip()

def extract_json(raw_text: str) -> Dict[str, Any]:
    """Cleanly parse JSON from an AI response, stripping any markdown code fences."""
    text = raw_text.strip()
    if "```" in text:
        parts = text.split("```")
        for p in parts[1:]:
            p_clean = p.strip()
            if p_clean.startswith("json"):
                p_clean = p_clean[4:].strip()
            try:
                return json.loads(p_clean)
            except Exception:
                continue
    # Fallback to direct json.loads
    try:
        return json.loads(text)
    except Exception:
        # Regex search for first { ... } block
        m = re.search(r'(\{[\s\S]*\})', text)
        if m:
            return json.loads(m.group(1))
        return {}

def ai_step1_extract_entities_and_columns(
    user_query: str,
    api_key: str,
    model: str,
    rag_contexts: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Step 1: AI Call
    Ask AI for expected table, view, materialized view, or MongoDB collection names
    and expected column/field names based on the user's query and stored domain RAG rules.
    """
    rag_notes = [f"- {r.get('struct_name')}: {r.get('description')} (target entities: {r.get('target_entities', [])})" for r in (rag_contexts or [])]
    rag_prompt_section = ("\n\nDomain Business Rules & Context (from pgvector):\n" + "\n".join(rag_notes)) if rag_notes else ""

    sys_prompt = (
        "You are an enterprise database architect. Given the user query and domain rules, determine:\n"
        "1. 'expected_tables': list of PostgreSQL tables, views, materialized views, or MongoDB collections implied.\n"
        "   - General Rule: Do NOT select application user authentication tables (e.g. 'users', 'app_users') as they represent internal system user data; stay away from them and focus on business domain entities.\n"
        "2. 'expected_columns': list of column/field names requested or needed for filtering, sorting, or projection.\n"
        f"{rag_prompt_section}\n\n"
        "Return pure JSON with keys 'expected_tables' and 'expected_columns' only."
    )
    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_query}
    ]
    raw = call_openrouter(messages, api_key, model)
    return extract_json(raw)

def step2_ground_schemas_in_databases(expected_tables: List[str]) -> Dict[str, Any]:
    """
    Step 2: Grounding
    Search PostgreSQL information_schema (tables, materialized views, columns)
    and MongoDB live collections.
    """
    grounded_pg: Dict[str, Dict[str, str]] = {}
    grounded_mongo: Dict[str, List[str]] = {}

    patterns = [f"%{t.rstrip('s')}%" for t in expected_tables if t]
    if patterns:
        tbl_sql = """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
              AND table_name ILIKE ANY(%s);
        """
        t_res = execute_readonly_query(tbl_sql, (patterns,)) or []

        mv_sql = """
            SELECT matviewname as table_name
            FROM pg_matviews
            WHERE schemaname NOT IN ('information_schema', 'pg_catalog')
              AND matviewname ILIKE ANY(%s);
        """
        m_res = execute_readonly_query(mv_sql, (patterns,)) or []
        matched_pg_names = [
            n for n in set([r["table_name"] for r in t_res] + [r["table_name"] for r in m_res])
            if n not in ('app_users', 'spatial_ref_sys')
        ]

        if matched_pg_names:
            col_sql = """
                SELECT table_name, column_name, data_type
                FROM information_schema.columns
                WHERE table_name = ANY(%s) AND table_schema NOT IN ('information_schema', 'pg_catalog')
                ORDER BY table_name, ordinal_position;
            """
            c_res = execute_readonly_query(col_sql, (matched_pg_names,)) or []
            for r in c_res:
                t = r["table_name"]
                c = r["column_name"]
                if t not in grounded_pg:
                    grounded_pg[t] = {}
                grounded_pg[t][c] = r["data_type"]

    # MongoDB check
    try:
        db = get_sync_mongo_db()
        all_colls = [c for c in db.list_collection_names() if not c.startswith("system.")]
        for cname in all_colls:
            if any(cand.rstrip("s").lower() in cname.lower() for cand in expected_tables):
                sample = db[cname].find_one()
                grounded_mongo[cname] = [k for k in (sample.keys() if sample else []) if k != "_id"]
    except Exception:
        pass

    return {
        "pg_tables": grounded_pg,
        "mongo_collections": grounded_mongo
    }

def ai_step3_select_traversal_endpoints(
    user_query: str,
    grounded_entities: List[str],
    api_key: str,
    model: str
) -> Dict[str, Any]:
    """
    Step 3: AI Call
    Ask AI how to traverse the knowledge graph: identify the start node, end node,
    and whether BFS or DFS should be used.
    """
    if len(grounded_entities) <= 1:
        single = grounded_entities[0] if grounded_entities else "customers"
        return {"start_node": single, "end_node": single, "algorithm": "bfs"}

    sys_prompt = (
        "You are a database graph traversal planner. Given the user query and the list of verified database entities,\n"
        "determine the best 'start_node' and 'end_node' to find connecting join paths across the database.\n"
        "Available verified entities: " + ", ".join(grounded_entities) + "\n"
        "Return pure JSON with:\n"
        "- 'start_node': string entity name\n"
        "- 'end_node': string entity name\n"
        "- 'algorithm': 'bfs' or 'dfs'"
    )
    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_query}
    ]
    raw = call_openrouter(messages, api_key, model)
    data = extract_json(raw)
    start_node = data.get("start_node") or grounded_entities[0]
    end_node = data.get("end_node") or grounded_entities[-1]
    algo = data.get("algorithm", "bfs")
    return {"start_node": start_node, "end_node": end_node, "algorithm": algo}

def step4_discover_graph_paths(start_node: str, end_node: str) -> List[Dict[str, Any]]:
    """
    Step 4: Memgraph Execution
    Run BFS and DFS over the live Memgraph graph to fetch all candidate join paths and bridge tables.
    """
    if start_node == end_node:
        return [{
            "path_sequence": [start_node],
            "hops": 0,
            "join_summary": f"Direct table query on {start_node}",
            "intermediate_entities": []
        }]

    b_paths = bfs_paths(start_node, end_node, max_depth=6) or []
    d_paths = dfs_paths(start_node, end_node, max_depth=6) or []
    all_paths = []
    seen = set()
    for p in b_paths + d_paths:
        seq = tuple(p.get("path_sequence", []))
        if seq not in seen:
            seen.add(seq)
            all_paths.append(p)

    return all_paths if all_paths else [{
        "path_sequence": [start_node],
        "hops": 0,
        "join_summary": f"Direct table query on {start_node}",
        "intermediate_entities": []
    }]

def ai_step5_synthesize_query(
    user_query: str,
    step1_intent: Dict[str, Any],
    grounded_schemas: Dict[str, Any],
    graph_endpoints: Dict[str, Any],
    all_paths: List[Dict[str, Any]],
    rag_contexts: Optional[List[Dict[str, Any]]],
    api_key: str,
    model: str
) -> Dict[str, Any]:
    """
    Step 5: Final AI Call
    Provide AI with:
    - Original user query
    - Step 1 expected entities & columns
    - Grounded database schemas (tables, columns, types)
    - Step 3 traversal endpoints
    - All discovered Memgraph join paths and bridge relationships
    - Domain RAG rules (e.g. privacy/confidentiality)
    AI formulates the exact executable query (SQL, Mongo, or Cross-DB join config).
    """
    schema_summary = {}
    for tbl, cols in grounded_schemas.get("pg_tables", {}).items():
        schema_summary[tbl] = list(cols.keys())
    for coll, fields in grounded_schemas.get("mongo_collections", {}).items():
        schema_summary[f"mongo:{coll}"] = fields

    # Enrich schema with any intermediate bridge tables found in Memgraph paths
    intermediate_to_fetch = set()
    for p in all_paths:
        for node in p.get("path_sequence", []):
            if node not in schema_summary and not node.startswith("mongo:"):
                intermediate_to_fetch.add(node)

    if intermediate_to_fetch:
        col_sql = """
            SELECT table_name, column_name
            FROM information_schema.columns
            WHERE table_name = ANY(%s) AND table_schema NOT IN ('information_schema', 'pg_catalog');
        """
        c_res = execute_readonly_query(col_sql, (list(intermediate_to_fetch),)) or []
        for r in c_res:
            t = r["table_name"]
            c = r["column_name"]
            if t not in schema_summary:
                schema_summary[t] = []
            schema_summary[t].append(c)

    paths_summary = sorted(
        [p.get("join_summary") for p in all_paths if p.get("join_summary")],
        key=lambda s: (0 if "product_inventory" in s else 1, len(s))
    )
    rag_notes = [f"- {r.get('struct_name')}: {r.get('description')}" for r in (rag_contexts or [])]

    # Fetch Entity Business Descriptions and Column Data-Type Dictionaries from Memgraph
    entity_names = [k.replace("mongo:", "") for k in schema_summary.keys()]
    dict_sections = []
    try:
        dict_cypher = """
            MATCH (n:Entity)
            WHERE n.name IN $names
            RETURN n.name as name, n.description as description, n.columns_dictionary as columns_dict;
        """
        dict_res = run_cypher(dict_cypher, {"names": entity_names}) or []
        for row in dict_res:
            n_name = row.get("name")
            n_desc = row.get("description") or ""
            c_dict = row.get("columns_dict")
            if c_dict:
                try:
                    c_list = json.loads(c_dict) if isinstance(c_dict, str) else c_dict
                    col_lines = []
                    for col in c_list:
                        c_n = col.get("name")
                        c_t = col.get("data_type", "varchar")
                        c_d = col.get("description", "")
                        col_lines.append(f"    * {c_n} ({c_t}): {c_d}" if c_d else f"    * {c_n} ({c_t})")
                    dict_sections.append(f"- Entity '{n_name}' ({n_desc}):\n" + "\n".join(col_lines[:20]))
                except Exception:
                    pass
            elif n_desc:
                dict_sections.append(f"- Entity '{n_name}': {n_desc}")
    except Exception:
        pass

    dictionary_prompt = ("\n\nMemgraph Semantic Dictionary (Business Context & Column Data Types):\n" + "\n".join(dict_sections)) if dict_sections else ""

    sys_prompt = (
        "You are an enterprise AI database engineer. Formulate the exact, production-ready query to answer the user's request.\n\n"
        f"Available Grounded Schemas & Columns:\n{json.dumps(schema_summary, indent=2)}\n\n"
        f"Discovered Memgraph Relational Join Paths:\n" + "\n".join(paths_summary[:5]) + "\n\n"
        f"Business RAG Guidelines:\n" + "\n".join(rag_notes) + "\n"
        f"{dictionary_prompt}\n\n"
        "Query Formulation Rules:\n"
        "1. Write valid PostgreSQL SELECT statement using table aliases and exact foreign keys from the join paths.\n"
        "2. If user requests 'from each <entity>' (e.g. from each warehouse), use DISTINCT ON (<entity>.id) and ORDER BY <entity>.id, <order_col> DESC.\n"
        "3. If user mentions specific entities or names (e.g. 'Bhiwandi Western', 'Sneha', 'Nair'), apply WHERE with ILIKE or =.\n"
        "4. If 'last' or 'most recent' is requested, order by the date/timestamp descending.\n"
        "5. If customer privacy/confidentiality rule applies, omit customer_id.\n"
        "6. CRITICAL CROSS-DB RULE: Entities prefixed with 'mongo:' or collections (such as 'product_reviews', 'customer_profiles', 'support_tickets') are stored in MongoDB (Port 27017), NOT PostgreSQL.\n"
        "   - NEVER write 'JOIN product_reviews' or 'JOIN mongo:...' inside the PostgreSQL 'sql_query'!\n"
        "   - If MongoDB data is requested (e.g. reviews, ratings, feedback, profiles):\n"
        "     * Set 'query_type': 'cross_db'\n"
        "     * In 'sql_query', select ONLY from PostgreSQL tables and ALWAYS include the relational join key in the SELECT columns (e.g. `p.sku`, `c.customer_code`)\n"
        "     * NEVER include MongoDB fields or aliases (e.g. `f.feedback_text` or `pr.rating`) in the PostgreSQL SELECT clause. PostgreSQL cannot resolve them. They are merged automatically by the cross-database joiner!\n"
        "     * Specify 'mongo_collection': name of collection (e.g. 'product_reviews')\n"
        "     * Specify 'pg_join_key': PostgreSQL column to join on (e.g. 'sku' or 'customer_code')\n"
        "     * Specify 'mongo_join_key': MongoDB field to join on (e.g. 'sku' or 'customer_code')\n"
        "7. To link warehouses to products/items, always use 'product_inventory' (warehouses -> product_inventory -> products). Do NOT use 'purchase_orders' unless the user specifically asks for supplier procurement or purchase orders.\n"
        "8. Do NOT add WHERE conditions on order/shipment status (e.g. status = 'COMPLETED') unless the user explicitly requested that status.\n\n"
        "Return pure JSON with:\n"
        "{\n"
        "  'query_type': 'postgres' | 'mongo' | 'cross_db',\n"
        "  'sql_query': 'SELECT ...',\n"
        "  'mongo_collection': string or null,\n"
        "  'mongo_filter_json': string or null,\n"
        "  'pg_join_key': string or null,\n"
        "  'mongo_join_key': string or null,\n"
        "  'selected_path': ['table1', 'table2', ...],\n"
        "  'explanation': 'Short explanation of why this query fulfills the user request.'\n"
        "}"
    )

    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_query}
    ]
    raw = call_openrouter(messages, api_key, model)
    return extract_json(raw)

def plan_dynamic_query(
    prompt: str,
    rag_contexts: Optional[List[Dict[str, Any]]] = None,
    api_key: Optional[str] = None,
    model: Optional[str] = None
) -> Dict[str, Any]:
    """
    Pure Multi-Stage AI Pipeline:
    1. AI Call: Extract Expected Tables & Columns
    2. Search & Ground Schemas in PostgreSQL & MongoDB
    3. AI Call: Select Graph Traversal Endpoints (Start Node, End Node, Algo)
    4. Graph Traversal: Discover all Memgraph Join Paths
    5. Final AI Call: Synthesize Query using Grounded Schemas + All Paths
    """
    effective_key = (api_key or settings.OPENROUTER_API_KEY or "").strip()
    effective_model = (model or settings.OPENROUTER_MODEL or "google/gemini-3.5-flash-lite").strip()

    # Step 1: AI Call (Intent & Entities, guided by pgvector RAG rules)
    step1_intent = ai_step1_extract_entities_and_columns(prompt, effective_key, effective_model, rag_contexts=rag_contexts)
    expected_tables = step1_intent.get("expected_tables", [])
    expected_columns = step1_intent.get("expected_columns", [])

    # Step 2: Ground Schemas
    grounded_schemas = step2_ground_schemas_in_databases(expected_tables)
    valid_pg = list(grounded_schemas.get("pg_tables", {}).keys())
    valid_mongo = list(grounded_schemas.get("mongo_collections", {}).keys())
    all_valid = valid_pg + valid_mongo

    if not all_valid:
        # Fallback to general base tables if AI gave unusual names
        expected_tables = ["customers", "orders", "products", "warehouses"]
        grounded_schemas = step2_ground_schemas_in_databases(expected_tables)
        valid_pg = list(grounded_schemas.get("pg_tables", {}).keys())
        valid_mongo = list(grounded_schemas.get("mongo_collections", {}).keys())
        all_valid = valid_pg + valid_mongo

    # Step 3: AI Call (Graph Traversal Endpoints)
    endpoints = ai_step3_select_traversal_endpoints(prompt, all_valid, effective_key, effective_model)
    start_node = endpoints.get("start_node", all_valid[0] if all_valid else "customers")
    end_node = endpoints.get("end_node", all_valid[-1] if len(all_valid) > 1 else start_node)

    # Step 4: Discover all Memgraph Paths
    all_paths = step4_discover_graph_paths(start_node, end_node)

    # Step 5: Final AI Synthesis
    final_plan = ai_step5_synthesize_query(
        prompt,
        step1_intent,
        grounded_schemas,
        endpoints,
        all_paths,
        rag_contexts,
        effective_key,
        effective_model
    )

    query_type = final_plan.get("query_type", "postgres")
    sql_query = (
        final_plan.get("sql_query")
        or final_plan.get("query")
        or final_plan.get("sql")
        or final_plan.get("postgres_query")
        or ""
    ).strip()

    # Safeguard: If the LLM failed to emit a valid SELECT query, generate a clean SELECT statement
    if not sql_query.upper().startswith(("SELECT", "WITH", "EXPLAIN")):
        target_tbl = start_node if start_node in valid_pg else (valid_pg[0] if valid_pg else "warehouses")
        cols = list(grounded_schemas.get("pg_tables", {}).get(target_tbl, {}).keys())
        cols_str = ", ".join(cols) if cols else "*"
        sql_query = f"SELECT {cols_str} FROM {target_tbl}"

    mongo_collection = final_plan.get("mongo_collection")
    pg_join_key = final_plan.get("pg_join_key")
    mongo_join_key = final_plan.get("mongo_join_key")

    # Cross-DB Detection & Guardrail: Ensure queries requesting Mongo collections are properly routed
    mongo_colls = list(grounded_schemas.get("mongo_collections", {}).keys())
    needs_cross_db = (
        query_type == "cross_db"
        or bool(mongo_collection)
        or any(mc in prompt.lower() or mc.rstrip("s") in prompt.lower() or "review" in prompt.lower() for mc in mongo_colls)
    )

    if needs_cross_db:
        query_type = "cross_db"
        if not mongo_collection:
            mongo_collection = mongo_colls[0] if mongo_colls else "product_reviews"
        if not pg_join_key:
            pg_join_key = "sku" if any(k in prompt.lower() for k in ["product", "item", "sku", "bought"]) else "customer_code"
        if not mongo_join_key:
            mongo_join_key = pg_join_key

        # Guardrail: Strip any illegal JOIN on MongoDB collections in the PostgreSQL SQL query
        for mc in (mongo_colls or ["product_reviews"]):
            sql_query = re.sub(
                rf'(?i)\s+(?:LEFT\s+|INNER\s+|RIGHT\s+|FULL\s+)?JOIN\s+(?:mongo:)?{re.escape(mc)}\b[^\n;]*(?:ON\s+[^\n;]+)?',
                '',
                sql_query
            )
            # Remove direct references to mongo-only columns if aliased in PostgreSQL SELECT
            sql_query = re.sub(r'(?i),\s*\w+\.(?:rating|headline|content|telemetry)\b', '', sql_query)
            sql_query = re.sub(r'(?i)\b\w+\.(?:rating|headline|content|telemetry)\s*,\s*', '', sql_query)

        # Ensure the join key is projected in the PostgreSQL SELECT query for the hash joiner
        if pg_join_key not in sql_query.lower():
            col_ref = f"p.{pg_join_key}" if ("products p" in sql_query or "products AS p" in sql_query) else pg_join_key
            sql_query = re.sub(r'(?i)SELECT\s+', f'SELECT {col_ref}, ', sql_query, count=1)

    selected_path = final_plan.get("selected_path") or (all_paths[0].get("path_sequence") if all_paths else [start_node])
    explanation = final_plan.get("explanation", f"AI synthesized query for: '{prompt}'")

    return {
        "title": "Query Result",
        "chart_type": "table",
        "is_aggregation": False,
        "label_field": None,
        "value_field": None,
        "query_config": {
            "query_type": query_type,
            "postgres_query": sql_query,
            "mongo_collection": mongo_collection,
            "mongo_filter_json": final_plan.get("mongo_filter_json", "{}"),
            "pg_join_key": pg_join_key,
            "mongo_join_key": mongo_join_key
        },
        "matched_entities": [start_node, end_node],
        "path_sequence": selected_path,
        "hops": len(selected_path) - 1 if len(selected_path) > 1 else 0,
        "is_cross_db": (query_type == "cross_db"),
        "target_mongo_collection": mongo_collection,
        "cross_join_key": (pg_join_key, mongo_join_key) if pg_join_key else None,
        "secondary_joins": [],
        "exclude_columns": [],
        "generated_sql": sql_query,
        "mongo_filter": json.loads(final_plan.get("mongo_filter_json", "{}")) if isinstance(final_plan.get("mongo_filter_json"), str) else {},
        "intermediate_entities": selected_path[1:-1] if len(selected_path) > 2 else [],
        "all_candidate_paths": all_paths,
        "selected_path_index": 0,
        "path_selection_rationale": f"Traversed {len(all_paths)} paths between {start_node} and {end_node}.",
        "explanation": explanation,
        "step1_intent": step1_intent,
        "endpoints": endpoints
    }
