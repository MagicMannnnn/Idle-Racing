module.exports = ({ config }) => {
  const repoName = process.env.EXPO_PUBLIC_REPO_NAME || 'Idle-Racing'
  const prNumber = process.env.EXPO_PUBLIC_PR_NUMBER
  const baseUrl = prNumber ? `/${repoName}/PRs/${prNumber}/` : `/${repoName}/`

  return {
    ...config,
    web: {
      ...config.web,
      bundler: 'metro',
      output: 'static',
      baseUrl: baseUrl,
    },
  }
}
