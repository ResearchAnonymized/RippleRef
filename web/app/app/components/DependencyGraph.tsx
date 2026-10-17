'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Network, 
  GitBranch, 
  Code,
  Database,
  Layers,
  ArrowRight, 
  Circle,
  Square,
  Triangle,
  Hexagon,
  Zap,
  Target,
  AlertTriangle, 
  CheckCircle, 
  Info
} from 'lucide-react';

interface DependencyNode {
  id: string;
  name: string;
  type: 'class' | 'method' | 'field' | 'interface' | 'package';
  package: string;
  dependencies: string[];
  dependents: string[];
  complexity: number;
  linesOfCode: number;
  isModified: boolean;
  position?: { x: number; y: number };
}

interface DependencyGraphProps {
  nodes: DependencyNode[];
  selectedNode?: string;
  onNodeSelect?: (nodeId: string) => void;
  showImpact?: boolean;
  refactoringSteps?: any[];
}

export default function DependencyGraph({
  nodes,
  selectedNode,
  onNodeSelect,
  showImpact = false,
  refactoringSteps = []
}: DependencyGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Initialize node positions
  useEffect(() => {
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    const radius = Math.min(dimensions.width, dimensions.height) * 0.3;

    nodes.forEach((node, index) => {
      if (!node.position) {
        const angle = (2 * Math.PI * index) / nodes.length;
        node.position = {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle)
        };
      }
    });
  }, [nodes, dimensions]);

  // Draw the graph
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    // Draw connections
    nodes.forEach(node => {
      node.dependencies.forEach(depId => {
        const depNode = nodes.find(n => n.id === depId);
        if (depNode && node.position && depNode.position) {
          ctx.beginPath();
          ctx.moveTo(node.position.x, node.position.y);
          ctx.lineTo(depNode.position.x, depNode.position.y);
          ctx.strokeStyle = '#64748b';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });
    });

    // Draw nodes
    nodes.forEach(node => {
      if (!node.position) return;

      const isSelected = selectedNode === node.id;
      const isHovered = hoveredNode === node.id;
      const isModified = node.isModified;

      // Node background
      ctx.beginPath();
      ctx.arc(node.position.x, node.position.y, 30, 0, 2 * Math.PI);
      ctx.fillStyle = isSelected ? '#3b82f6' : isHovered ? '#6366f1' : isModified ? '#f59e0b' : '#374151';
      ctx.fill();

      // Node border
      ctx.strokeStyle = isSelected ? '#60a5fa' : isModified ? '#fbbf24' : '#6b7280';
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.stroke();

      // Node icon
      const iconSize = 16;
      const iconX = node.position.x - iconSize / 2;
      const iconY = node.position.y - iconSize / 2;

      ctx.fillStyle = '#ffffff';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Simple icon representation
      const icon = getNodeIcon(node.type);
      ctx.fillText(icon, node.position.x, node.position.y);

      // Node label
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(node.name, node.position.x, node.position.y + 40);
    });
  }, [nodes, selectedNode, hoveredNode, dimensions]);

  const getNodeIcon = (type: string) => {
    switch (type) {
      case 'class': return 'C';
      case 'interface': return 'I';
      case 'method': return 'M';
      case 'field': return 'F';
      case 'package': return 'P';
      default: return '?';
    }
  };

  const getNodeTypeIcon = (type: string) => {
    switch (type) {
      case 'class': return <Code className="w-4 h-4" />;
      case 'interface': return <Layers className="w-4 h-4" />;
      case 'method': return <Target className="w-4 h-4" />;
      case 'field': return <Database className="w-4 h-4" />;
      case 'package': return <GitBranch className="w-4 h-4" />;
      default: return <Circle className="w-4 h-4" />;
    }
  };

  const getComplexityColor = (complexity: number) => {
    if (complexity <= 3) return 'text-green-400';
    if (complexity <= 7) return 'text-yellow-400';
    return 'text-red-400';
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Find clicked node
    const clickedNode = nodes.find(node => {
      if (!node.position) return false;
      const distance = Math.sqrt(
        Math.pow(x - node.position.x, 2) + Math.pow(y - node.position.y, 2)
      );
      return distance <= 30;
    });

    if (clickedNode && onNodeSelect) {
      onNodeSelect(clickedNode.id);
    }
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Find hovered node
    const hovered = nodes.find(node => {
      if (!node.position) return false;
      const distance = Math.sqrt(
        Math.pow(x - node.position.x, 2) + Math.pow(y - node.position.y, 2)
      );
      return distance <= 30;
    });

    setHoveredNode(hovered?.id || null);
  };

      return (
    <div className="space-y-6">
      {/* Graph Visualization */}
      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center">
            <Network className="w-5 h-5 mr-2 text-blue-400" />
            Dependency Graph
          </h3>
          <div className="flex space-x-2">
            <button className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm">
              <Zap className="w-4 h-4 mr-1" />
              Auto Layout
            </button>
            <button className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm">
              <Target className="w-4 h-4 mr-1" />
              Focus
            </button>
          </div>
        </div>

        <div className="relative">
          <canvas
            ref={canvasRef}
            width={dimensions.width}
            height={dimensions.height}
            className="border border-slate-600 rounded-lg cursor-pointer"
            onClick={handleCanvasClick}
            onMouseMove={handleMouseMove}
          />
          
          {/* Legend */}
          <div className="absolute top-4 right-4 bg-slate-900/90 rounded-lg p-3 text-xs">
            <div className="text-white font-semibold mb-2">Legend</div>
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <span className="text-slate-300">Selected</span>
      </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                <span className="text-slate-300">Modified</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-slate-500 rounded-full"></div>
                <span className="text-slate-300">Normal</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Node Details */}
      {selectedNode && (
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          {(() => {
            const node = nodes.find(n => n.id === selectedNode);
            if (!node) return null;

  return (
              <div>
                <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center">
                    {getNodeTypeIcon(node.type)}
                    <span className="ml-2">{node.name}</span>
          </h3>
                  <div className="flex space-x-2">
                    {node.isModified && (
                      <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 rounded text-xs">
                        Modified
                      </span>
                    )}
                    <span className={`px-2 py-1 rounded text-xs ${getComplexityColor(node.complexity)}`}>
                      Complexity: {node.complexity}
                    </span>
            </div>
        </div>
        
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-white font-medium mb-3">Details</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Type:</span>
                        <span className="text-white capitalize">{node.type}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Package:</span>
                        <span className="text-white">{node.package}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Lines of Code:</span>
                        <span className="text-white">{node.linesOfCode}</span>
          </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Complexity:</span>
                        <span className={`${getComplexityColor(node.complexity)}`}>{node.complexity}</span>
          </div>
        </div>
      </div>

                  <div>
                    <h4 className="text-white font-medium mb-3">Dependencies</h4>
                    <div className="space-y-2">
                      {node.dependencies.length > 0 && (
                        <div>
                          <div className="text-xs text-slate-400 mb-1">Depends on:</div>
                          <div className="space-y-1">
                            {node.dependencies.map(depId => {
                              const depNode = nodes.find(n => n.id === depId);
                              return depNode ? (
                                <div key={depId} className="text-xs text-blue-400 bg-slate-700 rounded px-2 py-1">
                                  {depNode.name}
                                </div>
                              ) : null;
                            })}
            </div>
          </div>
                      )}
                      
                      {node.dependents.length > 0 && (
                        <div>
                          <div className="text-xs text-slate-400 mb-1">Used by:</div>
                          <div className="space-y-1">
                            {node.dependents.map(depId => {
                              const depNode = nodes.find(n => n.id === depId);
                              return depNode ? (
                                <div key={depId} className="text-xs text-green-400 bg-slate-700 rounded px-2 py-1">
                                  {depNode.name}
            </div>
                              ) : null;
                            })}
              </div>
            </div>
          )}
        </div>
                  </div>
          </div>
          </div>
            );
          })()}
        </div>
      )}

      {/* Impact Analysis */}
      {showImpact && refactoringSteps.length > 0 && (
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
            <Target className="w-5 h-5 mr-2 text-purple-400" />
            Refactoring Impact Analysis
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-700 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-400">
                {refactoringSteps.reduce((sum, step) => sum + step.impact.filesAffected, 0)}
              </div>
              <div className="text-sm text-slate-400">Files Affected</div>
            </div>
            <div className="bg-slate-700 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-400">
                {refactoringSteps.reduce((sum, step) => sum + step.impact.methodsChanged, 0)}
              </div>
              <div className="text-sm text-slate-400">Methods Changed</div>
            </div>
            <div className="bg-slate-700 rounded-lg p-4">
              <div className="text-2xl font-bold text-yellow-400">
                {refactoringSteps.filter(step => step.impact.riskLevel === 'high').length}
              </div>
              <div className="text-sm text-slate-400">High Risk Steps</div>
            </div>
          </div>

          <div className="mt-4">
            <h4 className="text-white font-medium mb-3">Refactoring Steps Impact</h4>
            <div className="space-y-2">
              {refactoringSteps.map((step, index) => (
                <div key={index} className="bg-slate-700 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-white font-medium">{step.title}</div>
                    <div className="flex space-x-2">
                      <span className={`px-2 py-1 rounded text-xs ${
                        step.impact.riskLevel === 'low' ? 'bg-green-500/20 text-green-400' :
                        step.impact.riskLevel === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {step.impact.riskLevel.toUpperCase()} RISK
                      </span>
                    </div>
                  </div>
                  <div className="text-sm text-slate-400 mt-1">
                    {step.impact.filesAffected} files, {step.impact.methodsChanged} methods
          </div>
          </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}