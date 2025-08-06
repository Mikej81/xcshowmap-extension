// Initialize content script and signal background that we're ready
console.log(`🔄 [CONTENT] Content script initialized at ${new Date().toISOString()}`);
console.log(`📍 [CONTENT] Page info:`, {
    url: window.location.href,
    pathname: window.location.pathname,
    hostname: window.location.hostname,
    readyState: document.readyState,
    timestamp: new Date().toISOString()
});

// Track origin pools that we've seen in intercepted fetch data
const seenOriginPools = new Set();

// Intercept fetch requests to capture JSON response bodies
(function() {
    const originalFetch = window.fetch;
    
    window.fetch = async function(...args) {
        const startTime = performance.now();
        const url = typeof args[0] === 'string' ? args[0] : args[0].url;
        const method = args[1]?.method || 'GET';
        
        console.log(`🌐 [FETCH-INTERCEPT] ${method} ${url}`);
        
        try {
            const response = await originalFetch.apply(this, args);
            const endTime = performance.now();
            const duration = Math.round(endTime - startTime);
            
            // Clone response to read body without consuming it
            const responseClone = response.clone();
            
            console.log(`📡 [FETCH-RESPONSE] ${method} ${url}`, {
                status: response.status,
                statusText: response.statusText,
                contentType: response.headers.get('content-type'),
                duration: `${duration}ms`
            });
            
            // Try to read JSON response if content type suggests it's JSON
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json') || url.includes('/api/')) {
                try {
                    const jsonData = await responseClone.json();
                    
                    console.log(`📊 [FETCH-JSON] ${method} ${url}`, {
                        dataSize: JSON.stringify(jsonData).length,
                        hasItems: !!jsonData.items,
                        itemCount: jsonData.items?.length || 0,
                        keys: Object.keys(jsonData).slice(0, 10) // First 10 keys
                    });
                    
                    // Track origin pools that we see in API responses
                    if (url.includes('origin_pools')) {
                        if (jsonData.items) {
                            // This is a list of origin pools
                            jsonData.items.forEach(pool => {
                                if (pool.name) {
                                    seenOriginPools.add(pool.name);
                                    console.log(`🎯 [ORIGIN-POOL-TRACKED] Added origin pool to seen list: ${pool.name}`);
                                }
                            });
                        } else if (jsonData.name) {
                            // This is a single origin pool
                            seenOriginPools.add(jsonData.name);
                            console.log(`🎯 [ORIGIN-POOL-TRACKED] Added single origin pool to seen list: ${jsonData.name}`);
                        }
                    }
                    
                    // Send detailed API data to background for analysis
                    chrome.runtime.sendMessage({
                        action: "logApiData",
                        data: {
                            url: url,
                            method: method,
                            status: response.status,
                            responseData: jsonData,
                            timestamp: new Date().toISOString(),
                            duration: duration
                        }
                    }).catch(() => {
                        // Ignore if background script isn't ready
                    });
                    
                    // Log interesting API endpoints
                    if (url.includes('origin_pools') || url.includes('pool') || 
                        url.includes('member') || url.includes('server') ||
                        url.includes('endpoint') || url.includes('backend')) {
                        console.log(`🎯 [ORIGIN-POOL-DATA] Found potential origin pool data in ${url}:`, jsonData);
                    }
                    
                } catch (jsonError) {
                    console.warn(`⚠️ [FETCH-JSON] Failed to parse JSON from ${url}:`, jsonError);
                }
            }
            
            return response;
            
        } catch (error) {
            const endTime = performance.now();
            const duration = Math.round(endTime - startTime);
            console.error(`❌ [FETCH-ERROR] ${method} ${url} failed after ${duration}ms:`, error);
            throw error;
        }
    };
    
    console.log('✅ [CONTENT] Fetch interception installed');
})();

chrome.runtime.onMessage.addListener((message) => {
    console.log(`📨 [CONTENT] Received message:`, message);
    
    if (message.action === "refreshData") {
        console.log(`🔄 [CONTENT] Refresh data request received at ${new Date().toISOString()}`);
        fetchLoadBalancers();
    }
    
    if (message.action === "csrfTokenCaptured") {
        const tokenType = message.isManagedTenant ? "managed tenant" : "top-level";
        console.log(`🔑 [CONTENT] ${tokenType} CSRF Token captured at ${new Date().toISOString()}! Attempting to fetch load balancers...`);
        fetchLoadBalancers();
    }
    
    if (message.action === "csrfTokensCaptured") {
        console.log(`🔑 [CONTENT] Multiple CSRF Tokens captured at ${new Date().toISOString()}!`, {
            topLevel: message.csrfToken ? "Present" : "Missing",
            managedTenant: message.managedTenantCsrf ? "Present" : "Missing",
            tenant: message.managedTenant
        });
        fetchLoadBalancers();
    }
    
    if (message.action === "fetchOriginPools") {
        console.log(`🎯 [CONTENT] On-demand origin pool fetch requested at ${new Date().toISOString()}`);
        if (message.loadBalancers && message.namespace && message.csrfToken) {
            fetchOriginPoolsData(message.loadBalancers, message.namespace, message.managedTenant, message.csrfToken)
                .catch(error => {
                    console.warn("⚠️ On-demand origin pool fetching failed:", error);
                });
        } else {
            console.error("❌ Missing required data for origin pool fetch:", {
                hasLoadBalancers: !!message.loadBalancers,
                hasNamespace: !!message.namespace,
                hasCsrfToken: !!message.csrfToken
            });
        }
    }
});

// Signal to background script that content script is ready
chrome.runtime.sendMessage({ action: "contentScriptReady" }).catch(() => {
    // Ignore connection errors during initialization
});

// Initial attempt to fetch data with improved timing
function attemptInitialFetch() {
    console.log(`🚀 [CONTENT] Attempting initial data fetch at ${new Date().toISOString()}`);
    console.log(`📊 [CONTENT] Document state:`, {
        readyState: document.readyState,
        url: window.location.href,
        pathname: window.location.pathname
    });
    
    // Check if page is ready
    if (document.readyState !== 'complete') {
        console.log(`📄 [CONTENT] Document not ready (${document.readyState}), waiting 1 second...`);
        setTimeout(attemptInitialFetch, 1000);
        return;
    }
    
    console.log(`✅ [CONTENT] Document ready, proceeding with fetchLoadBalancers`);
    fetchLoadBalancers();
}

// Start with a single delayed attempt, but also try immediately if page is already ready
if (document.readyState === 'complete') {
    console.log(`✅ [CONTENT] Document already ready, attempting immediate fetch`);
    attemptInitialFetch();
} else {
    console.log(`📄 [CONTENT] Document not ready (${document.readyState}), will attempt after 1 second`);
    setTimeout(attemptInitialFetch, 1000);
}


async function fetchLoadBalancers() {
    console.log(`🔄 [CONTENT] fetchLoadBalancers started at ${new Date().toISOString()}`);
    
    chrome.runtime.sendMessage({ action: "getCsrfToken" }, async (response) => {
        console.log(`🔑 [CONTENT] CSRF token request response:`, response);
        
        const csrfToken = response?.csrfToken;
        const managedTenantCsrf = response?.managedTenantCsrf;
        const managedTenant = response?.managedTenant;
        const isManagedTenant = response?.isManagedTenant;
        
        console.log(`🔑 [CONTENT] CSRF Tokens Retrieved at ${new Date().toISOString()}:`, {
            topLevel: csrfToken ? `Present (${csrfToken.length} chars)` : "Missing",
            managedTenant: managedTenantCsrf ? `Present (${managedTenantCsrf.length} chars)` : "Missing",
            tenant: managedTenant,
            isManagedContext: isManagedTenant,
            responseKeys: Object.keys(response || {})
        });

        // Extract Namespace and Managed Tenant from URL
        console.log(`🔍 [CONTENT] Extracting namespace and tenant from URL: ${window.location.pathname}`);
        
        let namespaceMatch = window.location.pathname.match(/\/namespaces\/([^/]+)/);
        let namespace = namespaceMatch ? namespaceMatch[1] : null;
        let managedTenantMatch = window.location.pathname.match(/\/managed_tenant\/([^/]+)/);
        let managedTenantFromUrl = managedTenantMatch ? managedTenantMatch[1] : null;
        
        console.log(`📊 [CONTENT] URL parsing results:`, {
            pathname: window.location.pathname,
            namespaceMatch: namespaceMatch,
            extractedNamespace: namespace,
            managedTenantMatch: managedTenantMatch,
            extractedManagedTenant: managedTenantFromUrl
        });
        
        // Use managed tenant from background data or URL
        const effectiveManagedTenant = managedTenant || managedTenantFromUrl;

        // Exclude system namespace
        if (namespace === "system") {
            console.warn(`⚠️ [CONTENT] Ignoring 'system' namespace, searching for a valid one...`);
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
            console.error("❌ Missing Namespace. Check if you're on an F5XC console page with load balancers.");
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

        // Store namespace in background storage
        chrome.storage.local.set({ namespace: namespace });

        // Construct API URL based on managed tenant context
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

            // Store load balancers in tab-specific storage via background script
            chrome.runtime.sendMessage({
                action: "storeLoadBalancers", 
                loadBalancers: data.items
            }, (response) => {
                if (response?.success) {
                    console.log("✅ Stored Load Balancers for current tab:", data.items);
                    console.log("🎯 [CONTENT] Origin pool fetching is now on-demand only - will fetch when diagram is generated");
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

// Detect Navigation Changes (Works for Single Page Apps)
let lastUrl = window.location.href;
setInterval(() => {
    if (window.location.href !== lastUrl) {
        console.log("🔄 Detected Navigation Change, Refreshing Data...");
        lastUrl = window.location.href;
        // Wait a bit for the new page to load before fetching
        setTimeout(fetchLoadBalancers, 2000);
    }
}, 1000);

// Function to fetch origin pool details only for pools we've seen in intercepted data
async function fetchOriginPoolsData(loadBalancers, namespace, managedTenant, csrfToken) {
    console.log(`🎯 [CONTENT] Starting origin pools data fetch for ${loadBalancers.length} load balancers`);
    
    // Extract all unique origin pool references from load balancers
    const referencedPools = new Set();
    
    loadBalancers.forEach(lb => {
        // Check default route pools
        if (lb.get_spec?.default_route_pools) {
            lb.get_spec.default_route_pools.forEach(pool => {
                referencedPools.add(pool.pool.name);
            });
        }
        
        // Check route origin pools
        if (lb.get_spec?.routes) {
            lb.get_spec.routes.forEach(route => {
                if (route.simple_route?.origin_pools) {
                    route.simple_route.origin_pools.forEach(pool => {
                        referencedPools.add(pool.pool.name);
                    });
                }
            });
        }
    });
    
    // Only fetch pools that we've both referenced in load balancers AND seen in intercepted API data
    const poolsToFetch = new Set();
    for (const poolName of referencedPools) {
        if (seenOriginPools.has(poolName)) {
            poolsToFetch.add(poolName);
        } else {
            console.log(`⚠️ [CONTENT] Skipping ${poolName} - not seen in intercepted API data`);
        }
    }
    
    console.log(`🎯 [CONTENT] Referenced pools: ${referencedPools.size}, Seen in API: ${seenOriginPools.size}, Will fetch: ${poolsToFetch.size}`);
    console.log(`🎯 [CONTENT] Pools to fetch:`, Array.from(poolsToFetch));
    console.log(`🎯 [CONTENT] Seen pools:`, Array.from(seenOriginPools));
    
    if (poolsToFetch.size === 0) {
        console.log(`⚠️ [CONTENT] No origin pools to fetch - none were seen in intercepted API data`);
        return;
    }
    
    try {
        // Fetch each pool individually for efficiency
        const allOriginPools = [];
        
        for (const poolName of poolsToFetch) {
            console.log(`🌐 [CONTENT] Fetching individual origin pool: ${poolName}`);
            
            // Construct specific pool API URL
            let apiUrl;
            if (managedTenant) {
                apiUrl = `${window.location.origin}/managed_tenant/${managedTenant}/api/config/namespaces/${namespace}/origin_pools/${poolName}?report_fields&csrf=${csrfToken}`;
            } else {
                apiUrl = `${window.location.origin}/api/config/namespaces/${namespace}/origin_pools/${poolName}?report_fields&csrf=${csrfToken}`;
            }
            
            console.log(`🌐 [CONTENT] Fetching specific pool from: ${apiUrl}`);
            
            try {
                // Add timeout to prevent hanging
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
                
                const response = await fetch(apiUrl, { 
                    credentials: "include",
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    console.error(`❌ [CONTENT] Origin pool ${poolName} API failed: ${response.status} ${response.statusText}`);
                    continue; // Skip this pool and continue with others
                }
                
                const poolData = await response.json();
                console.log(`✅ [CONTENT] Retrieved origin pool ${poolName}:`, poolData);
                
                // Add to collection
                allOriginPools.push(poolData);
                
            } catch (error) {
                if (error.name === 'AbortError') {
                    console.warn(`⏰ [CONTENT] Origin pool ${poolName} fetch timed out`);
                } else {
                    console.error(`❌ [CONTENT] Origin pool ${poolName} fetch error:`, error);
                }
                continue; // Skip this pool and continue with others
            }
        }
        
        console.log(`✅ [CONTENT] Retrieved ${allOriginPools.length} origin pools total`);
            
        // Log detailed origin pool information
        if (allOriginPools.length > 0) {
            allOriginPools.forEach((pool, index) => {
                console.log(`🔍 [ORIGIN-POOL-${index}] ${pool.name}:`, {
                    name: pool.name,
                    hasOriginServers: !!(pool.get_spec?.origin_servers),
                    serverCount: pool.get_spec?.origin_servers?.length || 0,
                    loadBalancingMode: pool.get_spec?.loadbalancer_algorithm,
                    healthCheck: !!(pool.get_spec?.health_check_policy),
                    keys: Object.keys(pool.get_spec || {})
                });
                
                // Log server details
                if (pool.get_spec?.origin_servers) {
                    pool.get_spec.origin_servers.forEach((server, serverIndex) => {
                        console.log(`  📋 [SERVER-${serverIndex}]:`, {
                            hasPublicName: !!(server.public_name),
                            publicName: server.public_name?.dns_name,
                            hasPublicIp: !!(server.public_ip),
                            publicIp: server.public_ip?.ip,
                            hasPrivateIp: !!(server.private_ip),
                            hasPrivateName: !!(server.private_name),
                            hasK8sService: !!(server.k8s_service),
                            hasVk8sService: !!(server.vk8s_service)
                        });
                    });
                }
            });
        }
        
        // Store origin pools data for use in diagram generation
        chrome.runtime.sendMessage({
            action: "storeOriginPools",
            originPools: allOriginPools,
            namespace: namespace
        }, (response) => {
            if (response?.success) {
                console.log(`✅ [CONTENT] Stored origin pools data for diagram enhancement`);
            } else {
                console.error(`❌ [CONTENT] Failed to store origin pools:`, response?.error);
            }
        });
            
    } catch (error) {
        console.error(`❌ [CONTENT] Origin pools fetch error:`, error);
        // Don't throw error to avoid blocking main functionality
    }
}