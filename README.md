<p align="center">
  <a href="https://comunica.dev/">
    <img alt="Comunica" src="https://comunica.dev/img/comunica_red.svg" width="200">
  </a>
</p>

<p align="center">
  <strong>Work-in-Progress Components for Comunica</strong>
</p>

<p align="center">
  <a href="https://github.com/surilindur/comunica-components/actions/workflows/ci.yml"><img alt="CI" src=https://github.com/surilindur/comunica-components/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg"></a>
  <a href="https://opensource.org/licenses/MIT"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-yellow.svg"></a>
</p>

This is a monorepository that contains various work-in-progress components for [Comunica](https://github.com/comunica/comunica) and is not intended for actual use. If you wish to learn more about Comunica or actually use it, please refer to [its website](https://comunica.dev/). The following components reside here.

Components for membership metadata handling:

* [**Membership filter metadata extractor**](packages/actor-rdf-metadata-extract-membership-filter/), that parses membership filters from metadata streams and stores them back in the metadata.
* [**Membership filter parse bus**](packages/bus-rdf-parse-membership-filter/), where membership filter parsers are listening.
* [**Membership filter parser for Bloom filters**](packages/actor-rdf-parse-membership-filter-bloom/), that parses Bloom filters into membership filter objects.
* [**Membership filter context preprocess actor**](packages/actor-context-preprocess-membership-filter/), that creates the metadata filter storage in quest context, used to hold the extracted filters. This is the result of the link queue not having access to RDF metadata streams, so the filters need to be stored in another query-specific location.
* [**Membership filter-based link queue wrapper**](packages/actor-rdf-resolve-hypermedia-links-queue-wrapper-membership-filter/), that filters link queue output based on discovered membership filters.

Components for triple pattern cardinality estimation and join operation restarts:

* [**VoID description metadata extractor**](packages/actor-rdf-metadata-extract-void-description/), that parses VoID descriptions from metadata streams and stores them back in the metadata.
* [**VoID description metadata accumulator**](packages/actor-rdf-metadata-accumulate-void-description/), that accumulates VoID descriptions from multiple metadata. This package also includes **triple pattern cardinality estimators** that use available metadata at accumulation time to update estimated triple pattern cardinalities.
* [**Simple "adaptive" inner join actor**](packages/actor-rdf-join-inner-multi-adaptive-heuristics/), that allows restarting a join operation based on a set of conditions.

## Development Setup

The project can be cloned, after which the dependencies can be installed using Yarn with:

```bash
git clone https://github.com/surilindur/comunica-components
cd comunica-components
yarn install --immutable
yarn build
```

The default configuration for the engine using whichever components happen to be configured in it can then be executed:

```bash
yarn comunica-sparql-components --help
```

There are no unit tests and nothing is guaranteed to function as one would expect it to.

## Using Local Comunica

This project can be set to use local [Comunica](https://github.com/comunica/comunica), [Comunica Solid](https://github.com/comunica/comunica-feature-solid) and [Comunica Link Traversal](https://github.com/comunica/comunica-feature-link-traversal):

```
.../comunica
.../comunica-feature-solid
.../comunica-feature-link-traversal
.../comunica-components
```

This can be done by having the workspaces definitions in the repositories pointing at each other, for example as in this repository:
```json
  "workspaces": [
    "../comunica/engines/*",
    "../comunica/packages/*",
    "../comunica-feature-solid-fork/engines/*",
    "../comunica-feature-solid-fork/packages/*",
    "../comunica-feature-link-traversal-fork/engines/*",
    "../comunica-feature-link-traversal-fork/packages/*",
    "packages/*",
    "engines/*"
  ],
```

Afterwards, all the projects should be set up using `yarn install`.

## Issues

Please feel free to report any issues on the GitHub issue tracker, but do note that none of these components are intended for real use at this stage and are therefore not tested properly.

## License

This code is copyrighted by [Ghent University – imec](http://idlab.ugent.be/) and released under the [MIT license](http://opensource.org/licenses/MIT).
