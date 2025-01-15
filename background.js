chrome.action.onClicked.addListener(async (tab) => {
    const params = new URLSearchParams({
        inputMethod: 'url',
        url: tab.url
    });
    chrome.tabs.create({
        url: `index.html?${params.toString()}`
    });
}); 