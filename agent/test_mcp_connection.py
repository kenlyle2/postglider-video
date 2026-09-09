"""Smoke test: confirm the official mcp-clickhouse server (self-hosted, stdio)
connects to our ClickHouse Cloud service using the existing data-plane creds,
and that video_segments is queryable through it — not a raw HTTP client."""
import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

load_dotenv(Path(__file__).parent.parent / ".env.local")


async def main():
    env = {
        **os.environ,
        "CLICKHOUSE_HOST": os.environ["CLICKHOUSE_HOST"],
        "CLICKHOUSE_PORT": os.environ["CLICKHOUSE_PORT"],
        "CLICKHOUSE_USER": os.environ["CLICKHOUSE_USER"],
        "CLICKHOUSE_PASSWORD": os.environ["CLICKHOUSE_PASSWORD"],
        "CLICKHOUSE_SECURE": "true",
    }
    params = StdioServerParameters(command="mcp-clickhouse", args=[], env=env)
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = await session.list_tools()
            print("Tools exposed by mcp-clickhouse:")
            for t in tools.tools:
                print(f"  - {t.name}: {t.description[:80] if t.description else ''}")

            result = await session.call_tool(
                "run_query",
                {"query": "SELECT count(*) AS n FROM default.video_segments"},
            )
            print("\nrun_select_query result:")
            for c in result.content:
                print(" ", getattr(c, "text", c))


if __name__ == "__main__":
    asyncio.run(main())
