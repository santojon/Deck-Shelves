# Architecture

Living, versioned architecture documentation for Deck Shelves. Diagrams are kept
as text next to the code so they evolve with it and review like any other change.

## How it is organized

The diagrams follow the [C4 model](https://c4model.com/) — three zoom levels,
from the system in its environment down to the internal building blocks:

| Level | File | Answers |
| --- | --- | --- |
| Context | [context.md](context.md) | What is Deck Shelves and what does it talk to? |
| Container | [containers.md](containers.md) | What are the major runtime pieces? |
| Component | [components.md](components.md) | How is the frontend broken down inside? |

## Tooling

- **Mermaid** is the primary format. It renders **natively on GitHub** inside
  Markdown (no build step, no external service), so every diagram above shows up
  in the browser as soon as the file is pushed. GitHub's Mermaid does not render
  the dedicated `C4Context` syntax, so the C4 levels are expressed with plain
  Mermaid `flowchart` subgraphs — which do render — using one subgraph per C4
  boundary.
- **diagrams-as-code (YAML)** is available for polished, generated pictures where
  a hand-drawn Mermaid graph is not enough. A declarative YAML file
  (see [`diagrams/`](diagrams/)) is turned into an SVG/PNG by
  [diagrams-as-code](https://github.com/dmytrostriletskyi/diagrams-as-code),
  which wraps [Diagrams](https://github.com/mingrammer/diagrams) (needs Graphviz
  installed locally to render). Generation is a local, opt-in step — nothing here
  runs in CI.
- **LikeC4** ([likec4.dev](https://likec4.dev/), MIT) is the option if a *formal*
  single C4 model is ever wanted: one `.c4` model compiled to many views with
  `npx likec4`, entirely as codegen — no server or external app to run. Not set
  up here yet; noted as the compatible, no-server alternative to Structurizr.

## Conventions

- Text only, English only. Keep each diagram focused on one C4 level.
- Update the relevant diagram in the same change that alters the structure.
- Forward-looking / exploratory designs do not live here — this folder documents
  what exists today.
