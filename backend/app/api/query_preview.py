import io
import csv
import json
from fastapi import APIRouter, HTTPException, Response, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from app.db.redis_client import get_preview_data, get_query_result, delete_query_result, store_query_result

router = APIRouter(prefix="/api/preview", tags=["Query Confirmation & Preview"])

class StoreTestRequest(BaseModel):
    records: List[Dict[str, Any]]
    metadata: Optional[Dict[str, Any]] = None

@router.post("/test-store")
async def test_store_result(req: StoreTestRequest):
    res_id = store_query_result(req.records, req.metadata, ttl_seconds=600)
    return {"result_id": res_id, "total_records": len(req.records), "ttl_seconds": 600}

class ConfirmationActionRequest(BaseModel):
    result_id: str
    action: str # "confirm" or "correction"
    feedback: Optional[str] = None

@router.get("/{result_id}")
async def get_result_preview(result_id: str):
    preview = get_preview_data(result_id)
    if not preview:
        raise HTTPException(status_code=404, detail="Query result not found or expired after 10-minute TTL.")
    return preview

@router.post("/action")
async def handle_user_action(req: ConfirmationActionRequest):
    result_id = req.result_id
    action = req.action.lower().strip()
    
    if action == "correction":
        # Clear out from Redis immediately
        deleted = delete_query_result(result_id)
        return {
            "result_id": result_id,
            "action": "correction",
            "status": "cleared",
            "message": "Query result cleared from cache. Ready for revised query execution.",
            "cache_deleted": deleted
        }
    elif action == "confirm":
        data = get_query_result(result_id)
        if not data:
            raise HTTPException(status_code=404, detail="Query result expired or not found.")
            
        return {
            "result_id": result_id,
            "action": "confirm",
            "status": "confirmed",
            "total_records": data.get("total_records", 0),
            "download_json_url": f"/api/preview/{result_id}/download?format=json",
            "download_csv_url": f"/api/preview/{result_id}/download?format=csv",
            "message": "Results confirmed! Full dataset is ready for download."
        }
    else:
        raise HTTPException(status_code=400, detail="Action must be either 'confirm' or 'correction'.")

@router.get("/{result_id}/download")
async def download_result(result_id: str, format: str = Query("json", enum=["json", "csv"])):
    data = get_query_result(result_id)
    if not data:
        raise HTTPException(status_code=404, detail="Query result expired or not found.")
        
    records = data.get("records", [])
    
    if format == "csv":
        if not records:
            return Response(content="No records found", media_type="text/csv")
            
        output = io.StringIO()
        fieldnames = list(records[0].keys())
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        for r in records:
            writer.writerow(r)
            
        csv_data = output.getvalue()
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=sql_ginny_{result_id}.csv"}
        )
    else:
        # JSON format
        json_data = json.dumps(data, indent=2)
        return Response(
            content=json_data,
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename=sql_ginny_{result_id}.json"}
        )
