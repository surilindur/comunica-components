# Comunica Rate Limit HTTP Actor

[![npm version](https://badge.fury.io/js/%40comunica%2Factor-http-limit-rate.svg)](https://www.npmjs.com/package/@comunica/actor-http-limit-rate)

An [HTTP](https://github.com/comunica/comunica/tree/master/packages/bus-http) actor that performs simple host-based rate limiting.

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/actor-http-limit-rate
```

## Configure

After installing, this package can be added to your engine's configuration as follows:

```json
{
  "@context": [
    ...
    "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-http-limit-rate/^3.0.0/components/context.jsonld"
  ],
  "actors": [
    ...
    {
      "@id": "urn:comunica:default:http/actors#limit-rate",
      "@type": "ActorHttpLimitRate"
    }
  ]
}
```

### Config Parameters

* `concurrentRequestLimit`: The maximum concurrent request limit for any given host, defaults to 1,000.
* `requestDelayLimit`: The maximum delay for requests to any given host, defaults to 1 minute.
