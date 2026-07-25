# minimap

A preview of the full source code.

## Features

- **Canvas rendering**: three-layer canvas (back decorations, tokens, front decorations) with incremental redraws — only changed row ranges are repainted.
- **Syntax highlighting**: token colors are resolved directly from the active theme via computed DOM styles and cached per scope, so the minimap matches the editor exactly.
- **Scroll past end**: the minimap proportionally tracks the full editor scroll range, including the scroll-past-end zone.
- **Decoration API**: uses the same marker-based API as the text editor — supports `line`, `gutter`, `highlight-under`, `highlight-over`, `highlight-outline`, and `background-custom`/`foreground-custom` types.
- **Plugin system**: third-party packages can consume the `minimap` service to add their own decoration layers.
- **Quick settings**: toggle plugins and flip the minimap position via a dropdown on the minimap itself.
- **Stand-alone mode**: embed a minimap preview outside of a text editor for custom UI panels.
- **Independent scroll**: optionally decouple mouse-wheel scrolling on the minimap from the editor.

## Installation

To install `minimap` search for _minimap_ in the Install pane of the Lumine settings or run `lumine --install lumine-code/minimap`.

## Commands

Commands available in `atom-workspace`:

- `minimap:toggle`: show or hide the minimap in all text editors,
- `minimap:toggle-<plugin>`: activate or deactivate a registered minimap plugin (one command is registered per plugin).

## Customization

The appearance can be adjusted in the user stylesheet, e.g. hide the editor scrollbar next to the minimap, tint the minimap background, and recolor the visible-area overlay:

```less
atom-text-editor[with-minimap] .vertical-scrollbar {
  display: none;
}

atom-text-editor atom-text-editor-minimap {
  background: var(--app-background-color);

  .minimap-visible-area::after {
    background-color: rgba(127, 127, 127, 0.35);
  }
}
```

## Services

- **minimap** (`1.0.0`): provided to expose the minimap API — other packages can observe minimaps, decorate markers, and register minimap plugins.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
