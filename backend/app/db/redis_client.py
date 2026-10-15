import json
import uuid
import time
import redis
from datetime import datetime, date
from decimal import Decimal
from app.config import settings

# Custom JSON encoder for timestamps, Decimals, vectors
class GinnyJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        if isinstance(obj, Decimal):
            return float(obj)
        if hasattr(obj, '__str__'):
            return str(obj)
        return super().default(obj)

_redis_pool = None

def get_redis_client() -> redis.Redis:
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = redis.ConnectionPool.from_url(settings.REDIS_URL, decode_responses=True)
    return redis.Redis(connection_pool=_redis_pool)

def store_query_result(data: list, metadata: dict = None, ttl_seconds: int = 600) -> str:
    """
    Stores full query result directly into Redis with a 10-minute TTL (600s).
    Raises an error if Redis is unreachable.
    Returns unique result_id.
    """
    result_id = str(uuid.uuid4())[:8]
    key = f"ginny:res:{result_id}"
    
    total_count = len(data) if isinstance(data, list) else 0
    payload = {
        "result_id": result_id,
        "created_at": datetime.utcnow().isoformat(),
        "total_records": total_count,
        "metadata": metadata or {},
        "records": data,
        "expires_at": time.time() + ttl_seconds
    }
    
    r = get_redis_client()
    serialized = json.dumps(payload, cls=GinnyJSONEncoder)
    r.setex(key, ttl_seconds, serialized)
    return result_id

def get_query_result(result_id: str) -> dict:
    """Retrieves full query result directly from Redis."""
    r = get_redis_client()
    key = f"ginny:res:{result_id}"
    val = r.get(key)
    if val:
        return json.loads(val)
    return None

def delete_query_result(result_id: str) -> bool:
    """Clears out the query result from Redis if user requests correction."""
    r = get_redis_client()
    key = f"ginny:res:{result_id}"
    return bool(r.delete(key))

def get_preview_data(result_id: str, limit: int = 5) -> dict:
    """Returns top 5 preview records along with summary metadata and TTL remaining directly from Redis."""
    data = get_query_result(result_id)
    if not data:
        return None

    records = data.get("records", [])
    preview_rows = records[:limit]
    
    r = get_redis_client()
    key = f"ginny:res:{result_id}"
    ttl = r.ttl(key)
    ttl_remaining = max(0, ttl) if ttl > 0 else 0
            
    return {
        "result_id": result_id,
        "total_records": data.get("total_records", len(records)),
        "ttl_seconds_remaining": ttl_remaining,
        "preview_records": preview_rows,
        "metadata": data.get("metadata", {}),
        "status": "awaiting_confirmation"
    }
