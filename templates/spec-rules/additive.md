---
name: additive
description: Workflow rules for adding new functionality that follows project conventions (new module, helper, route, middleware, command, etc.). Read when adding code that integrates with existing infrastructure.
tags:
  - rules
  - additive
  - workflow
---

# Adding new functionality — workflow rules

Use when adding new code that **integrates with existing infrastructure** (new module, helper, route, middleware, command handler, etc.). The shape is dictated by patterns spread across multiple existing files; the spec captures those patterns so you don't re-derive them by reading neighbors.

Skip this recipe if the task is a pure single-file utility addition (e.g. "add a helper function to `utils.py`") — read that file directly and follow its style; no recipe needed.

## Workflow

### 1. Locate the right spec/concepts/ entry first

Project conventions live in `spec/concepts/<subsystem>.md` — these spec files describe the convention with file paths, types, and a "How to add a new X" recipe when the subsystem has a recurring shape.

If the task is "add a new <thing>" and a `spec/concepts/<thing>.md` exists, **read that ONE file**. The recipe inside should tell you everything: where the file goes, what types/imports to use, what shape to follow.

### 2. Don't read neighbor files unless the spec sends you there

A self-contained recipe means: you should NOT need to open an existing instance of the thing you're adding. If the spec includes a drop-in template, copy and adapt it directly. Reading a neighbor file is overhead the spec is supposed to eliminate.

If the spec is incomplete (missing a piece you need), open exactly one neighbor file as reference and update the spec afterwards via `/adam:spec-update`.

### 3. Skip the graph for additive work

The graph is for finding **callers** of an existing symbol. New code has no callers yet — there's nothing for the graph to look up. Don't burn turns on `gitnexus_context` for additive tasks.

The exception: if your new code needs to **invoke** an existing symbol you don't know the signature of, one `gitnexus_context` call to find it is fine.

### 4. Verify

Run the project's typecheck / lint command (`npx tsc --noEmit`, `mypy`, `cargo check`, `ruff check`, etc.).

## Don'ts

- **Don't write tests** for the new thing unless the prompt asks. The verification gate is typecheck-level.
- **Don't update the public re-export index** (`src/index.ts`, `__init__.py`, `mod.rs`, etc.) unless the recipe says to.
- **Don't read more than one neighbor file** — that's a sign the spec is too thin; flag it instead of compensating.
- **Don't call `gitnexus_*` for additive tasks** unless looking up the signature of an existing symbol you'll invoke.
