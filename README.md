# SlidePrint

### Capture and print slides from any presentation deck or website

SlidePrint is a powerful browser extension that lets you capture slides from any website in two ways:
- **Auto Mode**: Automatically captures supported platforms (DocSend, Pitch.com, Brieflink, etc.)
- **Manual Mode**: Select any area on any website for precise capture

<a href="https://chrome.google.com/webstore/detail/slideprint/gjflplfighngkllkdlpggcplnbjpjodc"><img src="https://user-images.githubusercontent.com/585534/107280622-91a8ea80-6a26-11eb-8d07-77c548b28665.png" alt="Install SlidePrint"></a>

## Features

- 🎯 **Smart Auto-Capture**: Automatically detects and captures slides from supported platforms
- 🖱️ **Manual Selection**: Draw selection areas on any website for custom captures
- 🌍 **Multi-Language**: Support for English, German, and Chinese
- 📱 **HiDPI Support**: Perfect quality on Retina and high-DPI displays
- 🔄 **Drag & Drop**: Reorder slides with intuitive drag-and-drop
- ⌨️ **Keyboard Shortcuts**: Quick capture with Shift+K
- 🖼️ **Live Thumbnails**: See captured slides with real-time previews
- 📄 **Print Ready**: Generate clean PDFs ready for printing or sharing

## Installation

### From Chrome Web Store (Recommended)
Install directly from the [Chrome Web Store](https://chrome.google.com/webstore/detail/slideprint/gjflplfighngkllkdlpggcplnbjpjodc)

### From GitHub (Development)
1. [Download the latest release](https://github.com/mdp/SlidePrint/releases) and unzip it
2. Open Chrome and navigate to [chrome://extensions/](chrome://extensions/)
3. Enable "Developer mode" in the upper right corner
4. Click "Load unpacked extension..." and select the unzipped folder
5. The SlidePrint extension should appear in your extensions list

## Usage

### Auto Mode (Supported Platforms)
1. Navigate to a supported presentation platform (DocSend, Pitch.com, Brieflink, etc.)
2. Click the SlidePrint extension icon
3. Click "Auto Capture" - the extension will automatically navigate and capture all slides
4. When complete, click "Print/Save" to open the output document
5. Print or save as PDF

### Manual Mode (Any Website)
1. Navigate to any website with content you want to capture
2. Click the SlidePrint extension icon
3. Click "Select Area" and draw a selection box around the content
4. Navigate through your slides/pages
5. Press "Shift+K" or click "Capture" for each slide
6. Reorder slides by dragging if needed
7. Click "Print/Save" to generate your document

### Keyboard Shortcuts
- **Shift+K**: Capture current page using saved selection area

## Development

### Setup
```bash
pnpm install
```

### Running in Development
```bash
pnpm dev
```
Then load the unpacked extension from `.output/chromium-mv3/` in Chrome.

### Building for Production
```bash
pnpm build
```

### Building for Firefox
```bash
pnpm build:firefox
```

### Creating Distribution Packages
```bash
pnpm zip          # Chrome package
pnpm zip:firefox  # Firefox package
```

### Testing
```bash
pnpm test
```

## Technical Notes

- **Permissions**: The extension requires host permissions for all sites to enable one-click selection and capture
- **Limitations**: Cannot inject on Chrome internal pages (chrome://) or the Chrome Web Store
- **Browser Support**: Chrome/Chromium and Firefox
- **Framework**: Built with Vue 3, TypeScript, and WXT framework

## Supported Platforms (Auto Mode)

- DocSend presentations
- Pitch.com decks
- Brieflink presentations
- Visible.vc pitch decks

*Manual mode works on any website for maximum flexibility.*
