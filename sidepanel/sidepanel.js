// TrackerRay Side Panel Controller

(function () {
  let activeTabId = null;

  // Helper: extract host name from raw URL
  function getHostname(urlStr) {
    try {
      if (!urlStr || urlStr.startsWith('chrome://') || urlStr.startsWith('chrome-extension://')) {
        return 'Internal Browser Page';
      }
      return new URL(urlStr).hostname;
    } catch (e) {
      return 'New Tab';
    }
  }

  // Generate unique numeric rule ID for declarativeNetRequest from string domain
  function getRuleId(domain) {
    let hash = 0;
    for (let i = 0; i < domain.length; i++) {
      hash = domain.charCodeAt(i) + ((hash << 5) - hash);
    }
    // Return positive int in valid range
    return Math.abs(hash % 9000000) + 10000;
  }

  // Request tab traffic mapping state from background worker
  function requestTrafficData(tabId) {
    if (!tabId) return;
    chrome.runtime.sendMessage({ type: 'GET_TAB_TRAFFIC', tabId }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response) {
        renderPanelState(response);
      }
    });
  }

  // Toggle domain block status via declarativeNetRequest dynamic rules
  async function toggleDomainBlock(domain, isBlocked) {
    const ruleId = getRuleId(domain);

    if (isBlocked) {
      // Unblock: remove rule
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [ruleId]
      });
    } else {
      // Block: add block rule
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: [{
          id: ruleId,
          priority: 1,
          action: { type: 'block' },
          condition: {
            urlFilter: `*://${domain}/*`,
            resourceTypes: ["script", "xmlhttprequest", "sub_frame", "image", "other"]
          }
        }],
        removeRuleIds: [ruleId] // Clear conflict
      });
    }

    // Refresh UI
    requestTrafficData(activeTabId);
  }

  // Refresh HTML stats, dynamic D3 graphs, and domains lists
  function renderPanelState(trafficData) {
    const { nodes, links, stats } = trafficData;

    // 1. Update stats badge counters
    document.getElementById('stat-total').textContent = stats.total;
    document.getElementById('stat-ads').textContent = stats.ads;
    document.getElementById('stat-analytics').textContent = stats.analytics;
    document.getElementById('stat-social').textContent = stats.social;

    // 2. Control graph empty state placeholder
    const placeholder = document.getElementById('graph-placeholder');
    if (nodes.length > 1) {
      placeholder.classList.add('hidden');
    } else {
      placeholder.classList.remove('hidden');
    }

    // 3. Render D3 Force Map
    window.TrackerMap.update(nodes, links);

    // 4. Render Domains List (Sorting trackers by request count, descending)
    const listContainer = document.getElementById('domains-list');
    listContainer.innerHTML = '';

    const trackers = nodes.filter(n => n.category !== 'first-party');
    trackers.sort((a, b) => b.count - a.count);

    document.getElementById('domains-count').textContent = `${trackers.length} trackers`;

    if (trackers.length === 0) {
      listContainer.innerHTML = '<div class="empty-list-notice">No tracking elements detected.</div>';
      return;
    }

    trackers.forEach(tracker => {
      const row = document.createElement('div');
      row.className = 'domain-row';

      row.innerHTML = `
        <div class="domain-info">
          <span class="domain-name" title="${tracker.id}">${tracker.id}</span>
          <div class="domain-meta">
            <span class="badge ${tracker.category}">${tracker.category}</span>
            <span class="hit-count">${tracker.count} hit${tracker.count > 1 ? 's' : ''}</span>
          </div>
        </div>
        <div class="actions-cell">
          <button class="block-toggle ${tracker.blocked ? 'blocked' : ''}" data-domain="${tracker.id}" data-blocked="${tracker.blocked}">
            ${tracker.blocked ? 'Allow' : 'Block'}
          </button>
        </div>
      `;

      // Wire up allow/block click
      row.querySelector('.block-toggle').addEventListener('click', (e) => {
        const domain = e.target.getAttribute('data-domain');
        const blocked = e.target.getAttribute('data-blocked') === 'true';
        toggleDomainBlock(domain, blocked);
      });

      listContainer.appendChild(row);
    });
  }

  // Initialize UI components on load
  document.addEventListener('DOMContentLoaded', async () => {
    // Init D3 Graph with click node block handler callback
    window.TrackerMap.init('#graph', (clickedDomain, isBlocked) => {
      toggleDomainBlock(clickedDomain, isBlocked);
    });

    // Wire up Clear/Reset button click
    document.getElementById('clear-btn').addEventListener('click', () => {
      if (activeTabId) {
        chrome.runtime.sendMessage({ type: 'CLEAR_TAB_TRAFFIC', tabId: activeTabId }, () => {
          requestTrafficData(activeTabId);
        });
      }
    });

    // Detect initial active tab info
    await updateActiveTab();
  });

  // Listen to background updates
  chrome.runtime.onMessage.addListener((message) => {
    if (message.tabId !== activeTabId) return;

    if (message.type === 'TRAFFIC_UPDATE') {
      renderPanelState(message.traffic);
    } else if (message.type === 'TAB_NAVIGATED') {
      // Clear panel view
      renderPanelState({ nodes: [], links: [], stats: { ads: 0, analytics: 0, social: 0, utility: 0, total: 0 } });
    }
  });

  // Listen to tab selection change in active window
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    activeTabId = activeInfo.tabId;
    const tab = await chrome.tabs.get(activeTabId);
    if (tab) {
      document.getElementById('active-host').textContent = getHostname(tab.url);
      requestTrafficData(activeTabId);
    }
  });

  // Listen to tab URL updates
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (tabId === activeTabId && changeInfo.url) {
      document.getElementById('active-host').textContent = getHostname(changeInfo.url);
      requestTrafficData(activeTabId);
    }
  });
})();
