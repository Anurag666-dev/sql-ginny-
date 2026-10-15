import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings

# FastMCP Server Instance
from app.mcp.server import mcp

# REST Routers
from app.auth.router import router as auth_router
from app.api.query_preview import router as preview_router
from app.api.graph_routes import router as graph_router
from app.api.meta_routes import router as meta_router

# Initialize FastAPI App
app = FastAPI(
    title="SQL Ginny Backend & MCP Gateway",
    description="Intelligent cross-database querying, RAG business context, Memgraph join topology, and FastMCP streamable HTTP transport",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all for local pair-programming and iframe embedding
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. Mount FastMCP Streamable HTTP & SSE Transports
try:
    sse_app = mcp.sse_app()
    for route in sse_app.routes:
        app.routes.append(route)
    print("[FastMCP] Mounted SSE Transport directly at /sse and /messages")
except Exception as e:
    print(f"[FastMCP Warning] SSE mount: {e}")

try:
    streamable_app = mcp.streamable_http_app()
    for route in streamable_app.routes:
        app.routes.append(route)
    print("[FastMCP] Mounted Streamable HTTP Transport directly at /mcp")
except Exception as e:
    print(f"[FastMCP Warning] Streamable HTTP mount: {e}")

from app.api.chat_routes import router as chat_router
from app.api.schema_studio_routes import router as schema_studio_router

# 3. Include REST API Routers
app.include_router(auth_router)
app.include_router(preview_router)
app.include_router(graph_router)
app.include_router(meta_router)
app.include_router(chat_router)
app.include_router(schema_studio_router)

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "sql_ginny_backend",
        "mcp_streamable_http": "/mcp",
        "mcp_sse": "/sse",
        "docs": "/docs"
    }

@app.get("/")
async def root():
    return {
        "message": "Welcome to SQL Ginny Backend API & FastMCP Streamable Server",
        "mcp_endpoint": "/mcp",
        "sse_endpoint": "/sse",
        "health": "/health",
        "docs": "/docs"
    }
