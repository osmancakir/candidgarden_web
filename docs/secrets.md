# Secrets

Managing secrets locally is done with environment files. Deployed secrets are
stored by Cloudflare Workers and managed with Wrangler.

> **Warning**: It is very important that you do NOT hard code any secrets in the
> source code. Even if your app source is not public, there are a lot of reasons
> this is dangerous and in the epic stack we default to creating source maps
> which will reveal your hard coded secrets to the public. Read more about this
> in [the source map decision document](./decisions/016-source-maps.md).

## Local development

When you need to create a new secret, it's best to add a line to your
`.env.example` file so folks know that secret is necessary. The value you put in
here should be not real because this file is committed to the repository.

To keep everything in line with the [guiding principle](./guiding-principles.md)
of "Offline Development," you should also strive make it so whatever service
you're interacting with can be mocked out using MSW in the `test/mocks`
directory.

You can also put the real value of the secret in `.env` which is `.gitignore`d
so you can interact with the real service if you need to during development.

## Production secrets

To publish one secret to the production and staging Workers, use Wrangler. For
example, if you were integrating with the `tito` API:

```sh
npx wrangler secret put TITO_API_SECRET --env production
npx wrangler secret put TITO_API_SECRET --env staging
```

Wrangler prompts for the value without putting it in shell history. For initial
setup or rotation of several values, use the environment-specific bulk secret
files described in the [deployment guide](./deployment.md#3-configure-worker-secrets).
