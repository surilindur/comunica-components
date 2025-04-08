#/bin/bash

context='{ "sources": [], "lenient": true }'

query='PREFIX snvoc: <http://localhost:3000/www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?tagName (COUNT(?message) AS ?messages) WHERE {
  ?message snvoc:hasCreator <http://localhost:3000/pods/00000000000000000933/profile/card#me>;
    snvoc:hasTag ?tag.
  ?tag foaf:name ?tagName.
}
GROUP BY ?tagName
ORDER BY DESC (?messages)'

node --max-old-space-size=8192 engines/query-sparql-components/bin/query.js --query "$query" --context "$context" -t stats
