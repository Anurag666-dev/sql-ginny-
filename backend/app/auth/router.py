from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, EmailStr
from app.auth.security import hash_password, verify_password, create_access_token, get_current_user
from app.db.postgres import get_db_cursor

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

class UserRegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

def ensure_users_table():
    """Ensure app_users table exists."""
    try:
        with get_db_cursor(use_admin=True, commit=True) as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS app_users (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    role VARCHAR(50) DEFAULT 'user',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)
            # Create default admin user if not exists
            cur.execute("SELECT id FROM app_users WHERE email = %s;", ("admin@ginny.ai",))
            if not cur.fetchone():
                admin_hash = hash_password("password123")
                cur.execute(
                    "INSERT INTO app_users (name, email, password_hash, role) VALUES (%s, %s, %s, %s);",
                    ("SQL Ginny Admin", "admin@ginny.ai", admin_hash, "admin")
                )
    except Exception as e:
        print(f"[Auth DB Warning] User table check: {e}")

# Call on import
ensure_users_table()

# In-memory user store fallback when PostgreSQL is connecting/starting up
FALLBACK_USERS = {
    "admin@ginny.ai": {
        "id": 1,
        "name": "SQL Ginny Admin",
        "email": "admin@ginny.ai",
        "password_hash": hash_password("password123"),
        "role": "admin"
    }
}

@router.post("/signup", response_model=TokenResponse)
async def signup(req: UserRegisterRequest):
    try:
        ensure_users_table()
        with get_db_cursor(use_admin=True, commit=True) as cur:
            cur.execute("SELECT id FROM app_users WHERE email = %s;", (req.email,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="An account with this email already exists.")
                
            pwd_hash = hash_password(req.password)
            cur.execute(
                "INSERT INTO app_users (name, email, password_hash, role) VALUES (%s, %s, %s, %s) RETURNING id, name, email, role;",
                (req.name, req.email, pwd_hash, "user")
            )
            user = dict(cur.fetchone())
            token = create_access_token({"sub": user["email"], "id": user["id"], "name": user["name"], "role": user["role"]})
            return {"access_token": token, "token_type": "bearer", "user": user}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Auth DB Fallback] Using memory store: {e}")
        if req.email in FALLBACK_USERS:
            raise HTTPException(status_code=400, detail="An account with this email already exists.")
        new_id = len(FALLBACK_USERS) + 1
        user_obj = {
            "id": new_id,
            "name": req.name,
            "email": req.email,
            "password_hash": hash_password(req.password),
            "role": "user"
        }
        FALLBACK_USERS[req.email] = user_obj
        user = {"id": new_id, "name": req.name, "email": req.email, "role": "user"}
        token = create_access_token({"sub": user["email"], "id": user["id"], "name": user["name"], "role": user["role"]})
        return {"access_token": token, "token_type": "bearer", "user": user}

@router.post("/login", response_model=TokenResponse)
async def login(req: UserLoginRequest):
    try:
        ensure_users_table()
        with get_db_cursor(use_admin=True, commit=False) as cur:
            cur.execute("SELECT id, name, email, password_hash, role FROM app_users WHERE email = %s;", (req.email,))
            row = cur.fetchone()
            
        if row and verify_password(req.password, row["password_hash"]):
            user = {"id": row["id"], "name": row["name"], "email": row["email"], "role": row["role"]}
            token = create_access_token({"sub": user["email"], "id": user["id"], "name": user["name"], "role": user["role"]})
            return {"access_token": token, "token_type": "bearer", "user": user}
    except Exception as e:
        print(f"[Auth DB Fallback] Using memory store: {e}")

    # Fallback memory check
    mem_user = FALLBACK_USERS.get(req.email)
    if mem_user and verify_password(req.password, mem_user["password_hash"]):
        user = {"id": mem_user["id"], "name": mem_user["name"], "email": mem_user["email"], "role": mem_user["role"]}
        token = create_access_token({"sub": user["email"], "id": user["id"], "name": user["name"], "role": user["role"]})
        return {"access_token": token, "token_type": "bearer", "user": user}

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect email or password."
    )

@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    return {"user": user}
