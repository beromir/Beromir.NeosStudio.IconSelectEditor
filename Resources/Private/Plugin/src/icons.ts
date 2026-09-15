import { apiFetch } from '@medienreaktor/neos-studio'

/**
 * Loading icons from this package's own endpoints (see
 * Classes/Controller/IconsController.php). The classic editor went through
 * the Neos UI's data source loader; this port uses Studio's public API client
 * so the requests share the shell's OAuth bearer token and refresh handling.
 *
 * Listings load per source and single icons per resource URI, both once for
 * the session - the host remounts the editor on every subject change, and the
 * classic UI's data loader cached the same way (dataSourceDisableCaching:
 * false). Settled results are kept in plain maps as well, so the editor reads
 * them synchronously while rendering instead of flashing a spinner for data
 * it already has.
 */

/** One selectable icon. */
export interface IconItem {
  label: string
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

/**
 * The index of the source whose directory holds the icon, or -1. Derived from
 * the resource URI alone (the endpoint builds it from the trimmed source path),
 * so no listing has to be loaded to find an icon's tab.
 */
export function sourceIndexForResourceUri(
  configs: SourceConfig[],
  resourceUri: string,
): number {
  if (!resourceUri) return -1
  const directory = resourceUri.slice(0, resourceUri.lastIndexOf('/') + 1)
  return configs.findIndex(
    (config) => `resource://${config.path.replace(/^\/+|\/+$/g, '')}/` === directory,
  )
}

const LISTING_ENDPOINT = '/icon-select-editor/icons'
const ICON_ENDPOINT = '/icon-select-editor/icon'

const listingRequests = new Map<string, Promise<IconItem[]>>()
const listings = new Map<string, IconItem[]>()
const iconRequests = new Map<string, Promise<IconItem | null>>()
/** Settled icons by resource URI; null marks one the endpoint could not resolve. */
const icons = new Map<string, IconItem | null>()

/** A source's listing if it has loaded, otherwise undefined. */
export function peekIconSource(config: SourceConfig): IconItem[] | undefined {
  return listings.get(config.path)
}

export function loadIconSource(config: SourceConfig): Promise<IconItem[]> {
  let request = listingRequests.get(config.path)
  if (!request) {
    request = fetchIconSource(config).then((items) => {
      listings.set(config.path, items)
      for (const item of items) icons.set(item.resourceUri, item)
      return items
    })
    // A failed load must not stick - drop it so the next attempt retries.
    request.catch(() => listingRequests.delete(config.path))
    listingRequests.set(config.path, request)
  }
  return request
}

/** An icon if it is known - loaded on its own or as part of a listing - otherwise undefined. */
export function peekIcon(resourceUri: string): IconItem | null | undefined {
  return icons.get(resourceUri)
}

export function loadIcon(resourceUri: string): Promise<IconItem | null> {
  const known = icons.get(resourceUri)
  if (known !== undefined) return Promise.resolve(known)
  let request = iconRequests.get(resourceUri)
  if (!request) {
    request = fetchIcon(resourceUri).then((item) => {
      icons.set(resourceUri, item)
      return item
    })
    request.catch(() => iconRequests.delete(resourceUri))
    iconRequests.set(resourceUri, request)
  }
  return request
}

async function fetchIconSource(config: SourceConfig): Promise<IconItem[]> {
  const query = encodeURIComponent(JSON.stringify([config]))
  const payload = await apiFetch<unknown>(`${LISTING_ENDPOINT}?sources=${query}`)
  const sources = (payload as { sources?: unknown } | null)?.sources
  if (!Array.isArray(sources)) {
    throw new Error('Unexpected icon sources response.')
  }
  // The endpoint skips a source it cannot use, leaving the list empty.
  const items = (sources[0] as { icons?: unknown } | null | undefined)?.icons
  return Array.isArray(items) ? items.filter(isIconItem) : []
}

async function fetchIcon(resourceUri: string): Promise<IconItem | null> {
  const query = encodeURIComponent(resourceUri)
  const payload = await apiFetch<unknown>(`${ICON_ENDPOINT}?resourceUri=${query}`)
  const item = (payload as { icon?: unknown } | null)?.icon
  return isIconItem(item) ? item : null
}

function isIconItem(item: unknown): item is IconItem {
  return (
    Boolean(item) &&
    typeof item === 'object' &&
    typeof (item as IconItem).label === 'string' &&
    typeof (item as IconItem).icon === 'string' &&
    typeof (item as IconItem).resourceUri === 'string'
  )
}

/**
 * The label for a resource URI, mirroring the endpoint's own derivation (see
 * IconsController::labelFromName()). Lets the trigger label a stored icon
 * before its markup has loaded.
 */
export function labelFromResourceUri(resourceUri: string): string {
  const file = resourceUri.slice(resourceUri.lastIndexOf('/') + 1)
  return file
    .replace(/\.svg$/i, '')
    .replace(/[-._]/g, ' ')
    .replace(/(^|\s)\S/g, (match) => match.toUpperCase())
}
