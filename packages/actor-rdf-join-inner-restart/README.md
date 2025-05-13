# Comunica Inner Join Restart Actor

An [RDF Join](https://github.com/comunica/comunica/tree/master/packages/bus-rdf-join) actor that allows restarting the join plan of inner joins.
The actor functions by comparing the current executing join order to an optimal one, at the time of evaluation,
and by restarting the join plan it encapsulates if this join order does not match the optimal one.

The following approaches are available for the evaluation:

* Evaluation upon metadata updates: When the metadata for a join entry is updated internally by the engine.
* Evaluation at intervals: Every *n* milliseconds of join execution.

The number of restarts can optionally be limited, with the default being unlimited.
With neither evaluation criteria enabled, the actor will not encapsulate any joins.

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/actor-rdf-join-restart
```

## Configure

After installing, this package can be added to your engine's configuration as follows:
```json
{
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-rdf-join-inner-restart/^0.0.0/components/context.jsonld"
  ],
  "actors": [
    {
      "@id": "urn:comunica:default:rdf-join/actors#restart",
      "@type": "ActorRdfJoinInnerRestart",
      "mediatorHashBindings": { "@id": "urn:comunica:default:hash-bindings/mediators#main" },
      "mediatorJoinEntriesSort": { "@id": "urn:comunica:default:rdf-join-entries-sort/mediators#main" },
      "mediatorJoinSelectivity": { "@id": "urn:comunica:default:rdf-join-selectivity/mediators#main" },
      "mediatorJoin": { "@id": "urn:comunica:default:rdf-join/mediators#main" },
      "evaluationAfterMetadataUpdate": true,
      "evaluationInterval": null,
      "restartLimit": null,
      "restartThreshold": 0.5,
      "wrapAllJoins": false
    }
  ]
}
```

### Config Parameters

* `mediatorHashBindings`: A mediator over the [RDF Hash Bindings bus](https://github.com/comunica/comunica/tree/master/packages/bus-rdf-hash-bindings).
* `mediatorJoinEntriesSort`: A mediator over the [RDF Join Entries Sort bus](https://github.com/comunica/comunica/tree/master/packages/bus-rdf-join-entries-sort).
* `mediatorJoinSelectivity`: A mediator over the [RDF Join Selectivity bus](https://github.com/comunica/comunica/tree/master/packages/bus-rdf-join-selectivity).
* `mediatorJoin`: A mediator over the [RDF Join bus](https://github.com/comunica/comunica/tree/master/packages/bus-rdf-join).
* `evaluationAfterMetadataUpdate`: Whether the actor should evaluate join plans upon metadata updates. Defaults to `false`.
* `evaluationInterval`: When specified, the actor will evaluate join plans every *n* milliseconds specified by this value. Defaults to `undefined`.
* `restartLimit`: When specified, limits the number of join restarts to this value. Defaults to `undefined`.
* `restartThreshold`: When specified, restarts to query plan are only allowed when the number of bindings produced is below this share of the total estimage. Defaults to `0.5`.
* `wrapAllJoins`: Whether all joins should be wrapped. When set to `false`, only the topmost join is wrapped. Defaults to `false`.
