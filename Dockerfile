FROM node:20

WORKDIR /app

COPY package*.json ./

RUN yarn cache clean
RUN yarn install

COPY . .

EXPOSE 8080

CMD ["yarn", "start"]
