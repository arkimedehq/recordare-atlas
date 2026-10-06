# Recordare Atlas: build the app, then serve it with the zero-dependency server (Node's http).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server ./server
COPY package.json LICENSE THIRD_PARTY_NOTICES.md ./
ENV ATLAS_HOST=0.0.0.0 ATLAS_PORT=5175
EXPOSE 5175
USER node
CMD ["node", "server/index.mjs"]
