export default ({ config }) => {
  const repo = process.env.EXPO_PUBLIC_REPO_NAME || 'Idle-Racing'
  const pr = process.env.EXPO_PUBLIC_PR_NUMBER // undefined locally

  // For PR previews: /<repo>/PRs/<number>
  // For non-PR builds (local/dev), keep it root.
  const baseUrl = pr ? `/${repo}/PRs/${pr}` : ''

  return {
    ...config,

    // Ensure static output for hosting on GitHub Pages
    web: {
      ...(config.web ?? {}),
      output: 'static',
    },

    // GitHub Pages support uses this experimental baseUrl
    experiments: {
      ...(config.experiments ?? {}),
      baseUrl,
    },
  }
}
