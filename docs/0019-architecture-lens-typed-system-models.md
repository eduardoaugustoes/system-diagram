# ADR 0019 — Architecture lens: typed system models as a future fifth lens

**Status:** Captured · 2026-05-19
**Deciders:** Eduardo

## Decision

When users describe Visions about software systems, Navvo will treat the *structure* of those systems as a typed, queryable model owned by the same lens machinery as Blind Spots / Heading / Weight / Blast Radius (ADR 0008). The model is **not** a draw.io-style diagram in a sidebar; it is a typed-schema artefact the agent edits through an operations API, validated on every mutation, with the renderer treated as a downstream view. Concrete shipping is deferred — this ADR captures the direction; build kicks in only after v1 has real users telling us they want it.

## Why

- The Pencil bet — typed schema + operations API + visual surface — does for design what we want to do for software architecture. The two are structural cousins: both have a typed model, both surface lenses-on-the-model, both depend on agent-driven editing being safe by construction.
- Strategy (ADR 0015) reasons about bets. The lenses (ADR 0008) reason about visions. Neither reasons about the *thing being built*. For users whose Visions are software-shaped (the gateway, the pillar, the platform), the absence of a structural plane forces them to keep that knowledge in a separate tool — which means Navvo's lenses can't see it.
- A folder of typed system models is queryable like a graph database, not like a folder of pictures. The agent can answer "which Visions share infrastructure?" or "what's the blast radius of decommissioning this Lambda?" from the model itself — extending the Blast Radius lens far beyond text.
- Vector search over diagrams is a workaround for the absence of structure. If the structure is already there, hybrid retrieval (typed query + free-text vector on descriptions) beats vector-only retrieval on both precision and reasoning. The lens system gets richer signal for free.

## What we accept

- **Scope creep risk is real.** v0.1 ships landing + waitlist. Adding "architecture modelling" before the plan instrument exists dilutes the wedge. This ADR is *captured direction*, not commitment — re-open after v1 ships and real users push for it.
- **Audience question is unresolved.** If Navvo positions broadly (founders, marketers, makers), software-architecture modelling is a niche lens. If Navvo wedges into engineering-led planners first, it's central. The doctrine (ADR 0007) reads broad today; this ADR doesn't force the answer.
- **Build cost is non-trivial.** A Pencil-class system tool is ~40% renderer, ~40% engine (schema + validator + operations API + canonical persistence), ~15% MCP server, ~5% app shell. The engine has to live in its own isomorphic package consumed by browser + MCP server + CI — not bolted into the SPA. Months of work even as a thin slice.
- **The file is plain text; the agent doesn't edit it directly.** Following Pencil's two-path discipline: typed JSON on disk for PR review, MCP-only operations for agents. Direct file edits are valid but validated on next load. The text serialisation exists for humans; the operations API exists for agents.

## Also considered

- **Replace the Strategy Board with a systems-design tool.** Loses — Strategy answers "are these the right bets?" (portfolio, drift, weight); architecture answers "what is the structure of the thing I'm building?" (components, connections, topology). Different objects of attention; collapsing them serves neither well.
- **A peer top-level surface to The Board ("The Build").** Plausible v0.2-or-later expansion if Navvo's audience turns out to be engineering-heavy. Loses *for now* because it pre-commits to that audience before validation, and adds a top-level navigation entry before the existing three (Map / Brief / Board) have shipped.
- **Bolt the architecture editor into the SPA, no engine extraction.** Cheapest path, gives a nice browser-only diagram editor with a typed schema. Loses because the MCP server and CI validator both need the engine; without engine extraction the agent path is the renderer path and headless validation becomes impossible. The Pencil-class behaviour requires the engine to be a peer of the renderer, not a part of it.
- **Embedded vector index inside each model file.** Loses — couples storage to index, drifts on model-rev changes, makes the file the source of truth and the cache at the same time. Keep the model in the file, the index outside (regenerable). Vector search complements structured search on the free-text fields; it doesn't replace it.
