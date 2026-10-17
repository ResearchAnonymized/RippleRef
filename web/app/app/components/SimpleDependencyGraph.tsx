'use client';

import React, { useState, useMemo, useRef } from 'react';
import { Network, ArrowRight, ArrowLeft, FileText, Code, GitBranch } from 'lucide-react';

interface DependencyNode {
  id: string;
  name: string;
  type: 'file' | 'class' | 'method';
  size: number;
  x?: number;
  y?: number;
}

interface DependencyConnection {
  id: string;
  from: string;
  to: string;
  type: 'import' | 'method_call' | 'inheritance' | 'composition';
  method?: string;
  weight: number;
}

interface SimpleDependencyGraphProps {
  nodes: DependencyNode[];
  connections: DependencyConnection[];
  selectedFile?: string;
  onNodeClick?: (nodeId: string) => void;
}

const SimpleDependencyGraph: React.FC<SimpleDependencyGraphProps> = ({
  nodes,
  connections,
  selectedFile,
  onNodeClick
}) => {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(['import', 'method_call', 'inheritance', 'composition']));
  const [showSummary, setShowSummary] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // Calculate layout
  const layout = useMemo(() => {
    // Add null checks and default values
    const safeNodes = nodes || [];
    const safeConnections = connections || [];
    
    if (safeNodes.length === 0) return { nodes: [], connections: [] };

    const filteredConnections = safeConnections.filter(connection => activeFilters.has(connection.type));
    const connectedNodeIds = new Set<string>();
    
    filteredConnections.forEach(connection => {
      connectedNodeIds.add(connection.from);
      connectedNodeIds.add(connection.to);
    });
    
    const filteredNodes = safeNodes.filter(node => connectedNodeIds.has(node.id));

    if (filteredNodes.length === 0) return { nodes: [], connections: [] };

    // Find center node (selected file or most connected)
    const centerNode = selectedFile 
      ? filteredNodes.find(n => n.id === selectedFile)
      : filteredNodes.reduce((max, node) => {
          const connections = filteredConnections.filter(c => c.from === node.id || c.to === node.id).length;
          const maxConnections = filteredConnections.filter(c => c.from === max.id || c.to === max.id).length;
          return connections > maxConnections ? node : max;
        });

    if (!centerNode) return { nodes: [], connections: [] };

    // Create semicircle layout around center
    const centerX = 400;
    const centerY = 300;
    const radius = Math.max(150, filteredNodes.length * 20);
    
    const positionedNodes = filteredNodes.map((node, index) => {
      if (node.id === centerNode.id) {
        return { ...node, x: centerX, y: centerY };
      }
      
      const angle = (index / (filteredNodes.length - 1)) * Math.PI;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      
      return { ...node, x, y };
    });

    return { nodes: positionedNodes, connections: filteredConnections };
  }, [nodes, connections, selectedFile, activeFilters]);

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev * 1.2, 3));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev / 1.2, 0.3));
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPanOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoomLevel(prev => Math.max(0.3, Math.min(3, prev * delta)));
  };

  const exportAsPNG = () => {
    if (!svgRef.current) return;
    
    const svg = svgRef.current;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    canvas.width = 800;
    canvas.height = 600;
    
    img.onload = () => {
      ctx?.drawImage(img, 0, 0);
      const pngData = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = 'dependency-graph.png';
      link.href = pngData;
      link.click();
    };
    
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  const exportAsSVG = () => {
    if (!svgRef.current) return;
    
    const svg = svgRef.current;
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.download = 'dependency-graph.svg';
    link.href = url;
    link.click();
    
    URL.revokeObjectURL(url);
  };

  const toggleFilter = (filterType: string) => {
    const newFilters = new Set(activeFilters);
    if (newFilters.has(filterType)) {
      newFilters.delete(filterType);
    } else {
      newFilters.add(filterType);
    }
    setActiveFilters(newFilters);
  };

  const resetFilters = () => {
    setActiveFilters(new Set(['import', 'method_call', 'inheritance', 'composition']));
  };

  const getFilteredConnections = () => {
    return (connections || []).filter(connection => activeFilters.has(connection.type));
  };

  const getFilteredNodes = () => {
    const filteredConnections = getFilteredConnections();
    const connectedNodeIds = new Set<string>();
    
    filteredConnections.forEach(connection => {
      connectedNodeIds.add(connection.from);
      connectedNodeIds.add(connection.to);
    });
    
    return (nodes || []).filter(node => connectedNodeIds.has(node.id));
  };

  if (!nodes || nodes.length === 0) {
    return (
      <div className="w-full h-full bg-slate-900/50 rounded-lg border border-slate-700 p-4 flex items-center justify-center">
        <div className="text-center text-slate-400">
          <Network className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No dependency data available</p>
          <p className="text-sm mt-2">Upload a project to see dependency relationships</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-slate-900/50 rounded-lg border border-slate-700 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-lg font-semibold text-white flex items-center">
          <Network className="w-5 h-5 mr-2 text-blue-400" />
          Dependency Graph
        </h4>
        
        <div className="flex items-center gap-2">
          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
            <button
              onClick={handleZoomOut}
              className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition-colors"
              title="Zoom Out"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="px-2 text-xs text-slate-300 min-w-[3rem] text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition-colors"
              title="Zoom In"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={handleResetZoom}
              className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition-colors"
              title="Reset Zoom"
            >
              ⌂
            </button>
          </div>

          {/* Export Controls */}
          <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
            <button
              onClick={exportAsPNG}
              className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition-colors"
              title="Export as PNG"
            >
              📷
            </button>
            <button
              onClick={exportAsSVG}
              className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition-colors"
              title="Export as SVG"
            >
              📐
            </button>
          </div>

          {/* Summary Toggle */}
          <button
            onClick={() => setShowSummary(!showSummary)}
            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-300 hover:text-white transition-colors"
          >
            {showSummary ? 'Show Graph' : 'Show Summary'}
          </button>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-slate-300">Filter by dependency type:</span>
          <button
            onClick={resetFilters}
            className="px-2 py-1 bg-slate-600 hover:bg-slate-500 rounded text-xs"
            title="Show all types"
          >
            Show All
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => toggleFilter('import')}
            className={`px-3 py-1 rounded text-xs font-medium transition-all ${
              activeFilters.has('import')
                ? 'bg-green-600 text-white shadow-lg'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
            title="Toggle import dependencies"
          >
            📦 Import ({(connections || []).filter(c => c.type === 'import').length})
          </button>
          <button
            onClick={() => toggleFilter('method_call')}
            className={`px-3 py-1 rounded text-xs font-medium transition-all ${
              activeFilters.has('method_call')
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
            title="Toggle method call dependencies"
          >
            🔧 Method Call ({(connections || []).filter(c => c.type === 'method_call').length})
          </button>
          <button
            onClick={() => toggleFilter('inheritance')}
            className={`px-3 py-1 rounded text-xs font-medium transition-all ${
              activeFilters.has('inheritance')
                ? 'bg-amber-600 text-white shadow-lg'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
            title="Toggle inheritance dependencies"
          >
            🏗️ Inheritance ({(connections || []).filter(c => c.type === 'inheritance').length})
          </button>
          <button
            onClick={() => toggleFilter('composition')}
            className={`px-3 py-1 rounded text-xs font-medium transition-all ${
              activeFilters.has('composition')
                ? 'bg-purple-600 text-white shadow-lg'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
            title="Toggle composition dependencies"
          >
            🧩 Composition ({(connections || []).filter(c => c.type === 'composition').length})
          </button>
        </div>
      </div>

      {/* Graph or Summary */}
      {showSummary ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800/50 rounded-lg p-4">
              <h5 className="text-sm font-medium text-slate-300 mb-2">📊 Statistics</h5>
              <div className="space-y-1 text-xs text-slate-400">
                <div>Total Files: {(nodes || []).length}</div>
                <div>Total Dependencies: {(connections || []).length}</div>
                <div>Import Dependencies: {(connections || []).filter(c => c.type === 'import').length}</div>
                <div>Method Calls: {(connections || []).filter(c => c.type === 'method_call').length}</div>
                <div>Inheritance: {(connections || []).filter(c => c.type === 'inheritance').length}</div>
                <div>Composition: {(connections || []).filter(c => c.type === 'composition').length}</div>
              </div>
            </div>
            
            <div className="bg-slate-800/50 rounded-lg p-4">
              <h5 className="text-sm font-medium text-slate-300 mb-2">🔗 Most Connected</h5>
              <div className="space-y-1 text-xs text-slate-400">
                {(nodes || [])
                  .map(node => ({
                    ...node,
                    connections: (connections || []).filter(c => c.from === node.id || c.to === node.id).length
                  }))
                  .sort((a, b) => b.connections - a.connections)
                  .slice(0, 5)
                  .map(node => (
                    <div key={node.id} className="flex justify-between">
                      <span className="truncate">{node.name}</span>
                      <span className="text-blue-400">{node.connections}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative">
          {/* SVG Graph */}
          <svg
            ref={svgRef}
            width="100%"
            height="500"
            className="border border-slate-700 rounded-lg bg-slate-900/30"
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
              transformOrigin: 'center center'
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            {/* Definitions for arrow markers */}
            <defs>
              <marker
                id="arrowhead-import"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon
                  points="0 0, 10 3.5, 0 7"
                  fill="#10b981"
                />
              </marker>
              <marker
                id="arrowhead-method"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon
                  points="0 0, 10 3.5, 0 7"
                  fill="#3b82f6"
                />
              </marker>
              <marker
                id="arrowhead-inheritance"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon
                  points="0 0, 10 3.5, 0 7"
                  fill="#f59e0b"
                />
              </marker>
              <marker
                id="arrowhead-composition"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon
                  points="0 0, 10 3.5, 0 7"
                  fill="#8b5cf6"
                />
              </marker>
            </defs>

            {/* Connections */}
            {getFilteredConnections().map((connection, index) => {
              const fromNode = layout.nodes.find(n => n.id === connection.from);
              const toNode = layout.nodes.find(n => n.id === connection.to);
              
              if (!fromNode || !toNode || !fromNode.x || !fromNode.y || !toNode.x || !toNode.y) {
                return null;
              }

              const getConnectionColor = (type: string) => {
                switch (type) {
                  case 'import': return '#10b981';
                  case 'method_call': return '#3b82f6';
                  case 'inheritance': return '#f59e0b';
                  case 'composition': return '#8b5cf6';
                  default: return '#6b7280';
                }
              };

              const getMarkerId = (type: string) => {
                switch (type) {
                  case 'import': return 'arrowhead-import';
                  case 'method_call': return 'arrowhead-method';
                  case 'inheritance': return 'arrowhead-inheritance';
                  case 'composition': return 'arrowhead-composition';
                  default: return 'arrowhead-import';
                }
              };

              const getStrokeDash = (type: string) => {
                switch (type) {
                  case 'import': return '5,5';
                  case 'method_call': return 'none';
                  case 'inheritance': return '10,5';
                  case 'composition': return '2,3';
                  default: return 'none';
                }
              };

              return (
                <line
                  key={`${connection.from}-${connection.to}-${index}`}
                  x1={fromNode.x}
                  y1={fromNode.y}
                  x2={toNode.x}
                  y2={toNode.y}
                  stroke={getConnectionColor(connection.type)}
                  strokeWidth={Math.max(1, connection.weight)}
                  strokeDasharray={getStrokeDash(connection.type)}
                  markerEnd={`url(#${getMarkerId(connection.type)})`}
                  opacity={0.7}
                />
              );
            })}

            {/* Nodes */}
            {getFilteredNodes().map(node => {
              const layoutNode = layout.nodes.find(n => n.id === node.id);
              if (!layoutNode || !layoutNode.x || !layoutNode.y) return null;

              const getNodeColor = (type: string) => {
                switch (type) {
                  case 'file': return '#1e40af';
                  case 'class': return '#7c3aed';
                  case 'method': return '#dc2626';
                  default: return '#374151';
                }
              };

              const getNodeIcon = (type: string) => {
                switch (type) {
                  case 'file': return <FileText className="w-4 h-4" />;
                  case 'class': return <Code className="w-4 h-4" />;
                  case 'method': return <GitBranch className="w-4 h-4" />;
                  default: return <FileText className="w-4 h-4" />;
                }
              };

              const isSelected = selectedFile === node.id;
              const radius = Math.max(20, Math.min(40, node.size / 10));

              return (
                <g key={node.id}>
                  <circle
                    cx={layoutNode.x}
                    cy={layoutNode.y}
                    r={radius}
                    fill={getNodeColor(node.type)}
                    stroke={isSelected ? '#fbbf24' : '#4b5563'}
                    strokeWidth={isSelected ? 3 : 2}
                    className="cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => onNodeClick?.(node.id)}
                  />
                  <text
                    x={layoutNode.x}
                    y={layoutNode.y + 5}
                    textAnchor="middle"
                    className="text-xs fill-white pointer-events-none"
                    style={{ fontSize: '10px' }}
                  >
                    {node.name.length > 12 ? node.name.substring(0, 12) + '...' : node.name}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Legend */}
          <div className="absolute bottom-2 left-2 bg-slate-800/90 rounded p-3 text-xs">
            <div className="text-slate-300 font-medium mb-2">Active Filters:</div>
            <div className="space-y-1">
              {activeFilters.has('import') && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded"></div>
                  <span className="text-slate-300">Import</span>
                </div>
              )}
              {activeFilters.has('method_call') && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded"></div>
                  <span className="text-slate-300">Method Call</span>
                </div>
              )}
              {activeFilters.has('inheritance') && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-amber-500 rounded"></div>
                  <span className="text-slate-300">Inheritance</span>
                </div>
              )}
              {activeFilters.has('composition') && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-purple-500 rounded"></div>
                  <span className="text-slate-300">Composition</span>
                </div>
              )}
              {activeFilters.size === 0 && (
                <div className="text-slate-500 italic">No filters active</div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Instructions for zoom and pan */}
      {!showSummary && (
        <div className="mt-2 text-xs text-slate-400 text-center">
          💡 Use mouse wheel to zoom, drag to pan, click filter buttons to show specific dependency types
        </div>
      )}
    </div>
  );
};

export default SimpleDependencyGraph;
