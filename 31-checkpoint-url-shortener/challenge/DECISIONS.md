# Decisions

Record the trade-offs you made. At least the two decisions below are required (add a third for
click analytics if you like). Replace every HTML comment with your own words; the tests check that
each heading exists and has at least 20 words.

## Decision 1: Redirect status code

### Context
<!-- What does the redirect need to support (analytics, expiry, deletion, changing the target)?
What do browsers and proxies do with each status code? -->

### Options considered
<!-- 301 Moved Permanently, 302 Found, 307/308. Pros and cons of each, including caching behaviour
and what happens to click counts. -->

### Decision
<!-- Which one, plus any Cache-Control header you send with it, and the main reason. -->

### Consequences
<!-- What does it cost (traffic, latency for repeat visitors)? When would you choose differently? -->

## Decision 2: How short codes are generated

### Context
<!-- Length, alphabet, guessability, write rate, custom aliases sharing the same namespace. -->

### Options considered
<!-- Hash of the URL, database sequence + base62, sequence + scramble, random + retry on collision,
pre-generated key pool... -->

### Decision
<!-- What you built and why; how collisions and alias races are handled. -->

### Consequences
<!-- Collision probability at your scale, what changes at 100x writes. -->
