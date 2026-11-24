FROM node:22-bookworm-slim AS workspace
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/reservas-crud/package.json ./apps/reservas-crud/
COPY apps/reservas-mid/package.json ./apps/reservas-mid/

FROM workspace AS build
RUN npm ci --workspace=reservas-mid
COPY apps/reservas-mid/tsconfig.json ./apps/reservas-mid/
COPY apps/reservas-mid/src ./apps/reservas-mid/src
RUN npm run build --workspace=reservas-mid

FROM workspace AS production-dependencies
RUN npm ci --omit=dev --workspace=reservas-mid

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies /app/ ./
COPY --from=build /app/apps/reservas-mid/dist/ ./apps/reservas-mid/dist/
WORKDIR /app/apps/reservas-mid
USER node
EXPOSE 3002
CMD ["node", "dist/server.js"]
