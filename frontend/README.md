# SQL Ginny — Frontend Visualizer & AI Interface 🖥️

Modern, high-performance web interface for SQL Ginny built with **React 18**, **TypeScript**, **Vite**, and **Tailwind CSS**. Integrates interactive 2D/3D database topology graphs, real-time SSE streaming AI chat, and pgvector Business RAG management.

---

## 🌟 Core Modules & Pages

### 1. 🤖 AI Chat (`/`)
- **Real-Time SSE Streaming**: Streams LLM token generation and FastMCP tool execution events in real time (`/api/chat/stream`).
- **Dynamic Tool Execution Cards**: Visual cards display live multi-turn tool progression:
  1. `retrieve_query_context` (Business RAG retrieval)
  2. `bfs_find_shortest_join_path` (Memgraph topology exploration)
  3. `run_postgres_raw_query` / `cross_db_query_and_join` (Query execution & Redis caching)
- **Model Selector**: Switch dynamically between free and paid OpenRouter models (NVIDIA Nemotron 3 Nano/Super, Google Gemma 4 31B, Claude 3.5 Sonnet, GPT-4o, DeepSeek V3) with custom API key support.
- **Conversation Management**: Multi-chat sidebar with session persistence and creation.
- **Query Preview & Data Export**: Integrated verification modal with Redis 10-minute cache confirmation, top-5 preview inspection, and full-dataset download as **CSV** or **JSON**.

---

### 2. 🕸️ Database Visualizer (`/visualize-db`)
- **2D & 3D Interactive Force Graph**: Powered by Three.js and Canvas, rendering all PostgreSQL tables, views, materialized views, and MongoDB collections.
- **Three-Edge Topology Taxonomy**:
  - 🔵 **`MUST_JOIN` (Solid Blue)**: Mandatory relational foreign key joins.
  - 🟡 **`CONDITIONAL_JOIN` (Dashed Amber)**: Joins governed by business conditions (e.g. `orders.status IN ('REFUNDED', 'CANCELLED')`).
  - 🟣 **`OPTIONAL_JOIN` (Dotted Purple)**: Outer cross-database enrichments linking PostgreSQL to MongoDB collections.
- **Join Path Tracer**: Select any starting node and destination node to calculate:
  - **BFS (Shortest Join Path)**: Minimizes hops and identifies necessary intermediate bridge tables.
  - **DFS (All Feasible Paths)**: Explores all relational routes across the schema graph.
  - Generates ready-to-use SQL join recipes and cross-database query templates.
- **Schema Inspector**: Click any node to view column lists, primary keys, foreign keys, and document field types.

---

### 3. 📚 Business RAG (`/business-structs`)
- **Domain Rules & Metric Catalog**: Manage domain definitions, KPI metric formulas (e.g. *Customer Lifetime Value*), and confidentiality policies stored in PostgreSQL with pgvector.
- **Dense Vector Embedding Generation**: Automatic 384-dimensional dense vector embeddings generated upon creating or editing domain rules.
- **Live Vector Similarity Tester**: Enter any natural language query to test pgvector cosine distance (`<=>`) and verify which business rules match with similarity scores.

---

### 4. 🔐 Authentication (`/login`, `/signup`)
- JWT-based authentication with token persistence in `localStorage`.
- Protected routing via `ProtectedRoute.tsx` safeguarding database administration routes.

---

## 📁 Directory Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── Navbar.tsx             # Top navigation with status indicators
│   │   ├── ProtectedRoute.tsx     # Route authentication guard
│   │   └── QueryPreviewModal.tsx  # Redis query result preview & CSV/JSON export
│   ├── contexts/
│   │   └── AuthContext.tsx        # User authentication state
│   ├── pages/
│   │   ├── Chat.tsx               # AI Streaming Chat with tool visualizer
│   │   ├── VisualizeDb.tsx        # 2D/3D Knowledge Graph Visualizer & Path Tracer
│   │   ├── BusinessStructs.tsx    # Business RAG catalog & vector similarity tester
│   │   ├── Login.tsx              # Authentication Login
│   │   └── Signup.tsx             # Authentication Signup
│   ├── App.tsx                    # Route definitions
│   ├── main.tsx                   # Entry point
│   └── index.css                  # Tailwind styles
├── index.html                     # HTML template
├── package.json                   # Dependencies and npm scripts
├── tailwind.config.js             # Tailwind CSS theme
├── tsconfig.json                  # TypeScript compiler configuration
└── vite.config.ts                 # Vite bundler configuration
```

---

## ⚙️ Configuration

Environment settings are controlled via `.env` in the `frontend` directory:

```ini
# Backend API Base URL
VITE_API_URL=http://localhost:8000
```

---

## 🚀 Setup & Local Execution

### Prerequisites
- Node.js 18+
- npm or yarn

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Run Development Server
```bash
npm run dev -- --host 0.0.0.0 --port 5173
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 3. Build for Production
```bash
npm run build
```
Generates optimized static assets in `dist/`.

### 4. Preview Production Build
```bash
npm run preview
```
Previews the production build on [http://localhost:4173](http://localhost:4173).
