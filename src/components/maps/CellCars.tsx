import React from 'react'
import { View, StyleSheet } from 'react-native'
import type { Car } from './useTrackCars'
import { mulberry32 } from './utils'

type Props = {
  cars: Car | Car[]
  multiplier?: number
  seed?: number
}

const PALETTE = [
  '#ff595e',
  '#ffca3a',
  '#8ac926',
  '#1982c4',
  '#6a4c93',
  '#118ab2',
  '#ef476f',
  '#ffd166',
  '#073b4c',
]

export function CellCars({ cars: car, multiplier = 1, seed = 12345 }: Props) {
  const cars = Array.isArray(car) ? car : [car]
  const rand = mulberry32(seed)

  const colors = cars.map((c) => PALETTE[Math.floor(mulberry32(seed * c.id)() * PALETTE.length)])

  return (
    <View pointerEvents="none" style={styles.container}>
      {cars.map((c, i) => (
        <View
          key={i}
          style={[
            styles.car,
            { backgroundColor: colors[i] },
            {
              // slight offset so multiple cars don't overlap perfectly
              transform: [
                { translateY: -i * 2 + c.dy * multiplier },
                { translateX: c.dx * multiplier },
                { rotate: `${c.rotDeg}deg` },
              ],
            },
          ]}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },

  car: {
    width: 6,
    height: 10,
    borderRadius: 2,
    backgroundColor: '#e63946',
    zIndex: 20,
  },
})
