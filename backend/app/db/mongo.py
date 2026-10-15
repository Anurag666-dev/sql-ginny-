import os
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
from app.config import settings

# Async Motor Client
_motor_client = None

def get_motor_client() -> AsyncIOMotorClient:
    global _motor_client
    if _motor_client is None:
        _motor_client = AsyncIOMotorClient(settings.MONGO_URI)
    return _motor_client

def get_async_mongo_db():
    client = get_motor_client()
    return client[settings.MONGO_DB]

# Synchronous PyMongo Client (for MCP synchronous tool calls or fallback)
_sync_client = None

def get_sync_mongo_client() -> MongoClient:
    global _sync_client
    if _sync_client is None:
        _sync_client = MongoClient(settings.MONGO_URI, serverSelectionTimeoutMS=5000)
    return _sync_client

def get_sync_mongo_db():
    client = get_sync_mongo_client()
    return client[settings.MONGO_DB]
