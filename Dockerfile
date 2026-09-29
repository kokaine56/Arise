# ---------------------------------------------------------------------------
# Frontend Build
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Install dependencies and build frontend
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Backend Build
# ---------------------------------------------------------------------------
FROM node:22-alpine AS server-build

WORKDIR /app/server

# Install backend dependencies
COPY server/package.json ./
RUN npm install

# Copy server source
COPY server/ ./

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

WORKDIR /app

# Copy built frontend
COPY --from=build /app/dist ./dist

# Copy backend
COPY --from=server-build /app/server ./server

WORKDIR /app/server

EXPOSE 8080

# Run the express server (using ts-node for simplicity since it's already in dependencies)
CMD ["npx", "ts-node", "server.ts"]
