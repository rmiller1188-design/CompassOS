# CompassOS P4A Review — OpenAI Attention Triage and Catch Me Up Core

## Review scope

P4A introduces Compass AI's first production attention layer. It selects a bounded set of normalized messages, sends only that compact advisory context to the OpenAI Responses API, validates structured model output, and produces a Catch Me Up brief with source provenance.

## Implemented guarantees

- Candidate selection is deterministic, explainable, and limited before model invocation.
- Model input contains normalized message context rather than provider credentials or raw token material.
- Responses API calls are server-side and specify `store: false`.
- Output uses strict JSON Schema.
- Model results may reference only supplied candidate IDs.
- Invented and duplicate item IDs are rejected.
- Scores, priorities, recommended actions, reasons, commitments, and due dates are validated.
- Catch Me Up sections retain the source account, message, thread, sender, and timestamp context.
- Model recommendations remain advisory and cannot execute mail or calendar actions.
- Provider response and request IDs are captured for operational diagnosis without exposing secrets.

## Validation

`npm run validate` syntax-checks the complete production core and runs the full Node test suite. P4A tests cover deterministic ranking, bounded selection, invented/duplicate ID rejection, Catch Me Up grouping, Responses API request shape, structured output parsing, and provider error propagation.

## Security and privacy boundary

- No OpenAI API key is committed or returned to clients.
- `store: false` is set on every attention request.
- No provider access or refresh token enters the model input.
- No outbound mail, message, contact, or calendar mutation is introduced.
- No unsupported iMessage database access is claimed.
- A later persistence layer must retain user control over memory and deletion.

## Explicit blockers

- Live OpenAI model evaluation requires a configured server-side API key.
- Prompt-quality evaluation requires a representative, user-approved dataset and acceptance criteria.
- Supabase persistence for briefs, user corrections, and model audit metadata is not included in P4A.
- No live-model quality or production latency claim is made.
