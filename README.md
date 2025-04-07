<p align="center">
  <img alt="Comunica" src=".github/assets/logo.svg" width="50">
</p>

<p align="center">
  <strong>Comunica Components</strong>
</p>

<p align="center">
  <a href="https://github.com/surilindur/comunica-components/actions/workflows/ci.yml"><img alt="Workflow: CI" src=https://github.com/surilindur/comunica-components/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg"></a>
  <a href="https://opensource.org/licenses/MIT"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-%23750014.svg"></a>
</p>

This is a collection of work-in-progress components for the [Comunica](https://github.com/comunica/comunica) query engine,
maintained here separately for prototyping and experimentation purposes.
If you wish to learn more about Comunica or actually use it, please refer to [its website](https://comunica.dev/).
If a component was found here previous, but not anymore, it could have been merged into the engine itself, or deprecated in favour of another one.

## Development Setup

The dependencies can be installed and the component built using Yarn:

```bash
yarn install --immutable
yarn build
```

The default configuration for the engine using whichever components happen to be configured in it can then be executed:

```bash
yarn comunica-sparql-components --help
```

## Linking to Local Comunica Source

This project can be set to use local [Comunica](https://github.com/comunica/comunica),
[Comunica Solid](https://github.com/comunica/comunica-feature-solid) and
[Comunica Link Traversal](https://github.com/comunica/comunica-feature-link-traversal),
by cloning the projects next to each other:

```
.../comunica
.../comunica-feature-solid
.../comunica-feature-link-traversal
.../comunica-components
```

Then, the Yarn workspaces feature can be used to point the projects to each other.
For example, in this repository:

```json
{
  "workspaces": [
    "../comunica/engines/*",
    "../comunica/packages/*",
    "../comunica-feature-solid-fork/engines/*",
    "../comunica-feature-solid-fork/packages/*",
    "../comunica-feature-link-traversal-fork/engines/*",
    "../comunica-feature-link-traversal-fork/packages/*",
    "packages/*",
    "engines/*"
  ]
}
```

Afterwards, all the projects should be set up using `yarn install`.

## Issues

Please feel free to report any issues on the GitHub issue tracker.

## License

This code is copyrighted by [Ghent University – imec](http://idlab.ugent.be/) and
released under the [MIT license](http://opensource.org/licenses/MIT).
