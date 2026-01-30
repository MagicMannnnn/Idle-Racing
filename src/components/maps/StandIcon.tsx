import React, { useMemo } from 'react'
import { View } from 'react-native'
import { StyleSheet } from 'react-native'
import { mulberry32 } from './utils'

const PALETTE = [
  '#ff595e',
  '#ffca3a',
  '#8ac926',
  '#1982c4',
  '#6a4c93',
  '#06d6a0',
  '#118ab2',
  '#ef476f',
  '#ffd166',
  '#073b4c',
]

type StandIconProps = {
  standRotation: string
  bars?: number
  minDotsPerBar?: number
  maxDotsPerBar?: number
  seed?: number
  entertainmentValue?: number
  size?: number
}

export function StandIcon({
  standRotation,
  bars = 4,
  minDotsPerBar = 1,
  maxDotsPerBar = 4,
  seed = 1,
  entertainmentValue = 0.5,
  size = 7,
}: StandIconProps) {
  const rows = useMemo(() => {
    const rand = mulberry32(seed)
    return Array.from({ length: bars }, (_, rowIdx) => {
      const count =
        minDotsPerBar +
        Math.floor(rand() * (maxDotsPerBar - minDotsPerBar + 1)) * entertainmentValue

      const dots = Array.from({ length: count }, (_, i) => {
        const leftPct =
          count == 1
            ? 10 + Math.floor(rand() * 80)
            : count == 2
              ? Math.floor(rand() * 30) + ((i + 1) / (count + 1)) * 100
              : ((i + 1) / (count + 1)) * 100

        const color = PALETTE[Math.floor(rand() * PALETTE.length)]

        return { leftPct, color, size, key: `${rowIdx}-${i}` }
      })

      return { rowIdx, dots }
    })
  }, [bars, minDotsPerBar, maxDotsPerBar, seed, entertainmentValue])

  return (
    <View style={[styles.standIcon, { transform: [{ rotate: standRotation }] }]}>
      {rows.map((row) => (
        <View key={row.rowIdx} style={styles.standBarRow}>
          <View style={styles.standBar} />

          {row.dots.map((d) => (
            <View
              key={d.key}
              style={[
                styles.dot,
                {
                  left: `${d.leftPct}%`,
                  width: d.size,
                  height: d.size,
                  borderRadius: d.size / 2,
                  backgroundColor: d.color,
                  marginLeft: -d.size / 2,
                },
              ]}
            />
          ))}
        </View>
      ))}
    </View>
  )
}

export const styles = StyleSheet.create({
  standIcon: {
    width: '72%',
    height: '58%',
    justifyContent: 'space-between',
  },

  standBarRow: {
    position: 'relative',
    justifyContent: 'center',

    height: 10,
  },

  standBar: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },

  dot: {
    position: 'absolute',
    top: -3,
  },
})
