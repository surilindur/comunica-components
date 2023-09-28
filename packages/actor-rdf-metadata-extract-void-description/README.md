# Comunica VoID Description RDF Metadata Extract Actor

[![npm version](https://badge.fury.io/js/%40comunica%2Factor-rdf-metadata-extract-void-description.svg)](https://www.npmjs.com/package/@comunica/actor-rdf-metadata-extract-void-description)

An [RDF Metadata Extract](https://github.com/comunica/comunica/tree/master/packages/bus-rdf-metadata-extract) actor
that extracts dataset descriptions following the [VoID](https://www.w3.org/TR/void/) vocabulary and adds them to the metadata stream.

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/actor-rdf-metadata-extract-void-description
```

## Metadata entries

This actor adds the following entries to the metadata object.

* `voidDescriptions`: List of VoID description objects extracted from the metadata stream.

## Configure

After installing, this package can be added to your engine's configuration as follows:
```json
{
  "@context": [
    ...
    "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-rdf-metadata-extract-void-description/^0.0.0/components/context.jsonld"  
  ],
  "actors": [
    ...
    {
      "@id": "urn:comunica:default:rdf-metadata-extract/actors#void-description",
      "@type": "ActorRdfMetadataExtractVoIDDescription",
      "mediatorDereferenceRdf": {
        "@id": "urn:comunica:default:dereference-rdf/mediators#main"
      }
    }
  ]
}
```
