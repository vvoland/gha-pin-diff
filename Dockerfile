# build
FROM node:20-alpine AS build

WORKDIR /src

RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,source=package.json,destination=package.json \
    --mount=type=bind,source=package-lock.json,destination=package-lock.json \
    npm ci

RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,source=. \
    npm run build && \
    npm test

# dist
FROM scratch AS dist
COPY --from=build /src/dist/ /

# final
FROM node:20-alpine AS final
WORKDIR /app
COPY --from=build /src/dist/ ./dist/
ENTRYPOINT ["node", "dist/main.js"]
