FROM mhart/alpine-node:base-7.7

MAINTAINER Mike Stead <stead.mike@gmail.com>

ENV YARN_VERSION 0.21.3
ADD https://yarnpkg.com/downloads/$YARN_VERSION/yarn-v${YARN_VERSION}.tar.gz /opt/yarn.tar.gz
RUN yarnDirectory=/opt/yarn && \
    mkdir -p "$yarnDirectory" && \
    tar -xzf /opt/yarn.tar.gz -C "$yarnDirectory" && \
    ln -s "$yarnDirectory/dist/bin/yarn" /usr/local/bin/ && \
    rm /opt/yarn.tar.gz

ENV PATH /root/.yarn/bin:$PATH
ENV NODE_ENV=production

WORKDIR /opt/app

COPY package.json yarn.lock ./
RUN yarn install --production
COPY . /opt/app

ENTRYPOINT ["node", "/opt/app/src/run.js"]
