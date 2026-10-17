import os
import asyncio
import json
from typing import Any, Dict, List, Optional

import httpx
from mcp.server import Server
from mcp.server.stdio import stdio_server

# Basic MCP server that exposes backend/agent capabilities as tools via MCP.
# This lets LLM clients (e.g., via OpenRouter MCP) call your refactoring tools
# in a standard, secure way.
#
# Run (stdio mode):
#
#   cd <repository-root>
#   python -m agents.mcp_server
#
# Tools are thin wrappers around existing HTTP endpoints of the backend (8083)
# and the agents server (8091). Ensure both are running.

BACKEND_BASE = os.environ.get("BACKEND_BASE", "http://localhost:8083/api")
AGENTS_BASE = os.environ.get("AGENTS_BASE", "http://localhost:8091")

server = Server("refactai-mcp")


async def _get(path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.get(f"{BACKEND_BASE}{path}", params=params)
        r.raise_for_status()
        return r.json()


async def _post(path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=300) as client:
        r = await client.post(f"{BACKEND_BASE}{path}", json=payload)
        r.raise_for_status()
        return r.json()


async def _post_agents(path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=300) as client:
        r = await client.post(f"{AGENTS_BASE}{path}", json=payload)
        r.raise_for_status()
        return r.json()


@server.tool()
async def health() -> Dict[str, Any]:
    """
    Check health of backend and agent servers.
    """
    async with httpx.AsyncClient(timeout=10) as client:
        be = await client.get(f"{BACKEND_BASE}/health")
        try:
            ag = await client.get(f"{AGENTS_BASE}/agents/health")
            agents = ag.json()
        except Exception as e:
            agents = {"ok": False, "error": str(e)}
    return {"backend": be.json(), "agents": agents}


@server.tool()
async def list_workspaces() -> List[Dict[str, Any]]:
    """
    Return array of workspaces.
    """
    return await _get("/workspaces")


@server.tool()
async def list_files(workspaceId: str) -> List[Dict[str, Any]]:
    """
    List files in a workspace.
    """
    return await _get(f"/workspaces/{workspaceId}/files")


@server.tool()
async def read_file(workspaceId: str, filePath: str) -> Dict[str, Any]:
    """
    Read a file content from a workspace.
    """
    return await _get(f"/workspaces/{workspaceId}/files/content", {"filePath": filePath})


@server.tool()
async def write_file(workspaceId: str, filePath: str, content: str) -> Dict[str, Any]:
    """
    Write content to a file in the workspace using refactoring apply endpoint.
    """
    return await _post("/refactoring/apply", {"workspaceId": workspaceId, "filePath": filePath, "refactoredCode": content})


@server.tool()
async def analyze_file(workspaceId: str, filePath: str) -> Dict[str, Any]:
    """
    Run static analysis on a file.
    """
    return await _get(f"/workspaces/{workstation_id}/files/analysis", {"filePath": filePath})


@server.tool()
async def analyze_live(workspaceId: str, filePath: str, content: str) -> Dict[str, Any]:
    """
    Run enhanced analysis on provided content (without committing to disk).
    """
    return await _post("/workspace-enhanced-analysis/analyze-live", {"workspaceId": workspaceId, "filePath": filePath, "content": content})


@server.tool()
async def dependencies_file(workspaceId: str, filePath: str) -> Dict[str, Any]:
    """
    Get dependency info for a file in a workspace.
    """
    return await _get(f"/workspaces/{workspaceId}/dependencies/file", {"filePath": filePath})


@server.tool()
async def refactor_rename_method(workspaceId: str, filePath: str, className: str, methodName: str, newName: str) -> Dict[str, Any]:
    """
    Perform a safe method rename using backend's ripple refactoring.
    """
    payload = {"type": "RENAME_METHOD", "filePath": filePath, "className": className, "methodName": methodName, "oldName": methodName, "newName": newName}
    return await _post(f"/refactoring/workspaces/{workspaceId}/perform-refactoring", payload)


@server.tool()
async def refactor_rename_class(workspaceId: str, filePath: str, oldName: str, newName: str) -> Dict[str, Any]:
    """
    Perform a safe class rename using backend's ripple refactoring.
    """
    payload = {"type": "RENAME_CLASS", "filePath": filePath, "oldName": oldName, "newName": newName}
    return await _post(f"/refactoring/workspaces/{workspaceId}/perform-refactoring", payload)


@server.tool()
async def refactor_apply_patch(workspaceId: str, filePath: str, newContent: str) -> Dict[str, Any]:
    """
    Apply a full-file refactor patch (content replace) via backend apply.
    """
    return await _post("/refactoring/apply", {"workspaceId": workspaceId, "filePath": filePath, "refactoredCode": newContent})


@server.tool()
async def verify_compile(workspaceId: str) -> Dict[str, Any]:
    """
    Run backend compile/test verification in the workspace.
    """
    return await _post(f"/workspaces/{workspaceId}/verify/compile", {})


@server.tool()
async def memory_get(workspaceId: str, filePath: str) -> Dict[str, Any]:
    """
    Get agent memory for a file.
    """
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.get(f"{AGENTS_BASE}/agents/memory", params={"workspaceId": workspaceId, "filePath": filePath})
        r.raise_for_status()
        return r.json()


@server.tool()
async def memory_put(workspaceId: str, filePath: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Store metadata for a file in agent memory.
    """
    return await _post_agents("/agents/refactor-direct", {"workspaceId": workspaceId, "filePath": filePath, "content": data.get("content", ""), "smells": data.get("smells", []), "goals": data.get("goals", [])})


async def main() -> None:
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream)


if __name__ == "__main__":
    asyncio.run(main())








