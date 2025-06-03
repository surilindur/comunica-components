# Comunica RDF Metadata Extract Actor for Link Filters from VoID Descriptions

An [RDF Metadata Extract](https://github.com/comunica/comunica/tree/master/packages/bus-rdf-metadata-extract) actor
that creates link filters from [VoID](https://www.w3.org/TR/void/) dataset descriptions,
for datasets with `void:sparqlEndpoint` available,
and either `void:uriSpace` or `void:uriRegexPattern` defined.

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/actor-rdf-metadata-extract-link-filter-void
```

## Configure

After installing, this package can be added to your engine's configuration as follows:
```json
{
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-rdf-metadata-extract-link-filter-void/^0.0.0/components/context.jsonld"
  ],
  "actors": [
    {
      "@id": "urn:comunica:default:rdf-metadata-extract/actors#link-filter-void",
      "@type": "ActorRdfMetadataExtractLinkFilterVoid"
    }
  ]
}
```
