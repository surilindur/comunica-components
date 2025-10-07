# Comunica HTTP Ignore Actor

An [HTTP](https://github.com/comunica/comunica/tree/master/packages/bus-http) actor that maintains a list of ignored URIs,
to avoid dereferencing known non-existing or potentially problematic resources.

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/actor-http-ignore
```

## Configure

After installing, this package can be added to your engine's configuration as follows:

```json
{
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-http-ignore/^4.0.0/components/context.jsonld"
  ],
  "actors": [
    {
      "@id": "urn:comunica:default:http/actors#ignore",
      "@type": "ActorHttpIgnore",
      "mediatorHttp": { "@id": "urn:comunica:default:http/mediators#main" },
      "beforeActors": { "@id": "urn:comunica:default:http/actors#retry" },
      "ignoreFailed": true,
      "ignorePatterns": [
        "^mailto:",
        "^data:"
      ]
    }
  ]
}
```

### Config Parameters

* `mediatorHttp`: A mediator over the [HTTP bus](https://github.com/comunica/comunica/tree/master/packages/bus-http).
* `ignoreFailed`: Whether the actor should mark failing resources as ignored. Defaults to `true`.
* `ignorePatterns`: An optional array of regular expressions to ignore URIs. Defaults to no patterns.
