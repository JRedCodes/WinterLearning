# Symptoms captured during the incident

Outputs pasted into the incident channel by different people over about an hour.
They're in rough chronological order. Some problems only became visible after someone
hot-fixed an earlier one directly in the cluster (those hot-fixes were NOT committed, so
every problem is still in `broken/`).

| File | Captured by | What |
|---|---|---|
| `01-get-pods.txt` | on-call | first look after the deploy |
| `02-describe-pod-config.txt` | on-call | why the pods won't start |
| `03-after-secret-hotfix.txt` | on-call | pods after patching the Secret by hand |
| `events.txt` | Sam | namespace events, 15 minutes later |
| `04-describe-pod-running.txt` | Sam | one of the pods that stays not-ready |
| `05-service-and-endpoints.txt` | Priya | why the Service routes nowhere |
| `06-debug-pod.txt` | Priya | testing the Service from inside the cluster after a selector hot-fix |
| `07-ingress.txt` | Dani | the public URL, after all the above was hot-fixed |
