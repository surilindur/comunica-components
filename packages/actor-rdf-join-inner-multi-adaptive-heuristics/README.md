# Comunica Inner Multi Adaptive Heuristics RDF Join Actor

[![npm version](https://badge.fury.io/js/%40comunica%2Factor-rdf-join-inner-multi-adaptive-heuristics.svg)](https://www.npmjs.com/package/@comunica/actor-rdf-join-inner-multi-adaptive-heuristics)

A comunica Inner Multi Heuristics Destroy RDF Join Actor.

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/actor-rdf-join-inner-multi-adaptive-heuristics
```

## Configure

After installing, this package can be added to your engine's configuration as follows:
```json
{
  "@context": [
    ...
    "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-rdf-join-inner-multi-adaptive-heuristics/^0.0.0/components/context.jsonld"
  ],
  "actors": [
    ...
    {
      "@id": "urn:comunica:default:rdf-join/actors#inner-multi-adaptive-heuristics",
      "@type": "ActorRdfJoinInnerMultiAdaptiveHeuristics",
      "mediatorJoinEntriesSort": { "@id": "urn:comunica:default:rdf-join-entries-sort/mediators#main" },
      "mediatorJoinSelectivity": { "@id": "urn:comunica:default:rdf-join-selectivity/mediators#main" },
      "mediatorJoin": { "@id": "urn:comunica:default:rdf-join/mediators#main" }
    }
  ]
}
```

### Config Parameters

* `mediatorJoinEntriesSort`: A mediator over the [RDF Join Entries Sort bus](https://github.com/comunica/comunica/tree/master/packages/bus-rdf-join-entries-sort).
* `mediatorJoinSelectivity`: A mediator over the [RDF Join Selectivity bus](https://github.com/comunica/comunica/tree/master/packages/bus-rdf-join-selectivity).
* `mediatorJoin`: A mediator over the [RDF Join bus](https://github.com/comunica/comunica/tree/master/packages/bus-rdf-join).
* `cardinalityThreshold`: Absolute value threshold for metadata cardinality value change before restarting join.
* `cardinalityThresholdMultiplier`: Multiplier/divisor threshold for metadata cardinality value change before restarting join.
* `allowOnlyOnce`: Whether the join should only be restarted once, and not an unlimited number of times.
