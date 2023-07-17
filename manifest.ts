import { defineManifest, defineDynamicResource } from '@crxjs/vite-plugin'
import packageJson from './package.json'

const { version } = packageJson

// Convert from Semver (example: 0.1.0-beta6)
const [major, minor, patch, label = '0'] = version
  // can only contain digits, dots, or dash
  .replace(/[^\d.-]+/g, '')
  // split into version parts
  .split(/[.-]/)

export default defineManifest(async (env) => ({
  manifest_version: 3,
  name: "SlidePrint",
  // up to four numbers separated by dots
  version: `${major}.${minor}.${patch}.${label}`,
  // semver is OK in "version_name"
  version_name: version,
  icons: {
    "48": "icon-48-active.png",
    "128": "icon-128-active.png"
  },
  permissions: [
    "activeTab", "scripting"
  ],
  action: {
    "default_popup": "src/popup/index.html"
  },
  background: {
    "service_worker": "src/background.ts",
    "type": "module"
  },
  incognito: "split",
  web_accessible_resources: [
    defineDynamicResource({
      matches: ['https://*.docsend.com/*', 'https://*.pitch.com/*'],
    })
  ]
}))