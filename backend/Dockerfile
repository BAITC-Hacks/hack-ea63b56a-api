FROM node:22-alpine AS build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/tsconfig*.json backend/nest-cli.json ./
COPY backend/src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app/backend
ENV NODE_ENV=production PORT=3001 DATASET_PATH=/data/contractors.csv CACHE_DIR=/app/backend/cache
COPY backend/package*.json ./
RUN npm ci --omit=dev && mkdir -p /data /app/backend/cache
COPY --from=build /app/backend/dist ./dist
COPY ["hackathon dataset anonymized.csv", "/data/contractors.csv"]
EXPOSE 3001
CMD ["node", "dist/main.js"]
