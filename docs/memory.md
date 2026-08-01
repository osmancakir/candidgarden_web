# Memory

Production runs in Cloudflare's Workers runtime, so there is no VM, container,
or swap file to size. The application must remain within the active Workers
plan's memory and CPU limits.

Request bodies and responses should be streamed where practical. Uploaded image
files are bounded by application validation before they are buffered for the S3
SDK, and rendered HTML/image responses are streamed. Consult the current
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
before increasing upload sizes or adding memory-heavy dependencies.
