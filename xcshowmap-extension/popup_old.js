document.addEventListener("DOMContentLoaded", () => {
    console.log(`🚀 [POPUP] Extension popup loaded at ${new Date().toISOString()}`);

    const loadBalancerSelect = document.getElementById("loadBalancerSelect");
    const generateButton = document.getElementById("generateBtn");
    const wrongPageMessage = document.getElementById("wrongPageMessage");
    const mainContent = document.getElementById("mainContent");
    const refreshPageBtn = document.getElementById("refreshPageBtn");
    const retryBtn = document.getElementById("retryBtn");
    const refreshDataBtn = document.getElementById("refreshDataBtn");
    let loadBalancers = {};

    generateButton.disabled = true;
    generateButton.style.backgroundColor = "#ccc";

    // Ensure main content is visible by default so users can see refresh button
    mainContent.style.display = 'block';
    wrongPageMessage.style.display = 'none';

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

    // Removed automatic popup reload to prevent issues
    // Users should manually refresh data when needed

    // Refresh data button functionality - improved flow
    refreshDataBtn.addEventListener("click", async () => {
        console.log(`🔄 [POPUP] User clicked refresh data button at ${new Date().toISOString()}`);
        loadBalancerSelect.innerHTML = '<option value="" disabled selected>Loading...</option>';
        refreshDataBtn.disabled = true;
        refreshDataBtn.textContent = '⏳ Loading...';
        
        try {
            // First ensure content script is injected
            chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
                if (!tabs[0]) {
                    console.error(`❌ [POPUP] No active tab found`);
                    showErrorMessage('No active tab found');
                    return;
                }
                
                const tabId = tabs[0].id;
                const tabUrl = tabs[0].url;
                
                // Check if we're on an F5XC console page
                if (!tabUrl || !tabUrl.includes('console.ves.volterra.io')) {
                    console.warn(`⚠️ [POPUP] Not on F5XC console page`);
                    showWrongPageMessage();
                    refreshDataBtn.disabled = false;
                    refreshDataBtn.textContent = '🔄 Refresh Data';
                    return;
                }
                
                // Inject content script if needed
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        files: ['content.js']
                    });
                    console.log(`✅ [POPUP] Content script injected/verified`);
                } catch (err) {
                    // Script might already be injected, that's okay
                    console.log(`ℹ️ [POPUP] Content script may already be injected:`, err.message);
                }
                
                // Small delay to ensure content script is ready
                setTimeout(() => {
                    // Send refresh message to content script
                    chrome.tabs.sendMessage(tabId, { action: "refreshData" }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.error(`❌ [POPUP] Failed to send refresh message:`, chrome.runtime.lastError);
                            // If content script not responding, try one more time
                            setTimeout(() => {
                                chrome.tabs.sendMessage(tabId, { action: "refreshData" }, (response2) => {
                                    if (chrome.runtime.lastError) {
                                        console.error(`❌ [POPUP] Second attempt failed:`, chrome.runtime.lastError);
                                        showErrorMessage('Please refresh the page first, then try again');
                                    }
                                });
                            }, 500);
                        } else {
                            console.log(`✅ [POPUP] Refresh message sent successfully`);
                        }
                    });
                    
                    // Fetch load balancers after a delay
                    setTimeout(() => {
                        fetchLoadBalancersOnce();
                        refreshDataBtn.disabled = false;
                        refreshDataBtn.textContent = '🔄 Refresh Data';
                    }, 2000);
                }, 200);
            });
        } catch (error) {
            console.error(`❌ [POPUP] Error during refresh:`, error);
            refreshDataBtn.disabled = false;
            refreshDataBtn.textContent = '🔄 Refresh Data';
            showErrorMessage('Failed to refresh data');
        }
    });

    // Initial load attempt - now only fetches if data already exists
    function fetchLoadBalancersOnce() {
        console.log(`📡 [POPUP] Starting fetchLoadBalancersOnce at ${new Date().toISOString()}`);
        
        // Add timeout to prevent indefinite loading
        const timeoutId = setTimeout(() => {
            console.warn(`⏰ [POPUP] Load balancer fetch timed out after 5 seconds - showing main content`);
            // Show main content so user can click refresh button
            mainContent.style.display = 'block';
            wrongPageMessage.style.display = 'none';
            loadBalancerSelect.innerHTML = '<option value="" disabled selected>Click refresh to load...</option>';
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
                    console.warn(`⚠️ [POPUP] No load balancers found in response - showing main content for manual refresh`);
                    // Show main content so user can click refresh button
                    mainContent.style.display = 'block';
                    wrongPageMessage.style.display = 'none';
                    loadBalancerSelect.innerHTML = '<option value="" disabled selected>Click refresh to load...</option>';
                    return;
                }

                console.log(`✅ [POPUP] Found ${response.loadBalancers.length} load balancers`);
                populateLoadBalancers(response.loadBalancers);
            });
        });
    }
    
    // Check if we're on F5XC console and show appropriate UI
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url && tabs[0].url.includes('console.ves.volterra.io')) {
            console.log(`✅ [POPUP] On F5XC console page, checking for existing data`);
            // Try to get existing data first
            fetchLoadBalancersOnce();
            
            // Show helpful message if no data
            setTimeout(() => {
                if (loadBalancerSelect.options.length <= 1) {
                    loadBalancerSelect.innerHTML = '<option value="" disabled selected>Click refresh to load data</option>';
                }
            }, 500);
        } else {
            console.log(`⚠️ [POPUP] Not on F5XC console page`);
            loadBalancerSelect.innerHTML = '<option value="" disabled selected>Navigate to F5XC console</option>';
        }
    });
    
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

// Error notification function
function showErrorNotification(message) {
    alert(`❌ ${message}`);
}

// Show error message inline
function showErrorMessage(message) {
    loadBalancerSelect.innerHTML = `<option value="" disabled selected>❌ ${message}</option>`;
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