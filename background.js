chrome.action.onClicked.addListener(async (tab) => {
    const params = new URLSearchParams({
        inputMethod: 'url',
        url: tab.url,
        isChromeExtension: true
    });
    chrome.tabs.create({
        url: `index.html?${params.toString()}`
    });
}); 