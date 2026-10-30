from typing import List, Dict, Any, Optional
from app.db.memgraph_client import run_cypher, get_memgraph_driver


def get_live_topology() -> Dict[str, Any]:
    """Retrieves full live topology directly from Memgraph. Raises an error if Memgraph is offline."""
    nodes_res = run_cypher(
        "MATCH (n:Entity) RETURN n.name as name, n.system as system, n.type as type, "
        "n.primary_key as primary_key, n.description as description, n.fields as fields"
    )
    edges_res = run_cypher(
        "MATCH (a:Entity)-[r]->(b:Entity) RETURN a.name as source, b.name as target, "
        "type(r) as type, r.from_field as from_field, r.to_field as to_field, "
        "r.condition as condition, r.description as desc"
    )

    if not nodes_res:
        raise RuntimeError(
            "Memgraph returned no topology nodes. Please ensure the Memgraph container is running on port 7687 "
            "and has been seeded via 'scripts/seed_all.py' or 'scripts/init_memgraph.cypher'."
        )

    return {"nodes": nodes_res, "edges": edges_res or []}


def _parse_cypher_path(p: Any, algorithm_label: str) -> Optional[Dict[str, Any]]:
    """
    Converts a native Memgraph Cypher Path object `(a)-[r]-(b)` into our structured path dictionary.
    Because `(a)-[r]-(b)` is matched undirectionally in Cypher, each relationship `r` retains its
    endpoint nodes `r.nodes[0]` and `r.nodes[1]`, making the join condition symmetric without manual flipping.
    """
    path_nodes = [n["name"] for n in p.nodes]
    # Enforce simple paths (no repeated nodes/cycles)
    if len(path_nodes) != len(set(path_nodes)) or len(path_nodes) < 2:
        return None

    path_edges: List[Dict[str, Any]] = []
    join_steps: List[str] = []

    for i, r in enumerate(p.relationships):
        stored_src = r.nodes[0]["name"]
        stored_tgt = r.nodes[1]["name"]
        ff = r.get("from_field")
        tf = r.get("to_field")
        cond = r.get("condition")
        edge_type = r.type

        # Align from_field / to_field with traversal walk order (path_nodes[i] -> path_nodes[i+1])
        walk_src = path_nodes[i]
        walk_tgt = path_nodes[i + 1]
        if walk_src == stored_src:
            walk_ff, walk_tf = ff, tf
        else:
            walk_ff, walk_tf = tf, ff

        edge_info = {
            "neighbor": walk_tgt,
            "type": edge_type,
            "from_field": walk_ff,
            "to_field": walk_tf,
            "condition": cond,
            "desc": r.get("description")
        }
        path_edges.append(edge_info)

        cond_str = f" [Condition: {cond}]" if cond else ""
        join_steps.append(
            f"{i + 1}. Link {walk_src} <-> {walk_tgt} via ({stored_src}.{ff} = {stored_tgt}.{tf}) [Type: {edge_type}]{cond_str}"
        )

    return {
        "algorithm": algorithm_label,
        "hops": len(path_edges),
        "is_direct": len(path_edges) == 1,
        "intermediate_entities": path_nodes[1:-1],
        "path_sequence": path_nodes,
        "edges": path_edges,
        "join_summary": " | ".join(join_steps)
    }


def bfs_paths(
    start_entity: str,
    target_entity: str,
    max_depth: Optional[int] = None,
    return_map: bool = False
) -> Any:
    """
    Uses Memgraph's native undirected Cypher `*BFS` engine:
      MATCH p = (a:Entity {name: $start})-[*BFS]-(b:Entity {name: $end})
    to find the shortest join path between two entities.
    """
    if not start_entity or not target_entity or start_entity == target_entity:
        return {} if return_map else []

    hop_bound = f"..{max_depth}" if max_depth else ""
    cypher = f"""
        MATCH p = (a:Entity {{name: $start}})-[*BFS{hop_bound}]-(b:Entity {{name: $end}})
        RETURN p
        LIMIT 5
    """
    found_map: Dict[tuple, Dict[str, Any]] = {}
    driver = get_memgraph_driver()
    with driver.session() as session:
        res = session.run(cypher, {"start": start_entity, "end": target_entity})
        for record in res:
            parsed = _parse_cypher_path(record["p"], "BFS")
            if parsed:
                seq_key = tuple(parsed["path_sequence"])
                found_map[seq_key] = parsed

    return found_map if return_map else list(found_map.values())


def dfs_paths(
    start_entity: str,
    target_entity: str,
    max_depth: Optional[int] = None,
    return_map: bool = False
) -> Any:
    """
    Uses Memgraph's native undirected variable-length Cypher traversal:
      MATCH p = (a:Entity {name: $start})-[*1..6]-(b:Entity {name: $end})
    to discover ALL candidate semantic join pathways (since shortest path != right semantic path).
    """
    if not start_entity or not target_entity or start_entity == target_entity:
        return {} if return_map else []

    upper_bound = max_depth if max_depth else 6
    cypher = f"""
        MATCH p = (a:Entity {{name: $start}})-[*1..{upper_bound}]-(b:Entity {{name: $end}})
        RETURN p
        LIMIT 20
    """
    found_map: Dict[tuple, Dict[str, Any]] = {}
    driver = get_memgraph_driver()
    with driver.session() as session:
        res = session.run(cypher, {"start": start_entity, "end": target_entity})
        for record in res:
            parsed = _parse_cypher_path(record["p"], "DFS")
            if parsed:
                seq_key = tuple(parsed["path_sequence"])
                found_map[seq_key] = parsed

    return found_map if return_map else list(found_map.values())
