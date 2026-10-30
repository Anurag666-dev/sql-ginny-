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
  Copy,
  Check,
  Maximize2
} from 'lucide-react';
import ForceGraph3D from '3d-force-graph';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// High-contrast enterprise color palette for distinct traversal paths on light canvas
const PATH_COLORS = [
  '#2563eb', // Royal Blue (Path 1)
  '#d97706', // Amber (Path 2)
  '#dc2626', // Crimson (Path 3)
  '#7c3aed', // Violet (Path 4)
  '#059669', // Emerald (Path 5)
  '#db2777', // Magenta (Path 6)
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
        max_hops: null,
      });
      setTraversalResult(res.data);
      setSelectedPathIndex('ALL');

      // Smoothly focus camera on start entity if in 3D mode
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
  const { nodePathsMap, edgePathsMap } = useMemo(() => {
    const nodeMap = new Map<string, number[]>();
    const edgeMap = new Map<string, number[]>();

    const allPaths: any[] = traversalResult?.paths || [];

    allPaths.forEach((pathObj: any, pIdx: number) => {
      const isActive = selectedPathIndex === 'ALL' || selectedPathIndex === pIdx;
      if (!isActive) return;

      const seq = pathObj?.path_sequence || [];
      seq.forEach((name: string) => {
        const existing = nodeMap.get(name) || [];
        if (!existing.includes(pIdx)) {
          existing.push(pIdx);
          nodeMap.set(name, existing);
        }
      });

      for (let i = 0; i < seq.length - 1; i++) {
        const k1 = `${seq[i]}->${seq[i + 1]}`;
        const k2 = `${seq[i + 1]}->${seq[i]}`;

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

  // Initialize and update Architectural 3D Force Graph (Light Studio Theme, CAD Geometry)
  useEffect(() => {
    if (viewMode !== '3d' || !graphContainerRef.current || !topology.nodes?.length) return;

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

    if (graphInstanceRef.current) {
      try {
        graphInstanceRef.current.pauseAnimation?.();
        const renderer = graphInstanceRef.current.renderer?.();
        renderer?.dispose?.();
        renderer?.forceContextLoss?.();
        graphInstanceRef.current._destructor?.();
      } catch { /* ignore cleanup error */ }
      if (graphContainerRef.current) {
        graphContainerRef.current.innerHTML = '';
      }
    }

    const container = graphContainerRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const Graph = (ForceGraph3D as any)()(container)
      .width(width)
      .height(height)
      .backgroundColor('#18181b') // High-contrast Dark Graphite Studio Canvas so 3D nodes, links & particles pop clearly
      .linkOpacity(0.85)
      .showNavInfo(false)
      .d3AlphaDecay(0.035)
      .d3VelocityDecay(0.42)
      .graphData(gData);

    // Custom Architectural 3D Node Object (CAD Prisms + Wireframe Edges + High-Visibility Labels)
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

      // High-Visibility Enterprise Color Coding on Dark Graphite Canvas
      let fillColor = isPg ? '#38bdf8' : '#10b981'; // Bright Cyan-Blue for SQL Tables, Emerald for Mongo Collections
      if (isView) fillColor = '#a855f7'; // Vivid Purple for Analytical Views
      if (isPath) {
        fillColor = isMultiPathBridge
          ? '#f59e0b'
          : PATH_COLORS[pathsContainingNode[0] % PATH_COLORS.length];
      }
      if (isStart) fillColor = '#10b981'; // Emerald for Source Node
      if (isTarget) fillColor = '#f43f5e'; // Rose-Red for Target Node
      if (isSelected) fillColor = '#facc15'; // Gold for Selected Inspector Node

      const size = isSelected ? 8.0 : isStart || isTarget ? 7.5 : isMultiPathBridge ? 7.0 : isPath ? 6.2 : 5.2;

      // Distinct 3D Architectural Geometry per Entity Type (NO planetary spheres/rings)
      let geometry: THREE.BufferGeometry;
      if (isView) {
        // Cuboid slab for Views / Materialized Views
        geometry = new THREE.BoxGeometry(size * 1.5, size * 0.9, size * 1.5);
      } else if (isPg) {
        // Hexagonal architectural prism for PostgreSQL Relational Tables
        geometry = new THREE.CylinderGeometry(size, size, size * 0.95, 6);
      } else {
        // Faceted Diamond / Octahedron for MongoDB Document Collections
        geometry = new THREE.OctahedronGeometry(size * 1.15, 0);
      }

      // Self-illuminated Phong Material so nodes are bright & clear from every angle
      const material = new THREE.MeshPhongMaterial({
        color: new THREE.Color(fillColor),
        emissive: new THREE.Color(fillColor),
        emissiveIntensity: isPath || isStart || isTarget || isSelected ? 0.75 : 0.45,
        shininess: 70,
        transparent: true,
        opacity: 0.95,
      });
      const mesh = new THREE.Mesh(geometry, material);
      group.add(mesh);

      // Crisp White CAD Wireframe Edge Outline on Every Node
      const edgesGeo = new THREE.EdgesGeometry(geometry);
      const edgesMat = new THREE.LineBasicMaterial({
        color: new THREE.Color('#ffffff'),
        transparent: true,
        opacity: isPath || isStart || isTarget || isSelected ? 0.95 : 0.65,
      });
      const wireframe = new THREE.LineSegments(edgesGeo, edgesMat);
      group.add(wireframe);

      // Architectural Bounding Frame for Source, Target, Bridge, or Selected Nodes
      if (isStart || isTarget || isSelected || isMultiPathBridge) {
        const frameSize = size * 2.15;
        const boxGeo = new THREE.BoxGeometry(frameSize, frameSize * 0.9, frameSize);
        const boxEdges = new THREE.EdgesGeometry(boxGeo);
        const boxLine = new THREE.LineSegments(
          boxEdges,
          new THREE.LineBasicMaterial({
            color: new THREE.Color(fillColor),
            transparent: true,
            opacity: 0.95,
          })
        );
        group.add(boxLine);
      }

      // High-Contrast Enterprise Label Plate (No Emojis)
      let rolePrefix = '';
      if (isStart) rolePrefix = '[SOURCE] ';
      else if (isTarget) rolePrefix = '[TARGET] ';
      else if (isMultiPathBridge) rolePrefix = `[BRIDGE • ${pathsContainingNode.length}] `;
      else if (isPath) rolePrefix = `[HOP] `;

      const labelText = `${rolePrefix}${node.name}`;
      const sprite = new SpriteText(labelText);

      const isHighlighted = isStart || isTarget || isSelected || isPath;
      sprite.color = isHighlighted ? '#0f172a' : '#f8fafc';
      sprite.textHeight = isHighlighted ? 4.5 : 3.8;
      sprite.fontWeight = '700';
      sprite.position.set(0, size + 6, 0);
      sprite.backgroundColor = isHighlighted ? '#ffffff' : 'rgba(24, 24, 27, 0.92)';
      sprite.borderColor = fillColor;
      sprite.borderWidth = isHighlighted ? 1.2 : 0.7;
      sprite.borderRadius = 4;
      sprite.padding = [2.5, 5];
      group.add(sprite);

      return group;
    });

    // Node Click Interaction
    Graph.onNodeClick((node: any) => {
      setSelectedNode(node);
      focusOnNode(node.name);
    });

    // High-Visibility Link Styling on Dark Graphite Canvas
    Graph.linkColor((link: any) => {
      const s = typeof link.source === 'object' ? link.source.id : link.source;
      const t = typeof link.target === 'object' ? link.target.id : link.target;
      const key = `${s}->${t}`;
      const edgePaths = edgePathsMap.get(key);
      if (edgePaths && edgePaths.length > 0) {
        if (edgePaths.length > 1) return '#facc15'; // Bright Gold for shared multi-path bridge edge
        return PATH_COLORS[edgePaths[0] % PATH_COLORS.length];
      }
      if (link.type === 'MUST_JOIN') return '#64748b'; // Visible Slate-500 for standard FK edges
      if (link.type === 'CONDITIONAL_JOIN') return '#f59e0b';
      return '#10b981';
    });

    Graph.linkWidth((link: any) => {
      const s = typeof link.source === 'object' ? link.source.id : link.source;
      const t = typeof link.target === 'object' ? link.target.id : link.target;
      const key = `${s}->${t}`;
      const edgePaths = edgePathsMap.get(key);
      if (edgePaths && edgePaths.length > 0) {
        return edgePaths.length > 1 ? 4.2 : 3.2;
      }
      return 1.4;
    });

    // Clean Data-Packet Directional Particles
    Graph.linkDirectionalParticles((link: any) => {
      const s = typeof link.source === 'object' ? link.source.id : link.source;
      const t = typeof link.target === 'object' ? link.target.id : link.target;
      const key = `${s}->${t}`;
      const edgePaths = edgePathsMap.get(key);
      if (edgePaths && edgePaths.length > 0) {
        return edgePaths.length > 1 ? 5 : 3;
      }
      return 1;
    });

    Graph.linkDirectionalParticleSpeed((link: any) => {
      const s = typeof link.source === 'object' ? link.source.id : link.source;
      const t = typeof link.target === 'object' ? link.target.id : link.target;
      const key = `${s}->${t}`;
      const edgePaths = edgePathsMap.get(key);
      return edgePaths && edgePaths.length > 0 ? 0.012 : 0.004;
    });

    Graph.linkDirectionalParticleWidth((link: any) => {
      const s = typeof link.source === 'object' ? link.source.id : link.source;
      const t = typeof link.target === 'object' ? link.target.id : link.target;
      const key = `${s}->${t}`;
      const edgePaths = edgePathsMap.get(key);
      return edgePaths && edgePaths.length > 0 ? 3.5 : 1.6;
    });

    Graph.linkDirectionalParticleColor((link: any) => {
      const s = typeof link.source === 'object' ? link.source.id : link.source;
      const t = typeof link.target === 'object' ? link.target.id : link.target;
      const key = `${s}->${t}`;
      const edgePaths = edgePathsMap.get(key);
      if (edgePaths && edgePaths.length > 0) {
        if (edgePaths.length > 1) return '#ffffff';
        return PATH_COLORS[edgePaths[0] % PATH_COLORS.length];
      }
      return '#94a3b8';
    });

    Graph.linkDirectionalArrowLength(4.5);
    Graph.linkDirectionalArrowRelPos(0.88);

    // Balanced D3 Force Simulation
    Graph.d3Force('charge')?.strength(-165);
    Graph.d3Force('link')?.distance(72);

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
      try {
        Graph.pauseAnimation?.();
        const renderer = Graph.renderer?.();
        renderer?.dispose?.();
        renderer?.forceContextLoss?.();
        Graph._destructor?.();
      } catch { /* ignore cleanup error */ }
    };
  }, [viewMode, topology, nodePathsMap, edgePathsMap, selectedNode, startEntity, targetEntity]);

  // Smooth Camera Focus on Node
  const focusOnNode = (nodeName: string) => {
    if (!graphInstanceRef.current) return;
    const gData = graphInstanceRef.current.graphData();
    const node = gData.nodes.find((n: any) => n.id === nodeName);
    if (node && node.x !== undefined) {
      const distance = 95;
      const distRatio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
      graphInstanceRef.current.cameraPosition(
        { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
        node,
        900
      );
    }
  };

  // Reset Camera View
  const handleResetCamera = () => {
    if (graphInstanceRef.current) {
      graphInstanceRef.current.zoomToFit(800, 50);
    }
  };

  // Controlled Turntable Orbit
  useEffect(() => {
    if (!graphInstanceRef.current) return;
    const controls = graphInstanceRef.current.controls?.();
    if (controls) {
      controls.autoRotate = isAutoRotating;
      controls.autoRotateSpeed = 0.65;
      controls.enableDamping = true;
      controls.dampingFactor = 0.12;
    }
  }, [isAutoRotating]);

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-50 text-slate-900 overflow-hidden font-sans">
      <Navbar />

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Control Panel: Path Finder (BFS & DFS) */}
        <aside className="w-96 border-r border-slate-200 bg-white p-5 overflow-y-auto space-y-6 shrink-0 z-10 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <Compass className="h-5 w-5 text-slate-800" />
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Join Path Explorer</h2>
            </div>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Traverse live tables & collections across PostgreSQL and MongoDB using unbounded Memgraph BFS/DFS algorithms.
            </p>
          </div>

          {/* Form */}
          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Source Entity (Start Node)</label>
              <select
                value={startEntity}
                onChange={(e) => setStartEntity(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-slate-900 focus:outline-none"
              >
                {topology.nodes.map((n: any) => (
                  <option key={n.name} value={n.name}>
                    [{n.system === 'PostgreSQL' ? 'PG' : 'MONGO'}] {n.name} ({n.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Target Entity (End Node)</label>
              <select
                value={targetEntity}
                onChange={(e) => setTargetEntity(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-slate-900 focus:outline-none"
              >
                {topology.nodes.map((n: any) => (
                  <option key={n.name} value={n.name}>
                    [{n.system === 'PostgreSQL' ? 'PG' : 'MONGO'}] {n.name} ({n.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Traversal Algorithm</label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAlgorithm('BFS')}
                  className={`rounded-lg py-2 text-xs font-semibold transition ${
                    algorithm === 'BFS'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  BFS (Shortest Path)
                </button>
                <button
                  type="button"
                  onClick={() => setAlgorithm('DFS')}
                  className={`rounded-lg py-2 text-xs font-semibold transition ${
                    algorithm === 'DFS'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  DFS (All Simple Paths)
                </button>
              </div>
            </div>

            <button
              onClick={runTraversal}
              disabled={traversing}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition"
            >
              {traversing ? 'Searching Memgraph...' : 'Compute Join Topology'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {/* Traversal Results Display */}
          {traversalResult && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Discovered Paths ({traversalResult.total_paths_found})
                </span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 border border-slate-300">
                  {traversalResult.algorithm}
                </span>
              </div>

              {/* Multi-Path Filter Pills */}
              {traversalResult.paths?.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <button
                    onClick={() => setSelectedPathIndex('ALL')}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                      selectedPathIndex === 'ALL'
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    All Paths ({traversalResult.paths.length})
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
                            ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
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
                      className={`rounded-xl border p-3.5 space-y-2.5 text-xs transition-all duration-200 border-l-4 ${
                        isSoleSelection
                          ? 'bg-white border-slate-300 shadow-md'
                          : isCurrentSelected
                          ? 'bg-white border-slate-200 hover:border-slate-300'
                          : 'opacity-45 bg-slate-50 border-slate-200'
                      }`}
                      style={{ borderLeftColor: pathColor }}
                    >
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-sm inline-block"
                            style={{ backgroundColor: pathColor }}
                          ></span>
                          <span className="text-slate-900 font-bold">Path #{idx + 1}</span>
                          <span className="text-slate-500 font-normal">({p.hops} hops)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() =>
                              setSelectedPathIndex(selectedPathIndex === idx ? 'ALL' : idx)
                            }
                            className={`text-[10px] px-2 py-0.5 rounded border font-semibold transition ${
                              isSoleSelection
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {isSoleSelection ? 'Isolated' : 'Isolate'}
                          </button>
                          <span className={p.is_direct ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                            {p.is_direct ? 'Direct' : `${p.intermediate_entities?.length} Bridge`}
                          </span>
                        </div>
                      </div>

                      <div className="font-mono text-[11px] bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex flex-wrap items-center gap-1.5">
                        {p.path_sequence?.map((node: string, nIdx: number) => (
                          <React.Fragment key={nIdx}>
                            <button
                              onClick={() => focusOnNode(node)}
                              className="hover:underline font-bold"
                              style={{
                                color:
                                  node === startEntity
                                    ? '#059669'
                                    : node === targetEntity
                                    ? '#4f46e5'
                                    : pathColor,
                              }}
                            >
                              {node}
                            </button>
                            {nIdx < p.path_sequence.length - 1 && (
                              <span className="text-slate-400">➔</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>

                      {p.intermediate_entities?.length > 0 && (
                        <p className="text-[11px] text-slate-600">
                          <strong className="text-slate-800">Bridge Entities:</strong> {p.intermediate_entities.join(', ')}
                        </p>
                      )}

                      <div className="border-t border-slate-200 pt-2 text-[11px] text-slate-600 space-y-1.5">
                        <p className="font-semibold text-slate-800">Join Specification:</p>
                        <p className="text-[11px] text-slate-600 leading-relaxed">{p.join_summary}</p>

                        {p.ready_sql_template && (
                          <div className="pt-1">
                            <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                              <span className="font-semibold uppercase">SQL Join Template</span>
                              <button
                                onClick={() => copySqlTemplate(p.ready_sql_template)}
                                className="flex items-center gap-1 text-slate-700 hover:text-slate-900 font-semibold"
                              >
                                {copiedTemplate ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                                <span>{copiedTemplate ? 'Copied' : 'Copy SQL'}</span>
                              </button>
                            </div>
                            <div className="font-mono text-[10px] text-slate-800 bg-slate-50 p-2 rounded border border-slate-200 overflow-x-auto whitespace-pre-wrap">
                              {p.ready_sql_template}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                  No relational path found between {startEntity} and {targetEntity}.
                </div>
              )}
            </div>
          )}

          {/* Architectural Legend */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2.5">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">3D CAD Topology Legend</h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2 text-slate-800">
                <span className="h-2.5 w-2.5 rounded-sm bg-slate-900"></span>
                <span className="font-semibold">Hexagonal Prism — PostgreSQL</span>
                <span className="text-[11px] text-slate-500 ml-auto">SQL Table</span>
              </div>
              <div className="flex items-center gap-2 text-emerald-700">
                <span className="h-2.5 w-2.5 rotate-45 bg-emerald-600"></span>
                <span className="font-semibold">Octahedron — MongoDB</span>
                <span className="text-[11px] text-slate-500 ml-auto">Document</span>
              </div>
              <div className="flex items-center gap-2 text-indigo-700">
                <span className="h-2.5 w-2.5 rounded-sm bg-indigo-600"></span>
                <span className="font-semibold">Cuboid Slab — Analytical View</span>
                <span className="text-[11px] text-slate-500 ml-auto">View / MV</span>
              </div>
              <div className="border-t border-slate-200 pt-2 space-y-1.5">
                <div className="flex items-center gap-2 text-emerald-700">
                  <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-600 text-white rounded">SOURCE</span>
                  <span className="font-medium text-slate-700">Origin Entity</span>
                </div>
                <div className="flex items-center gap-2 text-indigo-700">
                  <span className="px-1.5 py-0.5 text-[9px] font-bold bg-indigo-600 text-white rounded">TARGET</span>
                  <span className="font-medium text-slate-700">Destination Entity</span>
                </div>
                <div className="flex items-center gap-2 text-amber-700">
                  <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-600 text-white rounded">BRIDGE</span>
                  <span className="font-medium text-slate-700">Shared Multi-Path Node</span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Center: Graph Visualization Area */}
        <main className="flex-1 flex flex-col relative bg-slate-50 overflow-hidden">
          {/* Top Canvas Toolbar */}
          <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-white px-6 py-2.5 z-10 gap-3 shadow-sm">
            {/* System Filter Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSystemFilter('ALL')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  systemFilter === 'ALL'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                All Entities ({topology.nodes?.length || 0})
              </button>
              <button
                onClick={() => setSystemFilter('PostgreSQL')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  systemFilter === 'PostgreSQL'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Database className="h-3.5 w-3.5" />
                <span>PostgreSQL ({topology.nodes?.filter((n: any) => n.system === 'PostgreSQL').length || 0})</span>
              </button>
              <button
                onClick={() => setSystemFilter('MongoDB')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  systemFilter === 'MongoDB'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>MongoDB ({topology.nodes?.filter((n: any) => n.system === 'MongoDB').length || 0})</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-64">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Filter tables or columns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none"
              />
            </div>

            {/* View Mode & 3D Tools */}
            <div className="flex items-center gap-2">
              {viewMode === '3d' && (
                <>
                  <button
                    onClick={() => setIsAutoRotating(!isAutoRotating)}
                    title={isAutoRotating ? 'Stop Turntable Rotation' : 'Start Slow Turntable Rotation'}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                      isAutoRotating
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <RotateCw className={`h-3.5 w-3.5 ${isAutoRotating ? 'animate-spin' : ''}`} />
                    <span>Turntable</span>
                  </button>

                  <button
                    onClick={handleResetCamera}
                    title="Fit Full Topology to Screen"
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                  >
                    <Focus className="h-3.5 w-3.5" />
                    <span>Fit View</span>
                  </button>
                </>
              )}

              {/* Mode Toggle */}
              <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
                <button
                  onClick={() => setViewMode('3d')}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                    viewMode === '3d' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>3D Topology</span>
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                    viewMode === 'grid' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Grid className="h-3.5 w-3.5" />
                  <span>Schema Matrix</span>
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="m-4 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700 z-10">
              <ShieldAlert className="h-5 w-5 text-rose-600 shrink-0" />
              <div>
                <p className="font-semibold text-rose-900">Live Memgraph Database Disconnected</p>
                <p className="mt-0.5 text-rose-700">{error}</p>
              </div>
            </div>
          )}

          {/* 3D Force Graph Container */}
          {viewMode === '3d' && (
            <div className="relative flex-1 w-full h-full">
              <div ref={graphContainerRef} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing" />

              {/* Bottom Controls Bar */}
              <div className="absolute bottom-4 left-6 z-10 pointer-events-none rounded-xl border border-slate-200 bg-white/90 px-4 py-2 text-[11px] text-slate-600 backdrop-blur-sm shadow-sm flex items-center gap-5">
                <span><strong>Left Drag:</strong> Orbit 3D</span>
                <span><strong>Right Drag:</strong> Pan</span>
                <span><strong>Scroll:</strong> Zoom</span>
                <span><strong>Click Node:</strong> Inspect Schema</span>
              </div>
            </div>
          )}

          {/* 2D Schema Matrix Grid Container */}
          {viewMode === 'grid' && (
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Displaying {filteredNodes.length} tables and collections</span>
                <span>Click any card to inspect schema details</span>
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

                  return (
                    <div
                      key={node.name}
                      onClick={() => setSelectedNode(node)}
                      className={`rounded-xl border p-4 cursor-pointer transition-all duration-200 space-y-3 bg-white ${
                        isSelected
                          ? 'border-slate-900 ring-1 ring-slate-900 shadow-md'
                          : isStart
                          ? 'border-emerald-500 shadow-sm'
                          : isTarget
                          ? 'border-indigo-500 shadow-sm'
                          : isPath
                          ? 'border-amber-500 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isPg
                                ? 'bg-slate-100 text-slate-800 border border-slate-300'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {isPg ? 'PG' : 'MONGO'}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-sm text-slate-900">{node.name}</h4>
                              {isStart && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-600 text-white">
                                  SOURCE
                                </span>
                              )}
                              {isTarget && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-600 text-white">
                                  TARGET
                                </span>
                              )}
                              {isPath && !isStart && !isTarget && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                                  {isMultiPathBridge ? `BRIDGE (${pathsContainingNode.length})` : `PATH #${pathsContainingNode[0] + 1}`}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-500">{node.system} • {node.type}</span>
                          </div>
                        </div>

                        {node.primary_key && (
                          <span className="font-mono text-[10px] text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded font-semibold">
                            PK: {node.primary_key}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                        {node.description || 'Enterprise database entity'}
                      </p>

                      <div className="border-t border-slate-100 pt-2.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          Columns ({node.fields?.length || 0}):
                        </span>
                        <div className="flex flex-wrap gap-1.5 mt-1.5 max-h-24 overflow-y-auto">
                          {node.fields?.map((f: string, idx: number) => (
                            <span
                              key={idx}
                              className="font-mono text-[10px] bg-slate-50 text-slate-700 px-2 py-0.5 rounded border border-slate-200"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedNode(node);
                            setViewMode('3d');
                            setTimeout(() => focusOnNode(node.name), 200);
                          }}
                          className="flex items-center gap-1 text-[11px] font-semibold text-slate-800 hover:underline"
                        >
                          <Maximize2 className="h-3 w-3" />
                          <span>Focus in 3D</span>
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setStartEntity(node.name);
                            }}
                            className="text-[11px] font-medium text-slate-500 hover:text-slate-900"
                          >
                            Set Source
                          </button>
                          <span className="text-slate-300">•</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setTargetEntity(node.name);
                            }}
                            className="text-[11px] font-medium text-slate-500 hover:text-slate-900"
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
          <aside className="w-84 border-l border-slate-200 bg-white p-5 overflow-y-auto space-y-5 shrink-0 z-10 shadow-sm">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    selectedNode.system === 'PostgreSQL'
                      ? 'bg-slate-900 text-white'
                      : 'bg-emerald-600 text-white'
                  }`}
                >
                  {selectedNode.system === 'PostgreSQL' ? 'PG' : 'MONGO'}
                </span>
                <h3 className="text-base font-bold text-slate-900 tracking-tight">{selectedNode.name}</h3>
              </div>
              <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                {selectedNode.description || 'Database entity node'}
              </p>
            </div>

            <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500">Database Engine</span>
                <span className="font-semibold text-slate-900">{selectedNode.system}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500">Entity Type</span>
                <span className="font-semibold text-slate-800 uppercase text-[11px]">{selectedNode.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Primary Key</span>
                <span className="font-mono text-emerald-700 font-bold">{selectedNode.primary_key || 'None'}</span>
              </div>
            </div>

            {/* Field Schema List */}
            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                Columns & Fields ({selectedNode.fields?.length || 0})
              </h4>
              <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2 space-y-1">
                {selectedNode.fields?.map((field: string, fIdx: number) => (
                  <div
                    key={fIdx}
                    className="flex items-center justify-between rounded px-2.5 py-1.5 font-mono text-[11px] text-slate-800 hover:bg-white transition"
                  >
                    <span>{field}</span>
                    {field === selectedNode.primary_key && (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800 border border-emerald-300">
                        PK
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Related Connections from Memgraph */}
            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
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
                        className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs space-y-1 cursor-pointer hover:border-slate-400 hover:bg-white transition"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-slate-800 flex items-center gap-1">
                            <span>{isOutgoing ? '➔' : '⬅'}</span>
                            <span className="hover:underline text-slate-900 font-bold">{otherEntity}</span>
                          </span>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                              isMust
                                ? 'bg-slate-100 text-slate-800 border-slate-300'
                                : isCond
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            }`}
                          >
                            {edge.type}
                          </span>
                        </div>
                        <div className="font-mono text-[10px] text-slate-500">
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
                className="rounded-lg border border-slate-300 bg-white py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
              >
                Set as Source
              </button>
              <button
                onClick={() => setTargetEntity(selectedNode.name)}
                className="rounded-lg border border-slate-300 bg-white py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
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
