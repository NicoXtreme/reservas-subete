FROM node:22-bookworm-slim AS workspace
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/reservas-crud/package.json ./apps/reservas-crud/
COPY apps/reservas-mid/package.json ./apps/reservas-mid/

FROM workspace AS build
RUN npm ci --workspace=reservas-crud
COPY apps/reservas-crud/tsconfig.json ./apps/reservas-crud/
COPY apps/reservas-crud/src ./apps/reservas-crud/src
RUN npm run build --workspace=reservas-crud

FROM workspace AS production-dependencies
RUN npm ci --omit=dev --workspace=reservas-crud

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies /app/ ./
COPY --from=build /app/apps/reservas-crud/dist/ ./apps/reservas-crud/dist/
WORKDIR /app/apps/reservas-crud
USER node
EXPOSE 3001
CMD ["node", "dist/server.js"]
