# Comunica RDF Metadata Extract Actor for Bloom Filters

An [RDF Metadata Extract](https://github.com/comunica/comunica/tree/master/packages/bus-rdf-metadata-extract) actor that
collects Bloom filters from the metadata stream using a [custom vocabulary](http://semweb.mmlab.be/ns/membership).
These filters can be generated using the Bloom filter summary generator in [rdf-dataset-fragmenter.js](https://github.com/SolidBench/rdf-dataset-fragmenter.js).

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/actor-rdf-metadata-extract-link-filter-bloom
```

## Configure

After installing, this package can be added to your engine's configuration as follows:
```json
{
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-rdf-metadata-extract-link-filter-bloom/^0.0.0/components/context.jsonld"
  ],
  "actors": [
    {
      "@id": "urn:comunica:default:rdf-metadata-extract/actors#link-filter-bloom",
      "@type": "ActorRdfMetadataExtractLinkFilterBloom"
    }
  ]
}
```
