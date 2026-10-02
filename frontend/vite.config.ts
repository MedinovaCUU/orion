import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/orion/',
  optimizeDeps: {
    include: ['three/addons/controls/OrbitControls.js', 'three/addons/environments/RoomEnvironment.js', 'three/addons/loaders/GLTFLoader.js'],
  }
})
