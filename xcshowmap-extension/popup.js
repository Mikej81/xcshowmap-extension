document.addEventListener("DOMContentLoaded", () => {
    console.log(`🚀 [POPUP] Extension popup loaded at ${new Date().toISOString()}`);

    const loadBalancerSelect = document.getElementById("loadBalancerSelect");
    const generateButton = document.getElementById("generateBtn");
    const wrongPageMessage = document.getElementById("wrongPageMessage");
    const mainContent = document.getElementById("mainContent");
    const refreshPageBtn = document.getElementById("refreshPageBtn");
    const retryBtn = document.getElementById("retryBtn");
    let loadBalancers = {};
    let currentNamespace = null;

    generateButton.disabled = true;
    generateButton.style.backgroundColor = "#ccc";

    // Ensure main content is visible by default
    mainContent.style.display = 'block';
    wrongPageMessage.style.display = 'none';

    // Extract namespace from current tab URL
    async function extractNamespace() {
        return new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs[0] || !tabs[0].url) {
                    resolve(null);
                    return;
                }

                const url = tabs[0].url;
                const namespaceMatch = url.match(/\/namespaces\/([^\/]+)/);

                if (namespaceMatch && namespaceMatch[1] !== 'system') {
                    console.log(`📌 [POPUP] Extracted namespace: ${namespaceMatch[1]}`);
                    resolve(namespaceMatch[1]);
                } else {
                    console.log(`⚠️ [POPUP] No valid namespace found in URL`);
                    resolve(null);
                }
            });
        });
    }

    // Direct API fetch through background script
    async function fetchLoadBalancersDirect() {
        console.log(`🔄 [POPUP] Starting direct API fetch at ${new Date().toISOString()}`);

        // Extract namespace from URL
        currentNamespace = await extractNamespace();

        if (!currentNamespace) {
            loadBalancerSelect.innerHTML = '<option value="" disabled selected>Navigate to namespace page</option>';
            return;
        }

        loadBalancerSelect.innerHTML = '<option value="" disabled selected>Loading...</option>';

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tabId = tabs[0]?.id;

            if (!tabId) {
                console.error(`❌ [POPUP] No active tab found`);
                loadBalancerSelect.innerHTML = '<option value="" disabled selected>Error: Please refresh page</option>';
                return;
            }

            // Call background script to fetch directly via API
            chrome.runtime.sendMessage({
                action: "fetchLoadBalancersAPI",
                tabId: tabId,
                namespace: currentNamespace
            }, (response) => {

                if (chrome.runtime.lastError) {
                    console.error(`❌ [POPUP] Runtime error:`, chrome.runtime.lastError);
                    loadBalancerSelect.innerHTML = `<option value="" disabled selected>❌ ${chrome.runtime.lastError.message}</option>`;
                    return;
                }

                if (!response?.success) {
                    console.error(`❌ [POPUP] API fetch failed:`, response?.error);
                    if (response?.error?.includes('CSRF')) {
                        loadBalancerSelect.innerHTML = '<option value="" disabled selected>Please refresh page.</option>';
                    } else {
                        loadBalancerSelect.innerHTML = '<option value="" disabled selected>Please refresh page and try again.</option>';
                    }
                    return;
                }

                if (!response.loadBalancers || response.loadBalancers.length === 0) {
                    loadBalancerSelect.innerHTML = '<option value="" disabled selected>No load balancers found - refresh page</option>';
                    return;
                }

                console.log(`✅ [POPUP] Received ${response.loadBalancers.length} load balancers`);
                populateLoadBalancers(response.loadBalancers);
            });
        });
    }


    // Refresh page button
    refreshPageBtn.addEventListener("click", () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.reload(tabs[0].id);
                window.close();
            }
        });
    });

    // Retry button
    retryBtn.addEventListener("click", () => {
        wrongPageMessage.style.display = 'none';
        mainContent.style.display = 'block';
        loadBalancerSelect.innerHTML = '<option value="" disabled selected>Please refresh page</option>';
    });

    // Check initial state and auto-load if possible
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs[0] && tabs[0].url && tabs[0].url.includes('console.ves.volterra.io')) {
            console.log(`✅ [POPUP] On F5XC console page`);

            // Check if we have a namespace in the URL
            const namespace = await extractNamespace();
            if (!namespace) {
                loadBalancerSelect.innerHTML = '<option value="" disabled selected>Navigate to a namespace page</option>';
                return;
            }

            // Check if CSRF token is available
            chrome.runtime.sendMessage({
                action: "getCsrfToken",
                tabId: tabs[0].id
            }, (response) => {
                if (response?.csrfToken || response?.managedTenantCsrf) {
                    console.log(`🔑 [POPUP] CSRF token available, auto-loading data...`);
                    // Auto-load data since we have everything we need
                    fetchLoadBalancersDirect();
                } else {
                    console.log(`⚠️ [POPUP] No CSRF token yet, user needs to log in`);
                    loadBalancerSelect.innerHTML = '<option value="" disabled selected>Please refresh page to log in</option>';
                }
            });
        } else {
            console.log(`⚠️ [POPUP] Not on F5XC console page`);
            loadBalancerSelect.innerHTML = '<option value="" disabled selected>Navigate to F5XC console</option>';
        }
    });

    function populateLoadBalancers(loadBalancerList) {
        console.log(`📊 [POPUP] Populating ${loadBalancerList.length} load balancers`);

        // Clear and store
        loadBalancers = {};
        loadBalancerList.forEach(lb => {
            loadBalancers[lb.name] = lb;
        });

        // Populate dropdown
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

        console.log(`✅ [POPUP] Successfully populated dropdown`);
    }

    loadBalancerSelect.addEventListener("change", () => {
        generateButton.disabled = !loadBalancerSelect.value;
        generateButton.style.backgroundColor = loadBalancerSelect.value ? "green" : "#ccc";
    });

    generateButton.addEventListener("click", () => {
        const selectedLB = loadBalancerSelect.value;

        if (!selectedLB || !loadBalancers[selectedLB]) {
            alert("Load Balancer not found");
            return;
        }

        const lbData = loadBalancers[selectedLB];

        console.log("📨 Sending Load Balancer Data for Mermaid:", lbData);

        // Get current tab ID to pass to background script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentTabId = tabs[0]?.id;

            chrome.runtime.sendMessage({
                type: "generateMermaid",
                loadBalancer: lbData,
                lbName: selectedLB,
                tabId: currentTabId
            }, (response) => {
                if (response && response.mermaidDiagram) {
                    console.log("🖼️ Received Mermaid Diagram");
                } else {
                    alert("Failed to generate Mermaid Diagram");
                }
            });
        });
    });

    // Download debug logs button
    document.getElementById("downloadLogsBtn").addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "downloadLogs" }, (response) => {
            if (response?.success) {
                console.log("✅ Debug logs download initiated");
            } else {
                console.error("❌ Failed to download logs");
                alert("❌ Failed to download logs");
            }
        });
    });
});