import json
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from app.db.memgraph_client import run_cypher
from app.db.postgres import execute_readonly_query
from app.db.mongo import get_sync_mongo_db

router = APIRouter(prefix="/api/schema-studio", tags=["Schema Studio & Knowledge Graph Registry"])

class ColumnDictItem(BaseModel):
    name: str
    data_type: str = "varchar"
    description: str = ""
    is_primary_key: Optional[bool] = False
    is_foreign_key: Optional[bool] = False

class EntityPayload(BaseModel):
    name: str
    system: str = Field(..., description="PostgreSQL or MongoDB")
    type: str = Field(..., description="table, view, materialized_view, or collection")
    primary_key: Optional[str] = "id"
    description: str = Field(..., description="Business meaning of the entity")
    columns: List[ColumnDictItem] = []

class RelationshipPayload(BaseModel):
    source: str
    target: str
    type: str = Field(..., description="MUST_JOIN, CONDITIONAL_JOIN, or OPTIONAL_JOIN")
    from_field: str
    to_field: str
    condition: Optional[str] = None
    desc: Optional[str] = None

class DeleteRelationshipPayload(BaseModel):
    source: str
    target: str
    type: Optional[str] = None

@router.get("/catalog")
async def get_catalog():
    """
    Returns the complete knowledge graph catalog from Memgraph:
    - All entities with their business descriptions and column data-type dictionaries
    - All relational join edges (MUST_JOIN, CONDITIONAL_JOIN, OPTIONAL_JOIN)
    """
    try:
        nodes_cypher = """
            MATCH (n:Entity)
            RETURN n.name as name,
                   n.system as system,
                   n.type as type,
                   n.primary_key as primary_key,
                   n.description as description,
                   n.fields as fields,
                   n.columns_dictionary as columns_dictionary
            ORDER BY n.name ASC;
        """
        raw_nodes = run_cypher(nodes_cypher) or []

        entities = []
        for n in raw_nodes:
            dict_data = []
            raw_dict = n.get("columns_dictionary")
            if raw_dict:
                try:
                    if isinstance(raw_dict, str):
                        dict_data = json.loads(raw_dict)
                    elif isinstance(raw_dict, list):
                        dict_data = raw_dict
                except Exception:
                    dict_data = []

            # If no dictionary exists yet, construct default items from n.fields
            if not dict_data and n.get("fields"):
                dict_data = [
                    {
                        "name": f,
                        "data_type": "string" if n.get("system") == "MongoDB" else "varchar",
                        "description": "",
                        "is_primary_key": (f == n.get("primary_key"))
                    }
                    for f in n.get("fields", [])
                ]

            entities.append({
                "name": n.get("name"),
                "system": n.get("system") or ("MongoDB" if "collection" in (n.get("type") or "").lower() else "PostgreSQL"),
                "type": n.get("type") or "table",
                "primary_key": n.get("primary_key") or "id",
                "description": n.get("description") or "",
                "fields": n.get("fields") or [c.get("name") for c in dict_data if isinstance(c, dict)],
                "columns": dict_data
            })

        edges_cypher = """
            MATCH (a:Entity)-[r]->(b:Entity)
            RETURN a.name as source,
                   b.name as target,
                   type(r) as type,
                   r.from_field as from_field,
                   r.to_field as to_field,
                   r.condition as condition,
                   r.desc as desc
            ORDER BY a.name, b.name;
        """
        edges = run_cypher(edges_cypher) or []

        return {
            "total_entities": len(entities),
            "total_relationships": len(edges),
            "entities": entities,
            "relationships": edges
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch catalog from Memgraph: {str(e)}")

@router.post("/entity")
async def register_or_update_entity(payload: EntityPayload):
    """
    Registers a new database entity or updates an existing entity in Memgraph,
    storing the business description and full column data-type dictionary.
    """
    clean_name = payload.name.strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="Entity name cannot be empty.")

    system_clean = payload.system.strip()
    type_clean = payload.type.strip().lower()
    pk_clean = (payload.primary_key or "").strip() or ("_id" if system_clean == "MongoDB" else "id")
    desc_clean = payload.description.strip()

    columns_list = [c.dict() for c in payload.columns]
    field_names = [c["name"] for c in columns_list]
    columns_json = json.dumps(columns_list)

    # Determine graph labels
    label_type = "Table"
    if "view" in type_clean and "mat" in type_clean:
        label_type = "MaterializedView"
    elif "view" in type_clean:
        label_type = "View"
    elif "coll" in type_clean or system_clean == "MongoDB":
        label_type = "Collection"

    try:
        cypher = f"""
            MERGE (n:Entity {{name: $name}})
            SET n:{label_type},
                n.system = $system,
                n.type = $type,
                n.primary_key = $primary_key,
                n.description = $description,
                n.fields = $fields,
                n.columns_dictionary = $columns_json
            RETURN n.name as name;
        """
        run_cypher(cypher, {
            "name": clean_name,
            "system": system_clean,
            "type": type_clean,
            "primary_key": pk_clean,
            "description": desc_clean,
            "fields": field_names,
            "columns_json": columns_json
        })

        return {
            "success": True,
            "message": f"Entity '{clean_name}' successfully registered in Memgraph with {len(columns_list)} dictionary columns.",
            "entity": {
                "name": clean_name,
                "system": system_clean,
                "type": type_clean,
                "primary_key": pk_clean,
                "description": desc_clean,
                "columns_count": len(columns_list)
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Memgraph entity registration error: {str(e)}")

@router.delete("/entity/{entity_name}")
async def delete_entity(entity_name: str):
    """
    Deletes an entity node and all its connected relationship edges from Memgraph.
    """
    try:
        cypher = """
            MATCH (n:Entity {name: $name})
            DETACH DELETE n;
        """
        run_cypher(cypher, {"name": entity_name.strip()})
        return {"success": True, "message": f"Entity '{entity_name}' and connected relationships deleted."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete entity: {str(e)}")

@router.post("/relationship")
async def register_or_update_relationship(payload: RelationshipPayload):
    """
    Creates or updates a relational join edge between two entities in Memgraph
    with join keys, condition predicates, and edge types (MUST_JOIN, CONDITIONAL_JOIN, OPTIONAL_JOIN).
    """
    src = payload.source.strip()
    tgt = payload.target.strip()
    rel_type = payload.type.strip().upper()

    if rel_type not in ("MUST_JOIN", "CONDITIONAL_JOIN", "OPTIONAL_JOIN"):
        raise HTTPException(status_code=400, detail="Invalid edge type. Must be MUST_JOIN, CONDITIONAL_JOIN, or OPTIONAL_JOIN.")

    try:
        # 1. Delete any existing edge between src and tgt to prevent duplicate or conflicting edges
        delete_existing = """
            MATCH (a:Entity {name: $source})-[r]->(b:Entity {name: $target})
            DELETE r;
        """
        run_cypher(delete_existing, {"source": src, "target": tgt})

        # 2. Create the typed edge
        create_cypher = f"""
            MATCH (a:Entity {{name: $source}}), (b:Entity {{name: $target}})
            CREATE (a)-[r:{rel_type} {{
                from_field: $from_field,
                to_field: $to_field,
                condition: $condition,
                desc: $desc
            }}]->(b)
            RETURN type(r) as rel_type;
        """
        res = run_cypher(create_cypher, {
            "source": src,
            "target": tgt,
            "from_field": payload.from_field.strip(),
            "to_field": payload.to_field.strip(),
            "condition": payload.condition.strip() if payload.condition else None,
            "desc": payload.desc.strip() if payload.desc else f"{src}.{payload.from_field} -> {tgt}.{payload.to_field}"
        })

        if not res:
            raise HTTPException(
                status_code=404,
                detail=f"Either source entity '{src}' or target entity '{tgt}' does not exist in Memgraph."
            )

        return {
            "success": True,
            "message": f"Relationship {src} -[{rel_type}]-> {tgt} successfully registered.",
            "relationship": {
                "source": src,
                "target": tgt,
                "type": rel_type,
                "from_field": payload.from_field,
                "to_field": payload.to_field,
                "condition": payload.condition,
                "desc": payload.desc
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Memgraph edge creation error: {str(e)}")

@router.delete("/relationship")
async def delete_relationship(payload: DeleteRelationshipPayload):
    """
    Deletes a specific relationship edge between two entities.
    """
    try:
        cypher = """
            MATCH (a:Entity {name: $source})-[r]->(b:Entity {name: $target})
            WHERE ($type IS NULL OR type(r) = $type)
            DELETE r;
        """
        run_cypher(cypher, {
            "source": payload.source.strip(),
            "target": payload.target.strip(),
            "type": payload.type.strip().upper() if payload.type else None
        })
        return {"success": True, "message": f"Relationship between '{payload.source}' and '{payload.target}' deleted."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete relationship: {str(e)}")

@router.get("/introspect-live-databases")
async def introspect_live_databases():
    """
    Scans PostgreSQL and MongoDB to return all physical tables, views, and collections,
    indicating which ones are already registered in the Memgraph knowledge graph.
    """
    try:
        # Existing Memgraph entities
        existing_nodes = run_cypher("MATCH (n:Entity) RETURN n.name as name") or []
        registered_set = {n["name"] for n in existing_nodes}

        # PostgreSQL Tables & Views
        pg_sql = """
            SELECT table_name, table_type
            FROM information_schema.tables
            WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
              AND table_name NOT IN ('spatial_ref_sys')
            ORDER BY table_name;
        """
        pg_rows = execute_readonly_query(pg_sql) or []

        # PostgreSQL Matviews
        mv_sql = """
            SELECT matviewname as table_name
            FROM pg_matviews
            WHERE schemaname NOT IN ('information_schema', 'pg_catalog')
            ORDER BY matviewname;
        """
        mv_rows = execute_readonly_query(mv_sql) or []

        pg_entities = []
        for r in pg_rows:
            tname = r["table_name"]
            is_view = "VIEW" in (r.get("table_type") or "").upper()
            pg_entities.append({
                "name": tname,
                "system": "PostgreSQL",
                "type": "view" if is_view else "table",
                "is_registered": tname in registered_set
            })

        for r in mv_rows:
            mvname = r["table_name"]
            pg_entities.append({
                "name": mvname,
                "system": "PostgreSQL",
                "type": "materialized_view",
                "is_registered": mvname in registered_set
            })

        # MongoDB Collections
        mongo_entities = []
        try:
            db = get_sync_mongo_db()
            for coll in db.list_collection_names():
                if not coll.startswith("system.") and coll not in ("chats", "user_conversations"):
                    mongo_entities.append({
                        "name": coll,
                        "system": "MongoDB",
                        "type": "collection",
                        "is_registered": coll in registered_set
                    })
        except Exception:
            pass

        return {
            "postgresql": pg_entities,
            "mongodb": mongo_entities
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to introspect live databases: {str(e)}")

@router.get("/introspect-columns")
async def introspect_columns(
    system: str = Query(..., description="PostgreSQL or MongoDB"),
    entity_name: str = Query(..., description="Table or collection name")
):
    """
    Introspects columns/fields directly from PostgreSQL information_schema or MongoDB sample documents
    to auto-populate column names and types for the dictionary editor.
    """
    clean_sys = system.strip()
    clean_name = entity_name.strip()

    columns: List[Dict[str, Any]] = []

    if clean_sys.lower() == "postgresql":
        sql = """
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = %s AND table_schema NOT IN ('information_schema', 'pg_catalog')
            ORDER BY ordinal_position;
        """
        rows = execute_readonly_query(sql, (clean_name,)) or []
        for r in rows:
            cname = r["column_name"]
            dtype = r["data_type"]
            is_pk = (cname.lower() in ("id", f"{clean_name.rstrip('s')}_id"))
            columns.append({
                "name": cname,
                "data_type": dtype,
                "description": f"Field {cname} of type {dtype}",
                "is_primary_key": is_pk,
                "is_foreign_key": cname.endswith("_id") and not is_pk
            })

    elif clean_sys.lower() == "mongodb":
        try:
            db = get_sync_mongo_db()
            coll = db[clean_name]
            samples = list(coll.find().limit(5))
            seen_keys = {}
            for s in samples:
                for k, v in s.items():
                    if k not in seen_keys:
                        # Infer Mongo type
                        tname = type(v).__name__
                        if k == "_id":
                            dtype = "ObjectId"
                        elif isinstance(v, bool):
                            dtype = "boolean"
                        elif isinstance(v, int):
                            dtype = "integer"
                        elif isinstance(v, float):
                            dtype = "double"
                        elif isinstance(v, str):
                            dtype = "string"
                        elif isinstance(v, list):
                            dtype = "array"
                        elif isinstance(v, dict):
                            dtype = "object"
                        else:
                            dtype = tname
                        seen_keys[k] = dtype

            for k, dtype in seen_keys.items():
                columns.append({
                    "name": k,
                    "data_type": dtype,
                    "description": f"MongoDB document field {k} ({dtype})",
                    "is_primary_key": (k == "_id"),
                    "is_foreign_key": k.endswith("_code") or k.endswith("_id")
                })
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"MongoDB introspection error: {str(e)}")

    return {
        "system": clean_sys,
        "entity_name": clean_name,
        "total_columns": len(columns),
        "columns": columns
    }
