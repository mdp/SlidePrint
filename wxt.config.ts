import { defineConfig } from 'wxt';
import { version } from './package.json'
import tailwindcss from '@tailwindcss/vite';

// Convert from Semver (example: 0.1.0-beta6)
const [major, minor, patch, label = '0'] = version
  // can only contain digits, dots, or dash
  .replace(/[^\d.-]+/g, '')
  // split into version parts
  .split(/[.-]/)

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: "Slideprint",
    // up to four numbers separated by dots
    version: `${major}.${minor}.${patch}.${label}`,
    // semver is OK in "version_name"
    version_name: version,
    action: {
      default_title: 'SlidePrint',
    },
    web_accessible_resources: [
      {
        "matches": [
          "http://*/*",
          "https://*/*"
        ],
        "resources": [
          "injected.js"
        ],
      }
    ],
    permissions: [ "activeTab", "scripting" ],
  },
});
