import json
from typing import Dict, Any, List, Optional
from app.db.postgres import execute_readonly_query, execute_business_struct_write
from app.services.embeddings import get_text_embedding

def tool_add_or_update_business_context(
    struct_name: str,
    struct_type: str,
    target_entities: List[str],
    description: str,
    sql_expression: Optional[str] = None,
    metadata_json: Optional[str] = "{}"
) -> Dict[str, Any]:
    """
    Adds or updates business context rules, KPIs, or cross-DB join recipes in 'business_structs'.
    Uses restricted credentials (ginny_app_user) with write access and automatically computes dense pgvector embeddings.
    """
    try:
        # Generate dense 384-dimensional vector embedding for the text
        embedding_text = f"{struct_name} {struct_type} {description} {sql_expression or ''}"
        embedding = get_text_embedding(embedding_text)
        
        parsed_meta = json.loads(metadata_json) if metadata_json else {}
        
        sql = """
            INSERT INTO business_structs (
                struct_name, struct_type, target_entities, description, sql_expression, metadata, embedding, updated_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (struct_name) DO UPDATE SET
                struct_type = EXCLUDED.struct_type,
                target_entities = EXCLUDED.target_entities,
                description = EXCLUDED.description,
                sql_expression = EXCLUDED.sql_expression,
                metadata = EXCLUDED.metadata,
                embedding = EXCLUDED.embedding,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id, struct_name, struct_type, target_entities, updated_at;
        """
        
        res = execute_business_struct_write(sql, (
            struct_name,
            struct_type,
            target_entities,
            description,
            sql_expression,
            json.dumps(parsed_meta),
            embedding
        ))
        
        record = dict(res[0]) if res else {}
        return {
            "success": True,
            "message": f"Business context '{struct_name}' saved with 384-dim pgvector embedding.",
            "record": record
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to save business context: {str(e)}"
        }

def tool_delete_business_context(struct_name: str) -> Dict[str, Any]:
    """
    Deletes a business context entry by its struct_name from 'business_structs'.
    """
    try:
        sql = "DELETE FROM business_structs WHERE struct_name = %s RETURNING id, struct_name;"
        res = execute_business_struct_write(sql, (struct_name,))
        if res:
            return {"success": True, "message": f"Business context '{struct_name}' deleted."}
        return {"success": False, "message": f"Business context '{struct_name}' not found."}
    except Exception as e:
        return {"success": False, "error": str(e)}

def tool_retrieve_query_context(user_query: str, top_k: int = 4) -> Dict[str, Any]:
    """
    Converts a natural language query into an embedding vector, performs a cosine-distance
    similarity search (<=>) on 'business_structs' using pgvector, and returns relevant business rules,
    domain definitions, and join formulas to enrich SQL/Mongo queries.
    """
    try:
        query_vec = get_text_embedding(user_query)
        vec_literal = "[" + ",".join(str(x) for x in query_vec) + "]"
        
        # Uses pgvector cosine operator <=>
        sql = f"""
            SELECT 
                id, 
                struct_name, 
                struct_type, 
                target_entities, 
                description, 
                sql_expression, 
                metadata,
                (embedding <=> '{vec_literal}') AS distance
            FROM business_structs
            ORDER BY distance ASC
            LIMIT %s;
        """
        
        rows = execute_readonly_query(sql, (top_k,))
        results = []
        for r in (rows or []):
            item = dict(r)
            item["similarity_score"] = round(1.0 - float(item.get("distance", 1.0)), 4)
            results.append(item)
            
        return {
            "user_query": user_query,
            "top_k": top_k,
            "matched_contexts": results,
            "guidance": (
                "Review the matched business rules, metric formulas, and join recipes above before "
                "writing raw PostgreSQL or MongoDB queries to ensure domain accuracy and appropriate schema joins."
            )
        }
    except Exception as e:
        return {
            "error": f"RAG context retrieval failed: {str(e)}",
            "user_query": user_query
        }
