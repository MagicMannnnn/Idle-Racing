module.exports = ({ config }) => {
  const repoName = process.env.EXPO_PUBLIC_REPO_NAME || 'Idle-Racing'
  const prNumber = process.env.EXPO_PUBLIC_PR_NUMBER
  const baseUrl = prNumber ? `/${repoName}/PRs/${prNumber}/` : `/${repoName}/`

  return {
    name: 'Idle Racing',
    slug: 'idle-racing',
    scheme: 'idleracing',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    splash: {
      image: './assets/icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.gterry.idleracing',
      buildNumber: '1',
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/icon.png',
        backgroundColor: '#ffffff',
      },
      package: 'com.gterry.idleracing',
      versionCode: 1,
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: './assets/icon.png',
      output: 'static',
      bundler: 'metro',
      baseUrl: baseUrl,
    },
    plugins: [
      'expo-router',
      [
        'react-native-google-mobile-ads',
        {
          iosAppId: 'ca-app-pub-1318873164119612~5989075577',
        },
      ],
      'expo-font',
    ],
  }
}
