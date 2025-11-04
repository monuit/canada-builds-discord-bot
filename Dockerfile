# MARK: - Build stage
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# MARK: - Runtime stage
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/src ./src
COPY --from=build /app/USAGE.md ./USAGE.md
COPY --from=build /app/README.md ./README.md
COPY --from=build /app/railway.toml ./railway.toml
COPY --from=build /app/eslint.config.mjs ./eslint.config.mjs

EXPOSE 3000
CMD ["node", "dist/index.js"]
