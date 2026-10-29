import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Amplify keeps its sign-in setup in @aws-amplify/core; a second copy
    // would leave the sign-in screen unconfigured.
    dedupe: ['@aws-amplify/core'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
  },
})
