# Comunica RDF Membership Filter Parse Actor for Golomb Coded Sets

[![npm version](https://badge.fury.io/js/%40comunica%2Factor-rdf-parse-membership-filter-gcs.svg)](https://www.npmjs.com/package/@comunica/actor-rdf-parse-membership-filter-gcs)

An [RDF membership filter parse](https://github.com/comunica/comunica/tree/master/packages/bus-rdf-parse-membership-filter) actor that
can parse Golomb Coded Sets for the `http://semweb.mmlab.be/ns/membership#GCSFilter` type.

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/actor-rdf-parse-membership-filter-gcs
```

## Configure

After installing, this package can be added to your engine's configuration as follows:
```json
{
  "@context": [
    ...
    "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-rdf-parse-membership-filter-gcs/^0.0.0/components/context.jsonld"  
  ],
  "actors": [
    ...
    {
      "@id": "urn:comunica:default:rdf-parse/membership-filter#gcs",
      "@type": "ActorRdfParseMembershipFilterGcs"
    }
  ]
}
```
