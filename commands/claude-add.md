---
description: Add a single sub-agent, skill, or hook to .claude/. Prompts interactively if details are missing.
argument-hint: "[agent|skill|hook] [description]"
---

Run the `claude-add` skill. The argument $ARGUMENTS may name the kind (agent/skill/hook) and a description. If anything is missing or ambiguous, the skill will use AskUserQuestion to resolve it.
