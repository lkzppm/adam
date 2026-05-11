---
name: <TOPIC>
description: <one-line summary>
tags: [django, <area>]
updated: <YYYY-MM-DD>
anchors:
  - <file>:<symbol>
  - <Kind>:<file>:<symbol>
---

# <TOPIC>

<One paragraph of what this subsystem does in the project and why it exists.>

## Layout

<Where the relevant code lives. Examples:>
- `<app>/models.py` — model definitions
- `<app>/views.py` or `<app>/views/` — view functions / class-based views
- `<app>/urls.py` — URL routing for the app
- `<app>/serializers.py` — DRF serializers (if DRF is in use)
- `<app>/migrations/` — auto-generated, do not hand-edit
- `<project>/settings.py` — `INSTALLED_APPS`, middleware, DB config

## Anchors — `<key file>` (≈<n> lines)

| Symbol | How to locate it |
|---|---|
| `<ModelName>` | `gitnexus_context({name: "<ModelName>", repo: "<repo>"})` |
| `<view_func>` | `gitnexus_cypher({query: "MATCH (n) WHERE n.name = '<view_func>' RETURN n.filePath, n.startLine, n.endLine"})` |

Before editing a model field or view signature: `gitnexus_impact({target: "<symbol>", repo: "<repo>", direction: "upstream"})`.

## How to add a new <thing>

1. Add the model to `<app>/models.py`. Use `models.Model` as the base, declare fields, add a `Meta` if ordering/indexing matters.
2. Generate the migration: `python manage.py makemigrations <app>`. Review the output in `<app>/migrations/000N_*.py` before committing.
3. Apply: `python manage.py migrate`.
4. Add the view to `<app>/views.py` (function-based) or `<app>/views/<name>.py` (class-based). Prefer `LoginRequiredMixin`/`UserPassesTestMixin` for auth.
5. Wire the URL in `<app>/urls.py`, then ensure `<project>/urls.py` includes the app's urls via `path('<prefix>/', include('<app>.urls'))`.

```python
# <app>/models.py — drop-in template
from django.db import models

class <ModelName>(models.Model):
    name = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['name'])]

    def __str__(self) -> str:
        return self.name
```

## Conventions

- Migrations are append-only; never edit a migration after it ships to another env.
- Querysets are lazy; chain filters and `select_related`/`prefetch_related` to avoid N+1.
- Use `TestCase` from `django.test` (transactional rollback per test) for unit tests; `TransactionTestCase` only when needed.
- Settings split: `settings/base.py` + `settings/<env>.py` if the project uses environments.

## Related

- `<spec/concepts/<related>.md>` — <one-line context>
