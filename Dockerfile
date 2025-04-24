FROM node:alpine

ADD . /opt/comunica-prototype

WORKDIR /opt/comunica-prototype

RUN corepack enable && yarn install --immutable

WORKDIR /opt/comunica-prototype/engines/query-sparql-prototype

ENTRYPOINT [ "node", "bin/query.js" ]

CMD [ "--help" ]
