import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.API_KEY': JSON.stringify("AIzaSyAiIChPXh8NLbUzo3jkTXsDa2gemVPjuTg"),
  },
});