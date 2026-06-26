# ADR 0021 — Excalidraw-style annotation overlay over the typed substrate

**Status:** Captured · 2026-05-21
**Deciders:** Eduardo

## Decision

The planner canvas will be conceived as **two layered surfaces** sharing a viewport, never blended:

1. **Substrate layer** — typed Vision → Goal → MVI model. Source of truth. Validated. Agent-editable via MCP. Persisted as `<vision>.system.json` (or whatever the planner schema settles on).
2. **Overlay layer** — Excalidraw-embedded annotation surface. Sketches, sticky notes, freehand strokes, comment arrows. Persisted as a sibling file `<vision>.overlay.excalidraw.json`. Toggleable via a header pill.

The overlay never modifies the substrate. The substrate never references the overlay. They share only the pan/zoom transform so annotations stay visually anchored.

Concrete shipping is deferred — this ADR captures direction; build kicks in only after the planner substrate has shipped real value and users start asking for a scribble space.

## Why

- **Today most tools force a choice.** Notion / Linear / Jira are structured with no doodle space. Excalidraw / Miro / FigJam are freeform with no structure. Hybrids (Whimsical, ClickUp whiteboards) leak — the freeform layer can mutate the structured one, both feel sloppy.
- **The clean separation is the move.** Typed structure for "what we've decided"; freeform overlay for "what if we did this instead." Substrate is permanent. Overlay is committed-to-zero — you can throw it away without losing structured work. That's the property that makes it psychologically safe to scribble in.
- **Excalidraw's weaknesses become irrelevant in this role.** The hand-drawn aesthetic *should* feel informal — it signals "this is a draft." The closed type system doesn't matter — Excalidraw never models the domain. The custom-renderer gap doesn't matter — MVI cards live in the substrate. The uncustomizable toolbar doesn't matter — when overlay is on, you want Excalidraw's drawing toolbar.
- **The strengths line up.** Direct manipulation, arrow re-targeting with normalized fixed-point bindings, frames-as-containers, snap-to-grid, freehand strokes — all first-class in Excalidraw and exactly what a sketch overlay needs.

## Use cases that earn the overlay its keep

- **Co-design session.** Walking a co-founder through the roadmap. Toggle overlay, sketch "what if we delayed Goal X by a month and accelerated Goal Y?" with arrows and notes. Toggle off — plan unchanged. Optionally save the overlay as a named snapshot.
- **Async review.** Share a vision with someone. They toggle overlay, scribble questions next to specific MVIs. Next session you see their comments. Substrate stays untouched.
- **Brainstorm.** Empty overlay over the current plan. Draw a half-formed Goal in the margin. Decide it's worth it → manually promote to a typed MVI in the substrate panel.

## What we accept

- **Anchoring drift is real.** If you scribble "this MVI is risky" next to an MVI and later move/rename it in the substrate, the annotation points at empty space. v1 accepts drift (overlay is ephemeral; expect it). A soft-link mechanism ("annotation remembers it was near MVI x at position p, auto-translates if x moves") is significantly more work and Excalidraw doesn't do it natively — defer.
- **Multiplayer comments need a different story.** Excalidraw OSS has no real-time collab (their server is closed). For overlay-as-async-feedback, rotating overlay files through git works today. Real-time multiplayer is a much bigger scope — defer.
- **The "promote to structure" moment is manual.** When someone sketches a freeform Goal in overlay and decides to keep it, a human turns the scribble into a typed MVI by hand. That's correct UX (commit is intentional) but it's a moment worth designing.
- **Overlay discoverability is a v1 problem.** With multiple named overlays per vision, users need an overlay manager (list, thumbnails, timestamps). Modest scope but real.
- **Pre-1.0 Excalidraw.** They break APIs at minor versions. Manageable if we treat overlay as upgradeable on our schedule, not theirs.

## Architectural sketch

```
<CanvasViewport>            // owns pan/zoom state
  <SubstrateLayer model={visionModel} />        // current prototype, typed
  <OverlayLayer scene={overlayScene} enabled={overlayEnabled} />  // Excalidraw embedded
</CanvasViewport>
```

- Header pill: "Overlay" toggle. Off by default. On → Excalidraw's toolbar slides in, substrate dims slightly, overlay receives pointer events.
- When overlay is off but a saved overlay exists: it renders as a read-only ghost so you can see annotations. Toggle to fully hide.
- Storage layout (planner workspace):
  ```
  workspace/
    visions/
      checkout.system.json              ← substrate
      checkout.overlay.excalidraw.json  ← default overlay
      checkout.overlay.may-21-alt-roadmap.excalidraw.json  ← named snapshot
      checkout.overlay.review-from-alice.excalidraw.json   ← another snapshot
  ```
- Overlay files are plain Excalidraw JSON. Git-diffable. Shareable as files.
- Substrate file never imports / refers to overlay files.

## Also considered

- **Bake annotations into the substrate schema.** Add a `notes: Annotation[]` field on each MVI/Goal. Loses — couples drafts to canonical data, every comment becomes a permanent thing that needs maintenance, and the freeform mode of thought leaks into the typed model. The whole value of the separation is that overlay can be messy because it's not the substrate.
- **Embed Excalidraw as the *substrate* canvas, layer Vision/Goal/MVI semantics on top via `customData`.** Loses — domain entities become second-class citizens inside someone else's schema, no plugin API for custom element types, hand-drawn aesthetic permanent. Fine as a two-week interaction-validation prototype; bad as a foundation. See ADR 0021's research note for the full analysis.
- **Comments as a side panel only, no canvas overlay.** Loses — comments need spatial reference ("this MVI here") that text-only side panels can't capture without re-implementing the spatial part.
- **Real-time multiplayer overlay from day one.** Loses — Excalidraw's collab server is closed-source. Building our own real-time layer is months of work. Async-via-git is enough for v1.

## Open questions (for the future discussion)

1. **Soft-anchoring vs. accept-drift.** If drift turns out to be intolerable in practice, what's the minimum mechanism? Per-annotation `nearMviId` + offset, recomputed on substrate change?
2. **Snapshots vs. branches.** Are named overlays just snapshots (load → replace current overlay), or branches you can switch between with state? Probably snapshots for v1.
3. **Promote-to-substrate UX.** Right-click on a sketched shape → "Create MVI from this"? Or always manual?
4. **Multi-user without a server.** Are overlay files committed to git enough, or do we need something lighter (Cloud sync via Drive / iCloud / Dropbox the user already has)?
5. **Substrate interaction model first.** Before any of this, the substrate's own interaction model needs to settle (ELK auto-layout vs. free-form positioning vs. hybrid). The overlay layer's design assumes the substrate is settled.

## What this implies for current work

- The system-architecture POC (ADR 0019 / `0020-poc-contracts.md` / `prototypes/elk-renderer`) is unaffected. This ADR is about the planner direction.
- When the planner fork happens (see prior conversation, name TBD), the canvas component should be structured from day one with a `CanvasViewport` that *could* host a second layer later — even if v1 ships substrate-only. Cheap to design in; expensive to retrofit.
- Do not embed Excalidraw in the system-architecture prototype. It's the wrong tool for that canvas (typed components benefit from custom rendering; the system view is not draft-shaped).
