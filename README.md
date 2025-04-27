<p align="center">
  <img alt="Comunica" src=".github/assets/logo.svg" width="50">
</p>

<p align="center">
  <strong>Comunica Components</strong>
</p>

<p align="center">
  <a href="https://github.com/surilindur/comunica-components/actions/workflows/ci.yml"><img alt="Workflow: CI" src=https://github.com/surilindur/comunica-components/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <a href="https://coveralls.io/github/surilindur/comunica-components?branch=main"><img alt="Coverage: main" src="https://coveralls.io/repos/github/surilindur/comunica-components/badge.svg?branch=main"></a>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg"></a>
  <a href="https://opensource.org/licenses/MIT"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-%23750014.svg"></a>
</p>

This is a collection of work-in-progress prototype components for the [Comunica](https://github.com/comunica/comunica) query engine,
maintained separately for prototyping and experimentation purposes.
If a component was found here previous, but not anymore, it could have been merged into the engine itself, or deprecated in favour of another one.

If you wish to learn more about Comunica or actually use it, please refer to [its website](https://comunica.dev/).

## Development Setup

The dependencies can be installed and the components built using Yarn:

```bash
yarn install --immutable
```

The default configuration for the prototype engine can then be executed:

```bash
yarn comunica-sparql-prototype --help
```

## Issues

Please feel free to report any issues on the GitHub issue tracker.

## License

This code is copyrighted by [Ghent University – imec](http://idlab.ugent.be/) and
released under the [MIT license](http://opensource.org/licenses/MIT).
