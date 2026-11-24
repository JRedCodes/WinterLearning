# Decision record · Where does Postgres run?

<!--
You deployed Postgres as a StatefulSet inside the cluster. That's right for a laptop.
Would you do the same in production? Write a short ADR (architecture decision record).
Each section needs at least 20 words of your own. Delete these comments if you like.
-->

## Context

<!-- What are we deploying, for whom, and what do we need from the database
(durability, backups, upgrades, failover, cost, team size/skills)? -->

## Options considered

<!-- At least: (a) StatefulSet in the cluster, (b) a managed database (RDS / Cloud SQL /
Azure Database / Neon...), maybe (c) a Postgres operator (CloudNativePG, Zalando).
One or two pros and cons each. -->

## Decision

<!-- Which option for LOCAL dev and which for PRODUCTION, and why. -->

## Consequences

<!-- What gets easier, what gets harder, what you now have to do (e.g. how the app gets
the DB host/password in each environment, how migrations run, backups). -->
