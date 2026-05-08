# Edit-task quality check

Two layers: `tsc --noEmit` (does the patch compile?) and runtime invocation (does the new/renamed tool actually work end-to-end?).

| Task | Cond | Δ lines | tsc | runtime | reason |
|---|---|---:|:-:|:-:|---|
| T2 | baseline | +40 | ✓ | ✓ |  |
| T2 | with-adam | +40 | ✓ | ✓ |  |
| T2b | baseline | +30 | ✓ | ✓ |  |
| T2b | with-adam | +35 | ✓ | ✓ |  |
| T2c | baseline | +15 | ✓ | ✓ |  |
| T2c | with-adam | +15 | ✓ | ✓ |  |
| T2d | baseline | +21 | ✓ | ✓ |  |
| T2d | with-adam | +21 | ✓ | ✓ |  |
| T2e | baseline | +25 | ✓ | ✓ |  |
| T2e | with-adam | +31 | ✓ | ✓ |  |
| T2f | baseline | +26 | ✓ | ✗ | expected ok+array, got {"ok":true,"data":{"company":"a","results":[{"id":"oceanp |
| T2f | with-adam | +35 | ✓ | ✗ | expected ok+array, got {"ok":true,"data":{"query":"a","found":1,"experiences":[{ |
| T2g | baseline | +32 | ✓ | ✓ |  |
| T2g | with-adam | +32 | ✓ | ✓ |  |
| T2h | baseline | +23 | ✓ | ✗ | expected ok+array, got {"ok":true,"data":{"categories":["AI & ML","Backend","Dat |
| T2h | with-adam | +16 | ✓ | ✓ |  |
| T2i | baseline | +24 | ✓ | ✗ | expected ok+array, got {"ok":true,"data":{"techs":["FAISS","FastAPI","LangChain" |
| T2i | with-adam | +23 | ✓ | ✗ | expected ok+array, got {"ok":true,"data":{"techs":["FAISS","FastAPI","LangChain" |
| T2j | baseline | +21 | ✓ | ✓ |  |
| T2j | with-adam | +21 | ✓ | ✓ |  |
| T3 | baseline | +0 | ✓ | ✓ |  |
| T3 | with-adam | +0 | ✓ | ✓ |  |
| T3b | baseline | +1 | ✓ | ✓ |  |
| T3b | with-adam | +1 | ✓ | ✓ |  |

## Summary

| Cond | Compile | Runtime |
|---|---:|---:|
| baseline  | 12/12 | 9/12 |
| with-adam | 12/12 | 10/12 |
