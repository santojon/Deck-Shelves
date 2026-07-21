# Generated diagrams (diagrams-as-code)

For polished, rendered pictures (SVG/PNG) that a hand-written Mermaid graph does
not cover, this folder holds declarative **YAML** diagram definitions rendered by
[diagrams-as-code](https://github.com/dmytrostriletskyi/diagrams-as-code), a YAML
layer over [Diagrams](https://github.com/mingrammer/diagrams).

Generation is **local and opt-in** — it is not wired into CI, and no rendered
output is committed by default. Add the generated file next to its source only if
a picture is worth versioning.

## Prerequisites

- [Graphviz](https://graphviz.org/download/) installed and on `PATH`.
- The renderer: `pip install diagrams-as-code`.

## Render

```sh
diagrams-as-code docs/architecture/diagrams/providers.diagram.yaml
```

The output image is written next to the command's working directory per the YAML
`file_name` / `format`.

## Files

- [`providers.diagram.yaml`](providers.diagram.yaml) — the provider registration
  flow (external plugins → public API → shelf resolver). A starting point; adapt
  node `resource` types against the tool's schema documentation.
