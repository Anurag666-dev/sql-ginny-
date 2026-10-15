from typing import Dict, Any, List
from app.db.postgres import execute_readonly_query
from app.db.mongo import get_sync_mongo_db

def tool_get_database_metadata(target_system: str = "ALL") -> Dict[str, Any]:
    """
    Returns comprehensive metadata about databases, schemas, tables, views,
    materialized views, columns, foreign keys, and MongoDB collections & field structures.
    target_system: 'ALL', 'POSTGRESQL', or 'MONGODB'.
    """
    metadata = {}
    target = target_system.upper().strip()

    # 1. PostgreSQL Metadata
    if target in ("ALL", "POSTGRESQL", "POSTGRES"):
        try:
            # Tables and Views
            tables_sql = """
                SELECT 
                    table_schema, 
                    table_name, 
                    table_type
                FROM information_schema.tables
                WHERE table_schema = 'public';
            """
            tables_data = execute_readonly_query(tables_sql)
            
            # Columns
            cols_sql = """
                SELECT 
                    table_name, 
                    column_name, 
                    data_type, 
                    is_nullable
                FROM information_schema.columns
                WHERE table_schema = 'public'
                ORDER BY table_name, ordinal_position;
            """
            cols_data = execute_readonly_query(cols_sql)
            
            # Materialized views
            mviews_sql = """
                SELECT 
                    schemaname AS schema_name, 
                    matviewname AS materialized_view_name
                FROM pg_matviews
                WHERE schemaname = 'public';
            """
            mviews_data = execute_readonly_query(mviews_sql)
            
            # Foreign Key Constraints
            fk_sql = """
                SELECT
                    tc.table_name, 
                    kcu.column_name, 
                    ccu.table_name AS foreign_table_name,
                    ccu.column_name AS foreign_column_name 
                FROM information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                    ON ccu.constraint_name = tc.constraint_name
                    AND ccu.table_schema = tc.table_schema
                WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';
            """
            fk_data = execute_readonly_query(fk_sql)
            
            metadata["postgresql"] = {
                "tables_and_views": [dict(t) for t in tables_data] if tables_data else [],
                "columns": [dict(c) for c in cols_data] if cols_data else [],
                "materialized_views": [dict(m) for m in mviews_data] if mviews_data else [],
                "foreign_keys": [dict(f) for f in fk_data] if fk_data else []
            }
        except Exception as e:
            metadata["postgresql"] = {"error": str(e)}

    # 2. MongoDB Metadata
    if target in ("ALL", "MONGODB", "MONGO"):
        try:
            db = get_sync_mongo_db()
            collections = db.list_collection_names()
            mongo_meta = {}
            for col_name in collections:
                coll = db[col_name]
                count = coll.count_documents({})
                sample_doc = coll.find_one({})
                if sample_doc and "_id" in sample_doc:
                    sample_doc["_id"] = str(sample_doc["_id"])
                    
                field_types = {k: type(v).__name__ for k, v in (sample_doc or {}).items()}
                indexes = list(coll.list_indexes())
                clean_indexes = [idx.get("name") for idx in indexes]
                
                mongo_meta[col_name] = {
                    "document_count": count,
                    "fields_detected": field_types,
                    "sample_document": sample_doc,
                    "indexes": clean_indexes
                }
            metadata["mongodb"] = mongo_meta
        except Exception as e:
            metadata["mongodb"] = {"error": str(e)}

    return metadata

def tool_identify_relational_schema(query: str = "") -> Dict[str, Any]:
    """
    Scalable, on-demand PostgreSQL schema resolution.
    Searches across ALL non-system schemas (public, crm, sales, etc.) using targeted ILIKE matching
    and morphological variants, retrieving columns ONLY for matched candidate tables.
    Designed for production databases with 1,000+ tables.
    """
    import re
    try:
        stopwords = {
            "and", "or", "the", "a", "an", "in", "on", "at", "to", "for", "of", "with", "from",
            "by", "as", "is", "it", "this", "that", "which", "who", "what", "how", "return",
            "select", "show", "get", "find", "list", "all", "where", "having", "not", "null",
            "table", "data", "view", "count", "chart", "pie", "donut", "bar", "line", "give", "me"
        }
        raw_tokens = [t.lower() for t in re.findall(r'[a-zA-Z0-9_]+', query)] if query else []
        q_tokens = [t for t in raw_tokens if len(t) >= 3 and t not in stopwords]

        patterns = []
        for kw in q_tokens:
            patterns.append(f"%{kw}%")
            if kw.endswith("ies"):
                patterns.append(f"%{kw[:-3]}y%")
            elif kw.endswith("es"):
                patterns.append(f"%{kw[:-2]}%")
            elif kw.endswith("s"):
                patterns.append(f"%{kw[:-1]}%")
            else:
                patterns.append(f"%{kw}s%")
        patterns = list(set(patterns))

        candidate_tables = []

        if patterns:
            # 1. Targeted search for tables/views matching keywords across ALL schemas
            tables_sql = """
                SELECT table_schema, table_name, table_type
                FROM information_schema.tables
                WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
                  AND (table_name ILIKE ANY(%s) OR table_schema ILIKE ANY(%s))
                LIMIT 25;
            """
            t_res = execute_readonly_query(tables_sql, (patterns, patterns)) or []

            # 2. Targeted search for materialized views matching keywords
            mviews_sql = """
                SELECT schemaname as table_schema, matviewname as table_name, 'MATERIALIZED VIEW' as table_type
                FROM pg_matviews
                WHERE schemaname NOT IN ('information_schema', 'pg_catalog')
                  AND (matviewname ILIKE ANY(%s) OR schemaname ILIKE ANY(%s))
                LIMIT 15;
            """
            m_res = execute_readonly_query(mviews_sql, (patterns, patterns)) or []

            candidate_tables = [dict(t) for t in t_res] + [dict(m) for m in m_res]

            # 3. If no tables matched the name directly, probe column names for matching tables
            if not candidate_tables:
                col_probe_sql = """
                    SELECT DISTINCT table_schema, table_name
                    FROM information_schema.columns
                    WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
                      AND column_name ILIKE ANY(%s)
                    LIMIT 10;
                """
                col_probe_res = execute_readonly_query(col_probe_sql, (patterns,)) or []
                for cp in col_probe_res:
                    candidate_tables.append({
                        "table_schema": cp["table_schema"],
                        "table_name": cp["table_name"],
                        "table_type": "TABLE"
                    })
        else:
            # Fallback if no search query provided: inspect default public tables
            tables_sql = """
                SELECT table_schema, table_name, table_type
                FROM information_schema.tables
                WHERE table_schema = 'public'
                LIMIT 20;
            """
            candidate_tables = [dict(t) for t in (execute_readonly_query(tables_sql) or [])]

        if not candidate_tables:
            return {"status": "success", "matched_count": 0, "entities": []}

        # 4. Fetch columns ONLY for the matched candidate tables (scales to 10k+ tables)
        target_names = [t["table_name"] for t in candidate_tables]
        target_schemas = [t["table_schema"] for t in candidate_tables]

        cols_sql = """
            SELECT table_schema, table_name, column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = ANY(%s) AND table_schema = ANY(%s)
            ORDER BY table_schema, table_name, ordinal_position;
        """
        cols_data = execute_readonly_query(cols_sql, (target_names, target_schemas)) or []

        cols_by_entity = {}
        for c in cols_data:
            key = f"{c['table_schema']}.{c['table_name']}"
            if key not in cols_by_entity:
                cols_by_entity[key] = []
            cols_by_entity[key].append({
                "column_name": c["column_name"],
                "data_type": c["data_type"],
                "is_nullable": c["is_nullable"]
            })

        matched = []
        for ent in candidate_tables:
            t_schema = ent["table_schema"]
            t_name = ent["table_name"]
            t_type = ent.get("table_type", "TABLE")
            full_key = f"{t_schema}.{t_name}"
            t_cols = cols_by_entity.get(full_key, [])

            score = 1
            if q_tokens:
                for tok in q_tokens:
                    if tok in t_name.lower():
                        score += 3
                    elif any(tok in c["column_name"].lower() for c in t_cols):
                        score += 1

            matched.append({
                "qualified_name": full_key,
                "schema": t_schema,
                "table_name": t_name,
                "type": t_type,
                "match_relevance": score,
                "columns": t_cols
            })

        matched.sort(key=lambda x: x.get("match_relevance", 0), reverse=True)

        return {
            "status": "success",
            "matched_count": len(matched),
            "entities": matched[:15]
        }
    except Exception as e:
        return {"error": f"Failed to identify relational schema: {str(e)}"}

def tool_identify_mongo_collections(query: str = "") -> Dict[str, Any]:
    """
    Scalable, on-demand MongoDB collection resolution.
    Filters collection names using targeted keyword/stem matching and samples
    documents ONLY for matched collections.
    """
    import re
    try:
        stopwords = {
            "and", "or", "the", "a", "an", "in", "on", "at", "to", "for", "of", "with", "from",
            "by", "as", "is", "it", "this", "that", "which", "who", "what", "how", "return",
            "select", "show", "get", "find", "list", "all", "where", "having", "not", "null"
        }
        raw_tokens = [t.lower() for t in re.findall(r'[a-zA-Z0-9_]+', query)] if query else []
        q_tokens = [t for t in raw_tokens if len(t) >= 3 and t not in stopwords]

        db = get_sync_mongo_db()
        all_colls = [c for c in db.list_collection_names() if not c.startswith("system.")]

        candidate_colls = []
        for cname in all_colls:
            score = 0
            if q_tokens:
                for tok in q_tokens:
                    tok_stem = tok.rstrip("s")
                    if tok in cname.lower() or tok_stem in cname.lower():
                        score += 3
            else:
                score = 1

            if score > 0 or not q_tokens:
                candidate_colls.append((cname, score))

        candidate_colls.sort(key=lambda x: x[1], reverse=True)
        top_colls = candidate_colls[:10] if q_tokens else candidate_colls[:5]

        matched = []
        for cname, score in top_colls:
            # Sample document only for candidate collections
            sample_doc = db[cname].find_one()
            fields = {}
            if sample_doc:
                for k, v in sample_doc.items():
                    if k != "_id":
                        fields[k] = type(v).__name__
            count = db[cname].estimated_document_count()
            matched.append({
                "collection_name": cname,
                "database": db.name,
                "estimated_documents": count,
                "match_relevance": score,
                "fields": fields
            })

        return {
            "status": "success",
            "matched_count": len(matched),
            "collections": matched
        }
    except Exception as e:
        return {"error": f"Failed to identify mongo collections: {str(e)}"}
