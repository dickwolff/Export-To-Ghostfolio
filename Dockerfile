FROM node:22-alpine3.21
WORKDIR /app

ARG IMAGE_VERSION

LABEL name="Export to Ghostfolio"
LABEL description="Convert transaction history export from your favorite broker to a format that can be imported in Ghostfolio."
LABEL author="Dick Wolff"
LABEL version="$IMAGE_VERSION"

WORKDIR /

COPY ./src ./src
COPY ./public ./public
COPY package.json .
COPY package-lock.json .
COPY tsconfig.json .

RUN npm install --omit=dev

RUN mkdir /var/tmp/e2g-input
RUN mkdir /var/tmp/e2g-output
RUN mkdir /var/tmp/e2g-cache
RUN mkdir /app/uploads

# Copy startup script and environment template
COPY docker-entrypoint.sh /usr/local/bin/

# Make startup script executable
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Expose port for web UI
EXPOSE 3000

# Use custom entrypoint that supports both watch and web modes
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
