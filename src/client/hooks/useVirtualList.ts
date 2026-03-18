import { useState, useRef, useCallback, useEffect, useMemo } from 'react'

interface UseVirtualListOptions {
  itemCount: number
  itemHeight: number
  overscan?: number // extra items rendered above/below
}

export function useVirtualList({ itemCount, itemHeight, overscan = 5 }: UseVirtualListOptions) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)

  const onScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop)
    }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      setContainerHeight(el.clientHeight)
    })
    observer.observe(el)
    setContainerHeight(el.clientHeight)
    return () => observer.disconnect()
  }, [])

  const { startIndex, endIndex, totalHeight, offsetY } = useMemo(() => {
    const totalHeight = itemCount * itemHeight
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
    const visibleCount = Math.ceil(containerHeight / itemHeight)
    const end = Math.min(itemCount - 1, start + visibleCount + overscan * 2)
    return {
      startIndex: start,
      endIndex: end,
      totalHeight,
      offsetY: start * itemHeight,
    }
  }, [itemCount, itemHeight, containerHeight, scrollTop, overscan])

  // Scroll to given index
  const scrollToIndex = useCallback((index: number) => {
    const el = containerRef.current
    if (!el) return
    const targetTop = index * itemHeight
    const targetBottom = targetTop + itemHeight
    if (targetTop < el.scrollTop) {
      el.scrollTop = targetTop
    } else if (targetBottom > el.scrollTop + el.clientHeight) {
      el.scrollTop = targetBottom - el.clientHeight
    }
  }, [itemHeight])

  return {
    containerRef,
    onScroll,
    startIndex,
    endIndex,
    totalHeight,
    offsetY,
    scrollToIndex,
  }
}
