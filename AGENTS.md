<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- All analytics are precomputed by `scripts/build_data.py` (pandas + scikit-learn) into `src/data/pcrg.json`; the app is static and reads that file. Why: keeps the hackathon demo fast with no backend; rerun the script when data changes.
- Business formulas and assumptions (tariff, CO₂ factor, diversion, compost ratio, routing) live only in `src/lib/pcrg.ts` and are covered by `src/test/pcrg.test.ts`. Why: one visible source of truth.
- Alert status and demo role are browser-local (localStorage) prototypes. Why: no auth/database yet; move to Lovable Cloud tables before any real use.
- The Dataset Upload page (`/ingest`, Facility Manager role only) validates uploaded Excel files in-browser via `src/lib/ingest.ts`, mirroring the cleaning rules of `scripts/build_data.py`; nothing is persisted, and model retraining stays in the offline pipeline. Why: consistent with the static-demo architecture while giving judges a visible data-governance flow.
