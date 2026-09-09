"""PostGlider Video Archive Agent -- Agentic Cinema hackathon entry.

A Gemini agent (google-genai, function-calling) that answers questions about a
creator's video back-catalog by querying a ClickHouse-indexed transcript table
*at runtime* through the official ClickHouse MCP server (self-hosted
mcp-clickhouse, connected to our ClickHouse Cloud service). Every answer cites
the real source video + timestamp -- it never invents a quote.
"""
import asyncio
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from google import genai
from google.genai import types
from pydantic import BaseModel

from clickhouse_mcp import run_select_query

load_dotenv(Path(__file__).parent.parent / ".env.local")

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
MODEL = "gemini-3.8-flash"

QUERY_FN = types.FunctionDeclaration(
    name="query_video_archive",
    description=(
        "Run a read-only SQL SELECT against the `default.video_segments` "
        "table -- real transcript segments from a creator's YouTube video "
        "back-catalog, indexed in ClickHouse. Columns: video_id, channel "
        "(e.g. 'therawadvantage' or 'johannasrawfoods'), title, url, "
        "start_seconds, text. Use ILIKE for keyword matching (case-"
        "insensitive substring). For a compilation request, cast a wide net: OR "
        "together short single-word/two-word stems (e.g. '%knife%' OR '%chop%' OR "
        "'%slice%' OR '%dice%' OR '%mince%'), not long compound phrases like "
        "'%chopping technique%' -- compound phrases under-match real, casual speech "
        "and will starve you of material. Always LIMIT results (<=40)."
    ),
    parameters={
        "type": "object",
        "properties": {
            "sql": {
                "type": "string",
                "description": "A single read-only SELECT statement.",
            }
        },
        "required": ["sql"],
    },
)

SCENE_SCHEMA = {
    "type": "object",
    "properties": {
        "order": {"type": "integer"},
        "video_id": {"type": "string"},
        "video_title": {"type": "string"},
        "url": {"type": "string", "description": "Deep link: {url}&t={start_seconds}s"},
        "start_seconds": {"type": "number"},
        "trim_seconds": {"type": "number", "description": "Suggested clip length, ~8-15s."},
        "quote": {"type": "string", "description": "Verbatim quote from the `text` column."},
        "reason": {"type": "string", "description": "Why this scene sits at this arc position."},
        "transition_to_next": {
            "type": "string",
            "enum": ["hard cut", "cross-dissolve", "text card", "none (last scene)"],
        },
        "transition_reason": {"type": "string"},
    },
    "required": [
        "order", "video_id", "video_title", "url", "start_seconds", "trim_seconds",
        "quote", "reason", "transition_to_next", "transition_reason",
    ],
}

PRESENT_ARC_FN = types.FunctionDeclaration(
    name="present_arc",
    description=(
        "Finalize a compilation request by presenting the proposed narrative arc as "
        "structured scenes (never as prose) so the UI can render an editable storyboard. "
        "Call this exactly once, as your last action, when you have enough real material."
    ),
    parameters={
        "type": "object",
        "properties": {
            "arc_summary": {"type": "string", "description": "One-line summary of the overall arc."},
            "scenes": {"type": "array", "items": SCENE_SCHEMA},
            "insufficient_material_note": {
                "type": "string",
                "description": "Set ONLY if there isn't enough real material for a coherent arc -- "
                "explain honestly instead of forcing a weak structure. Leave scenes empty if so.",
            },
        },
        "required": ["arc_summary", "scenes"],
    },
)

QUERY_TOOL = types.Tool(function_declarations=[QUERY_FN])
COMPILATION_TOOL = types.Tool(function_declarations=[QUERY_FN, PRESENT_ARC_FN])

SYSTEM_INSTRUCTION = """You are the Archive Assistant for a video creator's own back-catalog.
You have a query_video_archive tool, which runs SQL against a ClickHouse table of real
transcript segments. Always use the tool to find real quotes before answering -- never
invent a quote, a video title, or a timestamp.

TWO MODES:

1. Plain question ("what has Chris said about X?") -- answer directly:
   - Quote the creator's actual words (verbatim from the `text` column).
   - Cite the source: video title + a deep link built as `{url}&t={start_seconds}s`.
   - If nothing matches, say so plainly -- do not guess.

2. Compilation request ("build/compile/stitch a video about X", "make a reel on X") --
   query broadly for every segment touching the theme, then act as an editor, not just a
   search engine: propose a NARRATIVE ARC, not a topic dump. Real segments dumped in
   whatever order they were found is not a compilation -- sequence them so one clip's
   ending sets up the next clip's premise. A strong arc usually moves:
     context/setup -> core technique -> edge case or troubleshooting -> practical
     payoff (recipe/result) -> bonus tip.
   Example, for an "avocado ripeness" theme: (1) "here are 3 different kinds of avocados"
   [establishes context] -> (2) "here's how to tell if each type is ripe" [the core
   technique] -> (3) "how to adjust if you have to serve one a day early" [edge case] ->
   (4) "my favorite guacamole recipe" [the payoff -- what it's all for] -> (5) "getting one
   more day out of an avocado using citrus juice" [bonus tip, strong closer]. Notice the
   arc, not just the topic, is what makes it a compilation.

   Once you have real material, call present_arc EXACTLY ONCE as your final action -- do not
   also write the arc out as prose, the UI renders present_arc's structured scenes directly.
   For each scene give: order, video_id, video_title, url (deep link: {url}&t={start_seconds}s),
   start_seconds, a suggested trim_seconds (~8-15s, adjusted to the segment's own natural
   sentence boundary -- never mid-word), the verbatim quote, a one-line reason it belongs at
   this position (not just "it's about X"), and a transition_to_next (hard cut for a
   technique-to-technique beat, cross-dissolve when jumping context/time, text card when
   pivoting from technique to payoff, "none (last scene)" for the final one) with a
   transition_reason.

   If the available segments don't support a real arc (e.g. only 2 near-duplicate clips),
   call present_arc with an empty scenes list and fill insufficient_material_note honestly
   rather than forcing a weak structure.

EFFICIENCY (applies to both modes): run ONE broad query first. Only run a second query if
the first came back with too few relevant rows (<10) to work with, or the user named a
specific channel/creator you need to filter to. Do NOT: re-run a count-only query after
you already have the real rows in hand, re-fetch the same theme again just with a
different ORDER BY, or pull a narrow timestamp-context window around a quote unless it is
genuinely too ambiguous to use as-is. You should rarely need more than 2 tool calls total.
If you still lack enough material after 2 queries, say so honestly (per the paragraph
above) rather than continuing to search indefinitely -- an honest "not enough material"
beats burning your entire turn budget on redundant re-verification and returning nothing.
"""


COMPILATION_TRIGGERS = (
    "compile", "stitch", "assemble", "build a video", "build me a video",
    "make a video", "make a reel", "put together a video", "edit a video",
)


def _is_compilation_request(question: str) -> bool:
    q = question.lower()
    return any(trigger in q for trigger in COMPILATION_TRIGGERS)


def _row_count(mcp_result_text: str) -> str:
    """Best-effort extraction of a row count from mcp-clickhouse's JSON result text,
    for a human-readable status line -- falls back gracefully if the shape changes."""
    try:
        parsed = json.loads(mcp_result_text)
        rows = parsed.get("rows")
        if isinstance(rows, list):
            return f"{len(rows)} row{'s' if len(rows) != 1 else ''}"
    except Exception:
        pass
    return "a result"


async def ask_agent_stream(question: str):
    """Async generator yielding real progress events as the agent works, then a
    final event. Event shapes: {"type": "status", "text": ...},
    {"type": "final", "answer": ..., "sql": ...} (plain Q&A), and
    {"type": "arc", "arc_summary": ..., "scenes": [...], "note": ...} (compilation)."""
    last_sql = None
    original_question = question
    compiling = _is_compilation_request(question)
    if compiling:
        yield {"type": "status", "text": "Compilation request detected -- planning a narrative arc, not just a search."}
        question = (
            f"{question}\n\n"
            "[This is a COMPILATION request -- you MUST use Mode 2 from your instructions: "
            "query broadly, then call present_arc exactly once with structured scenes. "
            "Do NOT respond with prose.]"
        )
    else:
        yield {"type": "status", "text": f'Looking into: "{original_question}"'}

    tools = [COMPILATION_TOOL if compiling else QUERY_TOOL]
    contents = [types.Content(role="user", parts=[types.Part(text=question)])]
    for step in range(8):  # bounded tool-call loop -- 3.8-flash is more deliberate, often
        # does a broad query then a narrower follow-up before finalizing; give it room
        yield {"type": "status", "text": "Thinking..." if step == 0 else "Reviewing results, deciding next step..."}
        response = client.models.generate_content(
            model=MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                tools=tools,
            ),
        )
        candidate = response.candidates[0]
        contents.append(candidate.content)

        function_calls = [
            part.function_call for part in candidate.content.parts if part.function_call
        ]
        if not function_calls:
            yield {"type": "final", "answer": response.text, "sql": last_sql}
            return

        present_call = next((fc for fc in function_calls if fc.name == "present_arc"), None)
        if present_call is not None:
            args = present_call.args
            yield {
                "type": "arc",
                "arc_summary": args.get("arc_summary", ""),
                "scenes": args.get("scenes", []),
                "note": args.get("insufficient_material_note"),
            }
            return

        parts = []
        for fc in function_calls:
            sql = fc.args.get("sql", "")
            last_sql = sql
            yield {"type": "status", "text": f"Querying ClickHouse (via mcp-clickhouse): {sql}"}
            result = await run_select_query(sql)
            yield {"type": "status", "text": f"-> got {_row_count(result)} back."}
            parts.append(
                types.Part(
                    function_response=types.FunctionResponse(
                        name=fc.name, response={"result": result}
                    )
                )
            )
        contents.append(types.Content(role="user", parts=parts))

    yield {"type": "final", "answer": "Sorry, I couldn't find an answer in time.", "sql": last_sql}


async def ask_agent(question: str) -> dict:
    async for event in ask_agent_stream(question):
        if event["type"] in ("final", "arc"):
            return event
    return {"type": "final", "answer": "Sorry, I couldn't find an answer in time.", "sql": None}


REFINE_SCHEMA = {
    "type": "object",
    "properties": {
        "arc_summary": {"type": "string"},
        "scenes": {"type": "array", "items": SCENE_SCHEMA},
    },
    "required": ["arc_summary", "scenes"],
}


async def refine_arc(arc_summary: str, scenes: list, user_note: str = "") -> dict:
    """A human has already curated the scene list (reordered and/or removed scenes).
    Ask Gemini for a coherence-only pass over transitions/reasons given the NEW order --
    no DB re-query needed, the quotes/timestamps are already real and human-approved."""
    prompt = f"""A human editor has curated this video compilation's scene order (they may have
removed scenes or reordered them from your original proposal). Re-check ONLY the arc's
coherence given this final order: update `reason` and `transition_to_next`/`transition_reason`
for each scene so they reflect this actual sequence (don't reference a scene that isn't here
anymore), and write a fresh one-line arc_summary. Do NOT invent new scenes, change any quote,
url, start_seconds, or video_id -- those are real and already fixed by the human.
{f"Editor's note: {user_note}" if user_note else ""}

Current order:
{json.dumps({"arc_summary": arc_summary, "scenes": scenes}, indent=2)}"""

    response = client.models.generate_content(
        model=MODEL,
        contents=[types.Content(role="user", parts=[types.Part(text=prompt)])],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=REFINE_SCHEMA,
        ),
    )
    return json.loads(response.text)


app = FastAPI()


class AskBody(BaseModel):
    question: str


class RefineBody(BaseModel):
    arc_summary: str
    scenes: list
    note: str = ""


@app.post("/api/ask")
async def ask(body: AskBody):
    result = await ask_agent(body.question)
    return JSONResponse(result)


@app.post("/api/refine")
async def refine(body: RefineBody):
    result = await refine_arc(body.arc_summary, body.scenes, body.note)
    return JSONResponse(result)


@app.post("/api/ask/stream")
async def ask_stream(body: AskBody):
    async def event_source():
        async for event in ask_agent_stream(body.question):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/", response_class=HTMLResponse)
async def index():
    return Path(__file__).with_name("index.html").read_text()


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8421))
    uvicorn.run(app, host="0.0.0.0", port=port)
