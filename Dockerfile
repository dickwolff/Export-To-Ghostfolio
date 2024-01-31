FROM node:18-alpine3.19

WORKDIR /app

COPY . .

RUN npm install

RUN mkdir /var/e2g-input
RUN mkdir /var/e2g-output

ENTRYPOINT [ "npm" ]
CMD ["run", "watch"]