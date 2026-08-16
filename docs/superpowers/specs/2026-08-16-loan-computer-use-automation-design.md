# Loan Computer-Use Automation System Design

## Purpose

Build a focused end-to-end computer-use automation system for the interface.ai take-home assignment. The system demonstrates this core loop:

```text
LLM discovery run -> structured capability artifact -> deterministic replay -> evidence
```

The system uses a local mock Loan Servicing Portal as the real application surface. The concrete goal is:

```text
Find member 24816, open their pre-approved auto loan offer, and advance it to the final review screen.
```

The project intentionally stops at the final review screen. It does not submit, approve, price, or disburse a loan.

## Design Thesis

The LLM is a discovery mechanism, not the production execution mechanism. Gemini observes the UI and proposes one bounded action at a time. The system validates, safety-checks, executes, records, and later replays those actions from a typed artifact with no LLM in the replay loop.

The design favors fail-closed behavior. If replay cannot resolve a target confidently, encounters ambiguity, sees a blocked intent, or misses a checkpoint, it stops with a structured result instead of guessing.

## Design Principles

The system is built around six principles:

```text
Discover once, replay many:
  LLM reasoning is valuable during discovery, but production invocation should be deterministic.

Adapter before tool:
  Playwright is the concrete browser implementation, not the core abstraction.

Artifact as contract:
  A capability artifact must be understandable by a human reviewer and callable by an agent.

Fail closed:
  Ambiguity, drift, and blocked intent stop the run instead of producing guessed actions.

Evidence is first-class:
  Each run should explain what happened, why it happened, and what the system observed.

Regulated-data posture:
  Even with mock data, artifacts and logs should avoid raw sensitive data by design.
```

These principles are intended to make the implementation look like a small production slice rather than a demo script.

## Requirement Mapping

The assignment requirement-to-design mapping is:

```text
3.1 Goal-driven agent loop:
  Gemini one-action-at-a-time discovery loop over a real browser surface.

3.2 Structured artifact:
  Hybrid capability artifact with contract, phases, deterministic steps, outputs, checkpoints,
  safety, known outcomes, compatibility, and evidence references.

3.3 Deterministic replay:
  ReplayEngine interprets the artifact with no Gemini calls, using target fingerprints and checkpoints.

3.4 Safety:
  Configurable origin/action/intent allowlist, approval-required intents, blocked intents, and redaction.

3.5 Evidence:
  JSONL logs, result JSON, screenshots, intervention files, and drift reports.

3.6 Human handoff:
  Same-session pause/resume with an intervention request and control lease.

3.7 Heterogeneity and multi-tenant:
  SurfaceAdapter seam plus base artifacts, variant overlays, compatibility metadata, and drift detection.
```

## Spec Acceptance Scenarios

This section applies the writing-skills discipline to the spec itself: the document should pass concrete pressure scenarios, not merely sound plausible.

### Scenario 1: Evaluator Rubric Audit

Pressure:

```text
An evaluator reads only README.md, REPORT.md, and evidence/.
They want to know whether Section 3 is implemented end to end.
```

The spec passes if the implementation produces:

```text
real Gemini discovery run against a live UI
typed artifact decoupled from raw model transcript
deterministic replay with no model calls
business_outcome, needs_human, failure, and blocked result examples
configurable allowlist and redaction policy
same-session human handoff evidence
clear design story for browser, legacy web, desktop, and tenant variants
```

Failure modes this spec must prevent:

```text
LLM only writes a plan instead of driving the UI
artifact is just Playwright code
replay silently uses Gemini
errors are all generic exceptions
handoff is represented only as an unimplemented note
multi-tenant story is hand-wavy
```

### Scenario 2: Implementer Handoff

Pressure:

```text
A developer starts implementation from this spec without the original conversation.
They need to know the modules, contracts, demo data, commands, and evidence outputs.
```

The spec passes if the developer can identify:

```text
module boundaries and dependency direction
surface adapter contract
observation shape
Gemini action schema
artifact top-level schema
step schema
target resolution algorithm
replay state machine
safety policy profiles
handoff flow
required evidence files
demo data matrix
testing strategy
cuts
```

Failure modes this spec must prevent:

```text
developer couples Gemini directly to Playwright
developer stores model transcript as the artifact
developer hardcodes only the happy path
developer cannot tell which scenario generates which evidence
developer implements production infrastructure instead of the vertical slice
```

### Scenario 3: Safety Reviewer Challenge

Pressure:

```text
A safety reviewer asks why an LLM is allowed near a loan workflow.
```

The spec passes if the answer is:

```text
the app is synthetic for the assignment
Gemini proposes bounded actions but cannot execute directly
policy checks every action before execution
raw screenshots are local by default and not sent to Gemini unless explicitly enabled
final submission, approval, disbursement, pricing changes, credit pulls, and signatures are blocked
normal demo replay stops at final review
ambiguous or approval-required states pause for a human
```

Failure modes this spec must prevent:

```text
model can click forbidden controls
free-tier model receives sensitive screenshots by default
logs contain raw member identifiers or credentials
policy is checked only during discovery but not replay
blocked controls rely only on UI hiding rather than runtime enforcement
```

### Scenario 4: Replay Auditor Challenge

Pressure:

```text
An auditor asks how one recorded run can be replayed deterministically next week.
```

The spec passes if replay is explained as:

```text
artifact interpreter
fixed steps
input parameter substitution
policy check before every action
target fingerprint scoring
checkpoint verification
known outcome detection
structured terminal result
evidence on failure or handoff
```

Failure modes this spec must prevent:

```text
coordinates become the primary replay strategy
selectors are used without confidence or checkpointing
replay continues after checkpoint failure
multiple matching elements are clicked arbitrarily
business outcomes are reported as technical failures
```

### Scenario 5: Multi-Tenant Reviewer Challenge

Pressure:

```text
A reviewer asks how the capability avoids being re-recorded for every institution.
```

The spec passes if the design explains:

```text
capability contract is shared across an app family
base recipe captures the common flow
tenant overlays specialize labels, routes, checkpoints, table mappings, and inserted warning steps
required_features identify whether a tenant supports the capability
drift reports explain expected versus observed UI state
uncertain drift fails closed or requests human review
```

Failure modes this spec must prevent:

```text
one artifact per tenant with no reuse story
one universal artifact with no variant model
unsafe self-healing when a tenant UI differs
no way to tell whether a replay is degraded, unsupported, or broken
```

## Architecture

Use a modular monolith in TypeScript:

```text
apps/loan-portal        local mock Loan Servicing Portal
src/llm                 Gemini client and mock LLM fallback
src/surface             SurfaceAdapter interface and BrowserSurfaceAdapter
src/agent               one-action-at-a-time discovery loop
src/artifacts           schema, recorder, validation
src/replay              deterministic artifact interpreter
src/safety              allowlist and risk policy
src/handoff             same-session pause/resume intervention handling
src/evidence            JSONL logs, screenshots, result writers
evidence/               submitted demo outputs
```

Core dependency direction:

```text
Discovery: GeminiClient + SurfaceAdapter + SafetyPolicy + ArtifactRecorder
Replay:    Artifact + SurfaceAdapter + SafetyPolicy + OutcomeDetector
```

Replay does not depend on Gemini.

### Architecture Trade-Offs

Three shapes were considered:

```text
Single-script prototype:
  Lowest implementation cost, but weak boundaries. It would blur LLM discovery, replay,
  policy, and evidence into one script, which makes the artifact look incidental.

Service-oriented system:
  Closer to eventual production, but overbuilt for the assignment. Queues, APIs, workers,
  and artifact registries would add infrastructure without proving the core abstraction.

Modular monolith:
  Chosen. It keeps the core boundaries explicit while remaining easy to run locally.
```

The modular monolith is the best fit because it demonstrates architectural judgment without premature scaling. Each module has one reason to change:

```text
llm:
  model provider and prompting changes

surface:
  browser/desktop/legacy app perception and action changes

agent:
  discovery-loop control flow changes

artifacts:
  schema and serialization changes

replay:
  deterministic execution and result-contract changes

safety:
  allowlist, risk classification, and policy profile changes

handoff:
  control-transfer and intervention workflow changes

evidence:
  logging, screenshots, traces, and redaction changes
```

This lets the report defend a clear seam: replacing Playwright with a desktop automation adapter should not require changing the artifact contract or the replay state machine.

## Component Contracts

The implementation should keep these interfaces small and explicit. Names may change, but responsibilities should not blur.

### LLMClient

Purpose:

```text
Turn an observation and goal into one structured decision.
```

Inputs:

```text
goal
observation
allowed action schema
policy summary
recent action summary
```

Outputs:

```text
AgentDecision
```

Contract:

```typescript
type AgentDecision =
  | {
      decision: "act";
      reason_summary: string;
      action: ProposedAction;
    }
  | {
      decision: "finish";
      reason_summary: string;
      outputs: Record<string, unknown>;
    }
  | {
      decision: "escalate";
      reason_summary: string;
      code: string;
      message: string;
    };
```

Design rule:

```text
LLMClient never touches Playwright, filesystem evidence, policy enforcement, or artifact storage.
```

### SurfaceAdapter

Purpose:

```text
Expose a computer surface through generic observe/act/evidence operations.
```

Contract:

```typescript
interface SurfaceAdapter {
  open(entrypoint: string): Promise<void>;
  observe(context: ObservationContext): Promise<Observation>;
  act(action: ResolvedAction): Promise<ActionResult>;
  captureEvidence(label: string): Promise<EvidenceRef>;
}
```

Browser implementation:

```text
BrowserSurfaceAdapter uses Playwright.
It converts generic targets into Playwright locators.
It captures state, visible text, controls, structures, and screenshots.
```

Design rule:

```text
All Playwright-specific calls stay behind BrowserSurfaceAdapter or target-resolution helpers.
```

### ComputerUseAgent

Purpose:

```text
Run LLM discovery until success, escalation, timeout, repeated state, or failure.
```

Responsibilities:

```text
request observation
build prompt payload
call LLMClient
validate decision
call SafetyPolicy
execute action through SurfaceAdapter
record event and candidate artifact step
enforce stopping conditions
```

Non-responsibilities:

```text
does not implement target scoring
does not own policy definitions
does not write final evidence format directly
does not run deterministic replay
```

### ArtifactRecorder

Purpose:

```text
Convert a successful discovery trace into a reviewable capability artifact.
```

Inputs:

```text
goal
validated actions
action results
observations
checkpoints
extracted outputs
policy metadata
compatibility metadata
```

Outputs:

```text
CapabilityArtifact
```

Design rule:

```text
The recorder may use the discovery trace as source material, but the emitted artifact must not
be the raw Gemini transcript.
```

### ReplayEngine

Purpose:

```text
Interpret a capability artifact deterministically with no LLM calls.
```

Responsibilities:

```text
validate artifact and params
apply variant overlay
open surface
check known outcomes
resolve targets
check safety before action
execute action
verify checkpoints
apply recoveries
extract outputs
return structured result
write evidence
```

Design rule:

```text
ReplayEngine must not import or call LLMClient.
```

### TargetResolver

Purpose:

```text
Turn a target fingerprint into exactly one actionable target or a structured non-action result.
```

Inputs:

```text
target fingerprint
current observation
surface adapter capabilities
tenant overlay
```

Outputs:

```text
ResolvedTarget | ambiguous_target | target_not_found | surface_drift_detected
```

Scoring signals:

```text
semantic role/name match
visible text match
near-text match
same-region match
structural/table match
adapter-hint match
unique-match bonus
```

Design rule:

```text
The resolver is deterministic. It does not ask Gemini which candidate to pick.
```

### SafetyPolicy

Purpose:

```text
Decide whether an action intent is allowed, approval-required, or blocked.
```

Inputs:

```text
current origin/route
action type
intent
risk class
policy profile
```

Outputs:

```text
allow | needs_human | blocked
```

Design rule:

```text
Policy runs during both discovery and replay. Replay policy is not optional.
```

### OutcomeDetector

Purpose:

```text
Detect known business outcomes, recoverable conditions, handoff states, and drift indicators.
```

Inputs:

```text
current observation
artifact known_outcomes
step-level recovery rules
```

Outputs:

```text
continue | business_outcome | recover | needs_human | failure | blocked
```

### HandoffManager

Purpose:

```text
Pause automation, transfer control to a human in the same browser session, and resume safely.
```

Responsibilities:

```text
write intervention request
write control lease
capture before/after screenshots
pause automation
wait for explicit resume
record human summary
verify resume checkpoint
return control to automation
```

Design rule:

```text
Handoff is same-session. It must not start a fresh browser and pretend context was preserved.
```

### EvidenceLogger

Purpose:

```text
Create durable run evidence without leaking secrets or unnecessary sensitive data.
```

Outputs:

```text
JSONL event logs
result JSON
screenshots
intervention JSON
drift report JSON
artifact references
```

Design rule:

```text
EvidenceLogger redacts params and never logs API keys, env vars, or raw credentials.
```

## Target Application

The target is a local, moderately legacy-feeling Loan Servicing Portal. It should use stable but awkward enterprise UI patterns: tables, tabs, inconsistent labels, nested regions, and no test IDs as primary locators.

Primary flow:

```text
Operator Dashboard
-> Member Search
-> Member Profile
-> Offers tab
-> Pre-approved Auto Loan offer
-> Offer Terms
-> Vehicle type selection
-> Final Review screen
```

Primary capability:

```text
prepare_auto_loan_offer_review
```

Inputs:

```json
{
  "member_id": "string",
  "offer_type": "auto_loan",
  "vehicle_type": "new | used"
}
```

Outputs:

```json
{
  "member_name": "string",
  "offer_id": "string",
  "apr": "string",
  "max_amount": "currency",
  "term_months": "number",
  "review_status": "ready_for_final_review"
}
```

### Target Choice Trade-Offs

Several target directions were considered:

```text
Public demo website:
  Useful for showing real external UI automation, but weaker for financial-domain outcomes,
  human handoff, safety policy, and controlled error states. It also creates terms-of-service
  and rate-limit concerns.

Read-only loan lookup:
  Very safe and easy to replay, but too thin. It would test extraction more than workflow
  automation and would not exercise meaningful policy boundaries.

Full loan submission:
  Rich workflow, but too risky for the assignment story. It would force us to simulate
  actions such as final submission, approval, credit pull, or disbursement.

Pre-approved auto-loan offer to final review:
  Chosen. It is multi-step, loan-specific, safe to mock, and naturally stops before
  irreversible actions.
```

The chosen flow is intentionally a "prepare for review" capability. It has enough complexity to test discovery, replay, outputs, policy, and handoff, while keeping the safety boundary defensible.

### User Experience Constraints For The Mock App

The mock app should not be too clean. It should deliberately include realistic enterprise friction:

```text
tabs and tables instead of a single wizard
some labels that are visible text rather than perfect ARIA names
offer rows that require reading table content
one ambiguous-search state
one no-offer business-outcome state
one blocked final-submit control on the review page
```

However, it should not be hostile enough to derail the project. We want stable UI with realistic runtime states, not a brittle puzzle.

## Discovery Agent

Discovery uses a structured one-action-at-a-time Gemini loop:

```text
observe current surface
-> ask Gemini for one JSON action
-> validate schema
-> safety-check intent/action
-> execute through SurfaceAdapter
-> record result and evidence
-> repeat until finish, escalation, timeout, or failure
```

Gemini may only return bounded decisions:

```text
click
type
select
extract
assert
wait
finish
escalate
```

The model does not write Playwright code and does not control the browser directly. It proposes generic UI actions. The BrowserSurfaceAdapter translates those actions into Playwright operations.

Stopping conditions:

```text
max_steps: 25
timeout_ms: 120000 by default
repeated_state_limit: 3
```

If the agent reaches the same state repeatedly without progress, it escalates or fails with a clear result.

### Discovery Strategy Trade-Offs

Four discovery strategies were considered:

```text
Free-form agent:
  Gemini narrates or decides in unstructured text. This feels flexible but is difficult to
  validate, log, replay, or policy-check. Rejected.

Plan-then-execute:
  Gemini writes a full plan up front and the system executes it. This is simpler, but weakens
  the live observe-decide-act story and handles runtime surprises poorly. Rejected as the
  primary path.

Gemini writes Playwright code:
  Fast for a coding demo, but wrong abstraction. The assignment asks for computer-use
  discovery and a reusable artifact, not model-generated browser scripts. Rejected.

One-action-at-a-time structured agent:
  Chosen. It gives the LLM real agency during discovery while keeping every action bounded,
  validated, logged, and recordable.
```

The chosen loop is intentionally conservative. Gemini can decide the next action, but it cannot skip policy, execute hidden side effects, or store sensitive data in the artifact.

### Prompt Contract

The model prompt should include:

```text
goal
current observation
allowed action schema
policy summary
recent actions
stop conditions
instruction to return JSON only
```

The model response should include:

```text
decision:
  act | finish | escalate

reason_summary:
  short, non-sensitive explanation for logs

action:
  generic UI action if decision is act

outputs:
  typed outputs if decision is finish
```

The system logs `reason_summary` for observability but does not treat it as executable truth. Only the structured action is executed.

## Observation Contract

The surface adapter builds a layered observation object. This keeps the agent loop general enough for future non-browser surfaces while still practical for this browser implementation.

```json
{
  "state": {},
  "visual": {},
  "accessibility": {},
  "structure": {},
  "policy": {}
}
```

Layer meanings:

```text
state:
  current URL, title, surface kind, recent actions

visual:
  screenshot path, viewport, visible text blocks

accessibility:
  actionable controls such as buttons, links, tabs, fields, and selects

structure:
  tables, forms, page regions, headings, and tab groups

policy:
  allowed actions, approval-required intents, blocked intents
```

Screenshots are captured locally for evidence. By default, Gemini receives redacted structured observations rather than raw screenshots. Screenshot upload to Gemini is allowed only for synthetic demo data or an approved production data-control setup.

### Observation Trade-Offs

Three observation approaches were considered:

```text
DOM/accessibility only:
  Reliable for clean web apps, but weak for legacy surfaces and less convincing as general
  computer use.

Screenshot/coordinates first:
  Closer to pure computer use and desktop automation, but too brittle for deterministic replay.
  Coordinates vary across viewport size, zoom, fonts, and branding.

Layered observation:
  Chosen. It combines visual, accessibility, structural, state, and policy signals while
  keeping screenshots out of the primary replay path.
```

The browser implementation can populate all layers with Playwright, but the contract is not Playwright-shaped. A desktop adapter could populate the same layers using OS accessibility APIs, screenshots, OCR, and mouse/keyboard automation.

### Screenshot Policy

Screenshots serve three different purposes:

```text
evidence:
  Always useful locally for debugging and assessment.

model context:
  Optional. Disabled by default because screenshots can contain PII or financial data.

replay targeting:
  Not primary. Replay uses semantic, visual-text, structural, and adapter hints instead of
  raw coordinates.
```

For the assignment, the app uses synthetic data, so screenshot evidence is acceptable. For production, screenshots would require redaction, access controls, and an approved model/data-processing policy before external upload.

## Capability Artifact Schema

Use a hybrid capability artifact:

```text
capability contract
+ phased deterministic execution recipe
+ safety policy
+ known outcomes
+ compatibility metadata
+ evidence references
```

Top-level shape:

```json
{
  "schema_version": "1.0",
  "capability": {
    "id": "prepare_auto_loan_offer_review",
    "name": "Prepare Auto Loan Offer Review",
    "status": "draft",
    "risk_level": "moderate"
  },
  "surface": {
    "kind": "browser",
    "app_family": "loan_servicing_portal",
    "supported_adapters": ["browser.playwright"]
  },
  "contract": {
    "inputs": {},
    "outputs": {}
  },
  "safety": {},
  "phases": [],
  "steps": [],
  "known_outcomes": [],
  "handoff": {},
  "compatibility": {},
  "variant_overlays": {},
  "evidence": {}
}
```

The artifact is decoupled from the raw Gemini transcript. It records the reusable flow, not the model conversation.

Artifact lifecycle:

```text
draft
reviewed
approved
deprecated
```

Discovery output starts as draft. Local demo replay may use `--allow-draft`. Production unattended replay would require approved artifacts.

### Artifact Schema Trade-Offs

Three artifact shapes were rejected:

```text
Raw action log:
  Easy to record and replay, but too close to a browser macro. It lacks typed inputs,
  outputs, safety, known outcomes, and human review context.

High-level workflow only:
  Human-readable but not deterministic. Replay would need hidden code for each high-level
  action, weakening the record-once/replay-many claim.

Generated Playwright script:
  Practical but browser-specific. It would make the artifact a script rather than an
  agent-invocable capability.
```

The hybrid artifact is chosen because it has two audiences:

```text
calling agent or human reviewer:
  reads the capability contract, inputs, outputs, safety, and known outcomes

replay engine:
  interprets deterministic steps, target fingerprints, checkpoints, and recovery rules
```

This split is central to the design. The artifact is a capability with an execution recipe, not just an execution recipe.

### Contract Versus Recipe

The contract should remain stable across tenants and versions:

```text
capability id
business description
input schema
output schema
business outcomes
safety policy
```

The recipe is allowed to vary:

```text
tab labels
target fingerprints
route checkpoints
inserted warning steps
table column mappings
tenant overlays
```

This distinction supports multi-tenant reuse without pretending every app instance has the exact same UI.

## Step Schema

Each replayable step answers:

```text
What business intent is this serving?
Is it safe, approval-required, or blocked?
What generic UI action should run?
How should the target be found?
What checkpoint proves success?
What recovery or failure path applies?
```

Example:

```json
{
  "id": "open_auto_loan_offer",
  "phase": "open_offer",
  "intent": "view_preapproved_auto_loan_offer",
  "risk": "safe",
  "action": {
    "type": "click",
    "target": {
      "id": "auto_loan_offer_row",
      "description": "Pre-approved Auto Loan offer row",
      "fingerprint": {
        "semantic": {
          "role": "row",
          "name_contains": "Pre-approved Auto Loan"
        },
        "visual": {
          "anchor_text": "Pre-approved Auto Loan",
          "near_text": "Active"
        },
        "structure": {
          "region": "offers_table"
        },
        "adapter_hints": {
          "browser.playwright": {
            "locator": "text=Pre-approved Auto Loan"
          }
        }
      },
      "confidence": {
        "minimum": 0.85,
        "signals": ["role_name_match", "same_region", "unique_match"]
      }
    }
  },
  "checkpoint": {
    "type": "text_visible",
    "value": "Offer Terms"
  }
}
```

### Phase And Step Semantics

Phases provide business-level reviewability:

```text
find_member
open_offer
review_terms
advance_to_review
extract_outputs
```

Steps provide deterministic replay:

```text
click member search
type member_id
click matching member row
click Offers tab
click auto-loan offer row
select vehicle type
click Continue to Review
assert Final Review
extract APR, max amount, term, and status
```

This avoids two failure modes:

```text
too low-level:
  A reviewer sees only clicks and selectors.

too high-level:
  Replay depends on hidden imperative code.
```

Every step should have a stable `id` because logs, drift reports, interventions, tenant overlays, and tests all need a common reference point.

## Target Resolution

Replay resolves targets through layered target fingerprints:

```text
1. semantic: role, name, label, accessible state
2. visual: visible text, nearby text, region
3. structural: table row, form field, section, relative position
4. adapter hints: Playwright locator fallback
```

Resolution rules:

```text
single high-confidence match -> act
zero high-confidence matches -> failure or drift report
multiple high-confidence matches -> needs_human
blocked intent -> blocked before action
```

This avoids brittle raw coordinates and avoids relying only on clean DOM selectors.

### Target Fingerprint Scoring

Target resolution should score candidates rather than blindly use the first match. Example signals:

```text
role_name_match:
  role and accessible name match the semantic fingerprint

visible_text_match:
  visible text or anchor text matches

same_region:
  candidate appears in the expected table, form, tab group, or page section

near_text_match:
  candidate is near an expected label or adjacent table cell

unique_match:
  only one candidate passes the threshold

adapter_hint_match:
  Playwright fallback locator resolves to a candidate
```

The deterministic rule is:

```text
score candidates
discard candidates below threshold
if one candidate remains, act
if multiple candidates remain, return needs_human
if none remain, return failure or surface_drift_detected
```

The scoring system is not meant to make replay "smart" in the LLM sense. It is a deterministic confidence gate that prevents unsafe clicks.

## Deterministic Replay

Replay is an artifact interpreter:

```text
load artifact
validate artifact schema
validate input params
apply tenant overlay if requested
open target app
for each step:
  check safety policy
  detect known outcomes
  resolve target
  execute action through SurfaceAdapter
  verify checkpoint
  extract outputs when declared
write structured result and evidence
```

No Gemini calls occur during replay.

Replay statuses:

```text
success
business_outcome
needs_human
failure
blocked
```

Result shape:

```json
{
  "status": "success | business_outcome | needs_human | failure | blocked",
  "capability_id": "prepare_auto_loan_offer_review",
  "run_id": "run_...",
  "step_id": "optional_step",
  "code": "optional_code",
  "message": "human-readable summary",
  "outputs": {},
  "evidence": {}
}
```

### Replay Design Trade-Offs

Replay intentionally does not call Gemini. A bounded LLM recovery step was considered, but rejected for the core path:

```text
Pros of LLM recovery:
  Could handle mild drift or unexpected UI changes.

Cons:
  Blurs the assignment's required distinction between discovery and deterministic replay.
  Makes safety harder to reason about.
  Makes evidence harder to compare.
```

Instead, replay handles variance through:

```text
target fingerprints
tenant overlays
known outcomes
recoverable-condition rules
human handoff
drift reports
```

This keeps production invocation cheap, auditable, and repeatable.

### Replay State Machine

Replay moves through these states:

```text
initialize
validate_artifact
validate_params
apply_variant_overlay
open_surface
execute_step
verify_checkpoint
detect_outcome
extract_output
complete
```

Terminal states:

```text
success
business_outcome
needs_human
failure
blocked
```

`needs_human` is not a crash. It is a safe pause with enough context for an operator to act.

## Outcomes And Recovery

Known business outcomes:

```text
member_not_found
no_auto_loan_offer
offer_expired
not_auto_loan_offer
```

Handoff outcomes:

```text
ambiguous_member_match
disclosure_warning
supervisor_review_required
ambiguous_target
unknown_modal
```

Hard failures:

```text
target_not_found
checkpoint_failed
timeout
output_extraction_failed
surface_drift_detected
```

Blocked outcomes:

```text
policy_violation
blocked_intent
blocked_route
```

Recoverable conditions:

```text
slow_load -> retry wait/checkpoint
session_warning -> click "Stay signed in" if allowlisted
known_maintenance_modal -> dismiss if allowlisted
unknown_modal -> needs_human
```

### Error Taxonomy Rationale

The taxonomy exists to avoid conflating different kinds of "not success":

```text
business_outcome:
  The app answered the business question, but not with the desired happy path.
  Example: no active pre-approved auto-loan offer.

recoverable_condition:
  The UI presented a known runtime issue that can be handled safely.
  Example: session warning with an allowlisted Stay signed in button.

needs_human:
  The system lacks enough confidence or authority to proceed.
  Example: ambiguous member match.

failure:
  The automation or UI state did not match the artifact.
  Example: checkpoint failed.

blocked:
  The artifact or model attempted a forbidden action.
  Example: submit final application.
```

This distinction is important because the caller should react differently to each status. `no_auto_loan_offer` may be displayed to an agent as a normal answer. `surface_drift_detected` should route to capability maintenance. `policy_violation` should be reviewed as a safety event.

## Safety Policy

Use a configurable allowlist:

```json
{
  "allowed_origins": ["http://localhost:3000"],
  "allowed_actions": ["click", "type", "select", "extract", "assert", "wait", "finish", "escalate"],
  "approval_required_intents": [
    "advance_warned_offer_to_review",
    "acknowledge_disclosure_warning",
    "resolve_ambiguous_member_match"
  ],
  "blocked_intents": [
    "submit_final_application",
    "approve_loan",
    "disburse_funds",
    "run_credit_pull",
    "change_pricing",
    "change_loan_amount",
    "change_loan_term",
    "override_eligibility",
    "accept_member_signature"
  ]
}
```

The replay engine checks policy before every action. Blocked actions stop before clicking.

The assignment demo policy allows the normal `advance_to_review` step because the flow stops at the final review screen and never submits the application. A stricter production profile could classify `advance_to_review` as approval-required while still keeping `submit_final_application` blocked outright.

Risk classes:

```text
safe:
  search member, open profile, view offers, read terms, select non-binding options,
  advance to final review, extract outputs

approval_required:
  advance warned offer to review, acknowledge disclosure warning, resolve ambiguous match

blocked:
  submit final application, approve loan, disburse funds, run credit pull, change pricing
```

### Safety Trade-Offs

The selected safety model is intent-based plus action/origin allowlisting:

```text
origin allowlist:
  prevents the agent from acting outside the target app

action allowlist:
  constrains the physical action vocabulary

intent policy:
  captures business risk that action type alone cannot express
```

Action type alone is insufficient. A click can be safe when opening the Offers tab and dangerous when submitting a final loan application. Therefore every step carries both:

```text
action.type
intent
```

The policy checks both before execution.

### Policy Profiles

Support at least two conceptual profiles:

```text
demo profile:
  allows normal advance_to_review because the flow stops before final submission

production-strict profile:
  may require human approval for advance_to_review, warned offers, or any state-changing step
```

Both profiles block final submission, loan approval, disbursement, pricing changes, credit pulls, and e-signature acceptance.

## Data Handling

Use synthetic demo data only.

Artifacts store:

```text
schemas
step IDs
target fingerprints
policy metadata
output definitions
```

Artifacts do not store raw borrower PII, credentials, tokens, or real financial data.

Logs redact run parameters:

```json
{
  "member_id": "****16"
}
```

Screenshots are acceptable in this assignment because the app is local and synthetic. Production use would require screenshot redaction, restricted retention, and an enterprise model/data-processing setup before sending visual data to an external LLM.

### Data Handling Trade-Offs

There is a tension between rich observations and sensitive data exposure:

```text
raw screenshots:
  high context, high data risk

structured observations:
  lower data risk, easier to redact, still enough for this workflow

fully domain-modeled state:
  safest and easiest for the model, but too close to building an API around the UI
```

The design chooses structured observations by default, plus local screenshots for evidence. This keeps the system credible for regulated environments while still satisfying the assignment's computer-use requirement.

## Human Handoff

Use same-session manual handoff.

Primary handoff scenario:

```text
member_id=77777 returns multiple matching members
```

Flow:

```text
replay detects ambiguous_member_match
-> writes intervention-request.json
-> saves before screenshot
-> changes control lease from automation to human
-> pauses with browser left open
-> human selects correct member in the same browser session
-> human presses Enter to resume
-> system captures after screenshot
-> control lease returns to automation
-> replay observes current page and continues
```

Control lease shape:

```json
{
  "intervention_id": "int_001",
  "controller": "automation | human",
  "reason": "ambiguous_member_match",
  "step_id": "select_member_result"
}
```

Human action record:

```json
{
  "intervention_id": "int_001",
  "reason": "ambiguous_member_match",
  "before_screenshot": "...",
  "after_screenshot": "...",
  "human_summary": "Operator selected the Avery Patel row with DOB ending 1991.",
  "resume_checkpoint": "member_profile_visible"
}
```

Detailed keylogging is intentionally out of scope.

### Handoff Trade-Offs

Three handoff mechanisms were considered:

```text
mock-only handoff:
  Write an intervention file but do not actually pause the live session. Rejected because it
  would not satisfy the same-session control-transfer requirement.

full operator console:
  Best production experience, but too much UI and authentication work for the take-home.

CLI same-session handoff:
  Chosen. It is minimal but real: automation pauses, the browser remains open, a human
  acts in the same session, and automation resumes after explicit confirmation.
```

The control lease makes the handoff auditable. Automation should not continue while the lease holder is `human`, and human action should not be silently folded into automation logs.

### Handoff Patch Suggestions

When a human resolves an ambiguous state, the system can save a proposed artifact patch:

```json
{
  "type": "proposed_patch",
  "source": "human_handoff",
  "reason": "ambiguous_member_match",
  "suggestion": {
    "step_id": "select_member_result",
    "candidate_rule": "match member_id plus DOB suffix"
  },
  "status": "requires_review"
}
```

This is intentionally a suggestion, not an automatic artifact mutation. Human actions can teach the system where the artifact is underspecified, but changes to reusable capabilities should be reviewed.

## Heterogeneity And Multi-Tenant Design

The implemented surface is browser-based, but the system is designed around a general SurfaceAdapter seam:

```text
observe(): Observation
act(action): ActionResult
captureEvidence(): Evidence
```

Implemented adapter:

```text
BrowserSurfaceAdapter using Playwright
```

Future adapters:

```text
DesktopSurfaceAdapter using OS accessibility APIs, screenshots, OCR, and mouse/keyboard control
LegacyWebSurfaceAdapter using frame-aware browser control and table/visual anchors
```

Multi-tenant strategy:

```text
base artifact for app family
+ tenant/version overlays for UI differences
+ compatibility metadata
+ drift detection
```

Compatibility section:

```json
{
  "compatibility": {
    "app_family": "loan_servicing_portal",
    "base_variant": "default",
    "tested_variants": ["default"],
    "required_features": [
      "member_search",
      "member_profile",
      "offers_tab",
      "auto_loan_offer_review"
    ]
  },
  "variant_overlays": {}
}
```

Example overlay:

```json
{
  "variant_overlays": {
    "tenant_b": {
      "target_overrides": {
        "open_offers_tab.target": {
          "fingerprint": {
            "semantic": {
              "role": "tab",
              "name": "Pre-Approvals"
            },
            "visual": {
              "anchor_text": "Pre-Approvals"
            }
          }
        }
      }
    }
  }
}
```

Replay applies a selected tenant overlay before executing. If targets or checkpoints no longer match, replay returns `surface_drift_detected` with expected vs observed evidence instead of guessing.

### Multi-Tenant Trade-Offs

Three reuse strategies were considered:

```text
record per tenant:
  Simple but does not scale. Hundreds of tenants times many apps creates repeated work and
  inconsistent safety review.

one universal artifact:
  Elegant but unrealistic. Tenant branding, labels, routes, version differences, and
  permissions will vary.

base artifact plus variant overlays:
  Chosen. Shared business contract and base recipe, with small tenant/version-specific
  changes where necessary.
```

The contract is shared:

```text
inputs
outputs
business outcomes
safety policy
phase names
high-level intent
```

The overlay can change:

```text
target names
route checkpoints
table column mappings
inserted warning steps
known outcomes for a tenant variant
```

This gives a practical path from one implemented tenant to many configured tenants without building a full registry.

### Drift Management

Replay should classify drift by severity:

```text
locator_degraded:
  primary target failed but approved fallback succeeded

overlay_recommended:
  base target failed, but a likely alternate label was observed

surface_drift_detected:
  required feature, target, checkpoint, or output mapping no longer matches safely
```

A drift report should include:

```text
step_id
expected fingerprint
observed visible text/controls
candidate matches with scores
screenshot path
optional suggested overlay
```

This creates a maintenance path: a reviewer can decide whether to approve a tenant overlay, re-record the capability, or mark the tenant unsupported.

## Evidence And Observability

Each run produces:

```text
JSONL event log
result JSON
screenshots
artifact JSON when discovery succeeds
intervention request JSON when handoff occurs
drift report JSON when drift is detected
```

Event shape:

```json
{
  "ts": "2026-08-16T10:15:42Z",
  "run_id": "run_discovery_001",
  "phase": "find_member",
  "step_id": "enter_member_id",
  "event": "action_executed",
  "actor": "gemini | replay | human",
  "intent": "search_member",
  "action_type": "type",
  "target_id": "member_id_field",
  "risk": "safe",
  "status": "ok"
}
```

### Evidence Design Trade-Offs

Evidence is intentionally structured instead of being only a video or raw transcript:

```text
JSONL logs:
  machine-readable, diffable, and easy to inspect step by step

screenshots:
  richer visual context for failures, handoff, and final state

result JSON:
  stable contract for caller-facing outcomes

raw Gemini transcript:
  useful for debugging discovery, but not the primary artifact and should not be required
  for replay or review
```

The logs should include the model's short reason summary during discovery, but replay logs should prove deterministic execution by showing that no model decision was requested.

## Demo Scenarios

Use five scenarios:

```text
1. discovery_success
   member 24816
   Gemini completes the flow and writes the artifact.

2. replay_success
   member 24816
   Replay runs without Gemini and reaches final review.

3. replay_business_outcome
   member 99999
   Member exists but has no active pre-approved auto loan offer, or no member is found.

4. replay_handoff
   member 77777
   Ambiguous member match causes same-session human handoff.

5. replay_blocked_policy
   test artifact attempts submit_final_application.
   Safety policy blocks before action.
```

Optional mock data:

```text
55555
Has offer but triggers disclosure or eligibility warning.
Useful if time allows an extra recoverable/escalation demo.
```

## Mock Data Matrix

```text
24816:
  Maya Chen
  Active pre-approved auto loan offer
  Offer ID OFFER-4421
  APR 6.49%
  Max amount $25,000
  Term 60 months

99999:
  Jordan Rivera
  No active pre-approved auto loan offer

77777:
  Ambiguous member search returns two Avery Patel records
  Human must choose correct row

55555:
  Sam Morgan
  Active offer with disclosure or eligibility warning
```

## CLI And Demo Contract

The README should expose a small command surface that maps directly to the assignment demo.

### Setup Commands

Expected setup flow:

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

Required environment variables:

```text
GEMINI_API_KEY:
  required only for real discovery

DISCOVERY_MODEL:
  default gemini-2.5-pro

LLM_MODE:
  gemini | mock

SEND_SCREENSHOTS_TO_LLM:
  false by default
```

### App Command

```bash
npm run app
```

Starts the local Loan Servicing Portal on `http://localhost:3000`.

### Discovery Command

```bash
npm run discover -- \
  --goal "Find member 24816, open their pre-approved auto loan offer, and advance it to the final review screen." \
  --target http://localhost:3000 \
  --params examples/params/happy-path.json \
  --out evidence/discovery-success
```

Expected outputs:

```text
evidence/discovery-success/discovery-log.jsonl
evidence/discovery-success/result.json
evidence/discovery-success/screenshots/
evidence/prepared-auto-loan-offer-review.v1.json
```

### Replay Success Command

```bash
npm run replay -- \
  --artifact evidence/prepared-auto-loan-offer-review.v1.json \
  --params examples/params/happy-path.json \
  --out evidence/replay-success \
  --allow-draft
```

Expected terminal result:

```text
status=success
review_status=ready_for_final_review
```

### Business Outcome Command

```bash
npm run replay -- \
  --artifact evidence/prepared-auto-loan-offer-review.v1.json \
  --params examples/params/no-offer.json \
  --out evidence/replay-business-outcome \
  --allow-draft
```

Expected terminal result:

```text
status=business_outcome
code=no_auto_loan_offer
```

### Handoff Command

```bash
npm run replay -- \
  --artifact evidence/prepared-auto-loan-offer-review.v1.json \
  --params examples/params/ambiguous-member.json \
  --out evidence/replay-handoff \
  --allow-draft \
  --interactive-handoff
```

Expected behavior:

```text
automation pauses
intervention-request.json is written
browser remains open
human selects the correct member
human presses Enter to resume
automation continues from the same session
```

### Blocked Policy Command

```bash
npm run replay -- \
  --artifact examples/artifacts/blocked-submit-attempt.v1.json \
  --params examples/params/happy-path.json \
  --out evidence/replay-blocked-policy \
  --allow-draft
```

Expected terminal result:

```text
status=blocked
code=policy_violation
step_id=submit_final_application
```

### Mock LLM Command

```bash
npm run discover -- \
  --llm mock \
  --goal "Find member 24816, open their pre-approved auto loan offer, and advance it to the final review screen." \
  --target http://localhost:3000 \
  --params examples/params/happy-path.json \
  --out evidence/mock-discovery
```

This supports local repeatability without a Gemini API key. The submitted evidence must still include at least one real Gemini discovery run.

## Cuts

Do not build:

```text
full production operator console
real multi-tenant artifact registry
queues or distributed services
desktop automation adapter
real bank integration
credential management beyond local environment variables
full artifact approval workflow
automatic LLM recovery during replay
```

Implement clean seams and document these as next steps.

## Testing Strategy

Focus tests where behavior matters:

```text
artifact schema validation
safety policy allow/block decisions
target resolution confidence behavior
replay result status mapping
known outcome detection
tenant overlay application
redaction helpers
```

End-to-end smoke tests should run against the local Loan Servicing Portal for:

```text
replay_success
replay_business_outcome
replay_blocked_policy
```

The real Gemini discovery run is captured as evidence rather than required for every test run. A mock LLM mode should support local repeatability without an API key.
