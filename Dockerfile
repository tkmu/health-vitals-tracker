FROM node:22-alpine AS base

FROM base AS builder
# Install python and build dependencies for node-gyp and native modules like mammoth/pdf-parse
RUN apk add --no-cache libc6-compat build-base python3 make g++ 

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy application code
COPY . .

# Generate Prisma Client and build the Next.js app
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Note: In Cloud Run, we should ideally run prisma deploy on start, but Cloud Run needs a DB ready.
# Cloud SQL proxy will be used or Unix socket connection string.
CMD ["node", "server.js"]
