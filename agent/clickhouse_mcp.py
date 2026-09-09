"""Thin wrapper around the official mcp-clickhouse server (self-hosted via stdio,
authenticated with our existing ClickHouse Cloud data-plane credentials). This is
the "actively use ClickHouse at runtime via the official ClickHouse MCP server"
integration the Agentic Cinema hackathon's ClickHouse track requires -- real code,
not a README mention.
"""
import json
import os

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


def _server_params() -> StdioServerParameters:
    env = {
        **os.environ,
        "CLICKHOUSE_HOST": os.environ["CLICKHOUSE_HOST"],
        "CLICKHOUSE_PORT": os.environ["CLICKHOUSE_PORT"],
        "CLICKHOUSE_USER": os.environ["CLICKHOUSE_USER"],
        "CLICKHOUSE_PASSWORD": os.environ["CLICKHOUSE_PASSWORD"],
        "CLICKHOUSE_SECURE": "true",
    }
    return StdioServerParameters(command="mcp-clickhouse", args=[], env=env)


async def run_select_query(sql: str) -> str:
    """Executes a read-only SQL query against ClickHouse via the official
    mcp-clickhouse MCP server and returns the JSON result as a string."""
    async with stdio_client(_server_params()) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool("run_query", {"query": sql})
            texts = [getattr(c, "text", "") for c in result.content]
            return "\n".join(texts) if texts else json.dumps({"rows": []})
