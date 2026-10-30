import psycopg2
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager
from app.config import settings

def get_admin_connection():
    """Superuser connection for migrations and admin maintenance."""
    return psycopg2.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        dbname=settings.POSTGRES_DB,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD
    )

def get_app_connection():
    """
    Restricted user connection (ginny_app_user) for AI MCP tool queries.
    WRITE access ONLY to 'business_structs'.
    READ-ONLY (SELECT) on all other tables, views, and materialized views.
    """
    return psycopg2.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        dbname=settings.POSTGRES_DB,
        user=settings.POSTGRES_APP_USER,
        password=settings.POSTGRES_APP_PASSWORD
    )

@contextmanager
def get_db_cursor(use_admin: bool = False, commit: bool = False):
    conn = get_admin_connection() if use_admin else get_app_connection()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        yield cur
        if commit:
            conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()

def execute_readonly_query(sql: str, params=None):
    """Executes a read query with the restricted user inside a READ ONLY transaction."""
    with get_db_cursor(use_admin=False, commit=False) as cur:
        # Database-level guard: PostgreSQL rejects any INSERT/UPDATE/DELETE/DDL in this session
        cur.connection.set_session(readonly=True)
        if params is not None:
            cur.execute(sql, params)
        else:
            cur.execute(sql)
        return cur.fetchall()

def execute_business_struct_write(sql: str, params=None):
    """Executes a write query on business_structs using the restricted user."""
    with get_db_cursor(use_admin=False, commit=True) as cur:
        if params is not None:
            cur.execute(sql, params)
        else:
            cur.execute(sql)
        try:
            return cur.fetchall()
        except psycopg2.ProgrammingError:
            return None
