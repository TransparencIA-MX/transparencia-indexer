FROM node:20-alpine AS builder
WORKDIR /app
COPY services/graphql/package.json services/graphql/package-lock.json* ./
RUN npm install
COPY services/graphql/tsconfig.json ./
COPY services/graphql/src ./src
COPY lexicons ./lexicons
RUN npx tsc

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/lexicons ./lexicons
COPY services/graphql/package.json ./
EXPOSE 4000
CMD ["node", "dist/index.js"]
