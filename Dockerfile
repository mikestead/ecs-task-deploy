FROM node:6.11.2-alpine

MAINTAINER Mike Stead <stead.mike@gmail.com>

WORKDIR /opt/app

COPY package.json /opt/app/package.json
RUN npm install
COPY . /opt/app

ENTRYPOINT ["node", "/opt/app/src/run.js"]
