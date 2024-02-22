# Comunica Membership Filter Context Preprocess Actor

[![npm version](https://badge.fury.io/js/%40comunica%2Factor-context-preprocess-membership-filter.svg)](https://www.npmjs.com/package/@comunica/actor-context-preprocess-membership-filter)

A comunica Source To Destination Context Preprocess Actor.

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/actor-context-preprocess-membership-filter
```

## Configure

After installing, this package can be added to your engine's configuration as follows:
```json
{
  "@context": [
    ...
    "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-context-preprocess-membership-filter/^0.0.0/components/context.jsonld"
  ],
  "actors": [
    ...
    {
      "@id": "urn:comunica:default:context-preprocess/actors#membership-filter",
      "@type": "ActorContextPreprocessMembershipFilter"
    }
  ]
}
```
