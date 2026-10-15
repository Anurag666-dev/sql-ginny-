from typing import List, Optional, Dict, Any
from mcp.server.fastmcp import FastMCP

# Import all tool implementations
from app.mcp.tools_datetime import tool_get_current_datetime
from app.mcp.tools_postgres import tool_run_postgres_raw_query, tool_invalidate_query_cache
from app.mcp.tools_mongo import tool_run_mongo_raw_query
from app.mcp.tools_cross_db import tool_cross_db_query_and_join
from app.mcp.tools_metadata import (
    tool_get_database_metadata,
    tool_identify_relational_schema,
    tool_identify_mongo_collections
)
from app.mcp.tools_business_rag import (
    tool_add_or_update_business_context,
    tool_delete_business_context,
    tool_retrieve_query_context
)
from app.mcp.tools_graph import (
    tool_bfs_shortest_join_path,
    tool_dfs_all_join_paths,
    tool_get_entity_relationships,
    tool_bfs_shortest_join_path as tool_find_entity_paths
)

# Create FastMCP instance for SQL Ginny
mcp = FastMCP("sql_ginny")

# Tool 1: Date and Time
@mcp.tool(name="get_current_datetime", description="Returns current system date, time, timezone, and ISO timestamps.")
def get_current_datetime() -> dict:
    return tool_get_current_datetime()

# Tool 2: PostgreSQL Raw Query with 10-min Redis preview
@mcp.tool(
    name="run_postgres_raw_query",
    description="Runs a raw SQL query against PostgreSQL using restricted credentials. Results are saved in Redis with a 10-minute TTL and the top 5 preview records are returned for user confirmation before full download."
)
def run_postgres_raw_query(query: str) -> dict:
    return tool_run_postgres_raw_query(query)

# Tool 3: Invalidate / Clear Redis Query Cache on correction
@mcp.tool(
    name="invalidate_query_cache",
    description="Deletes cached query results from Redis when the user requests a correction or cancellation."
)
def invalidate_query_cache(result_id: str) -> dict:
    return tool_invalidate_query_cache(result_id)

# Tool 4: MongoDB Raw Query with 10-min Redis preview
@mcp.tool(
    name="run_mongo_raw_query",
    description="Executes a raw JSON filter/aggregation against any MongoDB collection. Stores results in Redis (10m TTL) and displays top 5 documents for confirmation."
)
def run_mongo_raw_query(
    collection_name: str,
    filter_json: str = "{}",
    projection_json: Optional[str] = None,
    limit: int = 100
) -> dict:
    return tool_run_mongo_raw_query(collection_name, filter_json, projection_json, limit)

# Tool 5: Cross-DB Query and Hash Join
@mcp.tool(
    name="cross_db_query_and_join",
    description="Queries PostgreSQL and MongoDB simultaneously, performs an in-memory hash join on designated keys (e.g. customer_code or sku), stores joined result in Redis with a 10-minute TTL, and returns top 5 preview rows."
)
def cross_db_query_and_join(
    postgres_query: str,
    mongo_collection: str,
    mongo_filter_json: str = "{}",
    pg_join_key: str = "customer_code",
    mongo_join_key: str = "customer_code",
    join_type: str = "INNER",
    mongo_limit: int = 500,
    secondary_joins: Optional[List[Dict[str, Any]]] = None,
    exclude_columns: Optional[List[str]] = None
) -> dict:
    return tool_cross_db_query_and_join(
        postgres_query=postgres_query,
        mongo_collection=mongo_collection,
        mongo_filter_json=mongo_filter_json,
        pg_join_key=pg_join_key,
        mongo_join_key=mongo_join_key,
        join_type=join_type,
        mongo_limit=mongo_limit,
        secondary_joins=secondary_joins,
        exclude_columns=exclude_columns
    )

# Tool 6: Database Metadata
@mcp.tool(
    name="get_database_metadata",
    description="Returns metadata about PostgreSQL schemas, tables, views, materialized views, column types, foreign keys, and MongoDB collections, sample document schemas, field data types, and indexes."
)
def get_database_metadata(target_system: str = "ALL") -> dict:
    return tool_get_database_metadata(target_system)

# Tool 6b: Identify Relational Schema (PostgreSQL)
@mcp.tool(
    name="identify_relational_schema",
    description="Inspects live PostgreSQL database schema to identify matching database.schema.table, view, or materialized view names based on search terms or query intent. Returns matched table names, column definitions, data types, and primary keys from live PostgreSQL information_schema."
)
def identify_relational_schema(query: str = "") -> dict:
    return tool_identify_relational_schema(query)

# Tool 6c: Identify Mongo Collections (MongoDB)
@mcp.tool(
    name="identify_mongo_collections",
    description="Inspects live MongoDB database to identify matching collection names based on search terms or query intent. Returns matching collection names, sample document keys, and field types from live MongoDB."
)
def identify_mongo_collections(query: str = "") -> dict:
    return tool_identify_mongo_collections(query)

# Tool 7: RAG Context Retrieval (Embeddings + pgvector cosine similarity)
@mcp.tool(
    name="retrieve_query_context",
    description="Converts user natural language input into dense embeddings and retrieves relevant business domain rules, KPI definitions, and join formulas from pgvector table 'business_structs' prior to crafting queries."
)
def retrieve_query_context(user_query: str, top_k: int = 4) -> dict:
    return tool_retrieve_query_context(user_query, top_k)

# Tool 8: Add or Update Business Context
@mcp.tool(
    name="add_or_update_business_context",
    description="Adds or updates domain knowledge, KPI definitions, or join formulas into 'business_structs' using restricted write credentials, generating dense 384-dimensional pgvector embeddings."
)
def add_or_update_business_context(
    struct_name: str,
    struct_type: str,
    target_entities: List[str],
    description: str,
    sql_expression: Optional[str] = None,
    metadata_json: Optional[str] = "{}"
) -> dict:
    return tool_add_or_update_business_context(
        struct_name=struct_name,
        struct_type=struct_type,
        target_entities=target_entities,
        description=description,
        sql_expression=sql_expression,
        metadata_json=metadata_json
    )

# Tool 9: Delete Business Context
@mcp.tool(
    name="delete_business_context",
    description="Deletes a business context entry from 'business_structs' by name."
)
def delete_business_context(struct_name: str) -> dict:
    return tool_delete_business_context(struct_name)

# Tool 10: BFS Shortest Join Path Finder
@mcp.tool(
    name="bfs_find_shortest_join_path",
    description=(
        "CRITICAL FOR AI: Call this tool FIRST before writing SQL or MongoDB queries involving multiple entities. "
        "It uses Breadth-First Search (BFS) over the Memgraph knowledge graph to find the shortest join path between two entities, "
        "identifying required intermediate bridge tables, join keys (e.g. customers.id = orders.customer_id), edge types "
        "(MUST_JOIN, CONDITIONAL_JOIN, OPTIONAL_JOIN), and returns a ready-to-use SQL join template."
    )
)
def bfs_find_shortest_join_path(start_entity: str, target_entity: str, max_hops: int = 5) -> dict:
    return tool_bfs_shortest_join_path(start_entity, target_entity, max_hops)

# Tool 11: DFS Deep/Alternative Join Path Explorer
@mcp.tool(
    name="dfs_explore_all_join_paths",
    description=(
        "Explores all alternative and deep relational pathways between two entities using Depth-First Search (DFS) "
        "over the Memgraph knowledge graph. Use this when you need multiple alternative routes or indirect business connections "
        "linking tables and collections."
    )
)
def dfs_explore_all_join_paths(start_entity: str, target_entity: str, max_hops: int = 5) -> dict:
    return tool_dfs_all_join_paths(start_entity, target_entity, max_hops)

# Tool 12: Entity Relational Inspection
@mcp.tool(
    name="get_entity_relationships",
    description="Lists all immediate 1-hop inbound and outbound MUST_JOIN, CONDITIONAL_JOIN, and OPTIONAL_JOIN edges for a specific table or collection."
)
def get_entity_relationships(entity_name: str) -> dict:
    return tool_get_entity_relationships(entity_name)
