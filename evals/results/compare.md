# Eval comparison: composer-2.5 vs grok-4.6

Same cases, same prompts, same RAG. Only `CURSOR_MODEL` changed.

| case | composer-2.5 | grok-4.6 |
| --- | --- | --- |
| bad-medical-request | PASS (gate, 0 tools) | PASS (gate, 0 tools) |
| chaotic-nutrition | PASS score 9, 13 tools, 35 chunks | PASS score 9, 23 tools, 81 chunks |
| knowledge-based-recipe | FAIL score 0 / 0 rounds / 11 tools (recipes.md was in retrieval) | PASS score 9, 29 tools, 105 chunks |
| low-energy | PASS score 9, 13 tools | PASS score 9, 21 tools |
| no-gym | PASS score 9, 11 tools | PASS score 9, 15 tools |
| travel-day | PASS score 8, 7 tools | PASS score 9, 26 tools |
| **suite** | **5/6, exit 1** | **6/6, exit 0** |

Composer FAIL on `knowledge-based-recipe`: verdict `approve`, retrieval hit `recipes.md`, but `finalScore` is 0 because `rounds` is empty (likely early `generateShoppingList` path: review score is not folded into `summarizeScore`). Eval uses `finalScore`, so `minScore: 9` fails.

Grok called `searchKnowledge` more often (higher toolCalls / chunks). Embeddings still Ollama `nomic-embed-text`.

Raw logs: `evals/results/eval-composer-2.5.txt`, `evals/results/eval-grok-4.6.txt`.
`.env` now has `CURSOR_MODEL=grok-4.6`.
