from typing import List, Dict, Any

def perform_cross_db_join(
    pg_rows: List[Dict[str, Any]],
    mongo_docs: List[Dict[str, Any]],
    pg_key: str,
    mongo_key: str,
    join_type: str = "INNER",
    mongo_prefix: str = "mongo"
) -> List[Dict[str, Any]]:
    """
    Performs in-memory hash join between PostgreSQL rows and MongoDB documents.
    Supported join_type: 'INNER', 'LEFT', 'FULL'.
    """
    join_type = join_type.upper().strip()
    
    # Build hash map of MongoDB documents by join key (string normalized)
    mongo_map = {}
    for doc in mongo_docs:
        clean_doc = dict(doc)
        if "_id" in clean_doc:
            clean_doc["_id"] = str(clean_doc["_id"])
        
        k = clean_doc.get(mongo_key)
        if k is not None:
            norm_k = str(k).strip()
            if norm_k not in mongo_map:
                mongo_map[norm_k] = []
            mongo_map[norm_k].append(clean_doc)
            
    joined_results = []
    matched_mongo_keys = set()
    
    for pg_row in pg_rows:
        # Check pg_key directly, or with pg_ prefix if already prefixed
        raw_k = pg_row.get(pg_key)
        if raw_k is None and not pg_key.startswith("pg_"):
            raw_k = pg_row.get(f"pg_{pg_key}")
        if raw_k is None:
            # Fallback search if key has a different prefix
            clean_k = pg_key.replace("pg_", "")
            for k, v in pg_row.items():
                if k == clean_k or k.endswith(f"_{clean_k}"):
                    raw_k = v
                    break
            
        norm_k = str(raw_k).strip() if raw_k is not None else None
        
        # Check if incoming rows are already prefixed from a previous join
        is_prefixed = any(k.startswith("pg_") for k in pg_row.keys())
        
        matches = mongo_map.get(norm_k, [])
        if matches:
            matched_mongo_keys.add(norm_k)
            for m_doc in matches:
                combined = {}
                for pk, pv in pg_row.items():
                    key_name = pk if is_prefixed else (pk if (pk.startswith("pg_") or pk.startswith("mongo_")) else f"pg_{pk}")
                    combined[key_name] = pv
                for mk, mv in m_doc.items():
                    combined[f"{mongo_prefix}_{mk}"] = mv
                joined_results.append(combined)
        elif join_type in ("LEFT", "FULL"):
            combined = {}
            for pk, pv in pg_row.items():
                key_name = pk if is_prefixed else (pk if (pk.startswith("pg_") or pk.startswith("mongo_")) else f"pg_{pk}")
                combined[key_name] = pv
            joined_results.append(combined)
            
    if join_type == "FULL":
        for k, docs in mongo_map.items():
            if k not in matched_mongo_keys:
                for m_doc in docs:
                    combined = {}
                    for mk, mv in m_doc.items():
                        combined[f"{mongo_prefix}_{mk}"] = mv
                    joined_results.append(combined)
                    
    return joined_results
