# Redirects

Cloudflare terminates HTTPS before requests reach the Worker, so production does
not need the former Express HTTP-to-HTTPS middleware.

The Worker redirects `GET` and `HEAD` requests with trailing slashes to their
canonical path while preserving the query string. For example,
`https://example.com/foo/?page=2` redirects to `https://example.com/foo?page=2`.

Use Cloudflare Redirect Rules or Bulk Redirects for hostname-wide redirects,
such as redirecting `www.example.com` to `example.com`. Attach both hostnames to
Cloudflare, enable their certificates, and configure the redirect in the
dashboard. Keeping hostname policy at the edge avoids invoking the application
Worker for redirect-only traffic.
