# YAML gotchas for Kubernetes manifests

YAML looks friendly, and that's the trap: a lot of mistakes produce *valid* YAML that means something different from what you intended. The API server then either rejects it with a confusing message or, worse, accepts it.

## 1. Types are guessed from how a value looks

YAML 1.1 parsers (and Kubernetes accepts a lot of YAML 1.1 behaviour) turn unquoted scalars into types:

| You wrote | Parsed as | Problem |
|---|---|---|
| `DB_PORT: 5432` | integer | ConfigMap `data` and env `value` must be strings → rejected |
| `ENABLED: true` / `yes` / `on` | boolean | same, and `on`/`yes`/`no` surprise people |
| `NORWAY: NO` | boolean false (YAML 1.1) | the famous "Norway problem" |
| `VERSION: 1.10` | float 1.1 | your version just lost a digit |
| `ZIP: 01234` | octal or string depending on the parser | quote it |
| `TIME: 12:30` | sexagesimal 750 in YAML 1.1 | quote it |
| `key: ~` or `key:` | null | an empty value, not an empty string |

**Rule:** in `ConfigMap.data`, `Secret.stringData`, env `value:` and annotations, quote every value that isn't obviously text: `"5432"`, `"true"`, `"1.10"`. Fields that *are* typed in the schema (`replicas: 3`, `containerPort: 3000`, `runAsNonRoot: true`) take real numbers and booleans, and quoting those is wrong.

## 2. Indentation is structure

```yaml
# Intended: env belongs to the container
containers:
  - name: api
    image: wl-kudos-api:1.0.0
  env:                      # ❌ two spaces less: now `env` is a sibling of `containers`
    - name: LOG_LEVEL
      value: debug
```

Depending on where the misplaced key lands, the API server either rejects an unknown field (`strict decoding error: unknown field "spec.template.spec.env"`) or silently ignores it with older clients. Always run `kubectl apply --dry-run=server -f` (or at least `kubectl diff`) and read the result.

Use spaces, never tabs. Two spaces per level is the convention. Configure your editor to show whitespace in YAML files, and install a YAML language server with the Kubernetes schema (the Red Hat YAML extension for VS Code does this): it underlines unknown fields as you type.

## 3. Lists vs maps

```yaml
ports:
  - containerPort: 3000     # a list of one map
    name: http
```

```yaml
ports:
  containerPort: 3000       # ❌ a map: "cannot unmarshal object into ... of type []v1.ContainerPort"
```

A leading `- ` starts a new list item. Keys indented under the first key of an item belong to the same item. A common bug is an accidental extra `-`, which splits one item into two:

```yaml
env:
  - name: DB_PASSWORD
  - valueFrom:              # ❌ second item with no name
      secretKeyRef: { name: kudos-db, key: DB_PASSWORD }
```

## 4. Flow style is fine, mixing it is risky

`{ name: kudos-db, key: DB_PASSWORD }` and `["ALL"]` are valid YAML (JSON-ish "flow" style). They're compact for small maps, but inside flow style, commas and colons are structural, so quote values that contain them.

## 5. Multi-document files

`---` on its own line separates documents. `kubectl apply -f` handles many per file. Watch out for:

- a `---` at the very top followed by nothing (harmless), or two in a row (an empty document, also harmless with kubectl but noisy for other tools);
- a document that's only comments, which parses to `null` (the challenge tests skip those);
- `...` (end of document marker): rare, but legal.

## 6. Block scalars for multi-line strings

```yaml
data:
  app.conf: |               # literal: keeps newlines
    level=info
    format=json
  oneliner: >               # folded: newlines become spaces
    this becomes
    one line
```

Add `-` to strip the trailing newline (`|-`). Useful for embedding config files in ConfigMaps, scripts in `command`, or certificates.

## 7. Commands and quoting

```yaml
command: ["sh", "-c", 'pg_isready -h 127.0.0.1 -U "$POSTGRES_USER"']
```

Exec-form `command` does **not** go through a shell, so `$VARS` aren't expanded there. Kubernetes does expand `$(VAR)` (parentheses) using the container's env vars, but for anything shell-like (`&&`, `$VAR`, loops) wrap it in `sh -c`. Use single quotes on the YAML side when the shell string contains double quotes.

## 8. Duplicate keys

```yaml
metadata:
  labels:
    app: kudos-api
  labels:                   # ❌ duplicate key
    tier: backend
```

Many YAML parsers keep the last one silently (the `yaml` npm package used by the tests reports an error). The first `labels` block is gone and your selector no longer matches. Linters such as `yamllint` catch this.

## 9. Base64 in Secrets

`data:` values must be base64 **without** a trailing newline. `echo "pw" | base64` encodes `pw\n`, and now your password has a newline in it. Use `printf %s pw | base64` or `echo -n`, or just use `stringData:` with plain text and let the API server encode it.

## Tooling that catches these early

```bash
kubectl apply --dry-run=server -f k8s/     # needs a cluster; full validation incl. admission
kubectl apply --dry-run=client -f k8s/     # local parse + basic checks
yamllint k8s/                              # style + duplicate keys + truthy values
kubeconform -strict -summary k8s/          # schema validation without a cluster
```

The tests in this challenge go one step further: they check *consistency between* objects (selectors, ports, ConfigMap keys), which none of the tools above do.
