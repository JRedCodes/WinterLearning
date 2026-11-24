# curl cheat sheet

## Seeing what happens

```bash
curl URL                         # body only
curl -i URL                      # status line + response headers + body
curl -I URL                      # HEAD request (headers only)
curl -v URL                      # verbose: connection, TLS, request (>) and response (<) headers
curl -sS URL                     # silent, but still show errors (good for scripts)
curl --trace-ascii - URL         # every byte, for the really stubborn bugs
```

## Methods, headers and bodies

```bash
curl -X DELETE URL
curl -H 'accept: application/json' -H 'authorization: Bearer TOKEN' URL

# JSON body (-d implies POST; set the content type yourself!)
curl URL -H 'content-type: application/json' -d '{"url":"https://nodejs.org"}'
curl -X PUT URL -H 'content-type: application/json' -d @bookmark.json     # body from file
curl URL --json '{"url":"https://nodejs.org"}'   # curl ≥ 7.82: sets content-type + accept for you

# form data
curl URL -d 'a=1&b=2'                            # application/x-www-form-urlencoded
curl URL -F 'file=@photo.jpg'                    # multipart/form-data upload

# query strings: quote the URL so the shell doesn't eat & and ?
curl 'localhost:3000/bookmarks?tag=node&limit=5'
curl -G localhost:3000/search --data-urlencode 'q=café & crème'
```

## Conditional requests and caching

```bash
curl -i URL -H 'if-none-match: "etag-value"'
curl -i URL -H 'if-modified-since: Tue, 24 Nov 2026 10:00:00 GMT'
curl -i -X PUT URL -H 'if-match: "etag-value"' --json '{...}'
```

## Redirects, cookies, auth

```bash
curl -L URL                         # follow redirects
curl -c cookies.txt -b cookies.txt URL   # save and send cookies (session flows)
curl -u user:pass URL               # basic auth
```

## Timing and status only

```bash
curl -o /dev/null -s -w '%{http_code}\n' URL
curl -o /dev/null -s -w 'dns %{time_namelookup}s connect %{time_connect}s tls %{time_appconnect}s ttfb %{time_starttransfer}s total %{time_total}s\n' https://example.com
```

`time_connect` minus `time_namelookup` is roughly one TCP round trip. `time_appconnect` adds TLS. `time_starttransfer` (time to first byte) includes your server's processing time. This one line is a great way to see the cost of connection setup from section 1 of the lesson.

## Protocol versions and connections

```bash
curl --http1.1 URL
curl --http2 https://URL
curl -v URL URL                     # two requests on one command: look for "Re-using existing connection"
curl -H 'connection: close' -v URL
```

## Testing your server's edge cases (challenge)

```bash
curl -i localhost:3000/bookmarks -X PATCH                          # 405 + Allow
curl -i localhost:3000/nope                                        # 404
curl -i localhost:3000/bookmarks -H 'content-type: text/plain' -d '{}'   # 415
curl -i localhost:3000/bookmarks -H 'content-type: application/json' -d '{"url":'   # 400
head -c 20000 /dev/zero | tr '\0' 'a' | \
  curl -i localhost:3000/bookmarks -H 'content-type: application/json' --data-binary @-   # 413
curl -i localhost:3000/bookmarks -H 'content-type: application/json' \
  -H 'transfer-encoding: chunked' -d '{"url":"https://e.x"}'      # chunked body
```

## jq companions

```bash
curl -s localhost:3000/bookmarks | jq '.data | length'
curl -s localhost:3000/bookmarks | jq -r '.data[] | "\(.id)\t\(.url)"'
ID=$(curl -s localhost:3000/bookmarks --json '{"url":"https://e.x"}' | jq -r .data.id)
```
