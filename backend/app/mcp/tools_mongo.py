import json
from typing import Dict, Any, Optional
from app.db.mongo import get_sync_mongo_db
from app.db.redis_client import store_query_result

def serialize_mongo_doc(doc: dict) -> dict:
    from datetime import datetime, date
    out = {}
    for k, v in doc.items():
        if isinstance(v, (datetime, date)):
            out[k] = v.isoformat()
        elif hasattr(v, '__str__') and type(v).__name__ == 'ObjectId':
            out[k] = str(v)
        elif isinstance(v, dict):
            out[k] = serialize_mongo_doc(v)
        else:
            out[k] = v
    return out

def tool_run_mongo_raw_query(
    collection_name: str,
    filter_json: str = "{}",
    projection_json: Optional[str] = None,
    limit: int = 100
) -> Dict[str, Any]:
    """
    Executes a raw search or aggregation query against any MongoDB collection.
    Results are cached in Redis with a 10-minute TTL and the top 5 documents are returned for preview.
    """
    db = get_sync_mongo_db()
    coll = db[collection_name]
    filter_dict = json.loads(filter_json) if filter_json else {}
    projection_dict = json.loads(projection_json) if projection_json else None
    
    cursor = coll.find(filter_dict, projection_dict).limit(limit)
    docs = [serialize_mongo_doc(d) for d in cursor]
            
    total_count = len(docs)
    
    # Store in Redis with 10-minute TTL
    result_id = store_query_result(
        data=docs,
        metadata={"source": "MongoDB", "collection": collection_name, "filter": filter_json},
        ttl_seconds=600
    )
    
    preview_top_5 = docs[:5]
    
    return {
        "status": "awaiting_confirmation",
        "result_id": result_id,
        "collection": collection_name,
        "total_records": total_count,
        "preview_top_5": preview_top_5,
        "ttl_seconds": 600,
        "user_prompt": (
            f"Retrieved {total_count} documents from MongoDB '{collection_name}'. "
            f"Displaying top {len(preview_top_5)} documents. Query result ID: '{result_id}'. "
            f"Please confirm to proceed with download or suggest corrections."
        )
    }
