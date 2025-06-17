# Comunica Set Defaults Context Preprocess Actor

A [Context Preprocess](https://github.com/comunica/comunica/tree/master/packages/bus-context-preprocess) actor
that performs prototype-specific adjustments to the context before query execution.

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/actor-context-preprocess-prototype
```

## Configure

After installing, this package can be added to your engine's configuration as follows:
```text
{
  "@context": [
    ...
    "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-context-preprocess-prototype/^0.0.0/components/context.jsonld"
  ],
  "actors": [
    ...
    {
      "@id": "urn:comunica:default:context-preprocess/actors#prototype",
      "@type": "ActorContextPreprocessPrototype"
    }
  ]
}
```

### Config Parameters

* `filters`: Whether to add filter list to the context. Defaults to `true`.
