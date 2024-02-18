FROM node:20-alpine3.19
WORKDIR /app

ARG IMAGE_VERSION

LABEL name="Export to Ghostfolio"
LABEL description="Convert transaction history export from your favorite broker to a format that can be imported in Ghostfolio."
LABEL author="Dick Wolff"
LABEL version="$IMAGE_VERSION"

COPY . .

RUN npm install

RUN mkdir /var/e2g-input
RUN mkdir /var/e2g-output
RUN mkdir /var/e2g-cache

ENTRYPOINT [ "npm" ]
CMD ["run", "watch"]
