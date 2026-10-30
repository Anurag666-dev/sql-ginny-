from typing import List, Dict, Any


def _extract_row_key(row: Dict[str, Any], key_name: str) -> str | None:
    """Extracts and normalizes the join key from a PostgreSQL or MongoDB record."""
    val = row.get(key_name)
    if val is None and not key_name.startswith("pg_"):
        val = row.get(f"pg_{key_name}")
    if val is None:
        clean_k = key_name.replace("pg_", "")
        for k, v in row.items():
            if k == clean_k or k.endswith(f"_{clean_k}"):
                val = v
                break
    return str(val).strip() if val is not None else None


def _prefix_pg_row(pg_row: Dict[str, Any]) -> Dict[str, Any]:
    """Prefixes PostgreSQL fields with 'pg_' once, avoiding double-prefixing on chained secondary joins."""
    already_prefixed = any(k.startswith("pg_") for k in pg_row.keys())
    out = {}
    for pk, pv in pg_row.items():
        key_name = pk if (already_prefixed or pk.startswith("pg_") or pk.startswith("mongo_")) else f"pg_{pk}"
        out[key_name] = pv
    return out


def perform_cross_db_join(
    pg_rows: List[Dict[str, Any]],
    mongo_docs: List[Dict[str, Any]],
    pg_key: str,
    mongo_key: str,
    join_type: str = "LEFT",
    mongo_prefix: str = "mongo"
) -> List[Dict[str, Any]]:
    """
    Two-Map In-Memory Hash Join in O(N + M) time:
    1. Build `pg_map` from PostgreSQL rows in O(N) time.
    2. Build `mongo_map` from MongoDB documents in O(M) time.
    3. Merge the two maps by key (supporting INNER / MUST_JOIN and LEFT / OPTIONAL_JOIN).
       (Note: Any CONDITIONAL_JOIN filter is pushed down into the PostgreSQL WHERE clause
       or MongoDB `find(filter)` query before fetching rows into memory.)
    """
    join_type = join_type.upper().strip()

    # Step 1: Build PostgreSQL Hash Map -> O(N)
    pg_map: Dict[str, List[Dict[str, Any]]] = {}
    unkeyed_pg_rows: List[Dict[str, Any]] = []
    for row in pg_rows:
        norm_k = _extract_row_key(row, pg_key)
        if norm_k is not None:
            pg_map.setdefault(norm_k, []).append(row)
        else:
            unkeyed_pg_rows.append(row)

    # Step 2: Build MongoDB Hash Map -> O(M)
    mongo_map: Dict[str, List[Dict[str, Any]]] = {}
    for doc in mongo_docs:
        clean_doc = dict(doc)
        if "_id" in clean_doc:
            clean_doc["_id"] = str(clean_doc["_id"])
        norm_k = _extract_row_key(clean_doc, mongo_key)
        if norm_k is not None:
            mongo_map.setdefault(norm_k, []).append(clean_doc)

    # Step 3: Merge `pg_map` and `mongo_map` by join key
    joined_results: List[Dict[str, Any]] = []
    for norm_k, p_group in pg_map.items():
        m_group = mongo_map.get(norm_k, [])
        if m_group:
            for pg_row in p_group:
                base = _prefix_pg_row(pg_row)
                for m_doc in m_group:
                    combined = dict(base)
                    for mk, mv in m_doc.items():
                        combined[f"{mongo_prefix}_{mk}"] = mv
                    joined_results.append(combined)
        elif join_type in ("LEFT", "FULL", "OPTIONAL_JOIN"):
            for pg_row in p_group:
                joined_results.append(_prefix_pg_row(pg_row))

    if join_type in ("LEFT", "FULL", "OPTIONAL_JOIN"):
        for pg_row in unkeyed_pg_rows:
            joined_results.append(_prefix_pg_row(pg_row))

    return joined_results
