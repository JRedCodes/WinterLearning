# Dockerfile deep dive

The lesson covers the essentials. This page goes through the instructions you'll meet most, what each really does, and the details that bite in code review.

## Instructions that matter

| Instruction | Creates a layer? | Notes |
|---|---|---|
| `FROM image AS name` | starts a stage | Each `FROM` resets everything. `AS name` lets later stages `COPY --from=name`. |
| `WORKDIR /app` | tiny | Creates the dir if missing. Use it instead of `RUN cd` (each `RUN` is a new shell, so `cd` doesn't persist). |
| `COPY src dest` | yes | Cache key = instruction + checksum of the copied files. `--from=stage` copies from another stage, `--chown=user:group` sets ownership. |
| `ADD` | yes | Like COPY but also fetches URLs and auto-extracts tarballs. Prefer `COPY` unless you need that magic. |
| `RUN cmd` | yes | Cache key = the command **string**. `RUN apt-get update` stays cached forever even if upstream changed, which is why it's always combined with the install in one `RUN`. |
| `ENV K=v` | metadata | Visible to every later instruction **and** at runtime. Visible in `docker inspect`. Never secrets. |
| `ARG K` | metadata | Build-time only, but its value can still leak into `docker history` if used in `RUN`. Never secrets either. |
| `USER node` | metadata | Applies to later `RUN`, `CMD`, `ENTRYPOINT`, and the running container. |
| `EXPOSE 3000` | metadata | Documentation for humans and tools. It does **not** publish the port, `-p`/`ports:` does. |
| `HEALTHCHECK` | metadata | Docker runs it periodically. Ignored by Kubernetes. |
| `CMD` / `ENTRYPOINT` | metadata | `ENTRYPOINT` is the executable, `CMD` the default arguments (or the whole command if there's no entrypoint). |

## Shell form vs exec form

```dockerfile
RUN npm ci && npm cache clean --force        # shell form: runs under /bin/sh -c (fine for RUN)
CMD ["node", "dist/server.js"]               # exec form: no shell, node is PID 1
CMD node dist/server.js                      # shell form: sh is PID 1, signals don't reach node
```

For `RUN`, shell form is normal (you want `&&`). For `CMD`/`ENTRYPOINT`, use exec form. If you need a shell script to prepare things, end it with `exec node dist/server.js` so node *replaces* the shell and becomes PID 1.

## Secrets during the build

Sometimes the build needs a secret, such as a token for a private npm registry. Don't use `ARG NPM_TOKEN` or copy an `.npmrc` containing it: both end up in layers or history. Use BuildKit secret mounts:

```dockerfile
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci
```
```bash
docker build --secret id=npmrc,src=$HOME/.npmrc .
```

The secret exists only while that `RUN` executes and is never written to a layer.

## Faster builds

- **Order** (stable things first) is 90% of it.
- **Cache mounts** keep npm's download cache between builds without putting it in the image:
  `RUN --mount=type=cache,target=/root/.npm npm ci`
- **Parallel stages**: BuildKit builds independent stages concurrently. Splitting `deps` (prod-only install) from `build` (full install + tsc) lets both run at once.
- **CI layer cache**: with `docker/build-push-action`, `cache-from: type=gha` and `cache-to: type=gha,mode=max` store layers in the GitHub Actions cache.

## Smaller images

- Ship only runtime files: `node_modules` (prod), `dist/`, `package.json` (Node reads `"type": "module"` from it!), and runtime assets like `migrations/`.
- `npm cache clean --force` in the same `RUN` as `npm ci --omit=dev`, otherwise the cache is already in the layer.
- Removing files in a **later** layer doesn't shrink the image. The bytes are still in the earlier layer.
- Inspect: `docker history wl-26-api:local` shows each layer's size. The `dive` tool lets you browse layers interactively.

## A review checklist

- [ ] Base image pinned (major version at least, digest ideally)
- [ ] Multi-stage, final stage without dev deps, compilers or sources
- [ ] Manifests copied and installed before source
- [ ] `npm ci`, never `npm install`
- [ ] `.dockerignore` excludes node_modules, dist, .git, .env*
- [ ] `ENV NODE_ENV=production` in the final stage
- [ ] `USER` non-root, app files not writable by that user
- [ ] Exec-form `CMD` starting node directly
- [ ] `HEALTHCHECK` that doesn't need tools the image lacks
- [ ] No secrets in `ENV`, `ARG`, or copied files
- [ ] Image builds in CI and is tagged with the commit SHA
