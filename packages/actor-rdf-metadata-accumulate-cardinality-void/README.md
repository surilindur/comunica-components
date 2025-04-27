# Comunica RDF Metadata Accumulate Actor for Cardinalities from VoID Descriptions

An [RDF Metadata Accumulate](https://github.com/comunica/comunica/tree/master/packages/bus-rdf-metadata-accumulate) actor
that performs cardinality estimation using discovered VoID dataset descriptions.

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/actor-rdf-metadata-accumulate-cardinality-void
```

## Configure

After installing, this package can be added to your engine's configuration as follows:
```json
{
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-rdf-metadata-accumulate-cardinality-void/^0.0.0/components/context.jsonld"
  ],
  "actors": [
    {
      "@id": "urn:comunica:default:rdf-metadata-accumulate/actors#cardinality-void",
      "@type": "ActorRdfMetadataAccumulateCardinalityVoid"
    }
  ]
}
```
