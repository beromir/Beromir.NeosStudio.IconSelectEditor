# Beromir.NeosStudio.IconSelectEditor

The icon select editor for **Neos Studio** (`Medienreaktor.NeosStudio`). It
lets editors pick an SVG icon from one or several configured icon source
directories, with source tabs, a search field and a virtualized icon grid.

The editor registers as `Medienreaktor.IconSelectEditor/Editor`. The
[IconSelectEditor](https://github.com/beromir/IconSelectEditor) package
provides the same editor for the classic Neos UI under the same id; both can
be installed side by side, so one node type configuration serves both
interfaces. The stored value is identical, too.

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
    type: array
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

The following properties are stored in the database for the icon:

- `resourceUri` (e.g.
  `resource://Vendor.Site/Private/Icons/FontAwesome/regular/squirrel.svg`)
- `sourceName` (e.g. `Font Awesome`)
- `label` (e.g. `Squirrel`)

Clearing the selection stores an empty array - the same wire format as the
classic editor.

## How it works

The classic editor loads its icon listing through the Neos UI's data source
API, which the Studio plugin API does not expose. This port therefore ships a
small endpoint of its own (`neos/studio/icon-select-editor/icons`) that scans
the configured source directories and returns each icon's SVG markup. The
endpoint is session-authenticated the same way the Studio shell itself is:
any logged-in backend editor (`Neos.Neos:AbstractEditor`) may query it, and
paths are validated to stay inside the referenced package's `Resources`
folder.

## Differences to the classic UI original

- The picker expands in-flow below the trigger instead of overlaying as a
  dropdown - the Studio inspector is a scrollable panel, so an overlay would
  clip.
- The selected icon is additionally previewed in the trigger button.
- **No i18n.** Labels derive from the SVG file names; translation ids are not
  resolved.

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
