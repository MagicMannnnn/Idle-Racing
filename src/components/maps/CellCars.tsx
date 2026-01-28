import React from 'react'
import { View, StyleSheet } from 'react-native'
import type { Car } from './useTrackCars'

type Props = {
  cars: Car | Car[]
}

function directionRotation(dir: Car['dir']) {
  switch (dir) {
    case 'N':
      return [{ rotate: '0deg' }]
    case 'E':
      return [{ rotate: '90deg' }]
    case 'S':
      return [{ rotate: '180deg' }]
    case 'W':
      return [{ rotate: '270deg' }]
  }
}

function directionStyle(dir: Car['dir']) {
  switch (dir) {
    case 'N':
    case 'S':
      return { width: 6, height: 10 }
    case 'E':
    case 'W':
      return { width: 10, height: 6 }
  }
}

export function CellCars({ cars: car }: Props) {
  const cars = Array.isArray(car) ? car : [car]

  return (
    <View pointerEvents="none" style={styles.container}>
      {cars.map((c, i) => (
        <View
          key={i}
          style={[
            styles.car,
            {
              // slight offset so multiple cars don't overlap perfectly
              transform: [...directionRotation(c.dir), { translateY: -i * 2 }],
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
    zIndex: 10, // above standIcon
  },

  car: {
    width: 6,
    height: 10,
    borderRadius: 2,
    backgroundColor: '#e63946',
  },
})
