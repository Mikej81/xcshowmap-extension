document.addEventListener("DOMContentLoaded", () => {
    console.log(`🚀 [POPUP] Extension popup loaded at ${new Date().toISOString()}`);

    const loadBalancerSelect = document.getElementById("loadBalancerSelect");
    const generateButton = document.getElementById("generateBtn");
    const wrongPageMessage = document.getElementById("wrongPageMessage");
    const mainContent = document.getElementById("mainContent");
    const refreshPageBtn = document.getElementById("refreshPageBtn");
    const retryBtn = document.getElementById("retryBtn");
    let loadBalancers = {};

    generateButton.disabled = true;
    generateButton.style.backgroundColor = "#ccc";

    // Enhanced logging for popup state
    console.log(`📊 [POPUP] Initial state - mainContent visible: ${mainContent.style.display !== 'none'}, wrongPageMessage visible: ${wrongPageMessage.style.display !== 'none'}`);

    // Refresh page button functionality
    refreshPageBtn.addEventListener("click", () => {
        console.log(`🔄 [POPUP] User clicked refresh page button at ${new Date().toISOString()}`);
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                console.log(`🔄 [POPUP] Refreshing tab ${tabs[0].id}: ${tabs[0].url}`);
                chrome.tabs.reload(tabs[0].id);
                window.close();
            }
        });
    });

    // Retry button functionality
    retryBtn.addEventListener("click", () => {
        console.log(`🔄 [POPUP] User clicked retry button at ${new Date().toISOString()}`);
        wrongPageMessage.style.display = 'none';
        mainContent.style.display = 'block';
        loadBalancerSelect.innerHTML = '<option value="" disabled selected>Loading...</option>';
        fetchLoadBalancersOnce();
    });

    // Refresh popup when the active tab changes
    chrome.tabs.onActivated.addListener(() => {
        console.log("🔄 Active tab changed, refreshing popup...");
        location.reload();
    });

    // Listen for tab navigation updates
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete') {
            // Get current active tab to see if it's the one that was updated
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0] && tabs[0].id === tabId) {
                    console.log("🔄 Active tab navigated, refreshing popup...");
                    location.reload();
                }
            });
        }
    });

    // Initial load attempt
    function fetchLoadBalancersOnce() {
        console.log(`📡 [POPUP] Starting fetchLoadBalancersOnce at ${new Date().toISOString()}`);
        
        // Add timeout to prevent indefinite loading
        const timeoutId = setTimeout(() => {
            console.warn(`⏰ [POPUP] Load balancer fetch timed out after 5 seconds`);
            showWrongPageMessage();
        }, 5000);
        
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentTabId = tabs[0]?.id;
            const currentUrl = tabs[0]?.url;
            
            console.log(`📍 [POPUP] Current tab: ${currentTabId}, URL: ${currentUrl}`);
            
            if (!currentTabId) {
                clearTimeout(timeoutId);
                console.error(`❌ [POPUP] No active tab found`);
                showErrorNotification('No active tab found');
                return;
            }

            // Request load balancers for current tab only
            console.log(`📡 [POPUP] Requesting load balancers for tab ${currentTabId}`);
            chrome.runtime.sendMessage({ 
                type: "getLoadBalancers", 
                tabId: currentTabId 
            }, (response) => {
                clearTimeout(timeoutId); // Clear timeout since we got a response
                console.log(`📨 [POPUP] Received response:`, response);
                
                if (chrome.runtime.lastError) {
                    console.error(`❌ [POPUP] Runtime error:`, chrome.runtime.lastError.message);
                    showErrorNotification(`Runtime Error: ${chrome.runtime.lastError.message}`);
                    return;
                }

                if (!response?.loadBalancers?.length) {
                    console.warn(`⚠️ [POPUP] No load balancers found in response`);
                    showWrongPageMessage();
                    return;
                }

                console.log(`✅ [POPUP] Found ${response.loadBalancers.length} load balancers`);
                populateLoadBalancers(response.loadBalancers);
            });
        });
    }
    
    // Start initial fetch
    fetchLoadBalancersOnce();
    
    function populateLoadBalancers(loadBalancerList) {
        console.log(`📊 [POPUP] populateLoadBalancers called with ${loadBalancerList.length} items at ${new Date().toISOString()}`);
        console.log(`📊 [POPUP] Load balancer details:`, loadBalancerList.map(lb => ({name: lb.name, namespace: lb.namespace})));

        // Clear existing data
        loadBalancers = {};
        
        loadBalancerList.forEach(lb => {
            loadBalancers[lb.name] = lb;
            console.log(`📋 [POPUP] Added load balancer: ${lb.name} (namespace: ${lb.namespace})`);
        });

        // Populate dropdown with current tab's load balancers
        loadBalancerSelect.innerHTML = "";
        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = "Select a Load Balancer...";
        defaultOption.disabled = true;
        defaultOption.selected = true;
        loadBalancerSelect.appendChild(defaultOption);

        loadBalancerList.forEach(lb => {
            const option = document.createElement("option");
            option.value = lb.name;
            option.textContent = lb.name;
            option.setAttribute("data-namespace", lb.namespace);
            loadBalancerSelect.appendChild(option);
        });

        // Show main content and hide error message
        mainContent.style.display = 'block';
        wrongPageMessage.style.display = 'none';

        console.log(`✅ [POPUP] Successfully populated ${loadBalancerList.length} load balancers in dropdown`);
    }

    // Optional CSRF token check (non-blocking)
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id;
        if (!tabId) {
            console.warn(`⚠️ [POPUP] No tab ID for CSRF token check`);
            return;
        }
        
        console.log(`🔑 [POPUP] Checking CSRF token for tab ${tabId}`);
        chrome.runtime.sendMessage({ 
            action: "getCsrfToken", 
            tabId: tabId 
        }, (response) => {
            console.log(`🔑 [POPUP] CSRF Token check result:`, {
                tabId: tabId,
                hasTopLevel: !!response?.csrfToken,
                hasManagedTenant: !!response?.managedTenantCsrf,
                managedTenant: response?.managedTenant,
                timestamp: new Date().toISOString()
            });
        });
    });

    loadBalancerSelect.addEventListener("change", () => {
        generateButton.disabled = !loadBalancerSelect.value;
        generateButton.style.backgroundColor = loadBalancerSelect.value ? "green" : "#ccc";
    });

    generateButton.addEventListener("click", () => {
        const selectedLB = loadBalancerSelect.value;

        if (!selectedLB || !loadBalancers[selectedLB]) {
            showErrorNotification("Load Balancer not found in stored data");
            return;
        }

        const lbData = loadBalancers[selectedLB];

        console.log("📨 Sending Load Balancer Data for Mermaid:", lbData);
        console.log("📨 Sending Load Balancer Name:", selectedLB);

        chrome.runtime.sendMessage({
            type: "generateMermaid",
            loadBalancer: lbData,
            lbName: selectedLB
        }, (mermaidResponse) => {
            if (mermaidResponse && mermaidResponse.mermaidDiagram) {
                console.log("🖼️ Received Mermaid Diagram:", mermaidResponse.mermaidDiagram);
            } else {
                showErrorNotification("Failed to generate Mermaid Diagram");
            }
        });
    });

    // Download debug logs button
    document.getElementById("downloadLogsBtn").addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "downloadLogs" }, (response) => {
            if (response?.success) {
                console.log("✅ Debug logs download initiated");
            } else {
                console.error("❌ Failed to download logs");
                alert("❌ Failed to download logs. Check console for details.");
            }
        });
    });

});

chrome.tabs.onActivated.addListener(() => {
    console.log("🔄 Active tab changed, reloading popup...");
    location.reload();
});

// Error notification function
function showErrorNotification(message) {
    alert(`❌ ${message}`);
}

// Show wrong page message function
function showWrongPageMessage() {
    console.log(`⚠️ [POPUP] Showing wrong page message at ${new Date().toISOString()}`);
    console.log(`📊 [POPUP] Page state when showing error:`, {
        url: window.location.href,
        readyState: document.readyState,
        timestamp: new Date().toISOString()
    });
    
    // Log current tab info for debugging
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            console.log(`📍 [POPUP] Current tab info:`, {
                id: tabs[0].id,
                url: tabs[0].url,
                title: tabs[0].title,
                status: tabs[0].status
            });
        }
    });
    
    wrongPageMessage.style.display = 'block';
    mainContent.style.display = 'none';
}