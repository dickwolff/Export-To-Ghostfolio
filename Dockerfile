FROM node:22-alpine3.21
WORKDIR /app

ARG IMAGE_VERSION

LABEL name="Export to Ghostfolio"
LABEL description="Convert transaction history export from your favorite broker to a format that can be imported in Ghostfolio."
LABEL author="Dick Wolff"
LABEL version="$IMAGE_VERSION"

WORKDIR /

COPY ./src ./src
COPY package.json .
COPY package-lock.json .
COPY docker-entrypoint.sh .

RUN npm install --omit=dev

RUN mkdir /var/tmp/e2g-input
RUN mkdir /var/tmp/e2g-output
RUN mkdir /var/tmp/e2g-cache

RUN chmod +x /docker-entrypoint.sh

# Default mode: watcher (set to "api" for API mode)
ENV MODE="watcher"

# API port (only used in API mode)
ENV API_PORT=8080

EXPOSE 8080

ENTRYPOINT [ "/docker-entrypoint.sh" ]
