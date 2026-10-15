import json
from typing import Dict, Any, Optional, List
from app.db.postgres import execute_readonly_query
from app.db.mongo import get_sync_mongo_db
from app.services.cross_joiner import perform_cross_db_join
from app.db.redis_client import store_query_result

def tool_cross_db_query_and_join(
    postgres_query: str,
    mongo_collection: str,
    mongo_filter_json: str = "{}",
    pg_join_key: str = "customer_code",
    mongo_join_key: str = "customer_code",
    join_type: str = "INNER",
    mongo_limit: int = 500,
    secondary_joins: Optional[List[Dict[str, Any]]] = None,
    exclude_columns: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Executes a PostgreSQL query and a MongoDB query in parallel/sequence,
    joins the datasets on specified relational keys (e.g. customer_code, sku, or order_number),
    optionally performs secondary joins on additional MongoDB collections,
    prunes excluded columns (such as customer_code for confidentiality),
    stores full merged records in Redis with a 10-minute TTL, and returns the top 5 records.
    """
    try:
        # 1. Fetch PostgreSQL records
        pg_rows = execute_readonly_query(postgres_query)
        pg_records = [dict(r) for r in pg_rows] if pg_rows else []
        
        # 2. Fetch Primary MongoDB documents
        db = get_sync_mongo_db()
        coll = db[mongo_collection]
        filter_dict = json.loads(mongo_filter_json) if mongo_filter_json else {}
        cursor = coll.find(filter_dict).limit(mongo_limit)
        mongo_records = []
        for doc in cursor:
            if "_id" in doc:
                doc["_id"] = str(doc["_id"])
            mongo_records.append(doc)
            
        # 3. Perform Primary Hash Join
        joined = perform_cross_db_join(
            pg_rows=pg_records,
            mongo_docs=mongo_records,
            pg_key=pg_join_key,
            mongo_key=mongo_join_key,
            join_type=join_type,
            mongo_prefix=mongo_collection
        )

        # 4. Perform Secondary Joins if present
        if secondary_joins:
            all_db_colls = db.list_collection_names()
            for s_join in secondary_joins:
                s_coll_name = s_join.get("mongo_collection")
                if not s_coll_name or s_coll_name not in all_db_colls:
                    continue
                s_cursor = db[s_coll_name].find(s_join.get("filter") or {}).limit(mongo_limit)
                s_records = []
                for doc in s_cursor:
                    if "_id" in doc:
                        doc["_id"] = str(doc["_id"])
                    s_records.append(doc)
                joined = perform_cross_db_join(
                    pg_rows=joined,
                    mongo_docs=s_records,
                    pg_key=s_join.get("pg_join_key", "sku"),
                    mongo_key=s_join.get("mongo_join_key", "sku"),
                    join_type=s_join.get("join_type", "INNER"),
                    mongo_prefix=s_coll_name
                )
        
        # 5. Prune Excluded Columns (e.g. Customer confidentiality)
        if exclude_columns:
            clean_exclude = set()
            for ec in exclude_columns:
                ec_l = ec.lower()
                clean_exclude.add(ec_l)
                clean_exclude.add(f"pg_{ec_l}")
                clean_exclude.add(f"mongo_{ec_l}")
                clean_exclude.add(f"{mongo_collection.lower()}_{ec_l}")
                if secondary_joins:
                    for s in secondary_joins:
                        sc_name = (s.get("mongo_collection") or "").lower()
                        clean_exclude.add(f"{sc_name}_{ec_l}")

            has_cust_confidentiality = any("customer" in ec.lower() for ec in exclude_columns)

            for r in joined:
                for k in list(r.keys()):
                    k_l = k.lower()
                    if (
                        k_l in clean_exclude
                        or any(k_l.endswith(f"_{ec.lower()}") or k_l == ec.lower() or f"_{ec.lower()}" in k_l for ec in exclude_columns)
                        or (has_cust_confidentiality and ("customer_code" in k_l or "customer_id" in k_l or k_l in ("id", "pg_id")))
                    ):
                        del r[k]

        total_count = len(joined)
        
        # 6. Store in Redis with 10-min TTL
        result_id = store_query_result(
            data=joined,
            metadata={
                "source": "Cross-DB Join (Postgres + Mongo)",
                "pg_query": postgres_query,
                "mongo_collection": mongo_collection,
                "join_keys": f"pg.{pg_join_key} == mongo.{mongo_join_key}",
                "join_type": join_type,
                "secondary_collections": [s.get("mongo_collection") for s in (secondary_joins or [])]
            },
            ttl_seconds=600
        )
        
        preview_top_5 = joined[:5]
        columns = list(preview_top_5[0].keys()) if preview_top_5 else []
        
        return {
            "status": "awaiting_confirmation",
            "result_id": result_id,
            "join_type": join_type,
            "pg_records_count": len(pg_records),
            "mongo_records_count": len(mongo_records),
            "total_joined_records": total_count,
            "columns": columns,
            "preview_top_5": preview_top_5,
            "ttl_seconds": 600,
            "user_prompt": (
                f"Successfully completed Cross-DB join between PostgreSQL and MongoDB '{mongo_collection}'"
                f"{f' + {len(secondary_joins)} additional collection(s)' if secondary_joins else ''}. "
                f"Generated {total_count} matching rows. Displaying top {len(preview_top_5)} entries. "
                f"Result ID: '{result_id}'. Please confirm if this matches expectations for full download, "
                f"or indicate corrections."
            )
        }
    except Exception as e:
        return {
            "error": f"Cross-DB join failed: {str(e)}"
        }
