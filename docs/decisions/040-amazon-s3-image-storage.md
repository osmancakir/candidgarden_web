# Use Amazon S3 for Image Storage

Date: 2026-08-01

Status: accepted

## Context

Keeping uploaded image binaries in the relational database increases database
size, backup complexity, and query workload. The application needs durable,
scalable object storage while retaining image ownership and relationships in
PostgreSQL.

## Decision

Store uploaded image binaries in private Amazon S3 buckets and retain their
object keys and metadata in PostgreSQL. Use the official AWS SDK for JavaScript
for uploads and short-lived signed downloads rather than maintaining request
signing code in the application.

Production and staging use separate buckets and least-privilege application
identities. The buckets remain private; the application proxies image reads for
optimization and delivery.

## Consequences

### Positive

1. Binary data is separated from relational data and its backups.
2. AWS maintains region selection, endpoint construction, credential resolution,
   URL encoding, signing, retries, and protocol behavior in the SDK.
3. IAM roles and temporary credentials are supported through the SDK's default
   credential provider chain.
4. Private buckets do not require browser-facing CORS or public access.
5. Existing database object keys remain valid when objects are copied with the
   same keys.

### Negative

1. Each environment needs a bucket, IAM permissions, and AWS configuration.
2. Serving images incurs S3 requests and application egress.
3. Existing object binaries must be copied before the previous storage account
   is decommissioned.

## Implementation Notes

The application identity is limited to `s3:GetObject` and `s3:PutObject` for the
configured bucket's objects. Image retrieval uses a 60-second signed URL inside
the server-side image proxy.

## References

- [AWS SDK for JavaScript v3: S3 examples](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html)
- [AWS SDK credential provider chain](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html)
- [Amazon S3 Block Public Access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html)
- Previous image handling: [018-images.md](./018-images.md)
