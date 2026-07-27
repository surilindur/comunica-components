# Comunica Inner Join Restart Actor

An [RDF Join](https://github.com/comunica/comunica/tree/master/packages/bus-rdf-join) actor set that allows restarting the join plan of inner joins.
The actors function by comparing the current executing join order to an optimal one, at the time of evaluation,
and by restarting the join plan it encapsulates if this join order does not match the optimal one.

The following two actors are available:

* `ActorRdfJoinInnerRestartInterval`, that evaluates the join upon set intervals.
* `ActorRdfJoinInnerRestartMetadata`, that evaluates the join upon input metadata updates.

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/actor-rdf-join-restart
```

## Configure

After installing, the actors can be added to your engine's configuration as follows:
```json
{
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-rdf-join-inner-restart/^0.0.0/components/context.jsonld"
  ],
  "actors": [
    {
      "@id": "urn:comunica:default:rdf-join/actors#restart-metadata",
      "@type": "ActorRdfJoinInnerRestartMetadata",
      "mediatorHashBindings": { "@id": "urn:comunica:default:hash-bindings/mediators#main" },
      "mediatorJoinEntriesSort": { "@id": "urn:comunica:default:rdf-join-entries-sort/mediators#main" },
      "mediatorJoinSelectivity": { "@id": "urn:comunica:default:rdf-join-selectivity/mediators#main" },
      "mediatorJoin": { "@id": "urn:comunica:default:rdf-join/mediators#main" },
      "restartLimit": null
    },
    {
      "@id": "urn:comunica:default:rdf-join/actors#restart-interval",
      "@type": "ActorRdfJoinInnerRestartInterval",
      "mediatorHashBindings": { "@id": "urn:comunica:default:hash-bindings/mediators#main" },
      "mediatorJoinEntriesSort": { "@id": "urn:comunica:default:rdf-join-entries-sort/mediators#main" },
      "mediatorJoinSelectivity": { "@id": "urn:comunica:default:rdf-join-selectivity/mediators#main" },
      "mediatorJoin": { "@id": "urn:comunica:default:rdf-join/mediators#main" },
      "restartLimit": null,
      "evaluationInterval": 200
    }
  ]
}
```

### Config Parameters

* `mediatorHashBindings`: A mediator over the [RDF Hash Bindings bus](https://github.com/comunica/comunica/tree/master/packages/bus-rdf-hash-bindings).
* `mediatorJoinEntriesSort`: A mediator over the [RDF Join Entries Sort bus](https://github.com/comunica/comunica/tree/master/packages/bus-rdf-join-entries-sort).
* `mediatorJoinSelectivity`: A mediator over the [RDF Join Selectivity bus](https://github.com/comunica/comunica/tree/master/packages/bus-rdf-join-selectivity).
* `mediatorJoin`: A mediator over the [RDF Join bus](https://github.com/comunica/comunica/tree/master/packages/bus-rdf-join).
* `evaluationInterval`: When specified, the interval-based actor will evaluate join plans every *n* milliseconds specified by this value.
* `restartLimit`: When specified, limits the number of join restarts to this value. Defaults to infinity.
