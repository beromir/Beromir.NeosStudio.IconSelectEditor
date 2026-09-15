import { useEffect, useMemo, useRef, useState } from 'react'
import type { PropertyEditorProps } from '@medienreaktor/neos-studio'
import {
  labelFromResourceUri,
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
 * The stored value is the icon's resource URI as a plain string - an empty
 * string when cleared - so the property is a `string`. Source name and label
 * are not stored: both are derived from the URI (the label from the file
 * name, the source from the loaded listing), which keeps them from going
 * stale when icons are renamed or moved between sources.
 *
 * Differences to the classic-UI original, dictated by the Studio plugin API:
 *  - the icon listing comes from this package's own session-authenticated
 *    endpoint instead of the Neos UI data source API (not available to
 *    Studio plugins)
 *  - the picker expands in-flow below the trigger instead of overlaying as a
 *    dropdown - the Studio inspector is a scrollable panel and the plugin API
 *    exposes no portal/popover layer, so an overlay would clip
 *  - the selected icon is additionally previewed in the trigger button
 *  - the classic editor stores {resourceUri, sourceName, label} in an `array`
 *    property; this one stores the resource URI alone
 */

const COLUMNS = 5
const ROW_HEIGHT = 59
const LIST_HEIGHT = 300

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

  // The picked icon's resource URI, seeded from the stored value (the host
  // remounts on a subject change, which resets this).
  const [selected, setSelected] = useState<string>(() =>
    typeof value === 'string' ? value : '',
  )
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

  // Once the listing arrives, start on the source tab holding the stored icon
  // - like the classic editor. Deliberately not re-run on tab clicks.
  useEffect(() => {
    if (!loaded || !selected) return
    const index = loaded.findIndex((source) =>
      source.icons.some((icon) => icon.resourceUri === selected),
    )
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

  // The stored value is only the resource URI - the markup for the trigger
  // preview, and the source the icon belongs to, come from the listing.
  const selectedIcon = useMemo(() => {
    if (!loaded || !selected) return null
    for (const source of loaded) {
      const match = source.icons.find((icon) => icon.resourceUri === selected)
      if (match) return match
    }
    return null
  }, [loaded, selected])

  // Derived from the file name while the listing is still loading, so the
  // trigger labels a stored icon right away.
  const selectedLabel = selected
    ? selectedIcon?.label || labelFromResourceUri(selected)
    : ''

  if (!sources.length) {
    return (
      <div className="bise-notice bise-notice--error">
        No icon sources configured for the icon select editor. Configure
        editorOptions.iconSources in the node type definition.
      </div>
    )
  }

  function pick(icon: IconItem) {
    setSelected(icon.resourceUri)
    setOpen(false)
    onChange?.(icon.resourceUri)
    onCommit(icon.resourceUri)
  }

  function clear() {
    setSelected('')
    setOpen(false)
    // The property is a string - deselection stores the empty string.
    onChange?.('')
    onCommit('')
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
          {selectedIcon && (
            <span
              className="bise-trigger-icon"
              aria-hidden
              dangerouslySetInnerHTML={{ __html: selectedIcon.icon }}
            />
          )}
          <span className="bise-trigger-label">
            {selected ? selectedLabel || selected : 'Select icon'}
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
                      source.name === selectedIcon?.sourceName || undefined
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
                          data-selected={icon.resourceUri === selected || undefined}
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
