FROM node:22-alpine3.19
WORKDIR /app

ARG IMAGE_VERSION

LABEL name="Export to Ghostfolio on Web"
LABEL description="Convert transaction history export from your favorite broker to a format that can be imported in Ghostfolio."
LABEL author="Dick Wolff & JuanmanDev"
LABEL version="$IMAGE_VERSION"

COPY . .

RUN npm install

RUN mkdir /var/tmp/e2g-input
RUN mkdir /var/tmp/e2g-output
RUN mkdir /var/tmp/e2g-cache

RUN node --run web:generate

EXPOSE 3001

ENTRYPOINT [ "node" ]
CMD ["--run", "server"]
