# Stage 1: Build the Astro Static Frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend

# Copy frontend dependency configuration
COPY frontend/package.json* ./
RUN npm install

# Copy frontend source files
COPY frontend/ ./

# Compile the static bundle
RUN npm run build


# Stage 2: Create the Elysia production runner
FROM oven/bun:1.2.2-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install backend dependencies
COPY backend/package.json backend/bun.lock* /app/
RUN bun install

# Copy backend codebase to the root execution path inside container
COPY backend/src/ /app/src/
COPY backend/tsconfig.json /app/

# Copy the built static assets from Stage 1 into Elysia's files host path
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

RUN mkdir /app/seed

EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]
