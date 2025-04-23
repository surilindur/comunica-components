# Comunica Wrapper Membership RDF Resolve Hypermedia Links Queue Actor

[![npm version](https://badge.fury.io/js/%40comunica%2Factor-rdf-resolve-hypermedia-links-queue-wrapper-membership.svg)](https://www.npmjs.com/package/@comunica/actor-rdf-resolve-hypermedia-links-queue-wrapper-membership)

An [RDF Resolve Hypermedia Links Queue](https://github.com/comunica/comunica/tree/master/packages/bus-rdf-resolve-hypermedia-links-queue) actor
that wraps over another link queue provided by the bus,
and imposes a limit on the maximum number of links that can be pushed into it.

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/actor-rdf-resolve-hypermedia-links-queue-wrapper-membership
```

## Configure

After installing, this package can be added to your engine's configuration as follows:
```json
{
  "@context": [
    ...
    "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-rdf-resolve-hypermedia-links-queue-wrapper-membership-filter/^0.0.0/components/context.jsonld"
  ],
  "actors": [
    ...
    {
      "@id": "urn:comunica:default:rdf-resolve-hypermedia-links/queue#wrapper-membership-filter",
      "@type": "ActorRdfResolveHypermediaLinksQueueWrapperMembershipFilter"
    }
  ]
}
```
