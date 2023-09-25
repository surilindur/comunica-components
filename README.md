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

This is a monorepo that contains various work-in-progress components for [Comunica](https://github.com/comunica/comunica) and is not intended for actual use. If you wish to learn more about Comunica or actually use it, please refer to [its website](https://comunica.dev/).

The following components reside here:

* [**VoID Count RDF Metadata Extract Actor**](packages/actor-rdf-metadata-extract-void-count/), that extracts predicate cardinalities from VoID descriptions and uses the cardinality of the predicate of the currently resolving triple pattern as an estimate for the cardinality of the entire pattern by assigning it in the metadata.


## Development Setup

This project is currently set to use local [Comunica](https://github.com/comunica/comunica), [Comunica Solid](https://github.com/comunica/comunica-feature-solid) and [Comunica Link Traversal](https://github.com/comunica/comunica-feature-link-traversal):

```
.../comunica
.../comunica-feature-solid
.../comunica-feature-link-traversal
.../comunica-components
```

With the workspaces definitions in the repositories pointing at each other, for example as in this repository:
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

The default configuration for the engine using whichever components happen to be configured in it can then be executed:

```bash
$ yarn comunica-sparql-components --help
```

There are no unit tests and nothing is guaranteed to function as one would expect it to.

## Issues

Please feel free to report any issues on the GitHub issue tracker, but do note that none of these components are intended for real use at this stage and are therefore not tested properly.

## License

This code is copyrighted by [Ghent University – imec](http://idlab.ugent.be/) and released under the [MIT license](http://opensource.org/licenses/MIT).
