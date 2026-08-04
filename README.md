# Picturesque

Picturesque is a local-first visual workspace for comparing, refining, and
designing with images. The current application focuses on precise photo
comparison; the longer-term direction includes reusable layouts, text,
stickers, and richer image composition across web, desktop, and mobile.

Picturesque keeps image processing in the browser. Photos are not uploaded to
a server, and portable project files can retain the source images alongside
their mappings and adjustments.

## Roadmap

The self-contained [product and architecture roadmap](docs/roadmap.html)
describes the TypeScript migration, shared application core, editor and
template milestones, native platform strategy, and quality gates. Run the
local server and open <http://localhost:4173/docs/roadmap.html> to review its
interactive version.

## Current capabilities

- Manage any number of named image collections and compare any two of them.
- Pair corresponding images automatically or adjust mappings manually.
- Review pairs side by side, overlaid, through a movable wipe, as a difference
  blend, or with a blinking A/B view.
- Tune alignment, framing, opacity, brightness, contrast, saturation, warmth,
  and grayscale independently for each layer.
- Save projects in browser storage or download a portable project file.
- Export the current comparison as PNG or JPEG, export every pair, or download
  a ZIP archive.

## Run locally

Picturesque requires Node.js 20 or later and currently has no runtime
dependencies.

```console
npm run dev
```

Open <http://localhost:4173>.

## Validate changes

```console
npm test
npm run check
```

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `←` / `→` | Previous / next pair |
| `S`, `O`, `W`, `D`, `B` | Side, overlay, wipe, difference, blink |
| `F` | Fit comparison to the workspace |
| `0` | Reset zoom and pan |
| `[` / `]` | Decrease / increase overlay opacity |
| `G` | Toggle grid |
| `L` | Toggle labels |
| `?` | Open shortcut reference |
| `Ctrl/Cmd + S` | Download the project file |

## Privacy

Images are processed entirely in the browser. Browser saves use IndexedDB,
and portable project files embed image data directly, so project files can be
large when they contain high-resolution collections.

Do not commit private photos, exported comparisons, or saved project files to
this repository.

## License

Picturesque is available under the [MIT License](LICENSE).
