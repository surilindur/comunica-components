FROM node:current-alpine AS build

RUN npm install -g corepack && corepack enable

WORKDIR /opt/comunica

ADD --exclude=node_modules --exclude=components --exclude=**/*.js --exclude=**/*.js.map --exclude=**/*.d.ts ./engines ./engines
ADD --exclude=node_modules --exclude=components --exclude=**/*.js --exclude=**/*.js.map --exclude=**/*.d.ts ./packages ./packages
ADD ./.componentsjs-generator-config.json .
ADD ./.yarnrc.yml .
ADD ./LICENSE .
ADD ./package.json .
ADD ./yarn.lock .
ADD ./tsconfig.json .
ADD ./tsconfig.build.json .

RUN yarn install --immutable && yarn run build

FROM node:current-alpine

WORKDIR /opt/comunica

COPY --from=build --exclude=**/*.ts /opt/comunica/engines ./engines
COPY --from=build --exclude=**/*.ts /opt/comunica/packages ./packages
COPY --from=build --exclude=**/*.ts /opt/comunica/node_modules ./node_modules
COPY --from=build /opt/comunica/package.json .
COPY --from=build /opt/comunica/LICENSE .
COPY --from=build /opt/comunica/yarn.lock .

WORKDIR /opt/comunica/engines/query-sparql-prototype

ENTRYPOINT [ "node", "bin/query.js" ]

CMD [ "--help" ]
