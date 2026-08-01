# Email

This document describes how to get [Resend](https://resend.com) (the Epic Stack
email provider) setup.

> **NOTE**: this is an optional step. During development the emails will be
> logged to the terminal and in production if you haven't set the proper
> environment variables yet you will get a warning until you set the environment
> variables.

Create [an API Key](https://resend.com/api-keys) and set `RESEND_API_KEY` in
both prod and staging:

```sh
npx wrangler secret put RESEND_API_KEY --env production
npx wrangler secret put RESEND_API_KEY --env staging
```

Wrangler securely prompts for the API key for each environment.

Setup a [custom sending domain](https://resend.com/domains) and then make sure
to update the `from` email address in `app/utils/email.server.ts` and the
`expect(email.from).toBe` in `tests/e2e/onboarding.test.ts` to the one you want
your emails to come from.
