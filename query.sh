#!/bin/bash

context='{
  "sources": [
    {
      "value": "http://localhost:3000/pods/00000000000000000065/"
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
    ?message snvoc:hasCreator <http://localhost:3000/pods/00000000000000000065/profile/card#me> .
    ?message snvoc:isLocatedIn ?location .
    #<http://localhost:3000/pods/00000000000000000065/comments/2012-08-10#1030792474633> snvoc:isLocatedIn ?location .
    ?location foaf:name ?locationName .
} GROUP BY ?locationName'

node node_modules/@comunica/query-sparql-link-traversal-solid/bin/query.js --idp void --query "$query" --context "$context"

#--explain logical
