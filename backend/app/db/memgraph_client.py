from neo4j import GraphDatabase
from app.config import settings

_driver = None

def get_memgraph_driver():
    global _driver
    if _driver is None:
        uri = f"bolt://{settings.MEMGRAPH_HOST}:{settings.MEMGRAPH_PORT}"
        auth = (settings.MEMGRAPH_USER, settings.MEMGRAPH_PASSWORD) if settings.MEMGRAPH_USER else None
        _driver = GraphDatabase.driver(uri, auth=auth)
    return _driver

def run_cypher(query: str, parameters: dict = None):
    """Executes an openCypher query against Memgraph and returns a list of records."""
    driver = get_memgraph_driver()
    with driver.session() as session:
        result = session.run(query, parameters or {})
        return [record.data() for record in result]
