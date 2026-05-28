/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#0B0C0A',
          900: '#0B0C0A',
          800: '#101210',
          700: '#151714',
          600: '#1A1B17',
        },
        rule: '#1F221C',
        bone: '#E8E6DD',
        dim: '#7A7F73',
        signal: '#C6FF4A',
        signalDim: '#8FB934',
        primary: {
          DEFAULT: '#C6FF4A',
          dark: '#8FB934',
          light: '#DEFF8A',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      letterSpacing: {
        widish: '0.02em',
        widest2: '0.18em',
      },
      maxWidth: {
        page: '1280px',
        prose2: '68ch',
      },
    },
  },
  plugins: [],
}
