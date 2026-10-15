import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { Navbar } from '../components/Navbar';
import {
  Compass,
  ArrowRight,
  ShieldAlert,
  Search,
  RotateCw,
  Focus,
  Eye,
  Grid,
  Layers,
  Database,
  Network,
  Copy,
  Check,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Maximize2
} from 'lucide-react';
import ForceGraph3D from '3d-force-graph';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Vibrant color palette for distinct traversal paths
const PATH_COLORS = [
  '#facc15', // Amber / Gold (Path 1)
  '#38bdf8', // Sky Blue (Path 2)
  '#f43f5e', // Rose / Coral (Path 3)
  '#a855f7', // Purple (Path 4)
  '#34d399', // Emerald (Path 5)
  '#fb923c', // Vivid Orange (Path 6)
];

export const VisualizeDb: React.FC = () => {
  const [topology, setTopology] = useState<any>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<any | null>(null);

  // Path Finder states
  const [startEntity, setStartEntity] = useState('customers');
  const [targetEntity, setTargetEntity] = useState('product_reviews');
  const [algorithm, setAlgorithm] = useState<'BFS' | 'DFS'>('BFS');
  const [traversalResult, setTraversalResult] = useState<any | null>(null);
  const [selectedPathIndex, setSelectedPathIndex] = useState<number | 'ALL'>('ALL');
  const [traversing, setTraversing] = useState(false);
  const [copiedTemplate, setCopiedTemplate] = useState(false);

  // View Controls
  const [viewMode, setViewMode] = useState<'3d' | 'grid'>('3d');
  const [systemFilter, setSystemFilter] = useState<'ALL' | 'PostgreSQL' | 'MongoDB'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAutoRotating, setIsAutoRotating] = useState(false);

  // 3D Force Graph References
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const graphInstanceRef = useRef<any>(null);

  useEffect(() => {
    fetchTopology();
  }, []);

  const fetchTopology = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_URL}/api/graph/topology`);
      setTopology(res.data);
      if (res.data.nodes?.length > 0) {
        setSelectedNode(res.data.nodes[0]);
      }
    } catch (err: any) {
      console.error('Failed to load topology from Memgraph:', err);
      setError(
        'Memgraph is offline or uninitialized on port 7687. Start Docker containers with: sudo docker compose up -d && uv run python scripts/seed_all.py'
      );
    } finally {
      setLoading(false);
    }
  };

  const runTraversal = async () => {
    if (!startEntity || !targetEntity) return;
    setTraversing(true);
    try {
      const res = await axios.post(`${API_URL}/api/graph/traverse`, {
        start_entity: startEntity,
        target_entity: targetEntity,
        algorithm: algorithm,
        max_hops: 5,
      });
      setTraversalResult(res.data);
      setSelectedPathIndex('ALL');

      // Focus camera on start entity if in 3D mode
      if (graphInstanceRef.current && res.data.paths?.[0]?.path_sequence) {
        const pathSeq = res.data.paths[0].path_sequence;
        const firstNode = topology.nodes.find((n: any) => n.name === pathSeq[0]);
        if (firstNode) {
          focusOnNode(firstNode.name);
        }
      }
    } catch (err) {
      console.error('Traversal failed:', err);
    } finally {
      setTraversing(false);
    }
  };

  const copySqlTemplate = (template: string) => {
    navigator.clipboard.writeText(template);
    setCopiedTemplate(true);
    setTimeout(() => setCopiedTemplate(false), 2000);
  };

  // Traversal Path Nodes & Edges Map for Multi-Path Highlighting
  const { nodePathsMap, edgePathsMap, pathNodesSet, pathEdgesSet } = useMemo(() => {
    const nodeMap = new Map<string, number[]>();
    const edgeMap = new Map<string, number[]>();
    const nSet = new Set<string>();
    const eSet = new Set<string>();

    const allPaths: any[] = traversalResult?.paths || [];

    allPaths.forEach((pathObj: any, pIdx: number) => {
      const isActive = selectedPathIndex === 'ALL' || selectedPathIndex === pIdx;
      if (!isActive) return;

      const seq = pathObj?.path_sequence || [];
      seq.forEach((name: string) => {
        nSet.add(name);
        const existing = nodeMap.get(name) || [];
        if (!existing.includes(pIdx)) {
          existing.push(pIdx);
          nodeMap.set(name, existing);
        }
      });

      for (let i = 0; i < seq.length - 1; i++) {
        const k1 = `${seq[i]}->${seq[i + 1]}`;
        const k2 = `${seq[i + 1]}->${seq[i]}`;
        eSet.add(k1);
        eSet.add(k2);

        const list1 = edgeMap.get(k1) || [];
        if (!list1.includes(pIdx)) list1.push(pIdx);
        edgeMap.set(k1, list1);

        const list2 = edgeMap.get(k2) || [];
        if (!list2.includes(pIdx)) list2.push(pIdx);
        edgeMap.set(k2, list2);
      }
    });

    return {
      nodePathsMap: nodeMap,
      edgePathsMap: edgeMap,
      pathNodesSet: nSet,
      pathEdgesSet: eSet,
    };
  }, [traversalResult, selectedPathIndex]);

  // Filtered nodes
  const filteredNodes = useMemo(() => {
    return (topology.nodes || []).filter((node: any) => {
      const matchesSystem =
        systemFilter === 'ALL' ||
        (systemFilter === 'PostgreSQL' && node.system === 'PostgreSQL') ||
        (systemFilter === 'MongoDB' && node.system === 'MongoDB');
      const matchesSearch =
        !searchQuery ||
        node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (node.fields && node.fields.some((f: string) => f.toLowerCase().includes(searchQuery.toLowerCase())));
      return matchesSystem && matchesSearch;
    });
  }, [topology.nodes, systemFilter, searchQuery]);

  // Initialize and update 3D Force Graph
  useEffect(() => {
    if (viewMode !== '3d' || !graphContainerRef.current || !topology.nodes?.length) return;

    // Build Graph Data
    const gData = {
      nodes: topology.nodes.map((n: any) => ({
        id: n.name,
        name: n.name,
        system: n.system,
        type: n.type,
        primary_key: n.primary_key,
        fields: n.fields,
        description: n.description,
      })),
      links: (topology.edges || []).map((e: any) => ({
        source: e.source,
        target: e.target,
        type: e.type,
        from_field: e.from_field,
        to_field: e.to_field,
        condition: e.condition,
        desc: e.desc,
      })),
    };

    // Dispose previous instance if any
    if (graphInstanceRef.current) {
      graphInstanceRef.current._destructor?.();
      graphContainerRef.current.innerHTML = '';
    }

    const container = graphContainerRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // Create 3D Force Graph instance
    const Graph = (ForceGraph3D as any)()(container)
      .width(width)
      .height(height)
      .backgroundColor('#020617') // Slate 950 deep cosmic background
      .showNavInfo(false)
      .graphData(gData);

    // Custom 3D Node Object: Sphere + Floating Text Sprite
    Graph.nodeThreeObject((node: any) => {
      const group = new THREE.Group();

      const pathsContainingNode = nodePathsMap.get(node.name) || [];
      const isPath = pathsContainingNode.length > 0;
      const isMultiPathBridge = pathsContainingNode.length > 1;
      const isSelected = selectedNode?.name === node.name;
      const isStart = node.name === startEntity;
      const isTarget = node.name === targetEntity;
      const isPg = node.system === 'PostgreSQL';
      const isView = node.type === 'view' || node.type === 'materialized_view';

      // Colors
      let color = isPg ? '#38bdf8' : '#34d399'; // Sky blue for Postgres, Emerald for Mongo
      if (isView) color = '#c084fc'; // Purple for views
      if (isPath) {
        // Multi-path bridge node gets intense warm amber, single path gets its designated path color
        color = isMultiPathBridge ? '#f59e0b' : PATH_COLORS[pathsContainingNode[0] % PATH_COLORS.length];
      }
      if (isStart) color = '#10b981'; // Emerald for Start Node
      if (isTarget) color = '#ec4899'; // Pink/Rose for Target Node
      if (isSelected) color = '#f43f5e'; // Rose for Selected

      // Sphere Geometry & Material
      const radius = isSelected ? 8.5 : isStart || isTarget ? 8 : isMultiPathBridge ? 7.5 : isPath ? 6.5 : 5;
      const geometry = new THREE.SphereGeometry(radius, 20, 20);
      const material = new THREE.MeshPhongMaterial({
        color: new THREE.Color(color),
        emissive: new THREE.Color(color),
        emissiveIntensity: isPath || isSelected || isStart || isTarget ? 0.65 : 0.25,
        shininess: 60,
        transparent: true,
        opacity: 0.92,
      });
      const sphere = new THREE.Mesh(geometry, material);
      group.add(sphere);

      // Outer Glow Ring for Selected / Path / Endpoints
      if (isSelected || isPath || isStart || isTarget) {
        const ringGeo = new THREE.RingGeometry(radius + 2, radius + (isMultiPathBridge ? 4.5 : 3.5), 32);
        const ringMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(color),
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        group.add(ring);
      }

      // 3D Floating SpriteText Label
      let labelText = node.name;
      if (isStart) labelText = `▶ ${node.name} (Start)`;
      else if (isTarget) labelText = `🏁 ${node.name} (Target)`;
      else if (isMultiPathBridge) labelText = `⚡ ${node.name} (${pathsContainingNode.length} paths)`;

      const sprite = new SpriteText(labelText);
      sprite.color = isSelected || isStart || isTarget ? '#ffffff' : isPath ? '#fef08a' : '#e2e8f0';
      sprite.textHeight = isPath || isStart || isTarget ? 5 : 4.5;
      sprite.position.set(0, radius + 5, 0);
      sprite.backgroundColor = 'rgba(15, 23, 42, 0.9)';
      sprite.borderColor = color;
      sprite.borderWidth = isPath || isStart || isTarget ? 1 : 0.5;
      sprite.borderRadius = 4;
      sprite.padding = 3;
      group.add(sprite);

      return group;
    });

    // Node Interaction
    Graph.onNodeClick((node: any) => {
      setSelectedNode(node);
      focusOnNode(node.name);
    });

    // Custom 3D Link / Edge Colors & Particles
    Graph.linkColor((link: any) => {
      const s = typeof link.source === 'object' ? link.source.id : link.source;
      const t = typeof link.target === 'object' ? link.target.id : link.target;
      const key = `${s}->${t}`;
      const edgePaths = edgePathsMap.get(key);
      if (edgePaths && edgePaths.length > 0) {
        if (edgePaths.length > 1) return '#f59e0b'; // Amber-gold for shared multi-path bridge edge
        return PATH_COLORS[edgePaths[0] % PATH_COLORS.length];
      }
      if (link.type === 'MUST_JOIN') return '#38bdf8'; // Blue for mandatory foreign keys
      if (link.type === 'CONDITIONAL_JOIN') return '#f59e0b'; // Amber for conditional
      return '#34d399'; // Emerald for optional / cross-db
    });

    Graph.linkWidth((link: any) => {
      const s = typeof link.source === 'object' ? link.source.id : link.source;
      const t = typeof link.target === 'object' ? link.target.id : link.target;
      const key = `${s}->${t}`;
      const edgePaths = edgePathsMap.get(key);
      if (edgePaths && edgePaths.length > 0) {
        return edgePaths.length > 1 ? 4.5 : 3;
      }
      return 1.2;
    });

    // Directional Particle Flow
    Graph.linkDirectionalParticles((link: any) => {
      const s = typeof link.source === 'object' ? link.source.id : link.source;
      const t = typeof link.target === 'object' ? link.target.id : link.target;
      const key = `${s}->${t}`;
      const edgePaths = edgePathsMap.get(key);
      if (edgePaths && edgePaths.length > 0) {
        return edgePaths.length > 1 ? 6 : 4;
      }
      return 1;
    });

    Graph.linkDirectionalParticleSpeed((link: any) => {
      const s = typeof link.source === 'object' ? link.source.id : link.source;
      const t = typeof link.target === 'object' ? link.target.id : link.target;
      const key = `${s}->${t}`;
      const edgePaths = edgePathsMap.get(key);
      return edgePaths && edgePaths.length > 0 ? 0.015 : 0.005;
    });

    Graph.linkDirectionalParticleWidth((link: any) => {
      const s = typeof link.source === 'object' ? link.source.id : link.source;
      const t = typeof link.target === 'object' ? link.target.id : link.target;
      const key = `${s}->${t}`;
      const edgePaths = edgePathsMap.get(key);
      if (edgePaths && edgePaths.length > 0) {
        return edgePaths.length > 1 ? 4 : 3;
      }
      return 1.5;
    });

    Graph.linkDirectionalParticleColor((link: any) => {
      const s = typeof link.source === 'object' ? link.source.id : link.source;
      const t = typeof link.target === 'object' ? link.target.id : link.target;
      const key = `${s}->${t}`;
      const edgePaths = edgePathsMap.get(key);
      if (edgePaths && edgePaths.length > 0) {
        if (edgePaths.length > 1) return '#ffffff'; // White glowing particles for shared bridge
        return PATH_COLORS[edgePaths[0] % PATH_COLORS.length];
      }
      return '#38bdf8';
    });

    Graph.linkDirectionalArrowLength(4);
    Graph.linkDirectionalArrowRelPos(0.9);

    // Warm D3 Force Simulation
    Graph.d3Force('charge')?.strength(-140);
    Graph.d3Force('link')?.distance(65);

    // Resize Handler
    const resizeObserver = new ResizeObserver(() => {
      if (graphContainerRef.current) {
        Graph.width(graphContainerRef.current.clientWidth);
        Graph.height(graphContainerRef.current.clientHeight);
      }
    });
    resizeObserver.observe(container);

    graphInstanceRef.current = Graph;

    return () => {
      resizeObserver.disconnect();
      Graph._destructor?.();
    };
  }, [viewMode, topology, nodePathsMap, edgePathsMap, selectedNode, startEntity, targetEntity]);

  // Focus Camera on Node
  const focusOnNode = (nodeName: string) => {
    if (!graphInstanceRef.current) return;
    const gData = graphInstanceRef.current.graphData();
    const node = gData.nodes.find((n: any) => n.id === nodeName);
    if (node && node.x !== undefined) {
      const distance = 80;
      const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
      graphInstanceRef.current.cameraPosition(
        { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
        node,
        1200
      );
    }
  };

  // Reset Camera View
  const handleResetCamera = () => {
    if (graphInstanceRef.current) {
      graphInstanceRef.current.zoomToFit(1000, 40);
    }
  };

  // Auto-rotate Orbit Controls
  useEffect(() => {
    if (!graphInstanceRef.current) return;
    const controls = graphInstanceRef.current.controls?.();
    if (controls) {
      controls.autoRotate = isAutoRotating;
      controls.autoRotateSpeed = 1.2;
    }
  }, [isAutoRotating]);

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <Navbar />

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Control Panel: Path Finder (BFS & DFS) */}
        <aside className="w-96 border-r border-slate-800 bg-slate-900/80 p-5 overflow-y-auto space-y-6 shrink-0 z-10 backdrop-blur-md">
          <div>
            <div className="flex items-center gap-2">
              <Compass className="h-5 w-5 text-sky-400" />
              <h2 className="text-base font-bold text-white tracking-tight">Join Path Explorer</h2>
            </div>
            <p className="mt-1 text-xs text-slate-400 leading-relaxed">
              Explore 33 live tables & collections across PostgreSQL and MongoDB using Memgraph graph traversal algorithms.
            </p>
          </div>

          {/* Form */}
          <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/80 p-4 shadow-sm">
            <div>
              <label className="block text-xs font-semibold text-slate-300">Source Entity (Start)</label>
              <select
                value={startEntity}
                onChange={(e) => setStartEntity(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
              >
                {topology.nodes.map((n: any) => (
                  <option key={n.name} value={n.name}>
                    {n.system === 'PostgreSQL' ? '🐘' : '🍃'} {n.name} ({n.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300">Target Entity (Destination)</label>
              <select
                value={targetEntity}
                onChange={(e) => setTargetEntity(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
              >
                {topology.nodes.map((n: any) => (
                  <option key={n.name} value={n.name}>
                    {n.system === 'PostgreSQL' ? '🐘' : '🍃'} {n.name} ({n.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300">Algorithm</label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAlgorithm('BFS')}
                  className={`rounded-lg py-2 text-xs font-semibold transition ${
                    algorithm === 'BFS'
                      ? 'bg-sky-600 text-white shadow-md shadow-sky-500/20'
                      : 'border border-slate-700 bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  BFS (Shortest Path)
                </button>
                <button
                  type="button"
                  onClick={() => setAlgorithm('DFS')}
                  className={`rounded-lg py-2 text-xs font-semibold transition ${
                    algorithm === 'DFS'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                      : 'border border-slate-700 bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  DFS (Deep Paths)
                </button>
              </div>
            </div>

            <button
              onClick={runTraversal}
              disabled={traversing}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-600 py-2.5 text-xs font-semibold text-white shadow-lg shadow-sky-500/20 hover:from-sky-400 hover:to-indigo-500 disabled:opacity-50 transition"
            >
              {traversing ? 'Searching Memgraph...' : 'Trace Relational Join Path'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {/* Traversal Results Display */}
          {traversalResult && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Discovered Paths ({traversalResult.total_paths_found})
                </span>
                <span className="rounded bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-400 border border-sky-500/20">
                  {traversalResult.algorithm}
                </span>
              </div>

              {/* Multi-Path Filter Pills */}
              {traversalResult.paths?.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <button
                    onClick={() => setSelectedPathIndex('ALL')}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold transition flex items-center gap-1.5 ${
                      selectedPathIndex === 'ALL'
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                        : 'bg-slate-800/80 text-slate-300 hover:text-white'
                    }`}
                  >
                    <span>✨ All Paths ({traversalResult.paths.length})</span>
                  </button>

                  {traversalResult.paths.map((_: any, pIdx: number) => {
                    const color = PATH_COLORS[pIdx % PATH_COLORS.length];
                    const isSelected = selectedPathIndex === pIdx;
                    return (
                      <button
                        key={pIdx}
                        onClick={() => setSelectedPathIndex(pIdx)}
                        className={`px-2 py-1 rounded text-[11px] font-semibold transition flex items-center gap-1.5 border ${
                          isSelected
                            ? 'border-white text-white font-bold bg-slate-800 shadow-md'
                            : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white hover:border-slate-700'
                        }`}
                      >
                        <span
                          className="w-2 h-2 rounded-full inline-block"
                          style={{ backgroundColor: color }}
                        ></span>
                        <span>Path #{pIdx + 1}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {traversalResult.paths?.length > 0 ? (
                traversalResult.paths.map((p: any, idx: number) => {
                  const pathColor = PATH_COLORS[idx % PATH_COLORS.length];
                  const isCurrentSelected = selectedPathIndex === 'ALL' || selectedPathIndex === idx;
                  const isSoleSelection = selectedPathIndex === idx;

                  return (
                    <div
                      key={idx}
                      className={`rounded-xl border p-3.5 space-y-2 text-xs transition-all duration-200 border-l-4 ${
                        isSoleSelection
                          ? 'bg-slate-900/90 ring-1 ring-white/30 shadow-lg'
                          : isCurrentSelected
                          ? 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                          : 'opacity-40 bg-slate-950 border-slate-900'
                      }`}
                      style={{ borderLeftColor: pathColor }}
                    >
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full inline-block shadow-sm"
                            style={{ backgroundColor: pathColor }}
                          ></span>
                          <span className="text-white font-bold">Path #{idx + 1}</span>
                          <span className="text-slate-400 font-normal">({p.hops} hops)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() =>
                              setSelectedPathIndex(selectedPathIndex === idx ? 'ALL' : idx)
                            }
                            title={isSoleSelection ? 'Show all paths' : 'Isolate this path in 3D'}
                            className={`text-[10px] px-2 py-0.5 rounded border transition ${
                              isSoleSelection
                                ? 'bg-amber-500 text-slate-950 font-bold border-amber-400'
                                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
                            }`}
                          >
                            {isSoleSelection ? 'Isolated' : 'Isolate'}
                          </button>
                          <span className={p.is_direct ? 'text-emerald-400' : 'text-amber-400'}>
                            {p.is_direct ? 'Direct Link' : `${p.intermediate_entities?.length} Intermediate`}
                          </span>
                        </div>
                      </div>

                      <div className="font-mono text-[11px] text-sky-300 bg-slate-950/90 p-2.5 rounded-lg border border-slate-800 flex flex-wrap items-center gap-1.5">
                        {p.path_sequence?.map((node: string, nIdx: number) => (
                          <React.Fragment key={nIdx}>
                            <button
                              onClick={() => focusOnNode(node)}
                              className="hover:underline font-semibold"
                              style={{
                                color:
                                  node === startEntity
                                    ? '#34d399'
                                    : node === targetEntity
                                    ? '#f43f5e'
                                    : pathColor,
                              }}
                            >
                              {node}
                            </button>
                            {nIdx < p.path_sequence.length - 1 && (
                              <span className="text-slate-500">➔</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>

                      {p.intermediate_entities?.length > 0 && (
                        <p className="text-[11px] text-slate-400">
                          <strong className="text-slate-300">Bridge Tables:</strong> {p.intermediate_entities.join(', ')}
                        </p>
                      )}

                      <div className="border-t border-slate-800/80 pt-2 text-[11px] text-slate-300 space-y-1.5">
                        <p className="font-semibold text-slate-200">Join Recipe:</p>
                        <p className="text-[11px] text-slate-400 leading-relaxed">{p.join_summary}</p>

                        {p.ready_sql_template && (
                          <div className="pt-1">
                            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                              <span>SQL Template:</span>
                              <button
                                onClick={() => copySqlTemplate(p.ready_sql_template)}
                                className="flex items-center gap-1 text-sky-400 hover:text-sky-300"
                              >
                                {copiedTemplate ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                                <span>{copiedTemplate ? 'Copied' : 'Copy SQL'}</span>
                              </button>
                            </div>
                            <div className="font-mono text-[10px] text-indigo-300 bg-slate-950 p-2 rounded border border-slate-800 overflow-x-auto whitespace-pre-wrap">
                              {p.ready_sql_template}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-center text-xs text-slate-400">
                  No path found between {startEntity} and {targetEntity}.
                </div>
              )}
            </div>
          )}

          {/* Legend for 3 Edges & Multi-Path Highlights */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-2.5 shadow-sm">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Topology Graph Legend</h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2 text-sky-400">
                <span className="h-2 w-2 rounded-full bg-sky-400"></span>
                <span className="font-semibold">🐘 PostgreSQL Tables</span>
                <span className="text-[11px] text-slate-400 ml-auto">Relational</span>
              </div>
              <div className="flex items-center gap-2 text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                <span className="font-semibold">🍃 MongoDB Collections</span>
                <span className="text-[11px] text-slate-400 ml-auto">Documents</span>
              </div>
              <div className="flex items-center gap-2 text-purple-400">
                <span className="h-2 w-2 rounded-full bg-purple-400"></span>
                <span className="font-semibold">🟣 Views & Materialized Views</span>
                <span className="text-[11px] text-slate-400 ml-auto">Analytics</span>
              </div>
              <div className="border-t border-slate-800 pt-2 space-y-1.5">
                <div className="flex items-center gap-2 text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                  <span className="font-semibold">▶ Source Start Table</span>
                  <span className="text-[11px] text-slate-400 ml-auto">Origin</span>
                </div>
                <div className="flex items-center gap-2 text-pink-400">
                  <span className="h-2 w-2 rounded-full bg-pink-500"></span>
                  <span className="font-semibold">🏁 Target Destination Table</span>
                  <span className="text-[11px] text-slate-400 ml-auto">Goal</span>
                </div>
                <div className="flex items-center gap-2 text-amber-400">
                  <span className="h-2 w-2 rounded-full bg-amber-400"></span>
                  <span className="font-semibold">⚡ All Discovered Paths</span>
                  <span className="text-[11px] text-slate-400 ml-auto">Color Coded</span>
                </div>
                <div className="flex items-center gap-2 text-orange-400">
                  <span className="h-2 w-2 rounded-full bg-orange-400"></span>
                  <span className="font-semibold">🔗 Multi-Path Junctions</span>
                  <span className="text-[11px] text-slate-400 ml-auto">Bridge Nodes</span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Center: Graph Visualization Area */}
        <main className="flex-1 flex flex-col relative bg-slate-950 overflow-hidden">
          {/* Top Canvas Toolbar */}
          <div className="flex flex-wrap items-center justify-between border-b border-slate-800 bg-slate-900/70 px-6 py-2.5 z-10 gap-3 backdrop-blur-md">
            {/* System Filter Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSystemFilter('ALL')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  systemFilter === 'ALL'
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'border border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                All Entities ({topology.nodes?.length || 0})
              </button>
              <button
                onClick={() => setSystemFilter('PostgreSQL')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  systemFilter === 'PostgreSQL'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'border border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Database className="h-3.5 w-3.5 text-sky-400" />
                <span>PostgreSQL ({topology.nodes?.filter((n: any) => n.system === 'PostgreSQL').length || 0})</span>
              </button>
              <button
                onClick={() => setSystemFilter('MongoDB')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  systemFilter === 'MongoDB'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'border border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="h-3.5 w-3.5 text-emerald-400" />
                <span>MongoDB ({topology.nodes?.filter((n: any) => n.system === 'MongoDB').length || 0})</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-64">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search tables or columns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-1.5 pl-8 pr-3 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
              />
            </div>

            {/* View Mode & 3D Tools */}
            <div className="flex items-center gap-2">
              {viewMode === '3d' && (
                <>
                  <button
                    onClick={() => setIsAutoRotating(!isAutoRotating)}
                    title={isAutoRotating ? 'Pause 3D Orbit' : 'Auto-Rotate 3D Orbit'}
                    className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                      isAutoRotating
                        ? 'border-sky-500/50 bg-sky-950/40 text-sky-300'
                        : 'border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <RotateCw className={`h-3.5 w-3.5 ${isAutoRotating ? 'animate-spin' : ''}`} />
                    <span>Orbit</span>
                  </button>

                  <button
                    onClick={handleResetCamera}
                    title="Center & Reset 3D Camera"
                    className="flex items-center gap-1 rounded-lg border border-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-400 hover:text-white transition"
                  >
                    <Focus className="h-3.5 w-3.5" />
                    <span>Reset</span>
                  </button>
                </>
              )}

              {/* Mode Toggle */}
              <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-0.5">
                <button
                  onClick={() => setViewMode('3d')}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                    viewMode === '3d' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>3D Universe</span>
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                    viewMode === 'grid' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Grid className="h-3.5 w-3.5" />
                  <span>Schema Matrix</span>
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="m-4 flex items-center gap-3 rounded-xl border border-rose-800/80 bg-rose-950/40 p-4 text-xs text-rose-300 z-10">
              <ShieldAlert className="h-5 w-5 text-rose-400 shrink-0" />
              <div>
                <p className="font-semibold text-rose-200">Live Memgraph Database Disconnected</p>
                <p className="mt-0.5 text-rose-300/80">{error}</p>
              </div>
            </div>
          )}

          {/* 3D Force Graph Container */}
          {viewMode === '3d' && (
            <div className="relative flex-1 w-full h-full">
              <div ref={graphContainerRef} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing" />
              
              {/* Bottom Instructions Badge */}
              <div className="absolute bottom-4 left-6 z-10 pointer-events-none rounded-xl border border-slate-800 bg-slate-950/80 px-3.5 py-2 text-[11px] text-slate-400 backdrop-blur-sm shadow-lg flex items-center gap-4">
                <span>🖱️ <strong>Left Click + Drag:</strong> Rotate 3D</span>
                <span>🖱️ <strong>Right Click + Drag:</strong> Pan</span>
                <span>🔄 <strong>Scroll:</strong> Zoom In / Out</span>
                <span>🎯 <strong>Click Node:</strong> Inspect & Focus</span>
              </div>
            </div>
          )}

          {/* 2D Schema Matrix Grid Container */}
          {viewMode === 'grid' && (
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Displaying {filteredNodes.length} tables and collections</span>
                <span>Click any table to view schema details</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredNodes.map((node: any) => {
                  const isSelected = selectedNode?.name === node.name;
                  const pathsContainingNode = nodePathsMap.get(node.name) || [];
                  const isPath = pathsContainingNode.length > 0;
                  const isMultiPathBridge = pathsContainingNode.length > 1;
                  const isStart = node.name === startEntity;
                  const isTarget = node.name === targetEntity;
                  const isPg = node.system === 'PostgreSQL';

                  const cardBorderColor = isSelected
                    ? '#f43f5e'
                    : isStart
                    ? '#10b981'
                    : isTarget
                    ? '#ec4899'
                    : isMultiPathBridge
                    ? '#f59e0b'
                    : isPath
                    ? PATH_COLORS[pathsContainingNode[0] % PATH_COLORS.length]
                    : undefined;

                  return (
                    <div
                      key={node.name}
                      onClick={() => {
                        setSelectedNode(node);
                      }}
                      className={`rounded-xl border p-4 cursor-pointer transition-all duration-200 space-y-3 ${
                        isPath || isStart || isTarget
                          ? 'shadow-lg'
                          : isSelected
                          ? 'border-sky-500 bg-sky-950/30 shadow-md'
                          : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900'
                      }`}
                      style={
                        cardBorderColor
                          ? {
                              borderColor: cardBorderColor,
                              backgroundColor: `${cardBorderColor}12`,
                            }
                          : undefined
                      }
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{isPg ? '🐘' : '🍃'}</span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-sm text-white">{node.name}</h4>
                              {isStart && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  START
                                </span>
                              )}
                              {isTarget && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-500/30">
                                  TARGET
                                </span>
                              )}
                              {isPath && !isStart && !isTarget && (
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded border"
                                  style={{
                                    borderColor: `${cardBorderColor}60`,
                                    color: cardBorderColor,
                                    backgroundColor: `${cardBorderColor}20`,
                                  }}
                                >
                                  {isMultiPathBridge ? `⚡ ${pathsContainingNode.length} Paths` : `Path #${pathsContainingNode[0] + 1}`}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400">{node.system} • {node.type}</span>
                          </div>
                        </div>

                        {node.primary_key && (
                          <span className="font-mono text-[10px] text-emerald-300 bg-emerald-950/50 border border-emerald-800/40 px-2 py-0.5 rounded">
                            PK: {node.primary_key}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                        {node.description || 'Enterprise database entity'}
                      </p>

                      <div className="border-t border-slate-800 pt-2.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          Fields ({node.fields?.length || 0}):
                        </span>
                        <div className="flex flex-wrap gap-1.5 mt-1.5 max-h-24 overflow-y-auto">
                          {node.fields?.map((f: string, idx: number) => (
                            <span
                              key={idx}
                              className="font-mono text-[10px] bg-slate-950 text-slate-300 px-2 py-0.5 rounded border border-slate-800"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="pt-2 flex items-center justify-between border-t border-slate-800/60">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedNode(node);
                            setViewMode('3d');
                            setTimeout(() => focusOnNode(node.name), 200);
                          }}
                          className="flex items-center gap-1 text-[11px] font-semibold text-sky-400 hover:text-sky-300"
                        >
                          <Maximize2 className="h-3 w-3" />
                          <span>View in 3D</span>
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setStartEntity(node.name);
                            }}
                            className="text-[11px] text-slate-400 hover:text-white"
                          >
                            Set Source
                          </button>
                          <span className="text-slate-600">•</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setTargetEntity(node.name);
                            }}
                            className="text-[11px] text-slate-400 hover:text-white"
                          >
                            Set Target
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>

        {/* Right Sidebar: Selected Entity Details & Relations */}
        {selectedNode && (
          <aside className="w-84 border-l border-slate-800 bg-slate-900/80 p-5 overflow-y-auto space-y-5 shrink-0 z-10 backdrop-blur-md">
            <div>
              <div className="flex items-center gap-2">
                <div
                  className={`h-3.5 w-3.5 rounded-full ${
                    selectedNode.system === 'PostgreSQL' ? 'bg-sky-400' : 'bg-emerald-400'
                  }`}
                />
                <h3 className="text-base font-bold text-white tracking-tight">{selectedNode.name}</h3>
              </div>
              <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                {selectedNode.description || 'Database entity node'}
              </p>
            </div>

            <div className="space-y-2.5 rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 text-xs shadow-sm">
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Database Engine</span>
                <span className="font-semibold text-slate-200">{selectedNode.system}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Entity Type</span>
                <span className="font-semibold text-sky-400 uppercase text-[11px]">{selectedNode.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Primary Key</span>
                <span className="font-mono text-emerald-400 font-semibold">{selectedNode.primary_key || 'None'}</span>
              </div>
            </div>

            {/* Field Schema List */}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Columns & Fields ({selectedNode.fields?.length || 0})
              </h4>
              <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/90 p-2 space-y-1">
                {selectedNode.fields?.map((field: string, fIdx: number) => (
                  <div
                    key={fIdx}
                    className="flex items-center justify-between rounded px-2.5 py-1.5 font-mono text-[11px] text-slate-300 hover:bg-slate-900 transition"
                  >
                    <span>{field}</span>
                    {field === selectedNode.primary_key && (
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400 border border-emerald-500/30">
                        PRIMARY KEY
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Related Connections from Memgraph */}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Connected Join Edges
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {(topology.edges || [])
                  .filter((e: any) => e.source === selectedNode.name || e.target === selectedNode.name)
                  .map((edge: any, eIdx: number) => {
                    const isOutgoing = edge.source === selectedNode.name;
                    const otherEntity = isOutgoing ? edge.target : edge.source;
                    const isMust = edge.type === 'MUST_JOIN';
                    const isCond = edge.type === 'CONDITIONAL_JOIN';

                    return (
                      <div
                        key={eIdx}
                        onClick={() => focusOnNode(otherEntity)}
                        className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 text-xs space-y-1 cursor-pointer hover:border-slate-700 transition"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-slate-200 flex items-center gap-1">
                            <span>{isOutgoing ? '➔' : '⬅'}</span>
                            <span className="hover:underline text-sky-400">{otherEntity}</span>
                          </span>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                              isMust
                                ? 'bg-rose-950/60 text-rose-400 border border-rose-800/40'
                                : isCond
                                ? 'bg-amber-950/60 text-amber-400 border border-amber-800/40'
                                : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                            }`}
                          >
                            {edge.type}
                          </span>
                        </div>
                        <div className="font-mono text-[10px] text-slate-400">
                          {edge.from_field} = {edge.to_field}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Quick Set buttons for Path Finder */}
            <div className="pt-2 grid grid-cols-2 gap-2">
              <button
                onClick={() => setStartEntity(selectedNode.name)}
                className="rounded-lg border border-slate-700 bg-slate-800 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-700 transition"
              >
                Set as Source
              </button>
              <button
                onClick={() => setTargetEntity(selectedNode.name)}
                className="rounded-lg border border-slate-700 bg-slate-800 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-700 transition"
              >
                Set as Target
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
