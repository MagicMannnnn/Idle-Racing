import { router } from 'expo-router'

export default function NotFound() {
  router.replace('/home')
  return null
}
