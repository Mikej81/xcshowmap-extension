// Initialize content script and signal background that we're ready
console.log("🔄 Content script initialized and ready for communication");

chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "refreshData") {
        console.log("🔄 Received refresh request, reloading data...");
        fetchLoadBalancers();
    }
    
    if (message.action === "csrfTokenCaptured") {
        console.log("🔑 CSRF Token captured! Attempting to fetch load balancers...");
        fetchLoadBalancers();
    }
});

// Signal to background script that content script is ready
chrome.runtime.sendMessage({ action: "contentScriptReady" }).catch(() => {
    // Ignore connection errors during initialization
});

// Initial attempt to fetch data
setTimeout(() => {
    console.log("🚀 Content script fully loaded, attempting initial data fetch...");
    fetchLoadBalancers();
}, 1000); // Wait 1 second for page to stabilize


async function fetchLoadBalancers() {
    chrome.runtime.sendMessage({ action: "getCsrfToken" }, async (response) => {
        const csrfToken = response?.csrfToken;
        console.log("🔑 CSRF Token Retrieved:", csrfToken);

        // ✅ Extract Namespace and Managed Tenant
        let namespaceMatch = window.location.pathname.match(/\/namespaces\/([^/]+)/);
        let namespace = namespaceMatch ? namespaceMatch[1] : null;
        let managedTenantMatch = window.location.pathname.match(/\/managed_tenant\/([^/]+)/);
        let managedTenant = managedTenantMatch ? managedTenantMatch[1] : null;

        // 🚨 **EXCLUDE system namespace**
        if (namespace === "system") {
            console.warn("⚠️ Ignoring 'system' namespace, searching for a valid one...");
            namespace = null;
        }

        // Send detailed debug info to background for logging
        chrome.runtime.sendMessage({
            action: "logDebugInfo",
            data: {
                namespace: namespace,
                managedTenant: managedTenant,
                csrfToken: csrfToken ? "Present" : "Missing",
                currentURL: window.location.href,
                pathname: window.location.pathname,
                hostname: window.location.hostname,
                search: window.location.search,
                namespaceMatch: namespaceMatch,
                managedTenantMatch: managedTenantMatch
            }
        });

        console.log("📌 Extracted Namespace:", namespace);
        console.log("📌 Extracted Managed Tenant:", managedTenant);

        // Debug: Show what we found
        console.log("🔍 Debug - Current URL:", window.location.href);
        console.log("🔍 Debug - Pathname:", window.location.pathname);
        console.log("🔍 Debug - CSRF Token:", csrfToken ? "Found" : "Missing");
        console.log("🔍 Debug - Namespace:", namespace ? "Found: " + namespace : "Missing");

        if (!namespace) {
            console.error("❌ Missing Namespace. Check if you're on a Volterra console page with load balancers.");
            chrome.runtime.sendMessage({
                action: "logError", 
                message: "Missing Namespace",
                data: {
                    url: window.location.href,
                    pathname: window.location.pathname,
                    namespaceRegexMatch: namespaceMatch
                }
            });
            return;
        }

        if (!csrfToken) {
            console.warn("⚠️ CSRF Token not yet captured. Please interact with the page (refresh, navigate, or perform an action) to capture it.");
            console.log("📌 Namespace extracted successfully:", namespace, "- Waiting for CSRF token...");
            chrome.runtime.sendMessage({
                action: "logWarning",
                message: "CSRF Token not yet captured",
                data: {
                    namespace: namespace,
                    url: window.location.href
                }
            });
            return;
        }

        // ✅ Store namespace in background storage
        chrome.storage.local.set({ namespace: namespace });

        // ✅ Adjust API URL based on `managed_tenant`
        let apiUrl = managedTenant
            ? `${window.location.origin}/managed_tenant/${managedTenant}/api/config/namespaces/${namespace}/http_loadbalancers?report_fields&csrf=${csrfToken}`
            : `${window.location.origin}/api/config/namespaces/${namespace}/http_loadbalancers?report_fields&csrf=${csrfToken}`;

        console.log("🌐 Fetching Load Balancers from:", apiUrl);

        try {
            const apiResponse = await fetch(apiUrl, { credentials: "include" });

            if (!apiResponse.ok) {
                chrome.runtime.sendMessage({
                    type: 'errorNotification',
                    message: `API fetch failed: ${apiResponse.status}`
                });
                return;
            }

            const data = await apiResponse.json();
            console.log("✅ API Response:", data);

            // ✅ Store load balancers in tab-specific storage via background script
            chrome.runtime.sendMessage({
                action: "storeLoadBalancers", 
                loadBalancers: data.items
            }, (response) => {
                if (response?.success) {
                    console.log("✅ Stored Load Balancers for current tab:", data.items);
                } else {
                    console.error("❌ Failed to store load balancers:", response?.error);
                }
            });

        } catch (error) {
            console.error("❌ API Fetch Error:", error);
        }
    });
}

// 🟢 Detect Navigation Changes (Works for Single Page Apps)
let lastUrl = window.location.href;
setInterval(() => {
    if (window.location.href !== lastUrl) {
        console.log("🔄 Detected Navigation Change, Refreshing Data...");
        lastUrl = window.location.href;
        // Wait a bit for the new page to load before fetching
        setTimeout(fetchLoadBalancers, 2000);
    }
}, 1000);