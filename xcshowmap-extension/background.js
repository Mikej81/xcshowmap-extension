chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "generateDiagram",
        title: "Generate Diagram for Load Balancer",
        contexts: ["selection"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "generateDiagram") {
        // Send message to the content script
        chrome.tabs.sendMessage(tab.id, { type: "generateDiagram", selectionText: info.selectionText });
    }
});
