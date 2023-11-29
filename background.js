const GROUP_DENYLIST = [
  'google'
]

chrome.runtime.onInstalled.addListener(initializeTabGroups);
async function initializeTabGroups() {
  ungroupTabs();
  const urlMap = {};
  const tabGroupMap = {};

  let tabs = await chrome.tabs.query({})
  tabs
    .filter(tab => !tab.url.startsWith('chrome://'))
    .forEach(tab => handleTabUpdate(urlMap, tabGroupMap, tab));
  chrome.storage.local.set({ urlMap, tabGroupMap });
}

chrome.tabs.onUpdated.addListener(
  (tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete') return;
    if (changeInfo.url === tab.url) return;
    updateTabGroup(tab)
  });
function updateTabGroup(tab) {
  chrome.storage.local.get(['urlMap', 'tabGroupMap'], data => {
    const urlMap = data.urlMap
    const tabGroupMap = data.tabGroupMap
    handleTabUpdate(urlMap, tabGroupMap, tab);
    chrome.storage.local.set({ urlMap, tabGroupMap });
  });
}

chrome.tabGroups.onRemoved.addListener(async (group) => {
  // move all existing groups to the beginning
  let groups = await chrome.tabGroups.query({});
  groups.forEach(group => {
    return chrome.tabGroups.move(group.id, {index: 0}).catch(error => console.log(error.message))
  })
})

function handleTabUpdate(urlMap, tabGroupMap, tab) {
  const domain = getDomainFromUrl(tab.url)
  if (!domain) return;
  if (GROUP_DENYLIST.includes(domain)) return;

  if (urlMap[domain]) {
    urlMap[domain][tab.id] = true;
  } else {
    urlMap[domain] = {[tab.id]: true};
  }

  const tabIds = Object.keys(urlMap[domain]).map(Number);
  if (tabIds.length >= 3) {
    if (!tabGroupMap[domain]) {
      chrome.tabs.group({
        createProperties: {windowId: tab.windowId},
        tabIds: tabIds
      });
    } else {
      chrome.tabs.group({tabIds: tab.id, groupId: tabGroupMap[domain]}).catch(error => console.log(error.message));
    }
  }
}

chrome.tabGroups.onCreated.addListener(async (group) => {
  let tabs = await chrome.tabs.query({groupId: group.id})
  if (tabs.length === 0) return;
  let domain = getDomainFromUrl(tabs[0].url);

  chrome.tabGroups.update(group.id, {title: domain, collapsed: false}).catch(error => {
    return console.log(error.message);
  });
  chrome.tabGroups.move(group.id, {index: 0}).catch(error => {
    return console.log(error.message);
  });

  let data = await chrome.storage.local.get('tabGroupMap')
  data.tabGroupMap[domain] = group.id;
  chrome.storage.local.set({ tabGroupMap: data.tabGroupMap });
});


chrome.tabs.onRemoved.addListener(handleTabDelete);
async function handleTabDelete(tabId, removeInfo) {
  let data = await chrome.storage.local.get(['urlMap', 'tabGroupMap']);
  const urlMap = data.urlMap
  const tabGroupMap = data.tabGroupMap;

  for (const domain in urlMap) {
    if (urlMap[domain][tabId]) {
      delete urlMap[domain][tabId];
      if (Object.keys(urlMap[domain]).length < 3) {
        const tabIds = Object.keys(urlMap[domain]).map(Number);
        if (tabIds.length !== 0) chrome.tabs.ungroup(tabIds);
        delete tabGroupMap[domain];
      }
      break;
    }
  }

  chrome.storage.local.set({ urlMap, tabGroupMap });
}

async function ungroupTabs() {
  let tabs = await chrome.tabs.query({})
  const tabIds = tabs.map(tab => tab.id);
  chrome.tabs.ungroup(tabIds)
}

function getDomainFromUrl(url) {
  return new URL(url).hostname.split('.').slice(-2, -1).pop();
}
