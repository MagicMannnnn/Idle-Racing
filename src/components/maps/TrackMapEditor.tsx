import type { CellType } from '@state/useTrackMaps'
import { useTrackMaps } from '@state/useTrackMaps'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

type Props = {
  trackId: string
  initialGridSize?: number
  onSaved?: () => void
}

type Brush = 'track' | 'standArea' | 'grass'

const GRID_GAP = 1
const GRID_PAD = 1
const MIN_STAND_AREA_TILES = 10

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function brushToCellType(b: Brush): CellType {
  if (b === 'track') return 'track'
  if (b === 'grass') return 'infield'
  return 'empty'
}

function isSingleTrackLoop(cells: CellType[], size: number) {
  const idx = (x: number, y: number) => y * size + x
  const inB = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size

  const trackIdx: number[] = []
  for (let i = 0; i < cells.length; i++) if (cells[i] === 'track') trackIdx.push(i)
  if (trackIdx.length === 0) return { ok: false as const, reason: 'No track tiles' }

  for (const i of trackIdx) {
    const x = i % size
    const y = Math.floor(i / size)
    let d = 0
    const n = [
      [x, y - 1],
      [x + 1, y],
      [x, y + 1],
      [x - 1, y],
    ] as const
    for (const [nx, ny] of n) {
      if (!inB(nx, ny)) continue
      if (cells[idx(nx, ny)] === 'track') d++
    }
    if (d !== 2) {
      return {
        ok: false as const,
        reason: 'Track must be exactly one closed loop (each track tile needs 2 neighbours)',
      }
    }
  }

  const visited = new Set<number>()
  const stack = [trackIdx[0]]
  visited.add(trackIdx[0])

  while (stack.length) {
    const cur = stack.pop()!
    const x = cur % size
    const y = Math.floor(cur / size)
    const n = [
      [x, y - 1],
      [x + 1, y],
      [x, y + 1],
      [x - 1, y],
    ] as const
    for (const [nx, ny] of n) {
      if (!inB(nx, ny)) continue
      const ni = idx(nx, ny)
      if (cells[ni] !== 'track') continue
      if (visited.has(ni)) continue
      visited.add(ni)
      stack.push(ni)
    }
  }

  if (visited.size !== trackIdx.length) {
    return { ok: false as const, reason: 'Track must be exactly one complete loop' }
  }

  return { ok: true as const }
}

export function TrackMapEditor({ trackId, initialGridSize = 5, onSaved }: Props) {
  const ensure = useTrackMaps((s: any) => s.ensure)
  const grid = useTrackMaps((s: any) => s.get(trackId))
  const setCells = useTrackMaps((s: any) => s.setCells)

  const [brush, setBrush] = useState<Brush>('track')
  const [draftCells, setDraftCells] = useState<CellType[]>([])
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string>('')

  const lastIdxRef = useRef<number | null>(null)

  useEffect(() => {
    ensure(trackId, initialGridSize)
  }, [ensure, trackId, initialGridSize])

  useEffect(() => {
    if (!grid?.cells?.length) return
    setDraftCells(grid.cells.slice())
    setDirty(false)
    setError('')
  }, [grid?.cells, trackId])

  const mapSize = grid?.size ?? initialGridSize
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const isLandscape = windowWidth > windowHeight
  const isWeb = Platform.OS === 'web'

  const cellPx = useMemo(() => {
    // Calculate max size: either windowWidth - margin, or height - controls
    const maxSize = isWeb
      ? Math.min(windowWidth - (isLandscape ? 420 : 60), windowHeight - 200)
      : Math.min(windowWidth - 32, windowHeight * 0.75)
    const inner = maxSize - GRID_PAD * 2 - GRID_GAP * (mapSize - 1)
    return Math.max(6, Math.floor(inner / mapSize))
  }, [windowWidth, windowHeight, mapSize, isWeb, isLandscape])

  const wrapW = useMemo(
    () => cellPx * mapSize + GRID_GAP * (mapSize - 1) + GRID_PAD * 2,
    [cellPx, mapSize],
  )

  const standAreaCount = useMemo(() => {
    let c = 0
    for (let i = 0; i < draftCells.length; i++) if (draftCells[i] === 'empty') c++
    return c
  }, [draftCells])

  const indexFromLocalPoint = (lx: number, ly: number) => {
    const innerX = lx - GRID_PAD
    const innerY = ly - GRID_PAD
    if (innerX < 0 || innerY < 0) return null

    const stride = cellPx + GRID_GAP
    const rawCol = Math.floor(innerX / stride)
    const rawRow = Math.floor(innerY / stride)

    const col = clampInt(rawCol, 0, mapSize - 1)
    const row = clampInt(rawRow, 0, mapSize - 1)
    const clamped = rawCol !== col || rawRow !== row
    if (!clamped) {
      const inCellX = innerX % stride
      const inCellY = innerY % stride
      if (inCellX > cellPx || inCellY > cellPx) return null
    }

    return row * mapSize + col
  }

  const paintIndex = (idx: number) => {
    if (idx < 0 || idx >= mapSize * mapSize) return
    const nextType = brushToCellType(brush)

    setDraftCells((prev) => {
      const next =
        prev.length === mapSize * mapSize
          ? prev.slice()
          : new Array<CellType>(mapSize * mapSize).fill('infield')
      next[idx] = nextType
      return next
    })

    setDirty(true)
    setError('')
  }

  const onStart = (evt: any) => {
    lastIdxRef.current = null
    const { locationX, locationY } = evt.nativeEvent
    const idx = indexFromLocalPoint(locationX, locationY)
    if (idx == null) return
    lastIdxRef.current = idx
    paintIndex(idx)
  }

  const onMove = (evt: any) => {
    const { locationX, locationY } = evt.nativeEvent
    const idx = indexFromLocalPoint(locationX, locationY)
    if (idx == null) return
    if (lastIdxRef.current === idx) return
    lastIdxRef.current = idx
    paintIndex(idx)
  }

  const onEnd = () => {
    lastIdxRef.current = null
  }

  const onClear = () => {
    const next = new Array<CellType>(mapSize * mapSize).fill('infield')
    setDraftCells(next)
    setDirty(true)
    setError('')
  }

  const onSave = () => {
    if (!dirty) {
      setError('No changes to save')
      return
    }

    if (standAreaCount < MIN_STAND_AREA_TILES) {
      setError(`Need at least ${MIN_STAND_AREA_TILES} stand-area tiles`)
      return
    }

    const loopCheck = isSingleTrackLoop(draftCells, mapSize)
    if (!loopCheck.ok) {
      setError(loopCheck.reason)
      return
    }

    setCells(trackId, draftCells)
    setDirty(false)
    setError('')
    onSaved?.()
  }

  return (
    <SafeAreaView style={styles.safe} edges={isWeb ? ['top', 'left', 'right', 'bottom'] : []}>
      {isWeb ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{
            flexGrow: 1,
            paddingVertical: isLandscape ? 24 : 12,
            paddingHorizontal: 12,
          }}
          showsVerticalScrollIndicator={!isLandscape}
        >
          <View
            style={{
              flex: isLandscape ? 1 : undefined,
              flexDirection: isLandscape ? 'row' : 'column',
              alignSelf: 'center',
              gap: 12,
              alignItems: isLandscape ? 'flex-start' : 'center',
              justifyContent: isLandscape ? 'center' : 'flex-start',
            }}
          >
            <View style={{ width: wrapW, alignSelf: 'center' }}>
              <View
                style={[styles.wrap, { width: wrapW, height: wrapW, padding: GRID_PAD }]}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={onStart}
                onResponderMove={onMove}
                onResponderRelease={onEnd}
                onResponderTerminate={onEnd}
              >
                {Array.from({ length: mapSize * mapSize }).map((_, i) => {
                  const x = i % mapSize
                  const y = Math.floor(i / mapSize)
                  const type = (draftCells[i] ?? 'infield') as CellType

                  return (
                    <View
                      key={`${trackId}_${i}`}
                      pointerEvents="none"
                      style={[
                        styles.cell,
                        {
                          width: cellPx,
                          height: cellPx,
                          marginRight: x === mapSize - 1 ? 0 : GRID_GAP,
                          marginBottom: y === mapSize - 1 ? 0 : GRID_GAP,
                        },
                        type === 'infield' && styles.grass,
                        type === 'track' && styles.track,
                        type === 'empty' && styles.standAreaWhite,
                        type === 'stand' && styles.standMarker,
                      ]}
                    />
                  )
                })}
              </View>
            </View>

            <View style={{ width: isLandscape ? 350 : wrapW, alignSelf: 'center' }}>
              <View style={styles.controlsPanel}>
                <Text style={styles.title}>Edit Track</Text>

                <View style={styles.toolsRow}>
                  <BrushButton
                    label="Track"
                    active={brush === 'track'}
                    onPress={() => setBrush('track')}
                  />
                  <BrushButton
                    label="Stand area"
                    active={brush === 'standArea'}
                    onPress={() => setBrush('standArea')}
                  />
                  <BrushButton
                    label="Grass"
                    active={brush === 'grass'}
                    onPress={() => setBrush('grass')}
                  />
                </View>

                <Pressable
                  onPress={onClear}
                  style={({ pressed }) => [styles.clearBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.clearBtnText}>Clear All</Text>
                </Pressable>

                <Text style={styles.helper}>
                  Drag to draw • Stand-area tiles (white):{' '}
                  <Text style={styles.helperStrong}>{standAreaCount}</Text> / {MIN_STAND_AREA_TILES}{' '}
                  minimum • Track must be 1 closed loop
                </Text>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Pressable
                  onPress={onSave}
                  style={({ pressed }) => [styles.saveBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.saveBtnText}>Save</Text>
                </Pressable>

                <Text style={styles.note}>Edits are local until you press Save.</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={{
              flexDirection: isLandscape ? 'row' : 'column',
              alignSelf: 'center',
              gap: 12,
              alignItems: isLandscape ? 'flex-start' : 'center',
            }}
          >
            <View style={{ width: wrapW, alignSelf: 'center' }}>
              <View
                style={[styles.wrap, { width: wrapW, height: wrapW, padding: GRID_PAD }]}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={onStart}
                onResponderMove={onMove}
                onResponderRelease={onEnd}
                onResponderTerminate={onEnd}
              >
                {Array.from({ length: mapSize * mapSize }).map((_, i) => {
                  const x = i % mapSize
                  const y = Math.floor(i / mapSize)
                  const type = (draftCells[i] ?? 'infield') as CellType

                  return (
                    <View
                      key={`${trackId}_${i}`}
                      pointerEvents="none"
                      style={[
                        styles.cell,
                        {
                          width: cellPx,
                          height: cellPx,
                          marginRight: x === mapSize - 1 ? 0 : GRID_GAP,
                          marginBottom: y === mapSize - 1 ? 0 : GRID_GAP,
                        },
                        type === 'infield' && styles.grass,
                        type === 'track' && styles.track,
                        type === 'empty' && styles.standAreaWhite,
                        type === 'stand' && styles.standMarker,
                      ]}
                    />
                  )
                })}
              </View>
            </View>

            <View style={{ width: isLandscape ? 350 : wrapW, alignSelf: 'center' }}>
              <View style={styles.controlsPanel}>
                <Text style={styles.title}>Edit Track</Text>

                <View style={styles.toolsRow}>
                  <BrushButton
                    label="Track"
                    active={brush === 'track'}
                    onPress={() => setBrush('track')}
                  />
                  <BrushButton
                    label="Stand area"
                    active={brush === 'standArea'}
                    onPress={() => setBrush('standArea')}
                  />
                  <BrushButton
                    label="Grass"
                    active={brush === 'grass'}
                    onPress={() => setBrush('grass')}
                  />
                </View>

                <Pressable
                  onPress={onClear}
                  style={({ pressed }) => [styles.clearBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.clearBtnText}>Clear All</Text>
                </Pressable>

                <Text style={styles.helper}>
                  Drag to draw • Stand-area tiles (white):{' '}
                  <Text style={styles.helperStrong}>{standAreaCount}</Text> / {MIN_STAND_AREA_TILES}{' '}
                  minimum • Track must be 1 closed loop
                </Text>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Pressable
                  onPress={onSave}
                  style={({ pressed }) => [styles.saveBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.saveBtnText}>Save</Text>
                </Pressable>

                <Text style={styles.note}>Edits are local until you press Save.</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

function BrushButton(props: { label: string; active: boolean; onPress: () => void }) {
  const { label, active, onPress } = props
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.brushBtn,
        active && styles.brushBtnActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.brushBtnText, active && styles.brushBtnTextActive]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  controlsPanel: { gap: 12 },
  title: { fontSize: 18, fontWeight: '900', color: '#0B0F14' },

  toolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },

  brushBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.10)',
  },
  brushBtnActive: {
    backgroundColor: 'rgba(0,0,0,0.14)',
    borderColor: 'rgba(0,0,0,0.18)',
  },
  brushBtnText: { fontWeight: '900', fontSize: 12, color: 'rgba(0,0,0,0.70)' },
  brushBtnTextActive: { color: 'rgba(0,0,0,0.92)' },

  clearBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,0,0,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,0,0,0.18)',
    alignItems: 'center',
  },
  clearBtnText: { fontWeight: '900', fontSize: 13, color: 'rgba(140,0,0,0.95)' },

  helper: { fontSize: 12, fontWeight: '800', color: 'rgba(0,0,0,0.65)' },
  helperStrong: { fontWeight: '900', color: 'rgba(0,0,0,0.90)' },

  error: { color: '#B00020', fontWeight: '900', fontSize: 12 },

  pressed: { transform: [{ scale: 0.99 }], opacity: 0.9 },

  wrap: {
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.10)',
  },

  cell: { borderRadius: 3 },

  grass: { backgroundColor: 'rgba(30,160,80,0.14)' },
  track: { backgroundColor: 'rgba(20,20,20,0.28)' },

  standAreaWhite: { backgroundColor: '#FFFFFF' },
  standMarker: { backgroundColor: 'rgba(255,200,0,0.32)' },

  saveBtn: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#0B0F14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },

  note: { fontSize: 11, fontWeight: '800', color: 'rgba(0,0,0,0.55)' },
})
