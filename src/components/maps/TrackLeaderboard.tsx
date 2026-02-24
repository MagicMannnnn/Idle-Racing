import type { CarAnim } from '@hooks/useTrackCars'
import { useTrackMaps } from '@state/useTrackMaps'
import React, { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

type Row = {
  id: number
  laps: number
  progress: number
  colorHex: string
}

type Props = {
  cars: CarAnim[]
  height?: number
  sampleMs?: number
  setLeaderId?: (id: number | null) => void
  driverNames?: string[]
  driverNumbers?: number[]
}

export function TrackLeaderboard({
  cars,
  height = 180,
  sampleMs = 250,
  setLeaderId,
  driverNames: customDriverNames,
  driverNumbers: customDriverNumbers,
}: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const storeCarNames = useTrackMaps((s: any) => s.carNames || [])
  const storeCarNumbers = useTrackMaps((s: any) => s.carNumbers || [])

  // Use custom driver names/numbers if provided, otherwise fall back to store
  const carNames = customDriverNames ?? storeCarNames
  const carNumbers = customDriverNumbers ?? storeCarNumbers

  useEffect(() => {
    let alive = true

    const sample = () => {
      if (!alive) return
      const next: Row[] = cars.map((c) => ({
        id: c.id,
        laps: Math.max(0, Math.floor(c.laps.value || 0)),
        progress: c.progress.value || 0,
        colorHex: c.colorHex,
      }))

      next.sort((a, b) => b.progress - a.progress)
      setRows(next)
    }

    sample()
    const t = setInterval(sample, sampleMs)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [cars, sampleMs])

  const [selectedCarId, setSelectedCarId] = useState<number | null>(null)

  const fmtGap = useMemo(() => {
    return (gap: number) => {
      if (!Number.isFinite(gap) || gap <= 0) return '—'
      return `+${gap.toFixed(1)}`
    }
  }, [])

  return (
    <View style={[styles.card, { height }]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Leaderboard</Text>
        <Text style={styles.sub}>Live</Text>
      </View>

      <View style={styles.cols}>
        <Text style={[styles.col, styles.colPos]}>P</Text>
        <Text style={[styles.col, styles.colName]}>Driver</Text>
        <Text style={[styles.col, styles.colLaps]}>Laps</Text>
        <Text style={[styles.col, styles.colGap]}>Gap</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {(() => {
          const usedNumbers = new Set<number>()
          let prevProgress = 0

          return rows.map((r, idx) => {
            const carNumber = carNumbers[r.id - 1]

            let displayNumber: number
            if (carNumber !== undefined) {
              displayNumber = carNumber
            } else {
              displayNumber = r.id
              while (usedNumbers.has(displayNumber)) {
                displayNumber++
              }
            }

            usedNumbers.add(displayNumber)

            const name = `${carNames[r.id - 1] || 'Car'} #${displayNumber}`
            const gap = idx === 0 ? 0 : prevProgress - r.progress
            prevProgress = r.progress
            const isSelected = selectedCarId === r.id
            return (
              <Pressable
                key={r.id}
                onPress={() => {
                  const newId = isSelected ? null : r.id
                  setSelectedCarId(newId)
                  setLeaderId?.(newId)
                }}
                style={({ pressed }) => [
                  styles.row,
                  idx === 0 && styles.rowLeader,
                  isSelected && styles.rowSelected,
                  pressed && styles.rowPressed,
                ]}
              >
                <Text style={[styles.cell, styles.pos]}>{idx + 1}</Text>

                <View style={styles.nameWrap}>
                  <View style={[styles.swatch, { backgroundColor: r.colorHex }]} />
                  <Text style={[styles.cell, styles.name]}>{name}</Text>
                </View>

                <Text style={[styles.cell, styles.laps]}>{r.laps}</Text>
                <Text style={[styles.cell, styles.gap]}>{idx === 0 ? '—' : fmtGap(gap)}</Text>
              </Pressable>
            )
          })
        })()}

        {!rows.length ? <Text style={styles.empty}>No cars</Text> : null}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.06)',
    padding: 12,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: { fontSize: 16, fontWeight: '700' },
  sub: { fontSize: 12, opacity: 0.65 },

  cols: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.55)',
    paddingHorizontal: 8,
  },
  col: { fontSize: 11, fontWeight: '700', opacity: 0.75 },
  colPos: { width: 28 },
  colName: { flex: 1 },
  colLaps: { width: 48, textAlign: 'right' },
  colGap: { width: 62, textAlign: 'right' },

  scroll: { marginTop: 8 },
  scrollContent: { paddingBottom: 4 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginBottom: 6,
  },
  rowLeader: {
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  rowSelected: {
    backgroundColor: 'rgba(59, 130, 246, 0.25)',
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 0.6)',
  },
  rowPressed: {
    opacity: 0.7,
  },

  cell: { fontSize: 13 },
  pos: { width: 28, fontWeight: '800' },

  nameWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.18)',
  },
  name: { flex: 1, fontWeight: '600' },

  laps: { width: 48, textAlign: 'right', opacity: 0.8 },
  gap: { width: 62, textAlign: 'right', opacity: 0.8 },

  empty: { padding: 8, opacity: 0.6 },
})
