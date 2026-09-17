import { apiFetch } from '@medienreaktor/neos-studio';

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
    label: string;
    /** The SVG file's markup, rendered inline. */
    icon: string;
    /** The resource URI of the SVG shown in the picker. */
    resourceUri: string;
}

/** A sanitized editorOptions.iconSources entry. */
export interface SourceConfig {
    name: string;
    previewPath: string;
    fullResourceUri: boolean;
    valuePrefix: string;
    acceptBareValues: boolean;
}

export interface GlobalSourceDefinition {
    name?: unknown;
    previewPath?: unknown;
    resourcePath?: unknown;
    resourcePathAvailable?: unknown;
}

export type GlobalSources = Record<string, GlobalSourceDefinition>;

export interface GlobalSourceSettings {
    sources: GlobalSources;
    defaultSource: string;
}

export interface SourceResolution {
    sources: SourceConfig[];
    warnings: string[];
}

/** Source keys and prefixed inline sources need the global rendering map. */
export function requiresGlobalSources(raw: unknown): boolean {
    return (
        Array.isArray(raw) &&
        raw.some((entry) => {
            if (typeof entry === 'string') return true;
            if (!entry || typeof entry !== 'object') return false;
            const options = entry as Record<string, unknown>;
            return typeof options.source === 'string' || (typeof options.valuePrefix === 'string' && options.valuePrefix !== '');
        })
    );
}

/** Resolve editorOptions.iconSources using the shared source definitions. */
export function resolveSourceConfigs(raw: unknown, settings: GlobalSourceSettings = { sources: {}, defaultSource: '' }): SourceResolution {
    if (!Array.isArray(raw)) return { sources: [], warnings: [] };
    const globalSources = settings.sources;
    const configs: SourceConfig[] = [];
    const warnings: string[] = [];
    const prefixes = new Set<string>();
    for (const entry of raw) {
        const options = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
        const sourceKey = typeof entry === 'string' ? entry : options.source;

        if (typeof sourceKey === 'string') {
            const definition = globalSources[sourceKey];
            if (!/^[a-zA-Z0-9_-]+$/.test(sourceKey) || !definition || typeof definition !== 'object') {
                warnings.push(`Unknown icon source "${sourceKey}" in editorOptions.iconSources.`);
                continue;
            }
            const previewPath = normalizePath(options.previewPath ?? definition.previewPath);
            const resourcePath = normalizePath(definition.resourcePath ?? definition.previewPath);
            if (!previewPath || !resourcePath) {
                warnings.push(`Icon source "${sourceKey}" needs a previewPath and resourcePath in global settings.`);
                continue;
            }
            if (definition.resourcePathAvailable === false) {
                warnings.push(`Icon source "${sourceKey}" has no available rendering directory at "${resourcePath}".`);
                continue;
            }
            if (prefixes.has(sourceKey)) {
                warnings.push(`Icon source "${sourceKey}" is configured more than once.`);
                continue;
            }
            prefixes.add(sourceKey);
            configs.push({
                name: displayName(options.name ?? definition.name, sourceKey),
                previewPath,
                fullResourceUri: false,
                valuePrefix: sourceKey,
                acceptBareValues: sourceKey === settings.defaultSource,
            });
            continue;
        }

        if (!entry || typeof entry !== 'object') continue;
        const { name, path, previewPath, fullResourceUri, valuePrefix } = options;
        const normalizedPath = normalizePath(previewPath ?? path);
        if (!normalizedPath) {
            warnings.push('An inline icon source has no previewPath.');
            continue;
        }
        if (valuePrefix !== undefined && (typeof valuePrefix !== 'string' || (valuePrefix !== '' && !/^[a-zA-Z0-9_-]+$/.test(valuePrefix)))) {
            warnings.push(`Icon source "${displayName(name, normalizedPath)}" has an invalid valuePrefix.`);
            continue;
        }
        const prefix = valuePrefix || '';
        if (prefix) {
            const definition = globalSources[prefix];
            if (!definition || !normalizePath(definition.resourcePath ?? definition.previewPath)) {
                warnings.push(`Icon source "${prefix}" has no rendering path in global settings.`);
                continue;
            }
            if (definition.resourcePathAvailable === false) {
                warnings.push(
                    `Icon source "${prefix}" has no available rendering directory at "${normalizePath(definition.resourcePath ?? definition.previewPath)}".`,
                );
                continue;
            }
            if (prefixes.has(prefix)) {
                warnings.push(`Icon source "${prefix}" is configured more than once.`);
                continue;
            }
            prefixes.add(prefix);
        }
        configs.push({
            name: displayName(name, normalizedPath),
            previewPath: normalizedPath,
            fullResourceUri: fullResourceUri !== false,
            valuePrefix: prefix,
            acceptBareValues: prefix !== '' && prefix === settings.defaultSource,
        });
    }
    const bareValueSources = configs.filter((config) => config.acceptBareValues || (!config.valuePrefix && !config.fullResourceUri));
    if (bareValueSources.length > 1) {
        // A bare name cannot retain which tab it came from. Keep the configured
        // default source, but reject sources that would write ambiguous names.
        const sources = configs.filter((config) => {
            if (config.valuePrefix || config.fullResourceUri) return true;
            warnings.push(`Icon source "${config.name}" has ambiguous bare values. Configure a valuePrefix or enable fullResourceUri.`);
            return false;
        });
        return { sources, warnings };
    }
    return { sources: configs, warnings };
}

function normalizePath(value: unknown): string {
    return typeof value === 'string' ? value.trim().replace(/^\/+|\/+$/g, '') : '';
}

function displayName(value: unknown, fallback: string): string {
    return typeof value === 'string' && value !== '' ? value : fallback;
}

/**
 * A prefixed name identifies its source, a plain name belongs to the default
 * source or the sole unprefixed short-value source, and a full URI identifies
 * its directory.
 */
export function sourceIndexForValue(configs: SourceConfig[], value: string): number {
    if (!value) return -1;
    if (!value.startsWith('resource://')) {
        const separator = value.indexOf(':');
        if (separator !== -1) {
            if (separator === 0 || separator === value.length - 1 || value.lastIndexOf(':') !== separator) {
                return -1;
            }
            const prefix = value.slice(0, separator);
            return configs.findIndex((config) => config.valuePrefix !== '' && config.valuePrefix === prefix);
        }
        return configs.findIndex((config) => config.acceptBareValues || (!config.valuePrefix && !config.fullResourceUri));
    }
    const directory = value.slice(0, value.lastIndexOf('/') + 1);
    return configs.findIndex((config) => `resource://${config.previewPath}/` === directory);
}

/** The SVG used for the trigger preview of a stored value. */
export function previewResourceUriForValue(configs: SourceConfig[], value: string): string {
    if (!value) return '';
    if (value.startsWith('resource://')) return value;
    const source = configs[sourceIndexForValue(configs, value)];
    const name = value.slice(value.indexOf(':') + 1);
    return source && name ? `resource://${source.previewPath}/${name}.svg` : '';
}

/** The string committed to the node property when an icon is picked. */
export function valueForIcon(source: SourceConfig, icon: IconItem): string {
    const name = icon.resourceUri.slice(icon.resourceUri.lastIndexOf('/') + 1).replace(/\.svg$/i, '');
    if (source.valuePrefix) return `${source.valuePrefix}:${name}`;
    return source.fullResourceUri ? icon.resourceUri : name;
}

const LISTING_ENDPOINT = '/icon-select-editor/icons';
const ICON_ENDPOINT = '/icon-select-editor/icon';
const SOURCE_DEFINITIONS_ENDPOINT = '/icon-select-editor/sources';

let globalSources: GlobalSourceSettings | undefined;
let globalSourcesRequest: Promise<GlobalSourceSettings> | undefined;

export function peekGlobalSources(): GlobalSourceSettings | undefined {
    return globalSources;
}

export function loadGlobalSources(): Promise<GlobalSourceSettings> {
    if (globalSources) return Promise.resolve(globalSources);
    if (!globalSourcesRequest) {
        globalSourcesRequest = apiFetch<unknown>(SOURCE_DEFINITIONS_ENDPOINT)
            .then((payload) => {
                const sources = (payload as { sources?: unknown } | null)?.sources;
                if (!sources || typeof sources !== 'object' || Array.isArray(sources)) {
                    throw new Error('Unexpected icon source configuration response.');
                }
                const defaultSource = (payload as { defaultSource?: unknown } | null)?.defaultSource;
                globalSources = {
                    sources: sources as GlobalSources,
                    defaultSource: typeof defaultSource === 'string' ? defaultSource : '',
                };
                return globalSources;
            })
            .catch((error: unknown) => {
                globalSourcesRequest = undefined;
                throw error;
            });
    }
    return globalSourcesRequest;
}

const listingRequests = new Map<string, Promise<IconItem[]>>();
const listings = new Map<string, IconItem[]>();
const iconRequests = new Map<string, Promise<IconItem | null>>();
/** Settled icons by resource URI; null marks one the endpoint could not resolve. */
const icons = new Map<string, IconItem | null>();

/** A source's listing if it has loaded, otherwise undefined. */
export function peekIconSource(config: SourceConfig): IconItem[] | undefined {
    return listings.get(config.previewPath);
}

export function loadIconSource(config: SourceConfig): Promise<IconItem[]> {
    let request = listingRequests.get(config.previewPath);
    if (!request) {
        request = fetchIconSource(config).then((items) => {
            listings.set(config.previewPath, items);
            for (const item of items) icons.set(item.resourceUri, item);
            return items;
        });
        // A failed load must not stick - drop it so the next attempt retries.
        request.catch(() => listingRequests.delete(config.previewPath));
        listingRequests.set(config.previewPath, request);
    }
    return request;
}

/** An icon if it is known - loaded on its own or as part of a listing - otherwise undefined. */
export function peekIcon(resourceUri: string): IconItem | null | undefined {
    return icons.get(resourceUri);
}

export function loadIcon(resourceUri: string): Promise<IconItem | null> {
    const known = icons.get(resourceUri);
    if (known !== undefined) return Promise.resolve(known);
    let request = iconRequests.get(resourceUri);
    if (!request) {
        request = fetchIcon(resourceUri).then((item) => {
            icons.set(resourceUri, item);
            return item;
        });
        request.catch(() => iconRequests.delete(resourceUri));
        iconRequests.set(resourceUri, request);
    }
    return request;
}

async function fetchIconSource(config: SourceConfig): Promise<IconItem[]> {
    const query = encodeURIComponent(JSON.stringify([{ name: config.name, path: config.previewPath }]));
    const payload = await apiFetch<unknown>(`${LISTING_ENDPOINT}?sources=${query}`);
    const sources = (payload as { sources?: unknown } | null)?.sources;
    if (!Array.isArray(sources)) {
        throw new Error('Unexpected icon sources response.');
    }
    // The endpoint skips a source it cannot use, leaving the list empty.
    const items = (sources[0] as { icons?: unknown } | null | undefined)?.icons;
    return Array.isArray(items) ? items.filter(isIconItem) : [];
}

async function fetchIcon(resourceUri: string): Promise<IconItem | null> {
    const query = encodeURIComponent(resourceUri);
    const payload = await apiFetch<unknown>(`${ICON_ENDPOINT}?resourceUri=${query}`);
    const item = (payload as { icon?: unknown } | null)?.icon;
    return isIconItem(item) ? item : null;
}

function isIconItem(item: unknown): item is IconItem {
    return (
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as IconItem).label === 'string' &&
        typeof (item as IconItem).icon === 'string' &&
        typeof (item as IconItem).resourceUri === 'string'
    );
}

/**
 * The label for a resource URI, mirroring the endpoint's own derivation (see
 * IconsController::labelFromName()). Lets the trigger label a stored icon
 * before its markup has loaded.
 */
export function labelFromResourceUri(resourceUri: string): string {
    const file = resourceUri.slice(resourceUri.lastIndexOf('/') + 1);
    return file
        .replace(/\.svg$/i, '')
        .replace(/[-._]/g, ' ')
        .replace(/(^|\s)\S/g, (match) => match.toUpperCase());
}
