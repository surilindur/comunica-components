#!/bin/bash

context='{
  "sources": [],
  "lenient": true
}'

query='PREFIX snvoc: <http://localhost:3000/www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/>
SELECT DISTINCT ?creator ?messageContent WHERE {
  <http://localhost:3000/pods/00000000000000001129/profile/card#me> snvoc:likes _:g_0.
  _:g_0 (snvoc:hasPost|snvoc:hasComment) ?message.
  ?message snvoc:hasCreator ?creator.
  ?otherMessage snvoc:hasCreator ?creator;
    snvoc:content ?messageContent.
}
LIMIT 10'

node engines/query-sparql-prototype/bin/query.js --query "$query" --context "$context" -t stats
