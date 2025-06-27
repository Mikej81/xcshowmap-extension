// Initialize content script and signal background that we're ready
console.log("🔄 Content script initialized and ready for communication");

chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "refreshData") {
        console.log("🔄 Received refresh request, reloading data...");
        fetchLoadBalancers();
    }
    
    if (message.action === "csrfTokenCaptured") {
        const tokenType = message.isManagedTenant ? "managed tenant" : "top-level";
        console.log(`🔑 ${tokenType} CSRF Token captured! Attempting to fetch load balancers...`);
        fetchLoadBalancers();
    }
    
    if (message.action === "csrfTokensCaptured") {
        console.log("🔑 Multiple CSRF Tokens captured!", {
            topLevel: message.csrfToken ? "Present" : "Missing",
            managedTenant: message.managedTenantCsrf ? "Present" : "Missing",
            tenant: message.managedTenant
        });
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
        const managedTenantCsrf = response?.managedTenantCsrf;
        const managedTenant = response?.managedTenant;
        const isManagedTenant = response?.isManagedTenant;
        
        console.log("🔑 CSRF Tokens Retrieved:", {
            topLevel: csrfToken ? "Present" : "Missing",
            managedTenant: managedTenantCsrf ? "Present" : "Missing",
            tenant: managedTenant,
            isManagedContext: isManagedTenant
        });

        // ✅ Extract Namespace and Managed Tenant from URL
        let namespaceMatch = window.location.pathname.match(/\/namespaces\/([^/]+)/);
        let namespace = namespaceMatch ? namespaceMatch[1] : null;
        let managedTenantMatch = window.location.pathname.match(/\/managed_tenant\/([^/]+)/);
        let managedTenantFromUrl = managedTenantMatch ? managedTenantMatch[1] : null;
        
        // Use managed tenant from background data or URL
        const effectiveManagedTenant = managedTenant || managedTenantFromUrl;

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
                managedTenant: effectiveManagedTenant,
                managedTenantFromUrl: managedTenantFromUrl,
                managedTenantFromBackground: managedTenant,
                csrfToken: csrfToken ? "Present" : "Missing",
                managedTenantCsrf: managedTenantCsrf ? "Present" : "Missing",
                isManagedTenantContext: !!effectiveManagedTenant,
                currentURL: window.location.href,
                pathname: window.location.pathname,
                hostname: window.location.hostname,
                search: window.location.search,
                namespaceMatch: namespaceMatch,
                managedTenantMatch: managedTenantMatch
            }
        });

        console.log("📌 Extracted Namespace:", namespace);
        console.log("📌 Extracted Managed Tenant:", effectiveManagedTenant);
        console.log("📌 Is Managed Tenant Context:", !!effectiveManagedTenant);

        // Debug: Show what we found
        console.log("🔍 Debug - Current URL:", window.location.href);
        console.log("🔍 Debug - Pathname:", window.location.pathname);
        console.log("🔍 Debug - Top-level CSRF Token:", csrfToken ? "Found" : "Missing");
        console.log("🔍 Debug - Managed Tenant CSRF Token:", managedTenantCsrf ? "Found" : "Missing");
        console.log("🔍 Debug - Namespace:", namespace ? "Found: " + namespace : "Missing");

        if (!namespace) {
            console.error("❌ Missing Namespace. Check if you're on a Volterra console page with load balancers.");
            chrome.runtime.sendMessage({
                action: "logError", 
                message: "Missing Namespace",
                data: {
                    url: window.location.href,
                    pathname: window.location.pathname,
                    namespaceRegexMatch: namespaceMatch,
                    isManagedTenant: !!effectiveManagedTenant
                }
            });
            return;
        }

        // Determine which CSRF token to use based on context
        let effectiveCsrfToken = null;
        let tokenContext = "";
        
        if (effectiveManagedTenant) {
            // In managed tenant context, prefer managed tenant CSRF, fallback to top-level
            if (managedTenantCsrf) {
                effectiveCsrfToken = managedTenantCsrf;
                tokenContext = "managed tenant";
            } else if (csrfToken) {
                effectiveCsrfToken = csrfToken;
                tokenContext = "top-level (fallback)";
                console.warn("⚠️ Using top-level CSRF token for managed tenant context");
            }
        } else {
            // Regular context, use top-level CSRF
            effectiveCsrfToken = csrfToken;
            tokenContext = "top-level";
        }

        if (!effectiveCsrfToken) {
            const missingTokenType = effectiveManagedTenant ? "managed tenant or top-level" : "top-level";
            console.warn(`⚠️ ${missingTokenType} CSRF Token not yet captured. Please interact with the page (refresh, navigate, or perform an action) to capture it.`);
            console.log("📌 Namespace extracted successfully:", namespace, `- Waiting for ${missingTokenType} CSRF token...`);
            chrome.runtime.sendMessage({
                action: "logWarning",
                message: `${missingTokenType} CSRF Token not yet captured`,
                data: {
                    namespace: namespace,
                    managedTenant: effectiveManagedTenant,
                    isManagedTenantContext: !!effectiveManagedTenant,
                    hasTopLevelToken: !!csrfToken,
                    hasManagedTenantToken: !!managedTenantCsrf,
                    url: window.location.href
                }
            });
            return;
        }

        console.log(`✅ Using ${tokenContext} CSRF token for API requests`);

        // ✅ Store namespace in background storage
        chrome.storage.local.set({ namespace: namespace });

        // ✅ Construct API URL based on managed tenant context
        let apiUrl;
        if (effectiveManagedTenant) {
            apiUrl = `${window.location.origin}/managed_tenant/${effectiveManagedTenant}/api/config/namespaces/${namespace}/http_loadbalancers?report_fields&csrf=${effectiveCsrfToken}`;
        } else {
            apiUrl = `${window.location.origin}/api/config/namespaces/${namespace}/http_loadbalancers?report_fields&csrf=${effectiveCsrfToken}`;
        }

        console.log("🌐 Fetching Load Balancers from:", apiUrl);
        console.log(`🔑 Using ${tokenContext} CSRF token`);
        
        // Log comprehensive API request details
        chrome.runtime.sendMessage({
            action: "logDebugInfo",
            data: {
                apiRequestDetails: {
                    url: apiUrl,
                    namespace: namespace,
                    managedTenant: effectiveManagedTenant,
                    tokenUsed: tokenContext,
                    csrfTokenLength: effectiveCsrfToken ? effectiveCsrfToken.length : 0,
                    isManagedTenantRequest: !!effectiveManagedTenant
                }
            }
        });

        try {
            const apiResponse = await fetch(apiUrl, { credentials: "include" });

            if (!apiResponse.ok) {
                const errorMessage = `API fetch failed: ${apiResponse.status} ${apiResponse.statusText}`;
                console.error("❌", errorMessage);
                chrome.runtime.sendMessage({
                    action: "logError",
                    message: "API fetch failed",
                    data: {
                        status: apiResponse.status,
                        statusText: apiResponse.statusText,
                        url: apiUrl,
                        namespace: namespace,
                        managedTenant: effectiveManagedTenant,
                        tokenContext: tokenContext,
                        headers: Array.from(apiResponse.headers.entries())
                    }
                });
                chrome.runtime.sendMessage({
                    type: 'errorNotification',
                    message: errorMessage
                });
                return;
            }

            const data = await apiResponse.json();
            console.log("✅ API Response:", data);
            
            // Log successful API response details
            chrome.runtime.sendMessage({
                action: "logDebugInfo",
                data: {
                    apiResponseDetails: {
                        success: true,
                        itemCount: data.items ? data.items.length : 0,
                        namespace: namespace,
                        managedTenant: effectiveManagedTenant,
                        tokenContext: tokenContext,
                        responseSize: JSON.stringify(data).length
                    }
                }
            });

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
            chrome.runtime.sendMessage({
                action: "logError",
                message: "API fetch exception",
                data: {
                    error: error.message,
                    stack: error.stack,
                    url: apiUrl,
                    namespace: namespace,
                    managedTenant: effectiveManagedTenant,
                    tokenContext: tokenContext
                }
            });
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