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

# Install backend dependencies (including typescript and ts-node)
COPY server/package.json ./
RUN npm install

# Copy server source and compile
COPY server/ ./
RUN npx tsc

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

WORKDIR /app

# Copy built frontend
COPY --from=build /app/dist ./dist

# Copy backend
COPY --from=server-build /app/server ./server

WORKDIR /app

EXPOSE 8080

# Run the compiled API server
CMD ["node", "server/index.js"]
