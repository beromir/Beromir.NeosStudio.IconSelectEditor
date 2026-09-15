# Beromir.NeosStudio.IconSelectEditor

The icon select editor for **Neos Studio** (`Medienreaktor.NeosStudio`). It
lets editors pick an SVG icon from one or several configured icon source
directories, with source tabs, a search field and a virtualized icon grid.

The editor registers as `Medienreaktor.IconSelectEditor/Editor`. The
[IconSelectEditor](https://github.com/beromir/IconSelectEditor) package
provides the same editor for the classic Neos UI under the same id; both can
be installed side by side, so one node type configuration serves both
interfaces. The stored value differs, though - this port stores a plain
string where the classic editor stores an array (see [Usage](#usage)).

## Installation

Run the following command in your site package:

```bash
composer require --no-update beromir/neos-studio-icon-select-editor
```

Then run `composer update` in your project root and flush the Flow caches.

## Usage

```yaml
properties:
  icon:
    type: string
    ui:
      label: 'Icon'
      reloadIfChanged: true
      inspector:
        group: 'general'
        editor: 'Medienreaktor.IconSelectEditor/Editor'
        editorOptions:
          iconSources:
            - name: 'Font Awesome'
              path: 'Vendor.Site/Private/Icons/FontAwesome/regular'
            - name: 'Brands'
              path: 'Vendor.Site/Private/Icons/FontAwesome/brands'
```

A source `path` is `<PackageKey>/<path below the package's Resources folder>`;
every `*.svg` file in that directory becomes a selectable icon. Unlike the
classic package - which only looked in `DistributionPackages/` - paths are
resolved through the PackageManager, so icon sources inside composer-installed
packages work as well.

The stored value is the icon's resource URI as a plain string, e.g.
`resource://Vendor.Site/Private/Icons/FontAwesome/regular/squirrel.svg`.
Clearing the selection stores an empty string.

The classic editor instead stores an `array` of `resourceUri`, `sourceName`
and `label`. Both extra fields are derived from the resource URI anyway - the
label from the file name, the source from the configured `iconSources` - so
this port derives them at render time instead of storing copies that go stale
when an icon is renamed or moved to another source. Rendering gets simpler,
too: the property goes straight into `Neos.Fusion:ResourceUri`, with no
`.resourceUri` to pick out of an array first.

## How it works

The classic editor loads its icon listing through the Neos UI's data source
API, which the Studio plugin API does not expose. This port therefore ships two
small endpoints of its own, using Studio's public API client and the same OAuth
bearer authentication as the Studio and Neos API controllers:

- `api/icon-select-editor/icons` scans source directories and returns each
  icon's SVG markup.
- `api/icon-select-editor/icon` returns a single icon by its resource URI.

Nothing is loaded until the picker is opened, and then only the listing of the
active source tab - a set like Font Awesome's regular style is several
megabytes of SVG markup. A stored icon is previewed in the trigger through the
single-icon endpoint instead. Loaded listings and icons are cached for the
Studio session.

Any logged-in backend editor (`Neos.Neos:AbstractEditor`) may query the
endpoints, and paths are validated to stay inside the referenced package's
`Resources` folder.

## Differences to the classic UI original

- The picker expands in-flow below the trigger instead of overlaying as a
  dropdown - the Studio inspector is a scrollable panel, so an overlay would
  clip.
- The selected icon is additionally previewed in the trigger button.
- **No i18n.** Labels derive from the SVG file names; translation ids are not
  resolved.
- **The value is a plain string**, the resource URI, in a `string` property -
  not an array. See [Usage](#usage).

## Building

The bundle is prebuilt into `Resources/Public/Plugin/`. To rebuild:

```bash
cd Resources/Private/Plugin
npm install
npm run build        # emits Resources/Public/Plugin/{plugin.js,plugin.css}
```

Then flush Flow caches and reload `/neos/studio`. Use `npm run dev` to rebuild
on change while developing.

Note: `@medienreaktor/neos-studio` (type declarations of the Studio plugin
API) is a `file:` dependency pointing at the installed
`Medienreaktor.NeosStudio` package under `Packages/Application/`. If your
Studio package lives elsewhere, adjust the path in
`Resources/Private/Plugin/package.json`.

## License

This package is free software, released under the
[GNU General Public License, version 3 or later](LICENSE).
