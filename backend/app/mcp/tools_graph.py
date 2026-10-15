from typing import Dict, Any, List
from app.services.graph_traversal import bfs_paths, dfs_paths, get_live_topology

def generate_ready_sql_and_recipe(path: Dict[str, Any]) -> Dict[str, Any]:
    """Generates ready-to-use SQL JOIN clause and Cross-DB instructions for the AI query maker."""
    nodes = path.get("path_sequence", [])
    edges = path.get("edges", [])
    if not nodes or not edges:
        return {}

    sql_parts = [f"FROM {nodes[0]}"]
    cross_db_steps = []
    
    for i, edge in enumerate(edges):
        src = nodes[i]
        tgt = nodes[i+1]
        edge_type = edge["type"]
        ff = edge.get("from_field", "id")
        tf = edge.get("to_field", "id")
        cond = edge.get("condition")

        # Check if source or target is a Mongo collection
        is_mongo = tgt in ["customer_profiles", "product_reviews", "customer_activity_logs", "support_tickets"]
        
        if is_mongo:
            cross_db_steps.append(
                f"Cross-DB Step: Fetch from MongoDB collection '{tgt}' matching on {tgt}.{tf} = {src}.{ff}"
                + (f" with condition: {cond}" if cond else "")
            )
        else:
            join_clause = "JOIN" if edge_type == "MUST_JOIN" else "LEFT JOIN"
            on_clause = f"{src}.{ff} = {tgt}.{tf}"
            if cond:
                on_clause += f" AND {cond}"
            sql_parts.append(f"{join_clause} {tgt} ON {on_clause}")

    return {
        "sql_join_template": " ".join(sql_parts),
        "cross_db_steps": cross_db_steps
    }

def tool_bfs_shortest_join_path(start_entity: str, target_entity: str, max_hops: int = 5) -> Dict[str, Any]:
    """
    [CRITICAL AI TOOL - BFS PATHFINDER]
    Breadth-First Search over the Memgraph database topology to find the shortest, most efficient join path.
    Tells the AI:
    - Direct link exists or not
    - Exact intermediate bridge tables required (e.g. customers -> orders -> order_items -> products)
    - 3 Edge types: MUST_JOIN (mandatory FKs), CONDITIONAL_JOIN (criteria rules), OPTIONAL_JOIN (outer/enrichments)
    - Ready-to-use SQL JOIN template and cross-DB execution plan.
    """
    start_clean = start_entity.strip().lower()
    target_clean = target_entity.strip().lower()

    paths = bfs_paths(start_clean, target_clean, max_depth=max_hops)

    if not paths:
        return {
            "start_entity": start_entity,
            "target_entity": target_entity,
            "algorithm": "BFS",
            "found": False,
            "guidance_for_ai": f"No join path found between '{start_entity}' and '{target_entity}' within {max_hops} hops in the database graph."
        }

    # Enrich each path with ready-to-use templates
    for p in paths:
        templates = generate_ready_sql_and_recipe(p)
        p["ready_sql_template"] = templates.get("sql_join_template")
        p["cross_db_instructions"] = templates.get("cross_db_steps")

    return {
        "start_entity": start_entity,
        "target_entity": target_entity,
        "algorithm": "BFS",
        "shortest_path_hops": paths[0]["hops"],
        "is_direct_join": paths[0]["is_direct"],
        "intermediate_tables_needed": paths[0]["intermediate_entities"],
        "primary_recommended_path": paths[0],
        "all_candidate_paths": paths,
        "guidance_for_ai": (
            f"Use the 'ready_sql_template' or intermediate bridge tables to construct your final query. "
            f"Note: Pay attention to MUST_JOIN (mandatory) vs CONDITIONAL_JOIN (where criteria must be included) "
            f"vs OPTIONAL_JOIN (use LEFT JOIN or cross-db in-memory joiner)."
        )
    }

def tool_dfs_all_join_paths(start_entity: str, target_entity: str, max_hops: int = 5) -> Dict[str, Any]:
    """
    [CRITICAL AI TOOL - DFS EXPLORER]
    Depth-First Search over the Memgraph topology to explore all alternative, multi-hop, or deep relational
    routes between two database entities (Postgres tables or Mongo collections).
    """
    start_clean = start_entity.strip().lower()
    target_clean = target_entity.strip().lower()

    paths = dfs_paths(start_clean, target_clean, max_depth=max_hops)

    if not paths:
        return {
            "start_entity": start_entity,
            "target_entity": target_entity,
            "algorithm": "DFS",
            "found": False,
            "guidance_for_ai": f"No relational paths discovered between '{start_entity}' and '{target_entity}'."
        }

    for p in paths:
        templates = generate_ready_sql_and_recipe(p)
        p["ready_sql_template"] = templates.get("sql_join_template")
        p["cross_db_instructions"] = templates.get("cross_db_steps")

    return {
        "start_entity": start_entity,
        "target_entity": target_entity,
        "algorithm": "DFS",
        "total_paths_found": len(paths),
        "paths": paths,
        "guidance_for_ai": (
            f"Explored {len(paths)} distinct relational pathways. Choose the path that matches your desired "
            f"business logic (e.g. via direct transactions vs via support ticketing or customer review logs)."
        )
    }

def tool_get_entity_relationships(entity_name: str) -> Dict[str, Any]:
    """
    Returns all immediate 1-hop inbound and outbound relationships for a given table or MongoDB collection,
    including MUST_JOIN, CONDITIONAL_JOIN, and OPTIONAL_JOIN edge rules.
    """
    topology = get_live_topology()
    clean_name = entity_name.strip().lower()
    
    inbound = []
    outbound = []
    
    for edge in topology.get("edges", []):
        if edge["source"].lower() == clean_name:
            outbound.append(edge)
        elif edge["target"].lower() == clean_name:
            inbound.append(edge)
            
    return {
        "entity": entity_name,
        "outbound_joins": outbound,
        "inbound_joins": inbound,
        "total_connections": len(outbound) + len(inbound)
    }
