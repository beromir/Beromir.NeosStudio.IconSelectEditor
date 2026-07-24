import { useEffect, useMemo, useRef, useState } from 'react'
import type { PropertyEditorProps } from '@medienreaktor/neos-studio'
import {
  loadIconSources,
  normalizeSourceConfigs,
  type IconItem,
  type LoadedSource,
} from './icons'
import { VirtualList } from './VirtualList'

/**
 * Port of Medienreaktor.IconSelectEditor (beromir/neos-icon-select-editor) to
 * the Neos Studio editor contract. A pick is a discrete commit boundary, so
 * every selection calls onCommit (and onChange, so the creation dialog's live
 * validation stays current).
 *
 * The stored value is identical to the classic editor's:
 * {resourceUri, sourceName, label}, and an empty array when cleared - one
 * node type configuration serves both interfaces.
 *
 * Differences to the classic-UI original, dictated by the Studio plugin API:
 *  - the icon listing comes from this package's own session-authenticated
 *    endpoint instead of the Neos UI data source API (not available to
 *    Studio plugins)
 *  - the picker expands in-flow below the trigger instead of overlaying as a
 *    dropdown - the Studio inspector is a scrollable panel and the plugin API
 *    exposes no portal/popover layer, so an overlay would clip
 *  - the selected icon is additionally previewed in the trigger button
 */

const COLUMNS = 5
const ROW_HEIGHT = 59
const LIST_HEIGHT = 300

/** The stored value - what the classic editor writes too. */
interface StoredIcon {
  resourceUri: string
  sourceName: string
  label: string
}

function storedIcon(value: unknown): StoredIcon | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const candidate = value as Record<string, unknown>
  if (typeof candidate.resourceUri !== 'string' || candidate.resourceUri === '') {
    return null
  }
  return {
    resourceUri: candidate.resourceUri,
    sourceName: typeof candidate.sourceName === 'string' ? candidate.sourceName : '',
    label: typeof candidate.label === 'string' ? candidate.label : '',
  }
}

export function IconSelectEditor({
  value,
  options,
  onCommit,
  onChange,
  autoFocus,
  invalid,
}: PropertyEditorProps) {
  const sources = useMemo(
    () => normalizeSourceConfigs(options.iconSources),
    [options.iconSources],
  )
  const sourcesKey = JSON.stringify(sources)

  // The picked icon, seeded from the stored value (the host remounts on a
  // subject change, which resets this).
  const [selected, setSelected] = useState<StoredIcon | null>(() => storedIcon(value))
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [loaded, setLoaded] = useState<LoadedSource[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (autoFocus) triggerRef.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    if (!sources.length) {
      return
    }
    let cancelled = false
    setLoaded(null)
    setError(null)
    loadIconSources(sources).then(
      (result) => {
        if (!cancelled) setLoaded(result)
      },
      (loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError))
        }
      },
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcesKey])

  // Once the listing arrives, start on the stored icon's source tab - like
  // the classic editor. Deliberately not re-run on tab clicks.
  useEffect(() => {
    if (!loaded || !selected) return
    const index = loaded.findIndex((source) => source.name === selected.sourceName)
    if (index >= 0) setActiveIndex(index)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  // While open: close on a click outside or Escape.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      ) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (open) searchRef.current?.focus()
  }, [open])

  const clampedIndex = loaded ? Math.min(activeIndex, Math.max(0, loaded.length - 1)) : 0
  const activeSource = loaded?.[clampedIndex]

  const iconRows = useMemo(() => {
    const icons = activeSource?.icons ?? []
    const query = search.trim().toLowerCase()
    const filtered = query
      ? icons.filter((icon) => icon.label.toLowerCase().includes(query))
      : icons
    const rows: IconItem[][] = []
    for (let i = 0; i < filtered.length; i += COLUMNS) {
      rows.push(filtered.slice(i, i + COLUMNS))
    }
    return rows
  }, [activeSource, search])

  // The stored value only holds the resource URI - the markup for the trigger
  // preview has to come from the loaded listing.
  const selectedSvg = useMemo(() => {
    if (!loaded || !selected) return null
    for (const source of loaded) {
      const match = source.icons.find(
        (icon) => icon.resourceUri === selected.resourceUri,
      )
      if (match) return match.icon
    }
    return null
  }, [loaded, selected])

  if (!sources.length) {
    return (
      <div className="bise-notice bise-notice--error">
        No icon sources configured for the icon select editor. Configure
        editorOptions.iconSources in the node type definition.
      </div>
    )
  }

  function pick(icon: IconItem) {
    const committed: StoredIcon = {
      resourceUri: icon.resourceUri,
      sourceName: icon.sourceName,
      label: icon.label,
    }
    setSelected(committed)
    setOpen(false)
    onChange?.(committed)
    onCommit(committed)
  }

  function clear() {
    setSelected(null)
    setOpen(false)
    // The classic editor commits an empty array on deselection (the property
    // type is `array`) - keep the wire format identical.
    onChange?.([])
    onCommit([])
  }

  return (
    <div ref={rootRef} className="bise" aria-invalid={invalid || undefined}>
      <div className="bise-header">
        <button
          ref={triggerRef}
          type="button"
          className="bise-trigger"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          data-empty={selected ? undefined : true}
        >
          {selectedSvg && (
            <span
              className="bise-trigger-icon"
              aria-hidden
              dangerouslySetInnerHTML={{ __html: selectedSvg }}
            />
          )}
          <span className="bise-trigger-label">
            {selected ? selected.label || selected.resourceUri : 'Select icon'}
          </span>
          <i
            className={`fa fa-chevron-${open ? 'up' : 'down'} bise-trigger-chevron`}
            aria-hidden
          />
        </button>
        {selected && (
          <button
            type="button"
            className="bise-clear"
            title="Remove icon"
            aria-label="Remove icon"
            onClick={clear}
          >
            <i className="fa fa-times" aria-hidden />
          </button>
        )}
      </div>

      {open && (
        <div className="bise-panel">
          {error ? (
            <div className="bise-notice bise-notice--error">{error}</div>
          ) : !loaded ? (
            <div className="bise-loading" title="Loading">
              <i className="fa fa-spinner fa-spin fa-lg" aria-hidden />
            </div>
          ) : (
            <>
              <div className="bise-tabs">
                {loaded.map((source, index) => (
                  <button
                    key={`${source.name}-${index}`}
                    type="button"
                    className="bise-tab"
                    data-active={index === clampedIndex || undefined}
                    data-selected-source={
                      source.name === selected?.sourceName || undefined
                    }
                    onClick={() => {
                      setActiveIndex(index)
                      setSearch('')
                    }}
                  >
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
              {iconRows.length ? (
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
                          data-selected={
                            icon.resourceUri === selected?.resourceUri || undefined
                          }
                          onClick={() => pick(icon)}
                        >
                          <span
                            className="bise-icon"
                            aria-hidden
                            dangerouslySetInnerHTML={{ __html: icon.icon }}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                />
              ) : (
                <div className="bise-empty">
                  {search
                    ? 'No icons match the search.'
                    : 'No icons found in this source - check the editorOptions.iconSources path.'}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
