# This file is moved to the root directory before building the image

# base node image
FROM node:22-bookworm-slim AS base

# set for base and all layer that inherit from it
ENV NODE_ENV=production

# Install the PostgreSQL client and OpenSSL for Prisma.
RUN apt-get update && apt-get install -y openssl postgresql-client ca-certificates

# Install all node_modules, including dev dependencies
FROM base AS deps

WORKDIR /myapp

ADD package.json package-lock.json .npmrc ./
RUN npm ci --include=dev

# Setup production node_modules
FROM base AS production-deps

WORKDIR /myapp

COPY --from=deps /myapp/node_modules /myapp/node_modules
ADD package.json package-lock.json .npmrc ./
RUN npm prune --omit=dev

# Build the app
FROM base AS build

ARG COMMIT_SHA
ENV COMMIT_SHA=$COMMIT_SHA

# Use the following environment variables to configure Sentry
# ENV SENTRY_ORG=
# ENV SENTRY_PROJECT=


WORKDIR /myapp

COPY --from=deps /myapp/node_modules /myapp/node_modules

ADD prisma .
RUN npm exec prisma generate

ADD . .

# Mount the secret and set it as an environment variable and run the build
RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN \
  export SENTRY_AUTH_TOKEN=$(cat /run/secrets/SENTRY_AUTH_TOKEN) && \
  npm run build

# Finally, build the production image with minimal footprint
FROM base

ENV PORT="8080"
ENV NODE_ENV="production"
# add shortcut for connecting to database CLI
RUN echo "#!/bin/sh\npsql \"\$DATABASE_URL\"" > /usr/local/bin/database-cli && chmod +x /usr/local/bin/database-cli

WORKDIR /myapp

COPY --from=production-deps /myapp/node_modules /myapp/node_modules
COPY --from=build /myapp/node_modules/.prisma /myapp/node_modules/.prisma

COPY --from=build /myapp/build /myapp/build
COPY --from=build /myapp/package.json /myapp/package.json
COPY --from=build /myapp/prisma /myapp/prisma
COPY --from=build /myapp/app/components/ui/icons /myapp/app/components/ui/icons

ADD . .

CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma generate --sql && exec npm start"]
