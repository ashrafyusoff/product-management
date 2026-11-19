import { useCallback, useEffect, useRef, useState } from 'react'

interface DragState {
  id: string
  startIdx: number
  targetIdx: number
  deltaY: number
  rowHeight: number
}

/**
 * Pointer-based smooth row drag-to-reorder hook.
 * Uses rAF-throttled pointer tracking and CSS transforms so sibling rows
 * glide smoothly out of the way in real time without layout thrashing.
 */
export function useSmoothRowDrag(
  items: { id: string }[],
  onCommitOrder: (orderedIds: string[]) => void | Promise<void>,
) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map())
  const activeRef = useRef<{
    id: string
    startIdx: number
    startY: number
    lastY: number
    rowHeight: number
    midpoints: number[]
    rafId: number | null
  } | null>(null)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const onCommitRef = useRef(onCommitOrder)
  onCommitRef.current = onCommitOrder

  const registerRow = useCallback((id: string) => (el: HTMLTableRowElement | null) => {
    if (el) rowRefs.current.set(id, el)
    else rowRefs.current.delete(id)
  }, [])

  const computeTargetIdx = (startIdx: number, deltaY: number, midpoints: number[]) => {
    const draggedCenter = midpoints[startIdx] + deltaY
    let target = startIdx
    if (deltaY > 0) {
      for (let i = startIdx + 1; i < midpoints.length; i++) {
        if (draggedCenter > midpoints[i]) target = i
      }
    } else if (deltaY < 0) {
      for (let i = startIdx - 1; i >= 0; i--) {
        if (draggedCenter < midpoints[i]) target = i
      }
    }
    return target
  }

  const startDrag = useCallback((e: React.PointerEvent, id: string, index: number) => {
    if (e.button !== 0 || itemsRef.current.length < 2) return
    e.preventDefault()
    e.stopPropagation()

    const midpoints = itemsRef.current.map((item) => {
      const rect = rowRefs.current.get(item.id)?.getBoundingClientRect()
      return rect ? rect.top + rect.height / 2 : 0
    })
    const draggedRect = rowRefs.current.get(id)?.getBoundingClientRect()
    const rowHeight = draggedRect?.height ?? 44

    activeRef.current = {
      id,
      startIdx: index,
      startY: e.clientY,
      lastY: e.clientY,
      rowHeight,
      midpoints,
      rafId: null,
    }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'grabbing'
    setDrag({ id, startIdx: index, targetIdx: index, deltaY: 0, rowHeight })
  }, [])

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const active = activeRef.current
      if (!active) return
      active.lastY = e.clientY
      if (active.rafId !== null) return
      active.rafId = requestAnimationFrame(() => {
        const curr = activeRef.current
        if (!curr) return
        curr.rafId = null
        const deltaY = curr.lastY - curr.startY
        const targetIdx = computeTargetIdx(curr.startIdx, deltaY, curr.midpoints)
        setDrag({
          id: curr.id,
          startIdx: curr.startIdx,
          targetIdx,
          deltaY,
          rowHeight: curr.rowHeight,
        })
      })
    }

    const onPointerUp = () => {
      const active = activeRef.current
      if (!active) return
      if (active.rafId !== null) cancelAnimationFrame(active.rafId)
      const deltaY = active.lastY - active.startY
      const targetIdx = computeTargetIdx(active.startIdx, deltaY, active.midpoints)
      const startIdx = active.startIdx
      activeRef.current = null
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      setDrag(null)

      if (targetIdx !== startIdx) {
        const nextIds = itemsRef.current.map((x) => x.id)
        const [moved] = nextIds.splice(startIdx, 1)
        nextIds.splice(targetIdx, 0, moved)
        void onCommitRef.current(nextIds)
      }
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [])

  const getRowStyle = useCallback((id: string, idx: number): React.CSSProperties | undefined => {
    if (!drag) return undefined
    if (drag.id === id) {
      return {
        transform: `translate3d(0, ${drag.deltaY}px, 0) scale(1.005)`,
        transition: 'box-shadow 150ms ease',
        position: 'relative',
        zIndex: 30,
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.14), 0 4px 10px -4px rgba(0, 0, 0, 0.08)',
      }
    }
    let shift = 0
    if (drag.startIdx < drag.targetIdx && idx > drag.startIdx && idx <= drag.targetIdx) {
      shift = -drag.rowHeight
    } else if (drag.startIdx > drag.targetIdx && idx >= drag.targetIdx && idx < drag.startIdx) {
      shift = drag.rowHeight
    }
    return {
      transform: `translate3d(0, ${shift}px, 0)`,
      transition: 'transform 200ms cubic-bezier(0.2, 0, 0, 1)',
    }
  }, [drag])

  return {
    registerRow,
    startDrag,
    getRowStyle,
    draggingId: drag?.id ?? null,
  }
}
