from typing import Dict, Any, List
from app.db.postgres import execute_readonly_query
from app.db.redis_client import store_query_result, delete_query_result

def serialize_db_record(record: dict) -> dict:
    from datetime import datetime, date
    from decimal import Decimal
    out = {}
    for k, v in record.items():
        if isinstance(v, (datetime, date)):
            out[k] = v.isoformat()
        elif isinstance(v, Decimal):
            out[k] = float(v)
        else:
            out[k] = v
    return out

def tool_run_postgres_raw_query(query: str) -> Dict[str, Any]:
    """
    Executes a raw SQL query against PostgreSQL using restricted credentials (ginny_app_user).
    Stores results in Redis with a 10-minute TTL and returns top 5 rows for user confirmation.
    """
    cleaned_query = query.strip()
    if not cleaned_query.upper().startswith(("SELECT", "WITH", "EXPLAIN")):
        return {
            "error": "Security Restriction: Only SELECT queries are permitted on tables/views/materialized views."
        }
        
    rows = execute_readonly_query(cleaned_query)
    records = [serialize_db_record(dict(r)) for r in rows] if rows else []
    total_count = len(records)
    
    # Store in Redis / Cache with 10-minute (600s) TTL
    result_id = store_query_result(
        data=records,
        metadata={"source": "PostgreSQL", "query": cleaned_query},
        ttl_seconds=600
    )
    
    preview_top_5 = records[:5]
    columns = list(records[0].keys()) if records else []
    
    return {
        "status": "awaiting_confirmation",
        "result_id": result_id,
        "total_records": total_count,
        "columns": columns,
        "preview_top_5": preview_top_5,
        "ttl_seconds": 600,
        "user_prompt": (
            f"Retrieved {total_count} records. Displaying top {len(preview_top_5)} entries for verification. "
            f"Query result ID: '{result_id}'. Please confirm if this is correct to proceed with full download, "
            f"or state any correction needed."
        )
    }

def tool_invalidate_query_cache(result_id: str) -> Dict[str, Any]:
    """
    Clears out the cached query results from Redis when the user requests a correction.
    """
    deleted = delete_query_result(result_id)
    return {
        "result_id": result_id,
        "cleared": deleted,
        "message": f"Query result '{result_id}' has been removed from cache." if deleted else f"Query result '{result_id}' was not found or already expired."
    }
