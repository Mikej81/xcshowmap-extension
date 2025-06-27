chrome.runtime.onInstalled.addListener(() => {
    console.log("✅ Extension Installed: xcshowmap is ready!");
});

// Enhanced logging system for debugging - writes to extension folder
class ExtensionLogger {
    constructor() {
        this.logs = [];
        this.maxLogs = 500; // Reduced for file writing
    }

    async writeLogFile() {
        try {
            const logContent = this.logs.map(log => 
                `[${log.timestamp}] [${log.level}] ${log.message}\n${log.data ? JSON.stringify(log.data, null, 2) + '\n' : ''}---\n`
            ).join('');
            
            // Also write formatted JSON for easier parsing
            const jsonLogs = {
                generated: new Date().toISOString(),
                totalLogs: this.logs.length,
                logs: this.logs
            };
            
            // Store in local storage
            chrome.storage.local.set({
                'debug_logs': jsonLogs,
                'debug_log_text': logContent
            });
            
        } catch (error) {
            console.error('Failed to write log file:', error);
        }
    }

    log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            data: data,
            url: data?.url || 'unknown'
        };
        
        // Only store errors and warnings to reduce data size
        if (level === 'ERROR' || level === 'WARN') {
            this.logs.push(logEntry);
            
            // Keep only recent critical logs
            if (this.logs.length > this.maxLogs) {
                this.logs.shift();
            }
            
            // Auto-write log file after each critical entry
            this.writeLogFile();
        }
        
        // Enhanced console logging with structured data (all levels)
        const logPrefix = `[${timestamp}] [${level}] ${message}`;
        console.log(logPrefix);
        if (data) {
            console.table(data);
        }
    }

    error(message, data = null) {
        this.log('ERROR', message, data);
    }

    warn(message, data = null) {
        this.log('WARN', message, data);
    }

    info(message, data = null) {
        this.log('INFO', message, data);
    }

    debug(message, data = null) {
        this.log('DEBUG', message, data);
    }

    // Force output all logs for copying
    outputAllLogs() {
        const logContent = this.logs.map(log => 
            `[${log.timestamp}] [${log.level}] ${log.message}\n${log.data ? JSON.stringify(log.data, null, 2) + '\n' : ''}---\n`
        ).join('');
        
        console.log('='.repeat(80));
        console.log('ALL DEBUG LOGS FOR FILE EXPORT');
        console.log('='.repeat(80));
        console.log(logContent);
        console.log('='.repeat(80));
        console.log('END ALL LOGS');
        console.log('='.repeat(80));
        
        return logContent;
    }

    // Download logs as file
    downloadLogs() {
        const logContent = this.logs.map(log => 
            `[${log.timestamp}] [${log.level}] ${log.message}\n${log.data ? JSON.stringify(log.data, null, 2) + '\n' : ''}---\n`
        ).join('');
        
        // Create comprehensive log file with metadata
        const fullLogContent = `XC Service Flow Mapper Debug Logs
Generated: ${new Date().toISOString()}
Total Entries: ${this.logs.length}
Extension Version: 1.0

${'='.repeat(80)}
DEBUG LOGS
${'='.repeat(80)}

${logContent}

${'='.repeat(80)}
JSON STRUCTURED DATA
${'='.repeat(80)}

${JSON.stringify({
    generated: new Date().toISOString(),
    totalLogs: this.logs.length,
    logs: this.logs
}, null, 2)}
`;
        
        // Convert to data URL for Chrome extension service worker
        const dataUrl = 'data:text/plain;charset=utf-8,' + encodeURIComponent(fullLogContent);
        const filename = `xcshowmap-debug-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
        
        chrome.downloads.download({
            url: dataUrl,
            filename: filename,
            saveAs: false  // Auto-save to Downloads folder
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                console.error('❌ Failed to download logs:', chrome.runtime.lastError.message);
                logger.error("Download logs failed", {
                    error: chrome.runtime.lastError.message,
                    logCount: this.logs.length,
                    contentLength: fullLogContent.length
                });
            } else {
                console.log('✅ Debug logs downloaded:', filename);
                console.log('📁 Check your Downloads folder for the file');
            }
        });
    }
}

const logger = new ExtensionLogger();

let tabData = {}; // Store data per tab ID - structure: { urls: [], csrf_token: null, managed_tenant_csrf: null, managed_tenant: null }

class APIResponse {
    constructor(lbObject) {
        if (!lbObject || typeof lbObject !== "object") {
            throw new Error("Invalid API response: Load Balancer object is missing.");
        }

        console.log("✅ Processing Load Balancer:", lbObject.name || "UnknownLB");

        this.lbName = lbObject.name || "UnknownLB";
        this.namespace = lbObject.namespace || "UnknownNamespace";
        this.domains = lbObject.get_spec?.domains || [];
        this.appFirewall = lbObject.get_spec?.app_firewall?.name || null;

        // ✅ Store Default Route Pools properly
        this.defaultRoutePools = lbObject.get_spec?.default_route_pools?.map(pool => ({
            name: pool.pool.name
        })) || [];

        this.activeServicePolicies = lbObject.get_spec?.active_service_policies?.policies?.map(policy => ({
            namespace: policy.namespace,
            name: policy.name
        })) || [];

        this.routes = this.parseRoutes(lbObject.get_spec?.routes || []);
    }

    parseRoutes(routes) {
        return routes.map(route => {
            if (route.simple_route) {
                return {
                    type: "simple",
                    path: route.simple_route.path.prefix || route.simple_route.path.regex || "/",
                    headers: route.simple_route.headers || [],
                    originPools: route.simple_route.origin_pools?.map(pool => pool.pool.name) || [],
                    appFirewall: route.simple_route.advanced_options?.app_firewall?.name || null,
                    inheritedWAF: route.simple_route.advanced_options?.inherited_waf ? "Inherited" : null
                };
            } else if (route.redirect_route) {
                return {
                    type: "redirect",
                    path: route.redirect_route.path.prefix,
                    headers: route.redirect_route.headers || [],
                    hostRedirect: route.redirect_route.route_redirect.host_redirect,
                    pathRedirect: route.redirect_route.route_redirect.path_redirect
                };
            } else if (route.direct_response_route) {
                return {
                    type: "direct_response",
                    path: route.direct_response_route.path.prefix,
                    responseCode: route.direct_response_route.route_direct_response.response_code,
                    responseBody: route.direct_response_route.route_direct_response.response_body
                };
            }
            return null;
        }).filter(route => route !== null);
    }
}

chrome.webRequest.onCompleted.addListener(
    function (details) {
        if (details.url && details.tabId && details.tabId !== -1) {
            // Initialize tab data if not exists
            if (!tabData[details.tabId]) {
                tabData[details.tabId] = { 
                    urls: [], 
                    csrf_token: null, 
                    managed_tenant_csrf: null, 
                    managed_tenant: null 
                };
            }

            // Store URL for this specific tab
            if (!tabData[details.tabId].urls.includes(details.url)) {
                tabData[details.tabId].urls.push(details.url);
            }

            // Extract managed tenant from URL if present
            const managedTenantMatch = details.url.match(/\/managed_tenant\/([^\/]+)/);
            if (managedTenantMatch) {
                tabData[details.tabId].managed_tenant = managedTenantMatch[1];
                logger.info("Managed tenant detected", {
                    tabId: details.tabId,
                    managedTenant: managedTenantMatch[1],
                    url: details.url
                });
            }

            // Enhanced CSRF token extraction for F5 Volterra console
            if (details.url.includes("console.ves.volterra.io")) {
                console.log("🔍 Volterra console request detected for tab", details.tabId, "URL:", details.url);

                try {
                    const isManagedTenant = details.url.includes("/managed_tenant/");
                    
                    // Method 1: Check URL parameters for csrf token
                    if (details.url.includes("csrf=")) {
                        const urlParams = new URLSearchParams(new URL(details.url).search);
                        const csrfToken = urlParams.get("csrf");
                        if (csrfToken) {
                            if (isManagedTenant) {
                                console.log("✅ Managed Tenant CSRF Token extracted from URL for tab", details.tabId);
                                tabData[details.tabId].managed_tenant_csrf = csrfToken;
                                logger.info("Managed tenant CSRF token captured", {
                                    tabId: details.tabId,
                                    managedTenant: tabData[details.tabId].managed_tenant,
                                    tokenSource: "URL parameter",
                                    url: details.url
                                });
                            } else {
                                console.log("✅ Top-level CSRF Token extracted from URL for tab", details.tabId);
                                tabData[details.tabId].csrf_token = csrfToken;
                                logger.info("Top-level CSRF token captured", {
                                    tabId: details.tabId,
                                    tokenSource: "URL parameter",
                                    url: details.url
                                });
                            }
                            notifyContentScript(details.tabId, csrfToken, isManagedTenant);
                            return;
                        }
                    }

                    // Method 2: Check for X-CSRF-Token in response headers (common pattern)
                    if (details.responseHeaders) {
                        for (const header of details.responseHeaders) {
                            if (header.name.toLowerCase() === 'x-csrf-token' && header.value) {
                                if (isManagedTenant) {
                                    console.log("✅ Managed Tenant CSRF Token extracted from X-CSRF-Token header for tab", details.tabId);
                                    tabData[details.tabId].managed_tenant_csrf = header.value;
                                    logger.info("Managed tenant CSRF token captured", {
                                        tabId: details.tabId,
                                        managedTenant: tabData[details.tabId].managed_tenant,
                                        tokenSource: "X-CSRF-Token header",
                                        url: details.url
                                    });
                                } else {
                                    console.log("✅ Top-level CSRF Token extracted from X-CSRF-Token header for tab", details.tabId);
                                    tabData[details.tabId].csrf_token = header.value;
                                    logger.info("Top-level CSRF token captured", {
                                        tabId: details.tabId,
                                        tokenSource: "X-CSRF-Token header",
                                        url: details.url
                                    });
                                }
                                notifyContentScript(details.tabId, header.value, isManagedTenant);
                                return;
                            }
                        }
                    }

                    // Method 3: Check for Set-Cookie headers with CSRF token
                    if (details.responseHeaders) {
                        for (const header of details.responseHeaders) {
                            if (header.name.toLowerCase() === 'set-cookie' && header.value) {
                                // Look for various CSRF cookie patterns
                                const csrfPatterns = [
                                    /csrf[_-]?token=([^;]+)/i,
                                    /xsrf[_-]?token=([^;]+)/i,
                                    /_token=([^;]+)/i,
                                    /csrftoken=([^;]+)/i
                                ];
                                
                                for (const pattern of csrfPatterns) {
                                    const match = header.value.match(pattern);
                                    if (match && match[1]) {
                                        if (isManagedTenant) {
                                            console.log("✅ Managed Tenant CSRF Token extracted from cookie for tab", details.tabId);
                                            tabData[details.tabId].managed_tenant_csrf = match[1];
                                            logger.info("Managed tenant CSRF token captured", {
                                                tabId: details.tabId,
                                                managedTenant: tabData[details.tabId].managed_tenant,
                                                tokenSource: "Set-Cookie header",
                                                cookiePattern: pattern.toString(),
                                                url: details.url
                                            });
                                        } else {
                                            console.log("✅ Top-level CSRF Token extracted from cookie for tab", details.tabId);
                                            tabData[details.tabId].csrf_token = match[1];
                                            logger.info("Top-level CSRF token captured", {
                                                tabId: details.tabId,
                                                tokenSource: "Set-Cookie header",
                                                cookiePattern: pattern.toString(),
                                                url: details.url
                                            });
                                        }
                                        notifyContentScript(details.tabId, match[1], isManagedTenant);
                                        return;
                                    }
                                }
                            }
                        }
                    }

                } catch (error) {
                    logger.error("Error parsing Volterra console request for CSRF token", {
                        tabId: details.tabId,
                        url: details.url,
                        error: error.message
                    });
                }
            }
        }
    },
    { urls: ["<all_urls>"] },
    ["responseHeaders"]
);

// Helper function to notify content script of CSRF token with retry logic
function notifyContentScript(tabId, csrfToken, isManagedTenant = false) {
    // Store the token in appropriate field
    if (isManagedTenant) {
        tabData[tabId].managed_tenant_csrf = csrfToken;
    } else {
        tabData[tabId].csrf_token = csrfToken;
    }
    
    // Try to notify content script with retry logic
    let attempts = 0;
    const maxAttempts = 3;
    const retryDelay = 500; // 500ms between attempts
    
    function attemptNotification() {
        attempts++;
        chrome.tabs.sendMessage(tabId, {
            action: "csrfTokenCaptured",
            csrfToken: csrfToken,
            isManagedTenant: isManagedTenant,
            managedTenant: tabData[tabId].managed_tenant
        }).then(() => {
            const tokenType = isManagedTenant ? "managed tenant" : "top-level";
            console.log(`✅ Successfully notified content script of ${tokenType} CSRF token`);
            logger.info("Content script notification successful", {
                tabId: tabId,
                tokenType: tokenType,
                managedTenant: tabData[tabId].managed_tenant
            });
        }).catch((error) => {
            if (attempts < maxAttempts) {
                console.log(`🔄 Content script not ready, retrying (${attempts}/${maxAttempts})...`);
                setTimeout(attemptNotification, retryDelay);
            } else {
                // Only log warning after all attempts failed, and it's not critical since content script can request token
                const tokenType = isManagedTenant ? "managed tenant" : "top-level";
                console.log(`⚠️ Content script notification failed after retries - ${tokenType} token is stored and available on request`);
            }
        });
    }
    
    attemptNotification();
}

// Also check request headers for CSRF tokens
chrome.webRequest.onBeforeSendHeaders.addListener(
    function (details) {
        if (details.url && details.tabId && details.tabId !== -1 && 
            details.url.includes("console.ves.volterra.io")) {
            
            // Initialize tab data if not exists
            if (!tabData[details.tabId]) {
                tabData[details.tabId] = { 
                    urls: [], 
                    csrf_token: null, 
                    managed_tenant_csrf: null, 
                    managed_tenant: null 
                };
            }

            const isManagedTenant = details.url.includes("/managed_tenant/");
            
            // Skip if we already have the appropriate token for this tab
            if (isManagedTenant && tabData[details.tabId].managed_tenant_csrf) {
                return;
            }
            if (!isManagedTenant && tabData[details.tabId].csrf_token) {
                return;
            }

            try {
                // Check request headers for CSRF token
                if (details.requestHeaders) {
                    for (const header of details.requestHeaders) {
                        const headerName = header.name.toLowerCase();
                        if ((headerName === 'x-csrf-token' || 
                             headerName === 'x-xsrf-token' || 
                             headerName === 'csrf-token') && header.value) {
                            
                            if (isManagedTenant) {
                                console.log("✅ Managed Tenant CSRF Token extracted from request header for tab", details.tabId);
                                tabData[details.tabId].managed_tenant_csrf = header.value;
                                logger.info("Managed tenant CSRF token captured", {
                                    tabId: details.tabId,
                                    managedTenant: tabData[details.tabId].managed_tenant,
                                    tokenSource: "Request header",
                                    headerName: headerName,
                                    url: details.url
                                });
                            } else {
                                console.log("✅ Top-level CSRF Token extracted from request header for tab", details.tabId);
                                tabData[details.tabId].csrf_token = header.value;
                                logger.info("Top-level CSRF token captured", {
                                    tabId: details.tabId,
                                    tokenSource: "Request header",
                                    headerName: headerName,
                                    url: details.url
                                });
                            }
                            notifyContentScript(details.tabId, header.value, isManagedTenant);
                            return;
                        }
                    }
                }
            } catch (error) {
                logger.error("Error parsing request headers for CSRF token", {
                    tabId: details.tabId,
                    url: details.url,
                    error: error.message
                });
            }
        }
    },
    { urls: ["https://*.console.ves.volterra.io/*"] },
    ["requestHeaders"]
);

// Clean up closed tabs
chrome.tabs.onRemoved.addListener((tabId) => {
    delete tabData[tabId];
    console.log("🗑️ Cleaned up data for closed tab:", tabId);
});

// Listener for retrieving stored URLs and data per tab
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    if (message.action === "getCapturedUrls") {
        const tabId = message.tabId || sender.tab?.id;
        const urls = tabData[tabId]?.urls || [];
        console.log("📨 Sending captured URLs for tab", tabId, ":", urls);
        sendResponse({ urls });
        return true; // Keeps the response channel open for async sendResponse
    }

    if (message.action === "getCsrfToken") {
        const tabId = message.tabId || sender.tab?.id;
        const csrfToken = tabData[tabId]?.csrf_token || null;
        const managedTenantCsrf = tabData[tabId]?.managed_tenant_csrf || null;
        const managedTenant = tabData[tabId]?.managed_tenant || null;
        
        console.log("📨 Sending CSRF Tokens for tab", tabId, ":", {
            topLevel: csrfToken ? "Present" : "Missing",
            managedTenant: managedTenantCsrf ? "Present" : "Missing",
            tenant: managedTenant
        });
        
        sendResponse({ 
            csrfToken, 
            managedTenantCsrf, 
            managedTenant,
            isManagedTenant: !!managedTenant
        });
        return true; // Keeps the response channel open for async sendResponse
    }

    if (message.action === "logDebugInfo") {
        logger.debug("Content script debug info", {
            tabId: sender.tab?.id,
            ...message.data
        });
        return true;
    }

    if (message.action === "logError") {
        logger.error(message.message, {
            tabId: sender.tab?.id,
            ...message.data
        });
        return true;
    }

    if (message.action === "logWarning") {
        logger.warn(message.message, {
            tabId: sender.tab?.id,
            ...message.data
        });
        return true;
    }

    if (message.action === "downloadLogs") {
        logger.downloadLogs();
        sendResponse({ success: true });
        return true;
    }

    if (message.action === "contentScriptReady") {
        const tabId = sender.tab?.id;
        console.log("✅ Content script ready for tab", tabId);
        
        // If we have CSRF tokens waiting for this tab, send them now
        if (tabId && tabData[tabId]) {
            const hasTopLevel = !!tabData[tabId].csrf_token;
            const hasManagedTenant = !!tabData[tabId].managed_tenant_csrf;
            
            if (hasTopLevel || hasManagedTenant) {
                console.log("🔑 Sending waiting CSRF tokens to ready content script", {
                    topLevel: hasTopLevel,
                    managedTenant: hasManagedTenant,
                    tenant: tabData[tabId].managed_tenant
                });
                
                chrome.tabs.sendMessage(tabId, {
                    action: "csrfTokensCaptured",
                    csrfToken: tabData[tabId].csrf_token,
                    managedTenantCsrf: tabData[tabId].managed_tenant_csrf,
                    managedTenant: tabData[tabId].managed_tenant,
                    isManagedTenant: !!tabData[tabId].managed_tenant
                }).catch(() => {
                    // Still might not be ready, but we tried
                });
            }
        }
        sendResponse({ success: true });
        return true;
    }


    if (message.action === "storeLoadBalancers") {
        const tabId = sender.tab?.id;
        if (tabId && message.loadBalancers) {
            chrome.storage.local.set({ [`loadBalancers_${tabId}`]: message.loadBalancers }, () => {
                logger.info("Stored Load Balancers for tab", {
                    tabId: tabId,
                    count: message.loadBalancers.length
                });
                sendResponse({ success: true });
            });
        } else {
            logger.error("Missing tab ID or load balancers data", {
                tabId: tabId,
                hasLoadBalancers: !!message.loadBalancers
            });
            sendResponse({ success: false, error: "Missing tab ID or data" });
        }
        return true;
    }

    if (message.type === "getLoadBalancers") {
        const tabId = message.tabId || sender.tab?.id;
        chrome.storage.local.get(`loadBalancers_${tabId}`, (data) => {
            console.log("📨 Sending Load Balancers for tab", tabId, ":", data[`loadBalancers_${tabId}`]);
            sendResponse({ loadBalancers: data[`loadBalancers_${tabId}`] || [] });
        });
        return true; // Keeps the response channel open for async sendResponse
    }

    if (message.type === "generateMermaid") {
        const lbObject = message.loadBalancer;

        if (!lbObject) {
            console.error("❌ Load Balancer data is missing.");
            sendResponse({ error: "Load Balancer data is missing" });
            return;
        }

        console.log("📊 Processing Load Balancer:", lbObject.name);
        console.log("🔍 Raw Load Balancer JSON Data:", lbObject);

        // Use Promise-based approach instead of async/await in message listener
        generateMermaidDiagram(lbObject)
            .then(mermaidDiagram => {
                if (!mermaidDiagram) {
                    throw new Error("Failed to generate diagram content");
                }

                console.log("🖼️ **Generated Advanced Mermaid Diagram:**\n", mermaidDiagram);

                // ✅ Encode the diagram and open a new tab
                const encodedDiagram = encodeURIComponent(mermaidDiagram);
                const diagramUrl = `chrome-extension://${chrome.runtime.id}/mermaid.html?diagram=${encodedDiagram}`;

                chrome.tabs.create({ url: diagramUrl });

                sendResponse({ mermaidDiagram });
            })
            .catch(error => {
                console.error("❌ Error in generating Advanced Mermaid Diagram:", error);
                sendResponse({ error: error.message });
            });
        
        return true; // Keep response channel open for async response
    }

});


// Attach debugger to active tab
function attachDebugger() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
            chrome.debugger.attach({ tabId: tabs[0].id }, "1.3", () => {
                if (chrome.runtime.lastError) {
                    console.error("❌ Failed to attach debugger:", chrome.runtime.lastError.message);
                } else {
                    console.log("✅ Debugger Attached to Tab:", tabs[0].id);
                }
            });
        } else {
            console.error("❌ No active tabs found.");
        }
    });
}


// Enhanced diagram generation based on CLI tool
function generateMermaidDiagram(lb) {
    return new Promise((resolve, reject) => {
        try {
            const sanitize = (str) => str.replace(/[^a-zA-Z0-9]/g, '_');
            let diagram = '';
            let edges = 0;
            const wafAdded = new Map();
            const poolToUpstream = new Map();
            let nodeCount = 0;

            // Determine Load Balancer Type
            let loadBalancerLabel = "Load Balancer";
            if (lb.get_spec?.advertise_on_public_default_vip || 
                lb.get_spec?.advertise_on_public ||
                (lb.get_spec?.advertise_on_public_default_vip && 
                 Object.keys(lb.get_spec.advertise_on_public_default_vip || {}).length === 0)) {
                loadBalancerLabel = "Public Load Balancer";
            } else if (lb.get_spec?.advertise_on_custom || 
                       lb.get_spec?.advertise_custom?.advertise_where?.length > 0) {
                loadBalancerLabel = "Private Load Balancer";
            }

        // WAF Configuration
        const wafName = lb.get_spec?.app_firewall?.name || "WAF Not Configured";
        let wafClass = "certValid"; // Default to valid
        if (!lb.get_spec?.app_firewall?.name) {
            if (loadBalancerLabel === "Public Load Balancer") {
                wafClass = "noWaf"; // Public LB without WAF is concerning
            } else {
                wafClass = "certError"; // Private LB without WAF is questionable
            }
        }

        // Start Mermaid diagram (advanced syntax for v11.7+)
        diagram += `---\n`;
        diagram += `title: ${lb.name} Load Balancer Service Flow\n`;
        diagram += `---\n`;
        diagram += `graph LR;\n`;

        // User and Load Balancer
        diagram += `    User --> LoadBalancer;\n`;
        diagram += `    LoadBalancer["**${lb.name} ${loadBalancerLabel}**"];\n`;

        // Define CSS classes for styling with advanced features
        diagram += `    classDef certValid stroke:#01ba44,stroke-width:2px;\n`;
        diagram += `    classDef certWarning stroke:#DAA520,stroke-width:2px;\n`;
        diagram += `    classDef certError stroke:#B22222,stroke-width:2px;\n`;
        diagram += `    classDef noWaf fill:#FF5733,stroke:#B22222,stroke-width:2px;\n`;
        diagram += `    classDef animate stroke-dasharray: 9,5,stroke-dashoffset: 900,animation: dash 25s linear infinite;\n`;

        // Process Domains with Certificate Info
        if (lb.get_spec?.domains) {
            for (const domain of lb.get_spec.domains) {
                const certState = lb.get_spec?.cert_state || "Unknown";
                const certExpiration = lb.get_spec?.downstream_tls_certificate_expiration_timestamps?.[0] || "Unknown";
                
                let certClass = "certValid";
                let certStateDisplay = "Valid";
                
                if (certState === "CertificateExpiringSoon") {
                    certClass = "certWarning";
                    certStateDisplay = "Expiring Soon";
                } else if (certState === "CertificateExpired") {
                    certClass = "certError";
                    certStateDisplay = "Expired";
                } else if (certState !== "CertificateValid" && certState !== "Unknown") {
                    certClass = "certError";
                    certStateDisplay = certState;
                }

                const domainNodeID = sanitize(domain);
                const domainNode = `domain_${domainNodeID}["${domain}<br> Cert: ${certStateDisplay} <br> Exp: ${certExpiration}"]`;
                
                diagram += `    LoadBalancer e${edges}@-- SNI --> ${domainNode};\n`;
                edges++;
                diagram += `    class domain_${domainNodeID} ${certClass};\n`;
            }
        }

        // Handle Private Load Balancer Advertise Targets
        if (loadBalancerLabel === "Private Load Balancer" && 
            lb.get_spec?.advertise_custom?.advertise_where?.length > 0) {
            
            diagram += `    subgraph AdvertiseTargets ["**Advertised To**"]\n`;
            diagram += `        direction LR\n`;

            lb.get_spec.advertise_custom.advertise_where.forEach((adv, i) => {
                const nodeID = `adv_target_${i}`;
                let label = "Unknown Advertise Target";

                if (adv.site) {
                    label = `Site: ${adv.site.site.name}<br>Network: ${adv.site.network}`;
                    if (adv.site.ip) label += `<br>IP: ${adv.site.ip}`;
                } else if (adv.virtual_site) {
                    label = `Virtual Site: ${adv.virtual_site.virtual_site.name}<br>Network: ${adv.virtual_site.network}`;
                } else if (adv.virtual_site_with_vip) {
                    label = `Virtual Site: ${adv.virtual_site_with_vip.virtual_site.name}<br>Network: ${adv.virtual_site_with_vip.network}`;
                    if (adv.virtual_site_with_vip.ip) label += `<br>IP: ${adv.virtual_site_with_vip.ip}`;
                } else if (adv.vk8s_service) {
                    label = `vK8s Service on <br/> ${adv.vk8s_service.site.name}`;
                }

                diagram += `        ${nodeID}["${label}"];\n`;
            });

            diagram += `    end\n`;

            // Connect domains to advertise targets
            if (lb.get_spec?.domains) {
                lb.get_spec.advertise_custom.advertise_where.forEach((adv, i) => {
                    const nodeID = `adv_target_${i}`;
                    lb.get_spec.domains.forEach(domain => {
                        const domainNodeID = sanitize(domain);
                        diagram += `    domain_${domainNodeID} e${edges}@--> ${nodeID};\n`;
                        edges++;
                    });
                    diagram += `    ${nodeID} e${edges}@--> ServicePolicies;\n`;
                    edges++;
                });
            }
        } else if (lb.get_spec?.domains) {
            // Connect domains to service policies for public LBs
            lb.get_spec.domains.forEach(domain => {
                const domainNodeID = sanitize(domain);
                diagram += `    domain_${domainNodeID} e${edges}@--> ServicePolicies;\n`;
                edges++;
            });
        }

        // Common Security Controls Subgraph
        diagram += `    subgraph ServicePolicies ["**Common Security Controls**"]\n`;
        diagram += `        direction LR\n`;

        // Service Policies
        if (lb.get_spec?.active_service_policies?.policies?.length > 0) {
            lb.get_spec.active_service_policies.policies.forEach(policy => {
                diagram += `        sp_${sanitize(policy.name)}["${policy.name}"];\n`;
            });
        } else if (lb.get_spec?.service_policies_from_namespace) {
            diagram += `        sp_ns["Apply Namespace Service Policies"];\n`;
        } else {
            diagram += `        sp_none["No Service Policies Defined"];\n`;
        }

        // Malicious User Detection
        if (lb.get_spec?.enable_malicious_user_detection) {
            diagram += `        mud["Malicious User Detection"];\n`;
        }

        diagram += `    end\n`;

        // API Protection
        let apiProtectionNode = "";
        if (lb.get_spec?.api_protection_rules) {
            apiProtectionNode = "api_protection";
            diagram += `    api_protection["**API Protection Enabled**"];\n`;
            diagram += `    ServicePolicies e${edges}@--> api_protection;\n`;
            edges++;
        }

        // Bot Defense
        let botDefenseNode = "";
        if (lb.get_spec?.bot_defense) {
            botDefenseNode = "bot_defense[\"**Automated Fraud Enabled**\"]";
        } else if (lb.get_spec?.disable_bot_defense) {
            botDefenseNode = "bot_defense[\"**Automated Fraud Disabled**\"]";
        }

        if (apiProtectionNode && botDefenseNode) {
            diagram += `    ${apiProtectionNode} e${edges}@--> ${botDefenseNode};\n`;
            edges++;
        } else if (botDefenseNode) {
            diagram += `    ServicePolicies e${edges}@--> ${botDefenseNode};\n`;
            edges++;
        }

        // WAF Processing
        const wafNodeID = sanitize(wafName);
        const wafNode = `waf_${wafNodeID}["WAF: ${wafName}"]`;

        if (botDefenseNode) {
            diagram += `    ${botDefenseNode} e${edges}@--> ${wafNode};\n`;
            edges++;
        } else if (apiProtectionNode) {
            diagram += `    ${apiProtectionNode} e${edges}@--> ${wafNode};\n`;
            edges++;
        } else {
            diagram += `    ServicePolicies e${edges}@-->|Process WAF| ${wafNode};\n`;
            edges++;
        }

        diagram += `    class waf_${wafNodeID} ${wafClass};\n`;
        diagram += `    ${wafNode} e${edges}@--> Routes;\n`;
        edges++;

        diagram += `    Routes["**Routes**"];\n`;

        // Default Route
        if (lb.get_spec?.default_route_pools?.length > 0) {
            diagram += `    DefaultRoute["**Default Route**"];\n`;
            diagram += `    Routes e${edges}@--> DefaultRoute;\n`;
            edges++;

            for (const pool of lb.get_spec.default_route_pools) {
                const poolID = `pool_${sanitize(pool.pool.name)}["**Pool**<br>${pool.pool.name}"]`;
                diagram += `    DefaultRoute --> ${poolID};\n`;
                // Note: Origin pool details would require additional API calls
            }
        }

        // Process Routes
        if (lb.get_spec?.routes) {
            lb.get_spec.routes.forEach((route, i) => {
                if (route.simple_route) {
                    const matchConditions = ["**Route**"];
                    
                    if (route.simple_route.path?.prefix) {
                        matchConditions.push(`Path Match: ${route.simple_route.path.prefix}`);
                    } else if (route.simple_route.path?.regex) {
                        matchConditions.push(`Path Regex: ${route.simple_route.path.regex}`);
                    }

                    route.simple_route.headers?.forEach(header => {
                        if (header.regex) {
                            matchConditions.push(`Header Regex: ${header.name} ~ ${header.regex}`);
                        } else {
                            matchConditions.push(`Header Match: ${header.name}`);
                        }
                    });

                    const nodeID = `route_${i}`;
                    const matchLabel = matchConditions.join(" <BR> ");
                    diagram += `    ${nodeID}["${matchLabel}"];\n`;
                    diagram += `    Routes e${edges}@--> ${nodeID};\n`;
                    edges++;

                    // Route-specific WAF
                    const routeWAF = route.simple_route.advanced_options?.app_firewall?.name;
                    if (routeWAF) {
                        const routeWafNodeID = `waf_${sanitize(routeWAF)}`;
                        if (!wafAdded.has(routeWafNodeID)) {
                            diagram += `    ${routeWafNodeID}["**WAF**: ${routeWAF}"];\n`;
                            wafAdded.set(routeWafNodeID, true);
                        }
                        diagram += `    ${nodeID} e${edges}@--> ${routeWafNodeID};\n`;
                        edges++;
                    }

                    // Origin Pools
                    route.simple_route.origin_pools?.forEach(pool => {
                        const poolID = `pool_${sanitize(pool.pool.name)}["**Pool**<br>${pool.pool.name}"]`;
                        
                        if (routeWAF) {
                            const routeWafNodeID = `waf_${sanitize(routeWAF)}`;
                            diagram += `    ${routeWafNodeID} e${edges}@--> ${poolID};\n`;
                            edges++;
                        } else {
                            diagram += `    ${nodeID} e${edges}@--> ${poolID};\n`;
                            edges++;
                        }
                    });

                } else if (route.redirect_route) {
                    const nodeID = `redirect_${i}`;
                    const redirectTarget = `${route.redirect_route.route_redirect.host_redirect}${route.redirect_route.route_redirect.path_redirect}`;
                    diagram += `    ${nodeID}["**Redirect Route**<br>Path: ${route.redirect_route.path.prefix}"];\n`;
                    diagram += `    Routes e${edges}@--> ${nodeID};\n`;
                    edges++;
                    diagram += `    ${nodeID} e${edges}@-->|Redirects to| redirect_target_${i}["${redirectTarget}"];\n`;
                    edges++;
                }
            });
        }

            // Apply animation to all edges (restored for Mermaid v11.7+)
            for (let edge = 0; edge < edges; edge++) {
                diagram += `    class e${edge} animate;\n`;
            }

            resolve(diagram);
        } catch (error) {
            console.error("❌ Advanced diagram generation error:", error);
            reject(new Error(`Failed to generate advanced diagram: ${error.message}`));
        }
    });
}

// Removed unused handleMermaidGeneration function - integrated into main message listener


// Capture network requests from debugger (fallback)
chrome.debugger.onEvent.addListener((source, method, params) => {
    if (method === "Network.requestWillBeSent") {
        const url = params.request.url;
        if (url.includes("csrf=")) {
            const urlParams = new URLSearchParams(new URL(url).search);
            const csrfToken = urlParams.get("csrf");

            if (csrfToken) {
                console.log("🔑 Captured CSRF Token via Debugger:", csrfToken);
                chrome.storage.local.set({ csrf_token: csrfToken });
            }
        }
    }
});

// Attach debugger when extension is activated
chrome.action.onClicked.addListener(() => {
    attachDebugger();
});