// Minimal content script - only logs API calls for debugging
console.log(`🔄 [CONTENT] Minimal content script loaded at ${new Date().toISOString()}`);

// Signal to background script that content script is ready
chrome.runtime.sendMessage({ action: "contentScriptReady" }).catch(() => {
    // Ignore connection errors during initialization
});

// Listen for messages (mainly for backwards compatibility)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log(`📨 [CONTENT] Received message:`, message);
    
    // We no longer handle refreshData - all API calls are handled by background script
    if (message.action === "refreshData") {
        console.log(`ℹ️ [CONTENT] Refresh data message received - handled by background script now`);
        sendResponse({ success: true });
    }
    
    return true;
});

console.log('✅ [CONTENT] Minimal content script initialized - API calls handled by background script');