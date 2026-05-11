---
name: <TOPIC>
description: <one-line summary>
tags: [fastapi, <area>]
updated: <YYYY-MM-DD>
anchors:
  - <file>:<symbol>
  - <Kind>:<file>:<symbol>
---

# <TOPIC>

<One paragraph of what this subsystem does in the service and why it exists.>

## Layout

<Where the relevant code lives. Examples:>
- `app/api/routes/<area>.py` — `APIRouter` for `/<area>`
- `app/schemas/<area>.py` — Pydantic request/response models
- `app/services/<area>.py` — business logic separated from the route layer
- `app/deps.py` — `Depends(...)` dependencies (auth, db session, etc.)
- `app/main.py` — `FastAPI()` app and `include_router(...)` calls

## Anchors — `<key file>` (≈<n> lines)

| Symbol | How to locate it |
|---|---|
| `<route_func>` | `gitnexus_context({name: "<route_func>", repo: "<repo>"})` |
| `<SchemaModel>` | `gitnexus_cypher({query: "MATCH (n) WHERE n.name = '<SchemaModel>' RETURN n.filePath, n.startLine, n.endLine"})` |

Before editing an existing route or schema: `gitnexus_impact({target: "<symbol>", repo: "<repo>", direction: "upstream"})`.

## How to add a new endpoint

1. Define request/response models in `app/schemas/<area>.py` as Pydantic `BaseModel` subclasses. Reuse existing base types where possible.
2. Add the route function to `app/api/routes/<area>.py`. Type the body with the schema, return the response model. Use `Depends(...)` for auth/db.
3. If `<area>.py` is a new router, register it in `app/main.py` via `app.include_router(<area>.router, prefix="/<area>", tags=["<area>"])`.
4. Push non-trivial logic into `app/services/<area>.py`; keep the route function thin.

```python
# app/api/routes/<area>.py — drop-in template
from fastapi import APIRouter, Depends, HTTPException
from app.schemas.<area> import <Request>, <Response>
from app.deps import current_user
from app.services.<area> import <service_fn>

router = APIRouter()

@router.post("/", response_model=<Response>)
async def <route_func>(body: <Request>, user = Depends(current_user)) -> <Response>:
    try:
        return await <service_fn>(body, user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
```

## Conventions

- Pydantic v2 syntax (`model_config`, `Field(...)`, `Annotated`).
- Use `async def` for I/O-bound routes; sync only for CPU-bound work.
- Errors → `HTTPException(status_code=..., detail=...)`; never return raw 500s.
- Test routes via `httpx.AsyncClient(transport=ASGITransport(app=app))` against the same `app` instance.

## Related

- `<spec/concepts/<related>.md>` — <one-line context>
