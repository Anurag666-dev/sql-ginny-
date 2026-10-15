from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from app.mcp.tools_metadata import tool_get_database_metadata
from app.mcp.tools_business_rag import (
    tool_add_or_update_business_context,
    tool_delete_business_context,
    tool_retrieve_query_context
)
from app.db.postgres import execute_readonly_query

router = APIRouter(prefix="/api", tags=["Database Metadata & Business Structs"])

class BusinessStructRequest(BaseModel):
    struct_name: str
    struct_type: str
    target_entities: List[str]
    description: str
    sql_expression: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = {}

class RAGSearchRequest(BaseModel):
    query: str
    top_k: int = 4

@router.get("/metadata")
async def get_metadata(target: str = Query("ALL", enum=["ALL", "POSTGRESQL", "MONGODB"])):
    return tool_get_database_metadata(target)

@router.get("/business-structs")
async def list_business_structs():
    try:
        sql = """
            SELECT id, struct_name, struct_type, target_entities, description, sql_expression, metadata, created_at, updated_at
            FROM business_structs
            ORDER BY updated_at DESC;
        """
        rows = execute_readonly_query(sql)
        return {"records": [dict(r) for r in (rows or [])]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/business-structs")
async def create_or_update_struct(req: BusinessStructRequest):
    import json
    res = tool_add_or_update_business_context(
        struct_name=req.struct_name,
        struct_type=req.struct_type,
        target_entities=req.target_entities,
        description=req.description,
        sql_expression=req.sql_expression,
        metadata_json=json.dumps(req.metadata)
    )
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    return res

@router.delete("/business-structs/{struct_name}")
async def delete_struct(struct_name: str):
    res = tool_delete_business_context(struct_name)
    if not res.get("success"):
        raise HTTPException(status_code=404, detail=res.get("error", "Not found"))
    return res

@router.post("/business-structs/search-rag")
async def search_rag(req: RAGSearchRequest):
    return tool_retrieve_query_context(req.query, req.top_k)
