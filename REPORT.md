# Computer-Use Automation System Report

## Architecture

This project implements a focused vertical slice of a computer-use automation system for a mock Loan Servicing Portal. The capability is `prepare_auto_loan_offer_review`: find a member, open their pre-approved auto loan offer, and advance it to the final review screen without submitting the application.

The system is a TypeScript modular monolith. An LLM is used during discovery only. The final committed real-model evidence uses Claude via Anthropic with screenshot image context; Gemini and mock clients remain available for alternative runs. Discovery observes the current application surface, asks the model for one bounded next action, validates the action, checks policy, executes through a `SurfaceAdapter`, records evidence, and converts successful behavior into a capability artifact.

Replay does not call any LLM. Replay loads the artifact, validates parameters, applies tenant overlays, checks policy before every action, resolves targets deterministically, verifies checkpoints, extracts outputs, and returns a structured result.

## Artifact schema

The artifact is a hybrid capability artifact rather than a recorded Playwright script. It has a contract layer and an execution recipe. The contract defines the capability ID, inputs, outputs, known business outcomes, safety policy, and compatibility metadata. Known outcomes are declarative capability metadata, not hidden recorder logic inferred from one happy-path run.

The recipe defines phases, deterministic steps, target fingerprints, checkpoints, and recovery behavior. Each target has a layered fingerprint: semantic role/name, visible text anchors, structural region, and adapter-specific hints. Playwright hints are useful for this implementation, but they are not the primary conceptual model.

Artifacts start as `draft`. Local demo replay can run drafts with `--allow-draft`; an unattended production runner would require reviewed and approved artifacts.

## Determinism & error handling

The replay engine interprets artifact JSON with no model calls. It substitutes typed params, resolves a target, executes the action, waits for checkpoints, detects known outcomes, and writes evidence.

Replay statuses are `success`, `business_outcome`, `needs_human`, `failure`, and `blocked`. This separates normal business answers such as `no_auto_loan_offer` from runtime failures such as `checkpoint_failed` or `surface_drift_detected`.

Recoverable conditions are intentionally small: slow loads retry, known session warnings can be dismissed if allowlisted, known maintenance modals can be dismissed, and unknown modals require human handoff. This keeps replay deterministic while still acknowledging that real application surfaces are not perfectly still.

## Heterogeneity & multi-tenant

The implemented surface is a browser controlled by Playwright, but the core interface is `SurfaceAdapter`: `observe`, `act`, and `captureEvidence`. A desktop adapter could populate the same observation layers using OS accessibility APIs, screenshots, OCR, and mouse/keyboard automation.

For multi-tenant reuse, the artifact separates the shared capability contract from tenant-specific overlays. The base artifact describes the common workflow for a loan servicing app family. A tenant overlay can adjust labels, routes, checkpoints, table mappings, or inserted warning steps without rewriting the capability.

Replay verifies required features and checkpoints. If a tenant UI drifts, replay returns structured drift evidence instead of guessing.

## Escalation & handoff

The primary handoff scenario is an ambiguous target after searching member `77777`. The current committed evidence demonstrates the safe non-interactive handoff path: replay returns `needs_human` with `code=ambiguous_target` rather than guessing which `Open Member` link to click.

The implementation also supports `--interactive-handoff`, which opens a non-headless browser, writes intervention/control-lease files, waits for the operator to select the correct row, verifies the resume checkpoint, and continues. This is intentionally a minimal same-session handoff, not a full operator console. The design keeps the control-transfer model real while avoiding unnecessary UI infrastructure.

## Safety

The safety model combines origin allowlisting, action allowlisting, and intent policy. A click is not safe merely because it is a click; the intent determines business risk.

Safe actions include search, navigation, reading offers, selecting non-binding options, and reaching final review. Approval-required actions include ambiguous-member resolution and warning acknowledgement. Blocked actions include final application submission, loan approval, disbursement, credit pull, pricing changes, term changes, eligibility override, and accepting an e-signature.

Screenshots are captured locally for evidence. Screenshots are sent to the LLM only when `SEND_SCREENSHOTS_TO_LLM=true`; the final Claude discovery evidence used screenshot image context. This assignment uses synthetic data only.

## Cuts

I did not build a production operator console, artifact registry, distributed queues, desktop adapter, real bank integration, full approval workflow, or open-ended LLM recovery during replay.

The next steps would be artifact review and approval states, richer tenant compatibility scoring, an operator UI around the same control lease, and a desktop adapter using OS accessibility plus visual evidence.
