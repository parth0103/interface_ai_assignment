# Computer-Use Automation System

This repository implements a focused computer-use automation system for a mock Loan Servicing Portal.

The demo goal is:

```text
Find member 24816, open their pre-approved auto loan offer, and advance it to the final review screen.
```

Claude was used for the final committed real-model discovery evidence. Gemini and mock modes are also supported. Replay is deterministic and does not call any model.

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

Environment variables:

```text
ANTHROPIC_API_KEY=required for real Claude discovery
CLAUDE_MODEL=claude-sonnet-5
GEMINI_API_KEY=required for real Gemini discovery
DISCOVERY_MODEL=gemini-2.5-flash
LLM_MODE=mock, claude, anthropic, or gemini
SEND_SCREENSHOTS_TO_LLM=false
PORT=3000
```

## Run The Local App

```bash
npm run app
```

Open `http://localhost:3000`.

## Demo: Discovery

Mock mode:

```bash
LLM_MODE=mock npm run discover -- \
  --llm mock \
  --goal "Find member 24816, open their pre-approved auto loan offer, and advance it to the final review screen." \
  --target http://localhost:3000 \
  --params examples/params/happy-path.json \
  --out evidence/mock-discovery
```

Real Claude mode, matching the committed evidence:

```bash
SEND_SCREENSHOTS_TO_LLM=true npm run discover -- \
  --llm claude \
  --goal "Find member 24816, open their pre-approved auto loan offer, and advance it to the final review screen. Extract the review status before finishing." \
  --target http://localhost:3000 \
  --params examples/params/happy-path.json \
  --out evidence/discovery-claude-real-8
```

The successful discovery run writes:

```text
evidence/discovery-claude-real-8/artifact.v1.json
evidence/discovery-claude-real-8/discovery/run-log.jsonl
```

Real Gemini mode is also supported with `--llm gemini` and `GEMINI_API_KEY`.

## Demo: Replay Success

```bash
npm run replay -- \
  --artifact evidence/discovery-claude-real-8/artifact.v1.json \
  --params examples/params/happy-path.json \
  --out evidence/replay-11-success \
  --allow-draft
```

## Demo: Business Outcome

```bash
npm run replay -- \
  --artifact evidence/discovery-claude-real-8/artifact.v1.json \
  --params examples/params/no-offer.json \
  --out evidence/replay-12-business-outcome \
  --allow-draft
```

Expected status: `business_outcome`.

## Demo: Human Handoff

```bash
npm run replay -- \
  --artifact evidence/discovery-claude-real-8/artifact.v1.json \
  --params examples/params/ambiguous-member.json \
  --out evidence/replay-13-handoff \
  --allow-draft
```

Expected status for committed evidence: `needs_human`, code: `ambiguous_target`.

Optional interactive same-session handoff demo:

```bash
npm run replay -- \
  --artifact evidence/discovery-claude-real-8/artifact.v1.json \
  --params examples/params/ambiguous-member.json \
  --out evidence/replay-handoff-interactive \
  --allow-draft \
  --interactive-handoff
```

## Demo: Blocked Policy

```bash
npm run replay -- \
  --artifact examples/artifacts/blocked-submit-attempt.v1.json \
  --params examples/params/happy-path.json \
  --out evidence/replay-14-blocked-policy \
  --allow-draft
```

Expected status: `blocked`, code: `policy_violation`.

## Test

```bash
npm run typecheck
npm test
npm run test:e2e
npm run evidence:validate
```

## Evidence Map

```text
evidence/discovery-claude-real-8/artifact.v1.json
evidence/discovery-claude-real-8/discovery/run-log.jsonl
evidence/replay-11-success/replay/result.json
evidence/replay-11-success/replay/run-log.jsonl
evidence/replay-12-business-outcome/replay/result.json
evidence/replay-12-business-outcome/replay/run-log.jsonl
evidence/replay-13-handoff/replay/result.json
evidence/replay-13-handoff/replay/run-log.jsonl
evidence/replay-14-blocked-policy/replay/result.json
evidence/replay-14-blocked-policy/replay/run-log.jsonl
```
