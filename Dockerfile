# build
FROM node:24-alpine AS build

WORKDIR /src

RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,source=.,rw \
    npm ci && \
    npm run build -- --outDir /out && \
    node --test /out/**/*.test.js

# dist
FROM scratch AS dist
COPY --from=build /out/ /

# final
FROM node:24-alpine AS final
WORKDIR /app
COPY --from=build /out/ ./dist/
ENTRYPOINT ["node", "dist/main.js"]
