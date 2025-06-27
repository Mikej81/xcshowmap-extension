document.addEventListener("DOMContentLoaded", () => {

    const loadBalancerSelect = document.getElementById("loadBalancerSelect");
    const generateButton = document.getElementById("generateBtn");
    const wrongPageMessage = document.getElementById("wrongPageMessage");
    const mainContent = document.getElementById("mainContent");
    let loadBalancers = {};

    generateButton.disabled = true;
    generateButton.style.backgroundColor = "#ccc";

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

    // Get current active tab first
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentTabId = tabs[0]?.id;
        
        if (!currentTabId) {
            showErrorNotification('No active tab found');
            return;
        }

        // Request load balancers for current tab only
        chrome.runtime.sendMessage({ 
            type: "getLoadBalancers", 
            tabId: currentTabId 
        }, (response) => {
            if (chrome.runtime.lastError) {
                showErrorNotification(`Runtime Error: ${chrome.runtime.lastError.message}`);
                return;
            }

            if (!response?.loadBalancers?.length) {
                showWrongPageMessage();
                return;
            }

            console.log("📨 Load Balancers Received for current tab:", response.loadBalancers);

            response.loadBalancers.forEach(lb => {
                loadBalancers[lb.name] = lb;
            });

            // Populate dropdown with current tab's load balancers
            loadBalancerSelect.innerHTML = "";
            const defaultOption = document.createElement("option");
            defaultOption.value = "";
            defaultOption.textContent = "Select a Load Balancer...";
            defaultOption.disabled = true;
            defaultOption.selected = true;
            loadBalancerSelect.appendChild(defaultOption);

            response.loadBalancers.forEach(lb => {
                const option = document.createElement("option");
                option.value = lb.name;
                option.textContent = lb.name;
                option.setAttribute("data-namespace", lb.namespace);
                loadBalancerSelect.appendChild(option);
            });

            console.log("✅ Load Balancers Populated in Dropdown for current tab.");
        });
    });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id;
        if (!tabId) return;
        
        chrome.runtime.sendMessage({ 
            action: "getCsrfToken", 
            tabId: tabId 
        }, (response) => {
            console.log("🔑 CSRF Token for Active Tab:", response.csrfToken);
            if (!response.csrfToken) {
                showWrongPageMessage();
            }
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
    wrongPageMessage.style.display = 'block';
    mainContent.style.display = 'none';
}