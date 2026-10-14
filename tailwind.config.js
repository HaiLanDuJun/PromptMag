/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,html}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#07080c',
          900: '#0b0d13',
          850: '#10131b',
          800: '#151926',
          700: '#1d2231',
          600: '#2a3042'
        },
        neon: {
          green: '#3ddc97',
          cyan: '#22d3ee',
          amber: '#fbbf24'
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Consolas', '"Microsoft YaHei"', 'monospace']
      }
    }
  },
  plugins: []
}