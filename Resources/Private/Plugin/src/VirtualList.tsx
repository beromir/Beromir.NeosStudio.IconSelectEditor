import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * A minimal fixed-row-height virtual list - the classic editor used
 * react-window's FixedSizeList for the same job. Only the rows overlapping
 * the viewport (plus overscan) are mounted: an icon source can hold thousands
 * of inline SVGs, and mounting them all would put megabytes of DOM into the
 * inspector.
 */
export function VirtualList({
  rowCount,
  rowHeight,
  height,
  renderRow,
  resetKey,
  overscan = 2,
}: {
  rowCount: number
  rowHeight: number
  height: number
  renderRow: (index: number) => ReactNode
  /** Changing this scrolls back to the top (a new search, another tab). */
  resetKey: string
  overscan?: number
}) {
  const viewport = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)

  useEffect(() => {
    viewport.current?.scrollTo({ top: 0 })
    setScrollTop(0)
  }, [resetKey])

  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const last = Math.min(rowCount, Math.ceil((scrollTop + height) / rowHeight) + overscan)

  const rows = []
  for (let index = first; index < last; index++) {
    rows.push(
      <div
        key={index}
        style={{
          position: 'absolute',
          top: index * rowHeight,
          height: rowHeight,
          left: 0,
          right: 0,
        }}
      >
        {renderRow(index)}
      </div>,
    )
  }

  return (
    <div
      ref={viewport}
      className="bise-viewport"
      style={{ height }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ position: 'relative', height: rowCount * rowHeight }}>
        {rows}
      </div>
    </div>
  )
}
