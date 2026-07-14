// TrackerRay Service Worker

// Map of tabId -> { nodes: Map, links: Set, count: { ads: 0, analytics: 0, social: 0, utility: 0, total: 0 } }
const tabTraffic = new Map();

// Simplified blocklist/categorization dictionary
const TRACKER_PATTERNS = {
  analytics: [
    'google-analytics.com', 'googletagmanager.com', 'hotjar.com', 'mixpanel.com',
    'amplitude.com', 'segment.io', 'newrelic.com', 'sentry.io', 'optimizely.com'
  ],
  ads: [
    'doubleclick.net', 'googleadservices.com', 'adnxs.com', 'amazon-adsystem.com',
    'rubiconproject.com', 'pubmatic.com', 'casalemedia.com', 'criteo.com',
    'adsystem.com', 'taboola.com', 'outbrain.com', 'adroll.com'
  ],
  social: [
    'facebook.com', 'facebook.net', 'connect.facebook.net', 'instagram.com',
    'twitter.com', 't.co', 'linkedin.com', 'licdn.com', 'tiktok.com',
    'snapchat.com', 'pinterest.com'
  ]
};

// Extract main domain (e.g. sub.domain.com -> domain.com)
function getBaseDomain(urlStr) {
  try {
    const url = new URL(urlStr);
    const parts = url.hostname.split('.');
    if (parts.length > 2) {
      // Basic public suffix handling (co.uk, com.au, etc.)
      const secondToLast = parts[parts.length - 2];
      if (['co', 'com', 'org', 'net', 'gov', 'edu'].includes(secondToLast) && parts.length > 3) {
        return parts.slice(-3).join('.');
      }
      return parts.slice(-2).join('.');
    }
    return url.hostname;
  } catch (e) {
    return urlStr;
  }
}

// Categorize domain based on patterns
function categorizeDomain(hostname) {
  const normalized = hostname.toLowerCase();
  for (const [category, domains] of Object.entries(TRACKER_PATTERNS)) {
    if (domains.some(domain => normalized.includes(domain))) {
      return category;
    }
  }
  return 'utility'; // Default fallback for third-party scripts/assets
}

// Initialize tab traffic structure
function initTabTraffic(tabId) {
  return {
    nodes: new Map(), // hostname -> { id, category, blocked, count }
    links: new Set(), // "source->target"
    stats: { ads: 0, analytics: 0, social: 0, utility: 0, total: 0 }
  };
}

// Listen to web requests (non-blocking) to log traffic
chrome.webRequest.onBeforeRequest.addListener(
  async (details) => {
    const { tabId, url, initiator } = details;
    if (tabId < 0 || !initiator) return; // Ignore background/internal requests

    const source = getBaseDomain(initiator);
    const target = getBaseDomain(url);

    // Ignore first-party traffic
    if (source === target) return;

    if (!tabTraffic.has(tabId)) {
      tabTraffic.set(tabId, initTabTraffic(tabId));
    }
    const traffic = tabTraffic.get(tabId);

    // Determine category
    const category = categorizeDomain(target);

    // Check if this domain is blocked in declarativeNetRequest dynamic rules
    const blockedRules = await chrome.declarativeNetRequest.getDynamicRules();
    const isBlocked = blockedRules.some(rule => {
      return rule.condition && rule.condition.urlFilter && rule.condition.urlFilter.includes(target);
    });

    // Update node details
    if (!traffic.nodes.has(target)) {
      traffic.nodes.set(target, { id: target, category, blocked: isBlocked, count: 1 });
      // Update statistics
      traffic.stats[category]++;
      traffic.stats.total++;
    } else {
      const node = traffic.nodes.get(target);
      node.count++;
      node.blocked = isBlocked; // Keep block status synchronized
    }

    // Ensure initiator node exists
    if (!traffic.nodes.has(source)) {
      traffic.nodes.set(source, { id: source, category: 'first-party', blocked: false, count: 1 });
    }

    // Record links
    const linkKey = `${source}->${target}`;
    if (!traffic.links.has(linkKey)) {
      traffic.links.add(linkKey);
    }

    // Broadcast traffic updates to side panel
    chrome.runtime.sendMessage({
      type: 'TRAFFIC_UPDATE',
      tabId,
      traffic: getTabTrafficData(tabId)
    }).catch(() => {
      // Silent catch: messaging will fail if the sidepanel is closed, which is fine
    });
  },
  { urls: ["<all_urls>"] }
);

// Format raw traffic logs for D3 consumption
function getTabTrafficData(tabId) {
  const traffic = tabTraffic.get(tabId) || initTabTraffic(tabId);
  return {
    nodes: Array.from(traffic.nodes.values()),
    links: Array.from(traffic.links).map(link => {
      const [source, target] = link.split('->');
      return { source, target };
    }),
    stats: traffic.stats
  };
}

// Service worker message router
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_TAB_TRAFFIC') {
    sendResponse(getTabTrafficData(message.tabId));
  } else if (message.type === 'CLEAR_TAB_TRAFFIC') {
    tabTraffic.delete(message.tabId);
    sendResponse({ status: 'cleared' });
  }
  return true;
});

// Clean up state when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabTraffic.delete(tabId);
});

// Reset tracking graph on active navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    tabTraffic.set(tabId, initTabTraffic(tabId));
    chrome.runtime.sendMessage({
      type: 'TAB_NAVIGATED',
      tabId
    }).catch(() => {});
  }
});
