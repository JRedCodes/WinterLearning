# Deep dive: investigating an incident from logs and metrics

The challenge hands you an hour of logs and two metrics snapshots. This page is a method you can reuse on any incident, real or practice.

## 1. Establish the shape of the impact

Before looking for causes, pin down the symptom precisely:

- **When** did it start and end? Find the first and last bad event, and the last good one.
- **What** was affected? Which routes, which pods, which versions, which customers?
- **What was not affected?** This is often the most informative question. If `/orders/:id` stayed fast on the same pods while `/checkout` hung, the process, the network and the database are probably fine. The problem is specific to checkout's code path.

With NDJSON logs, `jq` is your SQL:

```bash
# Count messages per minute for one message type
jq -r 'select(.msg=="request aborted by client") | .time[11:16]' logs.ndjson | uniq -c

# Group by a field
jq -r 'select(.url=="/checkout") | "\(.version) \(.statusCode // "aborted")"' logs.ndjson | sort | uniq -c
```

## 2. Ask "what changed?"

Most incidents are caused by a change: a deploy, a config change, a feature flag, a traffic shift, a dependency's deploy, a certificate expiring. Line up the start of impact against:

- `service starting` lines and their `version` field
- configuration logged at startup (good services log their effective non-secret config)
- feature flag changes
- the dependency team's deploy log

A change two minutes before impact is your prime suspect until proven otherwise.

## 3. Follow one bad request end to end

Pick a failed request and pull every line with its `requestId` (or `traceId`). Read them in time order. Where does the time go? What's the last thing that happened before it went quiet?

If an expected line is *missing* (the request never logged "upstream call completed" for payments), that tells you where it got stuck.

## 4. Use metrics to confirm the mechanism

Logs give you examples; metrics give you totals. Compare a "before" snapshot with a "during" one:

- Which series exist in "during" that didn't exist "before"? A new dependency label is a new code path.
- Utilization and saturation (USE) of pools: in-flight at the maximum plus a growing queue = saturation.
- Event-loop lag and CPU: high means busy (CPU-bound), low means waiting (I/O-bound).
- Histogram buckets: where did requests move? Are slow requests even being counted?

## 5. Separate trigger, mechanism and contributing factors

- **Trigger:** the event that started it (a dependency got slow, a deploy).
- **Mechanism / root cause:** why the trigger turned into *this much* impact. Usually a missing defence: no timeout, no limit, no fallback, no isolation between features.
- **Contributing factors:** things that made it worse or longer: detection gaps, misleading dashboards, a rollback that took too long.

Each item gets action items: remove the mechanism (the most valuable), detect faster, mitigate faster.

## 6. Watch for red herrings

Real incident data is noisy. Some things you'll see that are *not* the cause:

- Warnings that were happening at the same rate before the incident (check the baseline!).
- Another team's blip that coincides in time but doesn't touch the affected path.
- Errors that are *consequences* (timeouts in callers) rather than causes.

For each suspicious signal ask: was it there before impact started? Does it explain the requests that *weren't* affected? If you remove it, does the story still hold?

## 7. Write it down while it's fresh

Use the template. Back every timeline entry with evidence. Keep it blameless: describe decisions in the context of what people knew at the time. A postmortem is a tool for the organisation to learn, not a verdict.
