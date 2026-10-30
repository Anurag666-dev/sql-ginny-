from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from app.services.graph_traversal import get_live_topology, bfs_paths, dfs_paths

router = APIRouter(prefix="/api/graph", tags=["Database Graph Topology & Visualizer"])

class TraverseRequest(BaseModel):
    start_entity: str
    target_entity: str
    algorithm: str = "BFS" # "BFS" or "DFS"
    max_hops: Optional[int] = None

@router.get("/topology")
async def get_graph_topology():
    """
    Returns the complete knowledge graph topology directly from Memgraph for the /visualize-db frontend page:
    - Nodes: PostgreSQL tables, views, materialized views & MongoDB collections.
    - Edges: MUST_JOIN (required), CONDITIONAL_JOIN (criteria-based), OPTIONAL_JOIN (enrichments).
    """
    try:
        return get_live_topology()
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Memgraph graph database is offline or unseeded: {str(e)}"
        )

@router.post("/traverse")
async def traverse_graph(req: TraverseRequest):
    """
    Finds direct and indirect join paths between two database entities using live Memgraph BFS or DFS.
    """
    start_clean = req.start_entity.strip().lower()
    target_clean = req.target_entity.strip().lower()
    algo = req.algorithm.upper().strip()
    
    try:
        if algo == "BFS":
            paths = bfs_paths(start_clean, target_clean, max_depth=req.max_hops)
        elif algo == "DFS":
            paths = dfs_paths(start_clean, target_clean, max_depth=req.max_hops)
        else:
            paths = bfs_paths(start_clean, target_clean, max_depth=req.max_hops)
            
        return {
            "start_entity": req.start_entity,
            "target_entity": req.target_entity,
            "algorithm": algo,
            "total_paths_found": len(paths),
            "paths": paths
        }
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Cannot traverse graph because Memgraph is offline: {str(e)}"
        )
