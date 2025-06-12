#!/bin/bash

context='{
  "sources": [
    {
      "value": "https://triple.ilabt.imec.be/test/bio-usecase/nbn-chist-era-annex-1-chemicals.ttl"
    },
    {
      "value": "https://idsm.elixir-czech.cz/sparql/endpoint/idsm",
      "type": "sparql",
      "context": {
        "traverse": false
      }
    }
  ],
  "lenient": true
}'

query='prefix sio: <http://semanticscience.org/resource/>

SELECT ?chemicalIdsm ?compound WHERE {
  <https://triple.ilabt.imec.be/test/bio-usecase/nbn-chist-era-annex-1-chemicals.ttl#0> sio:SIO_000300 ?sio.
  ?chemicalIdsm sio:SIO_000300 ?sio;
                sio:SIO_000011 ?compound.
}'

context='{
  "sources": [
    {
      "value": "http://localhost:3000/pods/0000000000000000025/"
    },
    {
      "value": "http://localhost:3030/sparql",
      "type": "sparql",
      "context": {
        "traverse": false
      }
    }
  ],
  "lenient": true
}'

query='PREFIX snvoc: <http://localhost:3000/www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>

SELECT ?locationName (COUNT(?message) AS ?messages) WHERE {
    ?message snvoc:hasCreator <http://localhost:3000/pods/0000000000000000025/profile/card#me> .
    ?message snvoc:isLocatedIn ?location .
    ?location foaf:name ?locationName .
} GROUP BY ?locationName'

query='PREFIX snvoc: <http://localhost:3000/www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/>
SELECT * WHERE {
    ?forum snvoc:hasMember ?forumMember .
    ?forumMember snvoc:hasPerson <http://localhost:3000/pods/0000000000000000025/profile/card#me> .
}'

query='PREFIX snvoc: <http://localhost:3000/www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/>
SELECT * WHERE {
    ?forum snvoc:hasMember ?forumMember .
    ?forumMember snvoc:hasPerson <http://localhost:3000/pods/0000000000000000025/profile/card#me> .
    ?forum snvoc:hasModerator ?moderator .
    ?moderator snvoc:email ?moderatorEmail .
}'

node engines/query-sparql-prototype/bin/query.js --query "$query" --context "$context"
