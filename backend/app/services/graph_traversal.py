from typing import List, Dict, Any, Optional
from collections import deque
from app.db.memgraph_client import run_cypher

def get_live_topology() -> Dict[str, Any]:
    """Retrieves full live topology directly from Memgraph. Raises an error if Memgraph is offline."""
    nodes_res = run_cypher("MATCH (n:Entity) RETURN n.name as name, n.system as system, n.type as type, n.primary_key as primary_key, n.description as description, n.fields as fields")
    edges_res = run_cypher("MATCH (a:Entity)-[r]->(b:Entity) RETURN a.name as source, b.name as target, type(r) as type, r.from_field as from_field, r.to_field as to_field, r.condition as condition, r.description as desc")
    
    if not nodes_res:
        raise RuntimeError("Memgraph returned no topology nodes. Please ensure the Memgraph container is running on port 7687 and has been seeded via 'scripts/seed_all.py' or 'scripts/init_memgraph.cypher'.")
        
    return {"nodes": nodes_res, "edges": edges_res or []}

def build_adjacency(topology: Dict[str, Any], undirected: bool = True) -> Dict[str, List[Dict[str, Any]]]:
    adj = {}
    for node in topology["nodes"]:
        adj[node["name"]] = []
        
    for edge in topology["edges"]:
        src = edge["source"]
        tgt = edge["target"]
        if src not in adj:
            adj[src] = []
        if tgt not in adj:
            adj[tgt] = []
            
        adj[src].append({
            "neighbor": tgt,
            "direction": "outbound",
            "type": edge["type"],
            "from_field": edge.get("from_field"),
            "to_field": edge.get("to_field"),
            "condition": edge.get("condition"),
            "desc": edge.get("desc")
        })
        
        if undirected:
            adj[tgt].append({
                "neighbor": src,
                "direction": "inbound",
                "type": edge["type"],
                "from_field": edge.get("to_field"),
                "to_field": edge.get("from_field"),
                "condition": edge.get("condition"),
                "desc": edge.get("desc")
            })
    return adj

def bfs_paths(start_entity: str, target_entity: str, max_depth: int = 5) -> List[Dict[str, Any]]:
    """
    Breadth-First Search (BFS) to find the shortest join paths between two database entities.
    """
    topology = get_live_topology()
    adj = build_adjacency(topology, undirected=True)
    
    if start_entity not in adj or target_entity not in adj:
        return []
        
    queue = deque([ (start_entity, [], []) ]) # (current_node, visited_nodes, edges_path)
    found_paths = []
    
    while queue:
        curr, path_nodes, path_edges = queue.popleft()
        current_path_nodes = path_nodes + [curr]
        
        if curr == target_entity and len(path_edges) > 0:
            found_paths.append({
                "algorithm": "BFS",
                "hops": len(path_edges),
                "is_direct": len(path_edges) == 1,
                "intermediate_entities": current_path_nodes[1:-1],
                "path_sequence": current_path_nodes,
                "edges": path_edges,
                "join_summary": generate_join_instructions(current_path_nodes, path_edges)
            })
            if len(found_paths) >= 3:
                break
            continue
            
        if len(path_edges) >= max_depth:
            continue
            
        for edge_info in adj.get(curr, []):
            nxt = edge_info["neighbor"]
            if nxt not in current_path_nodes: # avoid cycles
                queue.append((nxt, current_path_nodes, path_edges + [edge_info]))
                
    return found_paths

def dfs_paths(start_entity: str, target_entity: str, max_depth: int = 5) -> List[Dict[str, Any]]:
    """
    Depth-First Search (DFS) to explore all multi-hop relational pathways between two database entities.
    """
    topology = get_live_topology()
    adj = build_adjacency(topology, undirected=True)
    
    if start_entity not in adj or target_entity not in adj:
        return []
        
    found_paths = []
    
    def dfs(curr: str, current_path_nodes: List[str], current_edges: List[Dict[str, Any]]):
        if len(current_edges) > max_depth or len(found_paths) >= 5:
            return
            
        if curr == target_entity and len(current_edges) > 0:
            found_paths.append({
                "algorithm": "DFS",
                "hops": len(current_edges),
                "is_direct": len(current_edges) == 1,
                "intermediate_entities": current_path_nodes[1:-1],
                "path_sequence": current_path_nodes,
                "edges": current_edges,
                "join_summary": generate_join_instructions(current_path_nodes, current_edges)
            })
            return
            
        for edge_info in adj.get(curr, []):
            nxt = edge_info["neighbor"]
            if nxt not in current_path_nodes:
                dfs(nxt, current_path_nodes + [nxt], current_edges + [edge_info])
                
    dfs(start_entity, [start_entity], [])
    return found_paths

def generate_join_instructions(nodes: List[str], edges: List[Dict[str, Any]]) -> str:
    """Produces human and AI-readable join execution instructions."""
    steps = []
    for i, edge in enumerate(edges):
        src = nodes[i]
        tgt = nodes[i+1]
        edge_type = edge["type"]
        ff = edge["from_field"]
        tf = edge["to_field"]
        cond = f" [Condition: {edge['condition']}]" if edge.get("condition") else ""
        steps.append(f"{i+1}. Link {src} -> {tgt} via ({src}.{ff} = {tgt}.{tf}) [Type: {edge_type}]{cond}")
    return " | ".join(steps)
