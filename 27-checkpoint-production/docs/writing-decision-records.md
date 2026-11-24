# Writing decision records

An **Architecture Decision Record** (ADR) is a short document that captures one significant decision: the situation, the options, what was chosen and what it costs. Teams keep them in the repo (`docs/adr/0007-sessions-in-redis.md`) so that a year later "why on earth is it like this?" has an answer.

## Why bother

- **Future you forgets.** The constraints that made a choice obvious in March are invisible in December.
- **New teammates** can learn the system's reasoning, not just its shape.
- **Reviews get better.** Writing options down forces you to consider more than one.
- **Interviews.** "Tell me about a technical trade-off you made" is one of the most common senior-track questions. ADRs are your prepared answers.

## The four sections

### Context
The forces at play: requirements, constraints, scale, team skills, deadlines. No solution yet. A good context makes the decision feel almost inevitable.

> Weak: "We need auth."
> Strong: "Browser-only clients on the same site; logout must take effect immediately; we already run Redis; 3–5 instances behind a load balancer."

### Options considered
At least two real options (three is better), each with honest pros and cons. Include the one you rejected that a smart colleague would suggest. "Do nothing" is sometimes a valid option.

### Decision
What you chose, stated plainly, and the main reason. Include the specific parameters that matter (TTLs, limits, flags), since those are what people will want to change later.

### Consequences
What gets easier, what gets harder, which risks you accepted, what you'd revisit and when. A decision with no downsides listed is a decision that wasn't examined.

## Style tips

- One decision per record. Keep it short: half a page to a page.
- Write for a reader who wasn't in the room.
- Be concrete: numbers, names of tables and keys, links to code.
- Don't rewrite history. If a decision changes, write a new record that **supersedes** the old one and link both ways.
- It's fine to say "we don't know yet. We'll revisit when X happens."

## Example (unrelated to the challenge)

```markdown
## Decision: Store money as integer cents

### Context
Order totals are summed across many line items and currencies with 2 decimal places.
JavaScript numbers are IEEE-754 doubles; 0.1 + 0.2 !== 0.3. Postgres is our source of truth.

### Options considered
1. JS number + Postgres double precision: simple, wrong under addition.
2. Postgres numeric(12,2) + strings in JS + a decimal library: exact, but every call site must
   remember to use the library, and pg returns numeric as strings.
3. Integer cents everywhere (bigint in Postgres, number in JS up to 2^53): exact and fast; needs
   formatting at the edges and breaks for 3-decimal currencies.

### Decision
Option 3. All amounts are `amount_cents bigint`; APIs accept and return cents; formatting happens only
in the frontend.

### Consequences
Arithmetic is exact and cheap. We must convert at every boundary, and currencies with 3 decimals (KWD)
would need a per-currency exponent: deferred until we sell there.
```
