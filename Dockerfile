FROM node:18-alpine3.19

WORKDIR /app

COPY . .

RUN npm install

RUN mkdir /var/input
RUN mkdir /var/output

ENTRYPOINT [ "npm" ]
CMD ["run", "watch"]