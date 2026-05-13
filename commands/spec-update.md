---
description: Refresh specs to match current code — drift detection across all markdown specs, or a single spec when a path is given (markdown or pipeline-spec HTML)
argument-hint: "[spec/<path>.md | spec/pipelines/<slug>.html]"
---

Run the `spec-update` skill. If $ARGUMENTS contains a spec path, scope the update to that single file; otherwise audit all markdown specs (pipeline-specs are only updated when their path is passed explicitly).
