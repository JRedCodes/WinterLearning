# Incident 2026-10-14: "Checkout is spinning forever"

You're on the checkout team. Yesterday afternoon customers couldn't pay. Things recovered on their own after the on-call engineer rolled back. Nobody has written down *why* it happened yet. That's your job.

## What we know from Slack

- **14:19** Support: "Lots of tickets: the Pay button spins and then the page errors. Started maybe 20 minutes ago?"
- **14:22** PagerDuty pages on-call: `CheckoutSuccessRateLow` (successful checkouts per minute < 40% of the same time last week, for 10 minutes).
- **14:24** On-call: "Checkout pods are all Ready, CPU is low, no 5xx in the dashboard. Weird. Looking."
- **14:31** On-call: "Payments team says they had a short blip with a couple of 502s around 14:15 but they're green now. Not sure that's it."
- **14:37** On-call: "Giving up on finding it live. Rolling back to the last known good release."
- **14:41** On-call: "Rollback done. Checkouts recovering."
- **14:45** Support: "Customers say it works again."

## What's in this folder

| File | What it is |
|---|---|
| `logs.ndjson` | Log lines from the checkout service (all pods) between 13:40 and 14:50 UTC, one JSON object per line, debug level included. **Sampled:** lines that carry a `traceId` are kept for about 1 in 50 traces (a kept trace keeps all of its lines); lines without a `traceId` (startup, shutdown, connection-pool warnings) are all kept. Multiply request counts by ~50 for real volume. |
| `metrics-1350.txt` | A `/metrics` snapshot from one pod **before** the incident. |
| `metrics-1420.txt` | A `/metrics` snapshot from one pod **during** the incident. |
| `POSTMORTEM.md` | The template you fill in. |

## Investigating

Treat the logs like a database. A few starting points with `jq` (install it if you don't have it; there's a Node alternative below):

```bash
# What kinds of messages are there, and how many of each?
jq -r '.msg' logs.ndjson | sort | uniq -c | sort -rn

# Which versions were running, and when did each pod start?
jq -c 'select(.msg == "service starting") | {time, pod, version}' logs.ndjson

# Warnings and errors only
jq -c 'select(.level == "warn" or .level == "error") | {time, msg}' logs.ndjson | head -50

# Follow ONE request end-to-end by its requestId
jq -c 'select(.requestId == "PASTE-AN-ID-HERE")' logs.ndjson
```

No `jq`? `node -e` works too:

```bash
node -e 'const lines=require("fs").readFileSync("logs.ndjson","utf8").trim().split("\n").map(JSON.parse);
const c={}; for (const l of lines) c[l.msg]=(c[l.msg]||0)+1; console.log(c)'
```

Questions worth answering before you write anything:

1. When did customer impact start and end? Which signal tells you?
2. What changed shortly before impact started?
3. Which requests were affected and which weren't? What does the unaffected path tell you?
4. Why didn't the dashboards show 5xx errors? Why did every pod stay Ready?
5. The payments blip: cause, symptom or coincidence?
6. Compare the two metrics snapshots line by line. What's new in the second one?
