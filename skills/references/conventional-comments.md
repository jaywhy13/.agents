# Conventional Comments Reference

Format: `**<label> (<decorations>):** <subject>`

Every comment MUST include `AI-suggestion` as a decoration.

## Labels

| Label | Meaning | When to use |
|-------|---------|-------------|
| `suggestion` | Proposes a specific improvement | Code can be better; you have a concrete alternative |
| `issue` | Identifies a problem that needs fixing | Bugs, performance problems, correctness errors |
| `nitpick` | Minor stylistic or preference-based feedback | Formatting, naming, trivial inconsistencies |
| `thought` | Shares an observation without demanding action | Design considerations, things to watch for |
| `praise` | Highlights something well done | Good patterns, clever solutions, thoroughness |
| `note` | Provides context or information | Documenting intent, flagging awareness items |
| `question` | Asks for clarification | Unclear intent, ambiguous behavior |

## Decorations

Always include `AI-suggestion`. Optionally add:

| Decoration | Meaning |
|-----------|---------|
| `blocking` | Must be resolved before merge |
| `non-blocking` | Can be addressed later |
| `performance` | Performance-related |
| `security` | Security-related |
| `testing` | Test quality or coverage |

## Formatting Examples

Single decoration:
```
**suggestion (AI-suggestion):** Memoize `payload` to avoid repeated JSON parsing.
```

Multiple decorations:
```
**issue (AI-suggestion, performance):** Extra API call on every empty campaign list adds unnecessary latency.
```

Blocking:
```
**issue (AI-suggestion, blocking):** This will raise a `NoMethodError` when `result` is nil.
```

Praise:
```
**praise (AI-suggestion):** Good consolidation moving validation into the parameter declaration.
```

With explanation body:
```
**suggestion (AI-suggestion, performance):** Memoize `payload` to avoid repeated JSON parsing.

Every call to `campaign_id` or `status` re-parses the JSON. The existing Google equivalent memoizes with `@payload ||=`. Should match that pattern:

\`\`\`ruby
def payload
  @payload ||= JSON.parse(tactic_change.payload)
end
\`\`\`
```
