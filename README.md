# SlidePrint

### Print and Capture any DocSend, Pitch.com, or Brieflink pitch or deck

<a href="https://chrome.google.com/webstore/detail/slideprint/gjflplfighngkllkdlpggcplnbjpjodc"><img src="https://user-images.githubusercontent.com/585534/107280622-91a8ea80-6a26-11eb-8d07-77c548b28665.png" alt="Install SlidePrint"></a>

## Installation from Github

1. [Download the latest release](https://github.com/mdp/SlidePrint/releases) and unzip it somewhere.
1. Open Chrome and navigate to [chrome://extensions/](chrome://extensions/)
1. Make sure "Developer mode” is checked in the upper right corner
1. Click the "Load unpacked extension..." button and select the folder you unzipped
1. You should see the DocSend Print extension at the top of your extensions list on the page, and you should also see the DocSend Print button appear in the extension buttons section in Chrome

## Usage

1. Navigate to the pitchdeck presentation you want to print (starting at page 1)
1. Click the SlidePrint Print button
1. When it completes, you will be taken to a new tab containing the a document ready to print
1. Print or save your document

## Development Notes

### Setup

- `yarn install`

### Running in development

- Run `pnpm dev` and load the unpacked extension from `.output/chromium-mv3/`.

### Usage (Chrome)

- Click the extension icon to open the side panel.
- Click "Select Area" and drag over the portion of the page to capture.
- Navigate your slides/pages and click "Capture" for each.
- Click "Open Output" to review and print or save as PDF.

Keyboard shortcut: Press Alt+Shift+S to open the side panel and start selection (configurable in chrome://extensions/shortcuts).

Notes
- The extension cannot inject on Chrome internal pages (chrome://) or the Chrome Web Store.
- Host permissions are enabled for all sites to support one-click selection and capture.
