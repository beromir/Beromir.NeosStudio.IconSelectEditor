/**
 * Loading the icon listing from this package's own endpoint (see
 * Classes/Controller/IconsController.php). The classic editor went through
 * the Neos UI's data source loader; the Studio plugin API exposes no backend
 * access, so the port fetches its endpoint directly with the same backend
 * session the Studio shell itself is authenticated with.
 */

/** One selectable icon - the same item shape the classic data source produced. */
export interface IconItem {
  label: string
  sourceName: string
  /** The SVG file's markup, rendered inline. */
  icon: string
  /** `resource://<Package>/<path>/<file>.svg` - the stable stored identifier. */
  resourceUri: string
}

/** A sanitized editorOptions.iconSources entry. */
export interface SourceConfig {
  name: string
  path: string
}

export interface LoadedSource {
  name: string
  icons: IconItem[]
}

/** editorOptions.iconSources as validated configs; entries without a path are dropped. */
export function normalizeSourceConfigs(raw: unknown): SourceConfig[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const configs: SourceConfig[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const { name, path } = entry as Record<string, unknown>
    if (typeof path !== 'string' || path === '') continue
    configs.push({
      name: typeof name === 'string' && name !== '' ? name : path,
      path,
    })
  }
  return configs
}

const ENDPOINT = '/neos/studio/icon-select-editor/icons'

/**
 * One load per source configuration for the session - the host remounts the
 * editor on every subject change, and the classic UI's data loader cached the
 * same way (dataSourceDisableCaching: false).
 */
const cache = new Map<string, Promise<LoadedSource[]>>()

export function loadIconSources(configs: SourceConfig[]): Promise<LoadedSource[]> {
  const key = JSON.stringify(configs)
  let promise = cache.get(key)
  if (!promise) {
    promise = fetchIconSources(configs)
    // A failed load must not stick - drop it so reopening the editor retries.
    promise.catch(() => cache.delete(key))
    cache.set(key, promise)
  }
  return promise
}

async function fetchIconSources(configs: SourceConfig[]): Promise<LoadedSource[]> {
  const query = encodeURIComponent(JSON.stringify(configs))
  const response = await fetch(`${ENDPOINT}?sources=${query}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`Loading the icon sources failed (HTTP ${response.status}).`)
  }
  const payload: unknown = await response.json()
  const sources = (payload as { sources?: unknown } | null)?.sources
  if (!Array.isArray(sources)) {
    throw new Error('Unexpected icon sources response.')
  }
  return sources
    .filter((source): source is Record<string, unknown> =>
      Boolean(source) && typeof source === 'object',
    )
    .map((source) => ({
      name: typeof source.name === 'string' ? source.name : '',
      icons: Array.isArray(source.icons)
        ? source.icons.filter(
            (icon): icon is IconItem =>
              Boolean(icon) &&
              typeof icon === 'object' &&
              typeof (icon as IconItem).label === 'string' &&
              typeof (icon as IconItem).sourceName === 'string' &&
              typeof (icon as IconItem).icon === 'string' &&
              typeof (icon as IconItem).resourceUri === 'string',
          )
        : [],
    }))
}

/**
 * The label for a resource URI, mirroring the endpoint's own derivation (see
 * IconsController: ucwords(str_replace(['-', '.', '_'], ' ', $name))). Lets
 * the trigger label a stored icon before the listing has loaded.
 */
export function labelFromResourceUri(resourceUri: string): string {
  const file = resourceUri.slice(resourceUri.lastIndexOf('/') + 1)
  return file
    .replace(/\.svg$/i, '')
    .replace(/[-._]/g, ' ')
    .replace(/(^|\s)\S/g, (match) => match.toUpperCase())
}
