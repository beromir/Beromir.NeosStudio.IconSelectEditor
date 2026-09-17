import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { PropertyEditorProps } from '@medienreaktor/neos-studio';
import {
    labelFromResourceUri,
    loadGlobalSources,
    loadIcon,
    loadIconSource,
    peekGlobalSources,
    peekIcon,
    peekIconSource,
    previewResourceUriForValue,
    requiresGlobalSources,
    resolveSourceConfigs,
    sourceIndexForValue,
    valueForIcon,
    type GlobalSourceSettings,
    type IconItem,
    type SourceConfig,
} from './icons';
import { VirtualList } from './VirtualList';

/**
 * Port of Medienreaktor.IconSelectEditor (beromir/neos-icon-select-editor) to
 * the Neos Studio editor contract. A pick is a discrete commit boundary, so
 * every selection calls onCommit (and onChange, so the creation dialog's live
 * validation stays current).
 *
 * The stored value is a plain string. Each source commits a full resource
 * URI, an icon name, or a source-prefixed name. An empty string clears it.
 *
 * Differences to the classic-UI original, dictated by the Studio plugin API:
 *  - icons come from this package's own OAuth-authenticated API endpoints
 *    instead of the Neos UI data source API, and load lazily: nothing until
 *    the picker opens, then one source listing per tab shown. The trigger
 *    previews a stored icon through a single-icon request.
 *  - the picker expands in-flow below the trigger instead of overlaying as a
 *    dropdown - the Studio inspector is a scrollable panel and the plugin API
 *    exposes no portal/popover layer, so an overlay would clip
 *  - the selected icon is additionally previewed in the trigger button
 *  - the classic editor stores {resourceUri, sourceName, label} in an `array`
 *    property; this one stores a single string
 */

const COLUMNS = 5;
const ROW_HEIGHT = 59;
const LIST_HEIGHT = 300;

export function IconSelectEditor({ value, options, onCommit, onChange, autoFocus, invalid }: PropertyEditorProps) {
    const needsGlobalSources = useMemo(() => requiresGlobalSources(options.iconSources), [options.iconSources]);
    const [globalSources, setGlobalSources] = useState<GlobalSourceSettings | undefined>(() => peekGlobalSources());
    const [configurationError, setConfigurationError] = useState<string | null>(null);
    const { sources, warnings } = useMemo(() => resolveSourceConfigs(options.iconSources, globalSources), [options.iconSources, globalSources]);

    useEffect(() => {
        if (!needsGlobalSources || globalSources) return;
        let cancelled = false;
        loadGlobalSources().then(
            (definitions) => {
                if (!cancelled) setGlobalSources(definitions);
            },
            (error: unknown) => {
                if (!cancelled) {
                    setConfigurationError(error instanceof Error ? error.message : String(error));
                }
            },
        );
        return () => {
            cancelled = true;
        };
    }, [needsGlobalSources, globalSources]);

    // The picked icon's stored value, seeded from the node property (the host
    // remounts on a subject change, which resets this).
    const [selected, setSelected] = useState<string>(() => (typeof value === 'string' ? value : ''));
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    // Start on the source tab holding the stored icon - like the classic editor.
    const [activeIndex, setActiveIndex] = useState(() => Math.max(0, sourceIndexForValue(sources, selected)));
    const needsInitialSource = useRef(needsGlobalSources && !globalSources);
    useEffect(() => {
        if (!needsInitialSource.current || !globalSources) return;
        setActiveIndex(Math.max(0, sourceIndexForValue(sources, selected)));
        needsInitialSource.current = false;
    }, [globalSources, sources, selected]);
    const [error, setError] = useState<{ path: string; message: string } | null>(null);
    // Loads settle into the caches in ./icons, which rendering reads directly -
    // this only triggers the render that picks them up.
    const [, rerender] = useReducer((count: number) => count + 1, 0);

    const rootRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const searchRef = useRef<HTMLInputElement | null>(null);

    const clampedIndex = Math.min(activeIndex, Math.max(0, sources.length - 1));
    const activeSource: SourceConfig | undefined = sources[clampedIndex];
    const activeIcons = activeSource ? peekIconSource(activeSource) : undefined;
    const activeError = error && error.path === activeSource?.previewPath ? error.message : null;

    useEffect(() => {
        if (autoFocus) triggerRef.current?.focus();
    }, [autoFocus]);

    // Load the active tab's listing only while the picker is open - a source
    // can be megabytes of SVG markup, and most edits never open the picker.
    useEffect(() => {
        if (!open || !activeSource || peekIconSource(activeSource)) return;
        let cancelled = false;
        setError(null);
        loadIconSource(activeSource).then(
            () => {
                if (!cancelled) rerender();
            },
            (loadError: unknown) => {
                if (!cancelled) {
                    setError({
                        path: activeSource.previewPath,
                        message: loadError instanceof Error ? loadError.message : String(loadError),
                    });
                }
            },
        );
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, activeSource?.previewPath]);

    // Resolve a stored name against its source's preview directory.
    const selectedPreviewUri = previewResourceUriForValue(sources, selected);

    // The trigger preview fetches one SVG instead of its whole source listing.
    useEffect(() => {
        if (!selectedPreviewUri || peekIcon(selectedPreviewUri) !== undefined) return;
        let cancelled = false;
        loadIcon(selectedPreviewUri).then(
            () => {
                if (!cancelled) rerender();
            },
            // Without markup the trigger keeps showing the derived label.
            () => {},
        );
        return () => {
            cancelled = true;
        };
    }, [selectedPreviewUri]);

    // While open: close on a click outside or Escape.
    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            if (rootRef.current && event.target instanceof Node && !rootRef.current.contains(event.target)) {
                setOpen(false);
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
                triggerRef.current?.focus();
            }
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    useEffect(() => {
        if (open) searchRef.current?.focus();
    }, [open]);

    const iconRows = useMemo(() => {
        const icons = activeIcons ?? [];
        const query = search.trim().toLowerCase();
        const filtered = query ? icons.filter((icon) => icon.label.toLowerCase().includes(query)) : icons;
        const rows: IconItem[][] = [];
        for (let i = 0; i < filtered.length; i += COLUMNS) {
            rows.push(filtered.slice(i, i + COLUMNS));
        }
        return rows;
    }, [activeIcons, search]);

    const selectedIcon = selectedPreviewUri ? peekIcon(selectedPreviewUri) : null;
    const selectedSourceIndex = sourceIndexForValue(sources, selected);

    // Derived from the file name while the markup is still loading, so the
    // trigger labels a stored icon right away.
    const selectedLabel = selected ? selectedIcon?.label || labelFromResourceUri(selectedPreviewUri || selected) : '';

    if (configurationError) {
        return <div className="bise-notice bise-notice--error">{configurationError}</div>;
    }

    if (needsGlobalSources && !globalSources) {
        return <div className="bise-loading">Loading icon sources...</div>;
    }

    if (!sources.length) {
        return (
            <div className="bise-notice bise-notice--error">
                {warnings.length
                    ? warnings.join(' ')
                    : 'No icon sources configured for the icon select editor. Configure editorOptions.iconSources in the node type definition.'}
            </div>
        );
    }

    function pick(icon: IconItem) {
        if (!activeSource) return;
        const nextValue = valueForIcon(activeSource, icon);
        setSelected(nextValue);
        setOpen(false);
        onChange?.(nextValue);
        onCommit(nextValue);
    }

    function clear() {
        setSelected('');
        setOpen(false);
        // The property is a string - deselection stores the empty string.
        onChange?.('');
        onCommit('');
    }

    return (
        <div ref={rootRef} className="bise" aria-invalid={invalid || undefined}>
            {warnings.length > 0 && (
                <div className="bise-notice bise-notice--error" role="alert">
                    {warnings.map((warning) => (
                        <div key={warning}>{warning}</div>
                    ))}
                </div>
            )}
            <div className="bise-header">
                <button
                    ref={triggerRef}
                    type="button"
                    className="bise-trigger"
                    onClick={() => setOpen(!open)}
                    aria-expanded={open}
                    data-empty={selected ? undefined : true}>
                    {selectedIcon && <span className="bise-trigger-icon" aria-hidden dangerouslySetInnerHTML={{ __html: selectedIcon.icon }} />}
                    <span className="bise-trigger-label">{selected ? selectedLabel || selected : 'Select icon'}</span>
                    <i className={`fa fa-chevron-${open ? 'up' : 'down'} bise-trigger-chevron`} aria-hidden />
                </button>
                {selected && (
                    <button type="button" className="bise-clear" title="Remove icon" aria-label="Remove icon" onClick={clear}>
                        <i className="fa fa-times" aria-hidden />
                    </button>
                )}
            </div>

            {open && (
                <div className="bise-panel">
                    <div className="bise-tabs">
                        {sources.map((source, index) => (
                            <button
                                key={`${source.name}-${index}`}
                                type="button"
                                className="bise-tab"
                                data-active={index === clampedIndex || undefined}
                                data-selected-source={index === selectedSourceIndex || undefined}
                                onClick={() => {
                                    setActiveIndex(index);
                                    setSearch('');
                                }}>
                                {source.name}
                            </button>
                        ))}
                    </div>
                    <input
                        ref={searchRef}
                        className="bise-search"
                        type="text"
                        placeholder="Search..."
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                    {activeError ? (
                        <div className="bise-notice bise-notice--error">{activeError}</div>
                    ) : !activeIcons ? (
                        <div className="bise-loading" title="Loading">
                            <i className="fa fa-spinner fa-spin fa-lg" aria-hidden />
                        </div>
                    ) : iconRows.length ? (
                        <VirtualList
                            rowCount={iconRows.length}
                            rowHeight={ROW_HEIGHT}
                            height={Math.min(LIST_HEIGHT, iconRows.length * ROW_HEIGHT)}
                            resetKey={`${clampedIndex}|${search}`}
                            renderRow={(index) => (
                                <div className="bise-row">
                                    {(iconRows[index] ?? []).map((icon) => (
                                        <button
                                            key={icon.resourceUri}
                                            type="button"
                                            title={icon.label}
                                            className="bise-icon-button"
                                            data-selected={icon.resourceUri === selectedPreviewUri || undefined}
                                            onClick={() => pick(icon)}>
                                            <span className="bise-icon" aria-hidden dangerouslySetInnerHTML={{ __html: icon.icon }} />
                                        </button>
                                    ))}
                                </div>
                            )}
                        />
                    ) : (
                        <div className="bise-empty">
                            {search ? 'No icons match the search.' : 'No icons found in this source. Check its preview path.'}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
