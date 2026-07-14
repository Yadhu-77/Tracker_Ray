# TrackerRay 🛡️

TrackerRay is a premium, visual-first Manifest V3 Chrome Extension that maps, categorizes, and blocks third-party trackers, scripts, and network requests in real-time. By leveraging the modern Side Panel API and interactive force-directed layouts, TrackerRay grants users clear insight into who is tracking them, alongside one-click capabilities to intercept and block those requests.

---

## Key Features

*   **Interactive Force-Directed Node Map**: A live visual map built using D3.js showing connections between the main host website (blue node) and all third-party endpoints.
*   **Dynamic Blocking (Manifest V3 Compliant)**: Instantly block tracker traffic via Chrome's native `declarativeNetRequest` rules engine with a click.
*   **Visual Tracker Classification**: Categorizes trackers dynamically into Ads (pink), Analytics (green), Social (purple), and Utilities (yellow).
*   **Side-Panel Dashboard**: Fully integrated into the Chrome Side Panel layout, running on a low-latency dark-themed glassmorphism interface.
*   **Tab-Aware Metrics**: Real-time synchronization when switching tabs or refreshing webpages.

---

## Project Structure

```text
Extension display/
├── manifest.json       # Manifest V3 configuration with DNR & side panel permissions
├── background.js       # Background service worker (monitors traffic & handles messages)
├── sidepanel/
│   ├── index.html      # Dashboard dashboard skeleton structure
│   ├── styles.css      # Premium dark-mode layout styling tokens
│   ├── sidepanel.js    # Syncs tab active states, dynamic list rows, and rulesets
│   ├── tracker-map.js  # Coordinates D3.js force vectors, zoom, and node events
│   └── d3.min.js       # Offline local D3.js library copy
└── README.md           # Documentation
```

---

## How to Install

1.  Clone or download this repository folder.
2.  Open Google Chrome and go to `chrome://extensions`.
3.  Enable **Developer mode** using the toggle switch in the top-right corner.
4.  Click **Load unpacked** in the top-left corner.
5.  Select the `Extension display` directory.

---

## How It Works

1.  **Request Observation**: The extension uses a non-blocking `webRequest` listener inside [background.js](background.js) to capture outbound request URLs and target host origins. First-party requests are ignored to reduce layout noise.
2.  **State Synchronization**: When the side panel is opened, [sidepanel.js](sidepanel/sidepanel.js) connects to the service worker to grab tab history. As new requests stream, it dynamically feeds nodes and paths into the D3 rendering loop.
3.  **Active Blocking**: Clicking a node or clicking **Block** in the details list triggers the extension to register a dynamic block rule matching `*://[domain]/*`. Chrome immediately starts dropping network requests matching this rule.
