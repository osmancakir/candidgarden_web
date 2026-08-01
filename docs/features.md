# Features

Here are a few things you get today:

- [React Router](https://reactrouter.com/) is the web framework of choice
- Server-rendered deployment on
  [Cloudflare Workers](https://workers.cloudflare.com/)
- Managed [PostgreSQL](https://www.postgresql.org/) application database with
  [pgvector](https://github.com/pgvector/pgvector) support, connected through
  [Cloudflare Hyperdrive](https://developers.cloudflare.com/hyperdrive/)
- Cloudflare Workers observability with sampled logs and traces
- [GitHub Actions](https://github.com/features/actions) with testing and deploy
  on merge for both production and staging environments
- Email/Password Authentication with
  [cookie-based sessions](https://remix.run/utils/sessions#md-createcookiesessionstorage)
- Two-Factor Authentication (2fa) with support for authenticator apps
- Transactional email with [Resend](https://resend.com/) and forgot
  password/password reset support
- Progressively Enhanced and fully type safe forms with
  [Conform](https://conform.guide/)
- Database ORM with [Prisma](https://prisma.io/)
- Role-based User Permissions
- Private image storage with [Amazon S3](https://aws.amazon.com/s3/) and image
  transformation/caching at Cloudflare's edge
- In-memory caching via [cachified](https://npm.im/@epic-web/cachified)
- Styling with [Tailwind](https://tailwindcss.com/)
- An excellent, customizable component library with
  [Radix UI](https://www.radix-ui.com/)
- End-to-end testing with [Playwright](https://playwright.dev/)
- Local third party request mocking with [MSW](https://mswjs.io/)
- Unit testing with [Vitest](https://vitest.dev/) and
  [Testing Library](https://testing-library.com/) with pre-configured Test
  Database
- Code formatting with [Prettier](https://prettier.io/)
- Linting with [ESLint](https://eslint.org/)
- Static Types with [TypeScript](https://typescriptlang.org/)
- Runtime schema validation with [zod](https://zod.dev/)
- Error monitoring with [Sentry](https://sentry.io/welcome/)
- Light/Dark/System mode (without a flash of incorrect theme)

Here are some things that will likely find their way into the Epic Stack (or the
docs examples) in the future:

- Logging
- Ecommerce support with [Stripe](https://stripe.com/)
- Ethical site analytics with [fathom](https://usefathom.com/)
- Internationalization
- Image optimization route and component
- Feature flags
- Documentation on production data seeding process

Not a fan of bits of the stack? Fork it, change it, and use
`npx create-remix --template your/repo`! Make it your own.
