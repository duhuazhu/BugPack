import { useEffect, useRef, useCallback, useState } from 'react'
import * as fabric from 'fabric'

export type AnnotationTool = 'drag' | 'select' | 'rect' | 'arrow' | 'text' | 'number' | 'highlight' | 'pen' | 'mosaic'

interface Props {
  imageUrl: string
  color: string
  tool: AnnotationTool
  lineWidth: number
  zoom: number
  onZoomChange: (zoom: number) => void
  onAnnotated?: () => void
  initialAnnotations?: unknown[]
  onSaveAnnotations?: (canvasJson: unknown, annotatedDataUrl: string | null) => void
}

interface TextInputState {
  x: number
  y: number
  screenX: number
  screenY: number
}

// Number counter
let numberCounter = 1

export function AnnotationCanvas({ imageUrl, color, tool, lineWidth, zoom, onZoomChange, onAnnotated, initialAnnotations, onSaveAnnotations }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fcRef = useRef<fabric.Canvas | null>(null)
  const bgImageRef = useRef<fabric.FabricImage | null>(null)
  const isDrawingRef = useRef(false)
  const startPointRef = useRef<{ x: number; y: number } | null>(null)
  const activeShapeRef = useRef<fabric.FabricObject | null>(null)
  const undoStackRef = useRef<string[]>([])
  const redoStackRef = useRef<string[]>([])
  const lastStateRef = useRef<string | null>(null)
  const initialStateRef = useRef<string | null>(null)
  const isRestoringRef = useRef(false)
  const [textInput, setTextInput] = useState<TextInputState | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return

    const container = containerRef.current
    const fc = new fabric.Canvas(canvasRef.current, {
      width: container.clientWidth,
      height: container.clientHeight,
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim() || '#0A0A0F',
      selection: true,
    })

    fcRef.current = fc

    const observer = new ResizeObserver(() => {
      fc.setDimensions({
        width: container.clientWidth,
        height: container.clientHeight,
      })
      fitImage()
    })
    observer.observe(container)

    const themeObserver = new MutationObserver(() => {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim()
      if (bg) {
        fc.backgroundColor = bg
        fc.renderAll()
      }
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    return () => {
      observer.disconnect()
      themeObserver.disconnect()
      fc.dispose()
      fcRef.current = null
    }
  }, [])

  const fitImage = useCallback(() => {
    const fc = fcRef.current
    const img = bgImageRef.current
    if (!fc || !img) return

    const canvasW = fc.getWidth()
    const canvasH = fc.getHeight()
    const imgW = img.width || 1
    const imgH = img.height || 1

    const scale = Math.min(canvasW / imgW, canvasH / imgH) * 0.85
    img.set({
      scaleX: scale,
      scaleY: scale,
      left: (canvasW - imgW * scale) / 2,
      top: (canvasH - imgH * scale) / 2,
    })
    fc.renderAll()
  }, [])

  useEffect(() => {
    const fc = fcRef.current
    if (!fc || !imageUrl) return

    fabric.FabricImage.fromURL(imageUrl).then((img) => {
      if (bgImageRef.current) fc.remove(bgImageRef.current)

      img.set({
        selectable: false,
        evented: false,
        hasControls: false,
      })

      bgImageRef.current = img
      fc.insertAt(0, img)
      fitImage()
      numberCounter = 1

      initialStateRef.current = JSON.stringify(fc.toJSON())

      if (initialAnnotations && Array.isArray(initialAnnotations) && initialAnnotations.length > 0) {
        const savedJson = initialAnnotations[0] as any
        if (savedJson && savedJson.objects) {
          isRestoringRef.current = true
          fc.loadFromJSON(savedJson).catch((err: unknown) => { console.error('Canvas restore failed:', err) }).then(() => {
            isRestoringRef.current = false
            const objs = fc.getObjects()
            if (objs[0]) {
              objs[0].selectable = false
              objs[0].evented = false
              bgImageRef.current = objs[0] as fabric.FabricImage
            }
            let maxNum = 0
            for (const obj of objs) {
              if (obj instanceof fabric.Group) {
                const groupObjs = obj.getObjects()
                for (const child of groupObjs) {
                  if (child instanceof fabric.Text && /^\d+$/.test(child.text || '')) {
                    maxNum = Math.max(maxNum, parseInt(child.text || '0'))
                  }
                }
              }
            }
            numberCounter = maxNum + 1
            lastStateRef.current = JSON.stringify(fc.toJSON())
            undoStackRef.current = []
            redoStackRef.current = []

            // After restore: re-scale background image + proportionally adjust annotations
            const bgImg = bgImageRef.current
            if (bgImg) {
              const oldScaleX = bgImg.scaleX || 1
              const oldScaleY = bgImg.scaleY || 1
              const oldLeft = bgImg.left || 0
              const oldTop = bgImg.top || 0

              // Recalculate scale using fitImage logic
              const canvasW = fc.getWidth()
              const canvasH = fc.getHeight()
              const imgW = bgImg.width || 1
              const imgH = bgImg.height || 1
              const newScale = Math.min(canvasW / imgW, canvasH / imgH) * 0.85
              const newLeft = (canvasW - imgW * newScale) / 2
              const newTop = (canvasH - imgH * newScale) / 2
              bgImg.set({ scaleX: newScale, scaleY: newScale, left: newLeft, top: newTop })

              // Proportionally adjust all annotation objects
              const ratioX = newScale / oldScaleX
              const ratioY = newScale / oldScaleY
              for (const obj of fc.getObjects()) {
                if (obj === bgImg) continue
                obj.set({
                  left: (((obj.left || 0) - oldLeft) * ratioX) + newLeft,
                  top: (((obj.top || 0) - oldTop) * ratioY) + newTop,
                  scaleX: (obj.scaleX || 1) * ratioX,
                  scaleY: (obj.scaleY || 1) * ratioY,
                })
                obj.setCoords()
              }
            }

            fc.renderAll()
          })
          return
        }
      }

      const initJson = JSON.stringify(fc.toJSON())
      initialStateRef.current = initJson
      lastStateRef.current = initJson
      undoStackRef.current = []
      redoStackRef.current = []
    })
  }, [imageUrl, fitImage])

  useEffect(() => {
    const fc = fcRef.current
    if (!fc) return
    fc.setZoom(zoom / 100)
    fc.renderAll()
  }, [zoom])

  // Scroll wheel zoom
  useEffect(() => {
    const fc = fcRef.current
    if (!fc) return

    const handleWheel = (opt: fabric.TEvent<WheelEvent>) => {
      const e = opt.e
      e.preventDefault()
      e.stopPropagation()
      const delta = e.deltaY
      let newZoom = zoom + (delta > 0 ? -10 : 10)
      newZoom = Math.max(25, Math.min(300, newZoom))
      onZoomChange(newZoom)
    }

    fc.on('mouse:wheel', handleWheel)
    return () => { fc.off('mouse:wheel', handleWheel) }
  }, [zoom, onZoomChange])

  // Commit pending text input when switching tools
  useEffect(() => {
    if (textInput) commitTextInput()
  }, [tool])

  useEffect(() => {
    const fc = fcRef.current
    if (!fc) return

    if (tool === 'drag') {
      fc.isDrawingMode = false
      fc.selection = false
      fc.discardActiveObject()
      fc.forEachObject((obj) => {
        obj.selectable = false
        obj.evented = false
      })
      fc.defaultCursor = 'grab'
      fc.hoverCursor = 'grab'
    } else if (tool === 'select') {
      fc.isDrawingMode = false
      fc.selection = true
      fc.defaultCursor = 'default'
      fc.hoverCursor = 'move'
      fc.forEachObject((obj) => {
        if (obj !== bgImageRef.current) {
          obj.selectable = true
          obj.evented = true
        }
      })
    } else if (tool === 'pen') {
      fc.isDrawingMode = true
      fc.selection = false
      fc.defaultCursor = 'crosshair'
      fc.hoverCursor = 'crosshair'
      fc.discardActiveObject()
      fc.forEachObject((obj) => {
        obj.selectable = false
        obj.evented = false
      })
      const brush = new fabric.PencilBrush(fc)
      brush.width = lineWidth
      brush.color = color
      fc.freeDrawingBrush = brush
    } else if (tool === 'mosaic') {
      fc.isDrawingMode = true
      fc.selection = false
      fc.defaultCursor = 'crosshair'
      fc.hoverCursor = 'crosshair'
      fc.discardActiveObject()
      fc.forEachObject((obj) => {
        obj.selectable = false
        obj.evented = false
      })
      const brush = new fabric.PencilBrush(fc)
      brush.width = lineWidth * 6
      brush.color = 'rgba(128,128,128,0.35)'
      fc.freeDrawingBrush = brush
    } else {
      fc.isDrawingMode = false
      fc.selection = false
      fc.defaultCursor = 'crosshair'
      fc.hoverCursor = 'crosshair'
      fc.discardActiveObject()
      fc.forEachObject((obj) => {
        obj.selectable = false
        obj.evented = false
      })
    }
    fc.renderAll()
  }, [tool, lineWidth, color])

  // Drag panning
  useEffect(() => {
    const fc = fcRef.current
    if (!fc || tool !== 'drag') return

    let isDragging = false
    let lastX = 0
    let lastY = 0

    const handleDown = (opt: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
      isDragging = true
      const e = opt.e as MouseEvent
      lastX = e.clientX
      lastY = e.clientY
      fc.defaultCursor = 'grabbing'
      fc.hoverCursor = 'grabbing'
    }

    const handleMove = (opt: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
      if (!isDragging) return
      const e = opt.e as MouseEvent
      const vpt = fc.viewportTransform!
      vpt[4] += e.clientX - lastX
      vpt[5] += e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      fc.requestRenderAll()
    }

    const handleUp = () => {
      isDragging = false
      fc.defaultCursor = 'grab'
      fc.hoverCursor = 'grab'
    }

    fc.on('mouse:down', handleDown)
    fc.on('mouse:move', handleMove)
    fc.on('mouse:up', handleUp)
    return () => {
      fc.off('mouse:down', handleDown)
      fc.off('mouse:move', handleMove)
      fc.off('mouse:up', handleUp)
    }
  }, [tool])

  // Drawing tools (rect/arrow/text/number/highlight)
  useEffect(() => {
    const fc = fcRef.current
    if (!fc) return
    if (tool === 'drag' || tool === 'select' || tool === 'pen' || tool === 'mosaic') return

    const handleMouseDown = (opt: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
      const pointer = fc.getScenePoint(opt.e)
      isDrawingRef.current = true
      startPointRef.current = { x: pointer.x, y: pointer.y }

      if (tool === 'text') {
        const target = fc.findTarget(opt.e)
        if (target && target !== bgImageRef.current) {
          fc.setActiveObject(target)
          fc.renderAll()
          isDrawingRef.current = false
          return
        }
        const e = opt.e as MouseEvent
        const container = containerRef.current
        if (container) {
          const rect = container.getBoundingClientRect()
          setTextInput({
            x: pointer.x,
            y: pointer.y,
            screenX: e.clientX - rect.left,
            screenY: e.clientY - rect.top,
          })
          setTimeout(() => textareaRef.current?.focus(), 0)
        }
        isDrawingRef.current = false
        return
      }

      if (tool === 'number') {
        const num = numberCounter++
        const circle = new fabric.Circle({
          radius: 14,
          fill: color,
          originX: 'center',
          originY: 'center',
        })
        const text = new fabric.Text(String(num), {
          fontSize: 14,
          fill: '#FFFFFF',
          fontWeight: 'bold',
          fontFamily: 'sans-serif',
          originX: 'center',
          originY: 'center',
        })
        const group = new fabric.Group([circle, text], {
          left: pointer.x - 14,
          top: pointer.y - 14,
        })
        fc.add(group)
        isDrawingRef.current = false
        return
      }

      if (tool === 'rect' || tool === 'highlight') {
        const rect = new fabric.Rect({
          left: pointer.x,
          top: pointer.y,
          width: 0,
          height: 0,
          fill: tool === 'highlight' ? `${color}4D` : 'transparent',
          stroke: tool === 'highlight' ? 'transparent' : color,
          strokeWidth: tool === 'highlight' ? 0 : lineWidth,
        })
        fc.add(rect)
        activeShapeRef.current = rect
      }

      if (tool === 'arrow') {
        const line = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
          stroke: color,
          strokeWidth: lineWidth,
          selectable: false,
        })
        fc.add(line)
        activeShapeRef.current = line
      }
    }

    const handleMouseMove = (opt: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
      if (!isDrawingRef.current || !startPointRef.current) return
      const pointer = fc.getScenePoint(opt.e)
      const start = startPointRef.current

      if ((tool === 'rect' || tool === 'highlight') && activeShapeRef.current) {
        const rect = activeShapeRef.current as fabric.Rect
        const w = pointer.x - start.x
        const h = pointer.y - start.y
        rect.set({
          left: w > 0 ? start.x : pointer.x,
          top: h > 0 ? start.y : pointer.y,
          width: Math.abs(w),
          height: Math.abs(h),
        })
        fc.renderAll()
      }

      if (tool === 'arrow' && activeShapeRef.current) {
        const line = activeShapeRef.current as fabric.Line
        line.set({ x2: pointer.x, y2: pointer.y })
        fc.renderAll()
      }
    }

    const handleMouseUp = () => {
      if (!isDrawingRef.current) return
      isDrawingRef.current = false

      // After line complete, add arrowhead and group
      if (tool === 'arrow' && activeShapeRef.current) {
        const line = activeShapeRef.current as fabric.Line
        const x1 = line.x1 ?? 0, y1 = line.y1 ?? 0
        const x2 = line.x2 ?? 0, y2 = line.y2 ?? 0
        const angle = Math.atan2(y2 - y1, x2 - x1)
        const headLen = 12

        const head = new fabric.Polygon([
          { x: x2, y: y2 },
          { x: x2 - headLen * Math.cos(angle - Math.PI / 6), y: y2 - headLen * Math.sin(angle - Math.PI / 6) },
          { x: x2 - headLen * Math.cos(angle + Math.PI / 6), y: y2 - headLen * Math.sin(angle + Math.PI / 6) },
        ], {
          fill: color,
          selectable: false,
        })

        fc.remove(line)
        const group = new fabric.Group([line, head], { selectable: true })
        fc.add(group)
      }

      activeShapeRef.current = null
      startPointRef.current = null
      fc.renderAll()
    }

    fc.on('mouse:down', handleMouseDown)
    fc.on('mouse:move', handleMouseMove)
    fc.on('mouse:up', handleMouseUp)

    return () => {
      fc.off('mouse:down', handleMouseDown)
      fc.off('mouse:move', handleMouseMove)
      fc.off('mouse:up', handleMouseUp)
    }
  }, [tool, color, lineWidth])

  // Mosaic brush: pixelate brush area after path complete
  useEffect(() => {
    const fc = fcRef.current
    if (!fc || tool !== 'mosaic') return

    const brushWidth = lineWidth * 6

    const handlePathCreated = (opt: { path: fabric.Path }) => {
      if (!bgImageRef.current) return
      const drawnPath = opt.path
      const bound = drawnPath.getBoundingRect()
      const bgImg = bgImageRef.current
      const imgEl = bgImg.getElement() as HTMLImageElement
      const bgScale = bgImg.scaleX ?? 1
      const bgLeft = bgImg.left ?? 0
      const bgTop = bgImg.top ?? 0

      const outW = Math.round(bound.width)
      const outH = Math.round(bound.height)
      if (outW < 2 || outH < 2) { fc.remove(drawnPath); return }

      // Map coordinates to original image pixels
      const srcX = Math.max(0, (bound.left - bgLeft) / bgScale)
      const srcY = Math.max(0, (bound.top - bgTop) / bgScale)
      const srcW = Math.min(imgEl.naturalWidth - srcX, bound.width / bgScale)
      const srcH = Math.min(imgEl.naturalHeight - srcY, bound.height / bgScale)

      if (srcW < 2 || srcH < 2) { fc.remove(drawnPath); return }

      // Generate pixelated image
      const pixelSize = 10
      const smallW = Math.max(1, Math.ceil(srcW / pixelSize))
      const smallH = Math.max(1, Math.ceil(srcH / pixelSize))
      const offSmall = document.createElement('canvas')
      offSmall.width = smallW
      offSmall.height = smallH
      const ctxSmall = offSmall.getContext('2d')!
      ctxSmall.imageSmoothingEnabled = true
      ctxSmall.drawImage(imgEl, srcX, srcY, srcW, srcH, 0, 0, smallW, smallH)

      // Offscreen compositing: brush path mask + source-in mosaic overlay
      const offResult = document.createElement('canvas')
      offResult.width = outW
      offResult.height = outH
      const ctx = offResult.getContext('2d')!

      ctx.strokeStyle = '#000'
      ctx.lineWidth = brushWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      const pathData = drawnPath.path
      if (Array.isArray(pathData)) {
        ctx.beginPath()
        for (const seg of pathData) {
          const cmd = seg[0]
          if (cmd === 'M') ctx.moveTo(seg[1] - bound.left, seg[2] - bound.top)
          else if (cmd === 'L') ctx.lineTo(seg[1] - bound.left, seg[2] - bound.top)
          else if (cmd === 'Q') ctx.quadraticCurveTo(seg[1] - bound.left, seg[2] - bound.top, seg[3] - bound.left, seg[4] - bound.top)
          else if (cmd === 'C') ctx.bezierCurveTo(seg[1] - bound.left, seg[2] - bound.top, seg[3] - bound.left, seg[4] - bound.top, seg[5] - bound.left, seg[6] - bound.top)
        }
        ctx.stroke()
      }

      ctx.globalCompositeOperation = 'source-in'
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(offSmall, 0, 0, smallW, smallH, 0, 0, outW, outH)

      // Replace path with composited image, release offscreen canvas
      fc.remove(drawnPath)
      const dataUrl = offResult.toDataURL('image/png')
      offSmall.width = 0
      offSmall.height = 0
      offResult.width = 0
      offResult.height = 0
      fabric.FabricImage.fromURL(dataUrl).then((mosaicImg) => {
        mosaicImg.set({
          left: bound.left,
          top: bound.top,
          selectable: true,
        })
        fc.add(mosaicImg)
        fc.renderAll()
      })
    }

    fc.on('path:created', handlePathCreated as any)
    return () => { fc.off('path:created', handlePathCreated as any) }
  }, [tool, lineWidth])

  // Save state to undo stack
  const saveState = useCallback(() => {
    if (isRestoringRef.current) return
    const fc = fcRef.current
    if (!fc) return
    if (lastStateRef.current) {
      undoStackRef.current.push(lastStateRef.current)
    }
    redoStackRef.current = []
    const currentJson = fc.toJSON()
    lastStateRef.current = JSON.stringify(currentJson)
    onAnnotated?.()
    const dataUrl = fc.toDataURL({ format: 'png', multiplier: 1 })
    onSaveAnnotations?.(currentJson, dataUrl)
  }, [onAnnotated, onSaveAnnotations])

  useEffect(() => {
    const fc = fcRef.current
    if (!fc) return
    const handler = () => saveState()
    fc.on('object:added', handler)
    fc.on('object:modified', handler)
    fc.on('object:removed', handler)
    return () => {
      fc.off('object:added', handler)
      fc.off('object:modified', handler)
      fc.off('object:removed', handler)
    }
  }, [saveState])

  const fixBgAfterRestore = useCallback(() => {
    const fc = fcRef.current
    if (!fc) return
    const objs = fc.getObjects()
    if (objs[0]) {
      objs[0].selectable = false
      objs[0].evented = false
      bgImageRef.current = objs[0] as fabric.FabricImage
    }
    fc.renderAll()
  }, [])

  const performUndo = useCallback(() => {
    const fc = fcRef.current
    if (!fc || undoStackRef.current.length === 0) return
    redoStackRef.current.push(lastStateRef.current || JSON.stringify(fc.toJSON()))
    const prev = undoStackRef.current.pop()!
    lastStateRef.current = prev
    isRestoringRef.current = true
    fc.loadFromJSON(prev).then(() => {
      isRestoringRef.current = false
      fixBgAfterRestore()
    }).catch((err: unknown) => { console.error('Undo failed:', err); isRestoringRef.current = false })
  }, [fixBgAfterRestore])

  const performRedo = useCallback(() => {
    const fc = fcRef.current
    if (!fc || redoStackRef.current.length === 0) return
    undoStackRef.current.push(lastStateRef.current || JSON.stringify(fc.toJSON()))
    const next = redoStackRef.current.pop()!
    lastStateRef.current = next
    isRestoringRef.current = true
    fc.loadFromJSON(next).then(() => {
      isRestoringRef.current = false
      fixBgAfterRestore()
    }).catch((err: unknown) => { console.error('Redo failed:', err); isRestoringRef.current = false })
  }, [fixBgAfterRestore])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const fc = fcRef.current
      if (!fc) return

      if (textareaRef.current && document.activeElement === textareaRef.current) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const active = fc.getActiveObject()
        if (active && active !== bgImageRef.current) {
          if (active instanceof fabric.Textbox && active.isEditing) return
          fc.remove(active)
          fc.renderAll()
        }
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        performUndo()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'Z' && e.shiftKey) {
        e.preventDefault()
        performRedo()
        return
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [performUndo, performRedo])

  // Reset annotations, push current state to undo stack
  const performReset = useCallback(() => {
    const fc = fcRef.current
    if (!fc || !initialStateRef.current) return
    undoStackRef.current.push(lastStateRef.current || JSON.stringify(fc.toJSON()))
    redoStackRef.current = []
    lastStateRef.current = initialStateRef.current
    isRestoringRef.current = true
    numberCounter = 1
    fc.loadFromJSON(initialStateRef.current).then(() => {
      isRestoringRef.current = false
      fixBgAfterRestore()
      onSaveAnnotations?.(null, null)
    }).catch((err: unknown) => { console.error('Reset failed:', err); isRestoringRef.current = false })
  }, [fixBgAfterRestore, onSaveAnnotations])

  const commitTextInput = useCallback(() => {
    const fc = fcRef.current
    const textarea = textareaRef.current
    if (!fc || !textarea || !textInput) return
    const val = textarea.value.trim()
    if (val) {
      const fontSize = 16
      const text = new fabric.Text(val, {
        left: textInput.x,
        top: textInput.y,
        fontSize,
        fill: color,
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.8)', blur: 3, offsetX: 1, offsetY: 1 }),
      })
      fc.add(text)
      fc.renderAll()
    }
    setTextInput(null)
  }, [textInput, color])

  const cancelTextInput = useCallback(() => {
    setTextInput(null)
  }, [])

  // Fit to window: reset zoom + viewport + refit image
  const handleFitWindow = useCallback(() => {
    const fc = fcRef.current
    if (!fc) return
    fc.viewportTransform = [1, 0, 0, 1, 0, 0]
    fc.setZoom(1)
    fitImage()
    onZoomChange(100)
  }, [fitImage, onZoomChange])

  // Listen to toolbar events
  useEffect(() => {
    const handleUndo = () => performUndo()
    const handleRedo = () => performRedo()
    const handleReset = () => performReset()
    const handleFit = () => handleFitWindow()
    window.addEventListener('bugpack:undo', handleUndo)
    window.addEventListener('bugpack:redo', handleRedo)
    window.addEventListener('bugpack:reset', handleReset)
    window.addEventListener('bugpack:fitWindow', handleFit)
    return () => {
      window.removeEventListener('bugpack:undo', handleUndo)
      window.removeEventListener('bugpack:redo', handleRedo)
      window.removeEventListener('bugpack:reset', handleReset)
      window.removeEventListener('bugpack:fitWindow', handleFit)
    }
  }, [performUndo, performRedo, performReset, handleFitWindow])

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas ref={canvasRef} />
      {textInput && (
        <textarea
          ref={textareaRef}
          className="absolute z-30 outline-none resize-none rounded"
          style={{
            left: textInput.screenX,
            top: textInput.screenY,
            minWidth: 120,
            minHeight: 32,
            fontSize: 16,
            lineHeight: '1.4',
            padding: '4px 6px',
            color: color,
            caretColor: color,
            background: 'rgba(0,0,0,0.5)',
            border: `2px solid ${color}`,
            fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
            textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
          }}
          placeholder="Enter text..."
          onBlur={commitTextInput}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); cancelTextInput() }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitTextInput() }
            e.stopPropagation()
          }}
        />
      )}
    </div>
  )
}
