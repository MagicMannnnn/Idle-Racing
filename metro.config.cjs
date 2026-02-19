// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config')

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname)

// Set publicPath for subdirectory deployments (GitHub Pages)
const repoName = process.env.EXPO_PUBLIC_REPO_NAME || 'Idle-Racing'
const prNumber = process.env.EXPO_PUBLIC_PR_NUMBER
const baseUrl = prNumber ? `/${repoName}/PRs/${prNumber}/` : `/${repoName}/`

config.transformer.publicPath = baseUrl

module.exports = config
