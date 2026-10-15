# SQL Ginny Backend Dockerfile with uv
FROM python:3.11-slim

# Install system dependencies (build-essential, libpq-dev for PostgreSQL)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv from official astral-sh image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

WORKDIR /app

# Copy dependency specification and install using uv
COPY requirements.txt .
RUN uv pip install --system --no-cache -r requirements.txt

# Copy backend source code
COPY . .

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
