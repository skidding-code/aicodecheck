# Example reports

Real engine output, to illustrate the response shape and the probabilistic,
evidence-first philosophy. **Both are estimates, not proof.**

| File | Input | Result |
|------|-------|--------|
| `sample-report-ai-snippet.json` | a synthetic AI-style Python file from the calibration corpus | leans AI (`possibly_ai_assisted`) — driven by tutorial-style comments and repetitive structure, with concrete evidence |
| `sample-report-human-repo.json` | the real, mature human repo `pallets/click` (truncated for readability) | `uncertain` (~0.49) — a well-known human project correctly does **not** trip a confident "AI" verdict |

The human-repo example is truncated (`files`/`functions`/`folders`/`evidence`/
visualizations limited) to stay readable; see the `_note` field. Regenerate
either with the CLI:

```bash
aipd owner/repo --json report.json
aipd --snippet "$(cat somefile.py)" --language python --json report.json
```

Note how the human repo lands at `uncertain` with mixed signals (some lean AI,
some lean human) — exactly the honest, hedged behavior the tool is designed for.
