# Decision: how "import from URL" defends against SSRF

<!--
The pentest showed import-from-URL could reach internal services and the cloud metadata endpoint.
You fixed it in code. Now record the decision: what you chose, what else you could have done, and what's still exposed.
Delete these comments when you're done.
-->

## Context

<!-- What the feature does, why it's dangerous, what an attacker could reach from our network. -->
TODO

## Options considered

<!-- At least two. E.g. IP blocklist after DNS resolution; domain allowlist; an egress proxy that enforces policy; running the fetcher in an isolated network with no route to internal ranges; dropping the feature. -->
TODO

## Decision

<!-- What you implemented, and what you'd add before going to production. -->
TODO

## Consequences

<!-- Remaining risks (DNS rebinding / TOCTOU, IPv6 corner cases, new internal ranges), operational cost, what users can no longer do. -->
TODO
