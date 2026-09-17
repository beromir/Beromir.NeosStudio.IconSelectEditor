# Beromir.NeosStudio.IconSelectEditor

The icon select editor for **Neos Studio** (`Medienreaktor.NeosStudio`). It
lets editors pick an SVG icon from one or several configured icon source
directories, with source tabs, a search field and a virtualized icon grid.

The editor registers as `Medienreaktor.IconSelectEditor/Editor`. The
[IconSelectEditor](https://github.com/beromir/IconSelectEditor) package
provides the same editor for the classic Neos UI under the same id; both can
be installed side by side. The Studio editor stores a plain string and offers
its own value options, while the classic editor stores an array (see
[Usage](#usage)).

## Installation

Run the following command in your site package:

```bash
composer require --no-update beromir/neos-studio-icon-select-editor
```

Then run `composer update` in your project root and flush the Flow caches.

## Usage

Define sources once in your site's `Configuration/Settings.IconSelectEditor.yaml`:

```yaml
Beromir:
    NeosStudio:
        IconSelectEditor:
            sources:
                icons:
                    name: 'Icons'
                    previewPath: 'Vendor.Site/Private/Icons/FontAwesome/regular'
                    resourcePath: 'Vendor.Site/Private/Icons/FontAwesome/regular'
                brands:
                    name: 'Brands'
                    previewPath: 'Vendor.Site/Private/Icons/FontAwesome/brands'
                    resourcePath: 'Vendor.Site/Private/Icons/FontAwesome/brands'
```

Then reference those source keys in a node type or property mixin:

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
                    iconSources: ['icons', 'brands']
```

Each path is `<PackageKey>/<path below the package's Resources folder>`;
every `*.svg` file in `previewPath` becomes a selectable icon. The package
resolves paths through Flow's PackageManager, including composer-installed
packages. `resourcePath` determines where the Fusion helper renders icons and
defaults to `previewPath` when omitted. Changing `resourcePath` globally
changes the rendered style without editing components.

The source key becomes the stored value prefix: `icons:squirrel` or
`brands:twitter`. Clearing the selection stores an empty string. A missing
source, rendering path, or rendering directory is shown as an error in the inspector.

You can override a source's picker label or preview path for one editor:

```yaml
editorOptions:
    iconSources:
        - source: 'icons'
          name: 'Solid icons'
          previewPath: 'Vendor.Site/Private/Icons/FontAwesome/solid'
        - source: 'brands'
```

This changes the picker preview only. Override the global `resourcePath` in
site Settings to change the default rendering path, or pass a directory to
`IconSelect.resourceUri(value, directoryOverride)` for one rendering call.

Existing inline `iconSources` entries with `path` or `previewPath` still work.
For those entries, `fullResourceUri` defaults to `true`; setting it to `false`
stores a bare file name. `valuePrefix` stores `<prefix>:<name>` and must match
a key in global `sources`. If you store bare names, configure `defaultSource`
with the corresponding global source key.

Only one source in a picker may resolve bare names. If multiple sources would
do so, unprefixed sources with `fullResourceUri: false` are rejected with a
configuration error; give them a `valuePrefix` or enable `fullResourceUri`.
A prefixed source matching `defaultSource` also previews existing bare names,
regardless of its `fullResourceUri` option.

The package provides four Fusion helpers:

- `IconSelect.iconName(value)` returns `squirrel` or `twitter` from either
  stored form. It also extracts the file name from a full resource URI.
- `IconSelect.sourceName(value)` returns `icons` for `icons:squirrel` and
  `brands` for `brands:twitter`. A bare name uses `defaultSource` when set;
  a full resource URI returns an empty string.
- `IconSelect.resourceUri(value, directoryOverride)` returns the SVG resource
  URI using the global `sources` setting by default. A bare name
  uses `defaultSource` when set. The optional second argument overrides the
  directory for that call; a full resource URI passes through unchanged.
- `IconSelect.exists(value, directoryOverride)` checks whether the resolved SVG
  exists as a file inside the package's Resources folder. It uses the same
  source and override rules as `resourceUri`, and returns `false` for empty
  values, unknown sources or packages, invalid paths, and missing files.
  Use `${IconSelect.exists(props.icon)}` as a rendering condition to hide a
  missing icon or choose a fallback. This checks file existence, not SVG markup.

The component only passes the stored value:

```fusion
@private {
    templatePath = ${IconSelect.resourceUri(props.icon)}
}
```

`icons:squirrel` resolves to
`resource://Vendor.Site/Private/Icons/FontAwesome/regular/squirrel.svg`, while
`brands:twitter` resolves to
`resource://Vendor.Site/Private/Icons/FontAwesome/brands/twitter.svg`. An
empty value resolves to an empty string. Without an override, an unmapped
prefix does too. For an exception, pass a directory without
`resource://`, for example
`IconSelect.resourceUri(props.icon, 'Vendor.Site/Private/Icons/FontAwesome/solid')`.

The classic editor instead stores an `array` of `resourceUri`, `sourceName`
and `label`. This port derives the label from the file name and the source from
the configured `iconSources`, avoiding copies that go stale when an icon is
renamed or moved.

## How it works

The classic editor loads its icon listing through the Neos UI's data source
API, which the Studio plugin API does not expose. This port therefore ships
endpoints of its own, using Studio's public API client and the same OAuth
bearer authentication as the Studio and Neos API controllers:

- `api/icon-select-editor/sources` returns the global source definitions when
  a property references source keys. The response is cached for the Studio
  session.
- `api/icon-select-editor/icons` scans source directories and returns each
  icon's SVG markup.
- `api/icon-select-editor/icon` returns a single icon by its preview resource
  URI. The editor derives that URI from `previewPath` when the stored value is
  a file name, with or without a source prefix.

The picker loads a source listing only when its tab is opened - a set like
Font Awesome's regular style is several megabytes of SVG markup. A stored
icon is previewed in the trigger through the single-icon endpoint instead.
Loaded listings and icons are cached for the Studio session.

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
- **The value is a plain string**, either a full resource URI, a file name, or
  a prefixed file name according to the source configuration - not an array.
  See [Usage](#usage).

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
