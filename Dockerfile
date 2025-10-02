FROM node:alpine

ADD . /opt/comunica-prototype

WORKDIR /opt/comunica-prototype

RUN yarn install --frozen-lockfile --ignore-engines --ignore-optional

WORKDIR /opt/comunica-prototype/engines/query-sparql-prototype

ENTRYPOINT [ "node", "bin/query.js" ]

CMD [ "--help" ]
