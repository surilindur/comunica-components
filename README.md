<p align="center">
  <a href="https://comunica.dev/">
    <img alt="Comunica" src="https://comunica.dev/img/comunica_red.svg" width="200">
  </a>
</p>

<p align="center">
  <strong>Work-in-Progress Components for Comunica</strong>
</p>

<p align="center">
<a href="https://github.com/surilindur/comunica-components/actions?query=workflow%3ACI"><img src="https://github.com/surilindur/comunica-components/workflows/CI/badge.svg" alt="Build Status"></a>
</p>

This is a monorepository that contains various work-in-progress components for [Comunica](https://github.com/comunica/comunica) and is not intended for actual use. If you wish to learn more about Comunica or actually use it, please refer to [its website](https://comunica.dev/).

The following components reside here:

* [**VoID description RDF metadata extractor**](packages/actor-rdf-metadata-extract-void-description/), that parses VoID descriptions from the metadata stream and stores them back in the metadata.
* [**Simple "adaptive" inner join actor**](packages/actor-rdf-join-inner-multi-adaptive-heuristics/), that keeps restarting joins every time there is a significant enough change in the estimated cardinalities.
* [**VoID description RDF metadata accumulator**](packages/actor-rdf-metadata-accumulate-void-description/), that accumulates VoID descriptions from multiple metadata and performs simple cardinality estimation for triple patterns based on those descriptions.

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
