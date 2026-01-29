// CellCars.tsx
// ✅ Use the car.colorHex (so it always matches leaderboard)

import React from 'react'
import { StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'
import type { CarAnim } from './useTrackCars'

type Props = {
  cars: CarAnim[]
  carW?: number
  carH?: number
}

function CarView({ car, carW, carH }: { car: CarAnim; carW: number; carH: number }) {
  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    transform: [
      { translateX: car.x.value - carW / 2 },
      { translateY: car.y.value - carH / 2 },
      { rotate: `${car.rotDeg.value}deg` },
    ],
  }))

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.car, { width: carW, height: carH, backgroundColor: car.colorHex }, style]}
    />
  )
}

export function CellCars({ cars, carW = 6, carH = 10 }: Props) {
  return (
    <Animated.View pointerEvents="none" style={styles.overlay}>
      {cars.map((c) => (
        <CarView key={c.id} car={c} carW={carW} carH={carH} />
      ))}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  car: {
    borderRadius: 2,
  },
})
