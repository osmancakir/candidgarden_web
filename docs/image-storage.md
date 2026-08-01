# Image Storage

Uploaded images are stored in private [Amazon S3](https://aws.amazon.com/s3/)
buckets. Image metadata and object keys remain in PostgreSQL; the application
uploads objects with the AWS SDK and proxies reads through the image resource
route using short-lived signed URLs.

## Configuration

The application requires these settings:

```sh
AWS_REGION="eu-central-1"
AWS_S3_BUCKET="your-private-image-bucket"
```

The Cloudflare Worker authenticates to S3 with scoped IAM access keys stored as
Worker secrets:

```sh
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret-key"
# AWS_SESSION_TOKEN="your-session-token" # when using temporary credentials
```

The repository's `.env.example` and `.dev.vars.example` contain mock
credentials, and MSW intercepts S3 requests so the Node development/test harness
remains offline.

Use separate private buckets and credentials for production and staging. The
application identity needs only `s3:GetObject` and `s3:PutObject` for objects in
the configured bucket:

```json
{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Effect": "Allow",
			"Action": ["s3:GetObject", "s3:PutObject"],
			"Resource": "arn:aws:s3:::YOUR_BUCKET/*"
		}
	]
}
```

Keep S3 Block Public Access enabled. Browsers do not access the bucket directly,
so no bucket CORS configuration is required for the current upload and serving
flow.

## How It Works

1. The application validates an uploaded image.
2. The server uploads its binary data to the configured S3 bucket.
3. PostgreSQL stores the image's ownership and S3 object key.
4. The image resource route creates a 60-second signed URL, applies Cloudflare
   Image Transformations, and stores the immutable result in the edge cache.

Existing database object keys do not need to change when objects are copied into
the S3 bucket with the same keys.

Relevant implementation files:

- `app/utils/storage.server.ts`
- `app/routes/resources/images.tsx`
- `tests/mocks/s3.ts`
