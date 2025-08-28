chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension Installed: xcshowmap is ready!");
    // Clean up storage on install to prevent quota issues
    cleanupOldStorageData();
});

// Function to clean up old storage data
async function cleanupOldStorageData() {
    try {
        console.log("🧹 Cleaning up old storage data to prevent quota issues");

        // Get all storage keys
        const allData = await chrome.storage.local.get();
        const keysToRemove = [];

        // Remove old load balancer and origin pool data (keep only recent)
        const currentTime = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        for (const key of Object.keys(allData)) {
            // Remove old tab-specific data
            if (key.startsWith('loadBalancers_') || key.startsWith('originPools_')) {
                keysToRemove.push(key);
            }
            // Remove old debug logs
            if (key === 'debug_logs' || key === 'debug_log_text' || key === 'api_logs') {
                keysToRemove.push(key);
            }
        }

        if (keysToRemove.length > 0) {
            await chrome.storage.local.remove(keysToRemove);
            console.log(`🧹 Removed ${keysToRemove.length} old storage entries`);
        }

    } catch (error) {
        console.error("Failed to cleanup storage:", error);
    }
}

// Enhanced logging system for debugging - writes to extension folder
class ExtensionLogger {
    constructor() {
        this.logs = [];
        this.apiLogs = []; // New array for API request/response logs
        this.maxLogs = 50; // Drastically reduced to prevent quota issues
        this.maxApiLogs = 20; // Reduced API logs
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
                totalApiLogs: this.apiLogs.length,
                logs: this.logs,
                apiLogs: this.apiLogs
            };

            // Store in local storage
            chrome.storage.local.set({
                'debug_logs': jsonLogs,
                'debug_log_text': logContent,
                'api_logs': this.apiLogs
            });

        } catch (error) {
            console.error('Failed to write log file:', error);
        }
    }

    log(level, message, data = null) {
        const timestamp = new Date().toISOString();

        // Simplified log entry with minimal data
        const logEntry = {
            timestamp,
            level,
            message: message.substring(0, 200), // Truncate long messages
            url: data?.url?.substring(0, 100) || 'unknown'
        };

        // Only store errors and warnings to reduce data size
        if (level === 'ERROR' || level === 'WARN') {
            this.logs.push(logEntry);

            // Keep only recent critical logs
            if (this.logs.length > this.maxLogs) {
                this.logs.shift();
            }

            // Only auto-write occasionally to reduce storage calls
            if (this.logs.length % 10 === 0) {
                this.writeLogFile();
            }
        }

        // Enhanced console logging (but don't store large data)
        const logPrefix = `[${timestamp}] [${level}] ${message}`;
        console.log(logPrefix);
        if (data && typeof data === 'object') {
            // Log summary instead of full data
            console.log('Data summary:', {
                keys: Object.keys(data).slice(0, 5),
                size: JSON.stringify(data).length
            });
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

    // New method to log API requests and responses
    logApiRequest(url, method, requestData = null, responseData = null, tabId = null) {
        // Store minimal data to avoid quota issues
        const apiLogEntry = {
            timestamp: new Date().toISOString(),
            tabId: tabId,
            url: url.substring(0, 200), // Truncate long URLs
            method: method,
            contentType: responseData?.contentType?.substring(0, 50),
            statusCode: responseData?.statusCode,
            isJson: responseData?.isJson || false,
            dataSize: responseData?.data ? JSON.stringify(responseData.data).length : 0,
            itemCount: responseData?.data?.items?.length || 0
        };

        this.apiLogs.push(apiLogEntry);

        // Keep only recent API logs
        if (this.apiLogs.length > this.maxApiLogs) {
            this.apiLogs.shift();
        }

        // Log to console for immediate debugging (but don't store large data)
        console.log(`[API] ${method} ${url}`, {
            tabId: tabId,
            statusCode: responseData?.statusCode,
            dataSize: apiLogEntry.dataSize,
            itemCount: apiLogEntry.itemCount
        });

        // Only store to chrome.storage if needed, and without large data
        if (this.apiLogs.length % 5 === 0) { // Only write every 5 entries
            this.writeLogFile();
        }
    }

    // Analyze captured origin pool data
    analyzeOriginPools() {
        const originPoolApis = this.apiLogs.filter(log =>
            log.url.includes('origin_pools') || log.url.includes('pool') ||
            log.url.includes('member') || log.url.includes('server') ||
            log.url.includes('endpoint') || log.url.includes('backend')
        );

        if (originPoolApis.length === 0) {
            return "No origin pool related API calls found.";
        }

        let analysis = `Found ${originPoolApis.length} origin pool related API calls:\n\n`;

        originPoolApis.forEach((api, index) => {
            analysis += `${index + 1}. ${api.method} ${api.url}\n`;
            analysis += `   Status: ${api.responseData?.statusCode || 'unknown'}\n`;

            if (api.responseData?.data) {
                const data = api.responseData.data;
                analysis += `   Response Type: ${typeof data}\n`;
                analysis += `   Has Items: ${!!data.items}\n`;
                analysis += `   Item Count: ${data.items?.length || 0}\n`;

                if (data.items && data.items.length > 0) {
                    analysis += `   Sample Item Keys: ${Object.keys(data.items[0]).join(', ')}\n`;

                    // Look for member information
                    const sampleItem = data.items[0];
                    if (sampleItem.members || sampleItem.origin_servers || sampleItem.servers) {
                        analysis += `    Contains member/server information!\n`;
                    }
                    if (sampleItem.targets || sampleItem.endpoints) {
                        analysis += `    Contains target/endpoint information!\n`;
                    }
                }
            }
            analysis += '\n';
        });

        return analysis;
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

        // Create API logs content
        const apiLogContent = this.apiLogs.map(log =>
            `[${log.timestamp}] [API] ${log.method} ${log.url} (${log.responseData?.statusCode || 'unknown'})\n${log.responseData?.data ? JSON.stringify(log.responseData.data, null, 2) + '\n' : ''}---\n`
        ).join('');

        // Create comprehensive log file with metadata
        const fullLogContent = `XC Service Flow Mapper Debug Logs
Generated: ${new Date().toISOString()}
Total Debug Entries: ${this.logs.length}
Total API Entries: ${this.apiLogs.length}
Extension Version: 1.5.8

${'='.repeat(80)}
DEBUG LOGS
${'='.repeat(80)}

${logContent}

${'='.repeat(80)}
API REQUEST/RESPONSE LOGS
${'='.repeat(80)}

${apiLogContent}

${'='.repeat(80)}
ORIGIN POOL DATA ANALYSIS
${'='.repeat(80)}

${this.analyzeOriginPools()}

${'='.repeat(80)}
JSON STRUCTURED DATA
${'='.repeat(80)}

${JSON.stringify({
            generated: new Date().toISOString(),
            totalLogs: this.logs.length,
            totalApiLogs: this.apiLogs.length,
            logs: this.logs,
            apiLogs: this.apiLogs.map(log => ({
                timestamp: log.timestamp,
                url: log.url,
                method: log.method,
                statusCode: log.responseData?.statusCode,
                hasJsonResponse: !!log.responseData?.data,
                responseKeys: log.responseData?.data ? Object.keys(log.responseData.data) : [],
                itemCount: log.responseData?.data?.items?.length || 0
            }))
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
                console.error(' Failed to download logs:', chrome.runtime.lastError.message);
                logger.error("Download logs failed", {
                    error: chrome.runtime.lastError.message,
                    logCount: this.logs.length,
                    contentLength: fullLogContent.length
                });
            } else {
                console.log(' Debug logs downloaded:', filename);
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

        console.log("Processing Load Balancer:", lbObject.name || "UnknownLB");

        this.lbName = lbObject.name || "UnknownLB";
        this.namespace = lbObject.namespace || "UnknownNamespace";
        this.domains = lbObject.get_spec?.domains || [];
        this.appFirewall = lbObject.get_spec?.app_firewall?.name || null;

        //  Store Default Route Pools properly
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
                    path: route.redirect_route.path?.prefix || route.redirect_route.path?.path || null,
                    headers: route.redirect_route.headers || [],
                    hostRedirect: route.redirect_route.route_redirect.host_redirect,
                    pathRedirect: route.redirect_route.route_redirect.path_redirect || null
                };
            } else if (route.direct_response_route) {
                return {
                    type: "direct_response",
                    path: route.direct_response_route.path.prefix,
                    responseCode: route.direct_response_route.route_direct_response.response_code,
                    responseBody: route.direct_response_route.route_direct_response.response_body
                };
            } else if (route.custom_route_object) {
                return {
                    type: "custom",
                    routeRef: route.custom_route_object.route_ref?.name || null,
                    namespace: route.custom_route_object.route_ref?.namespace || null
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

            // Enhanced CSRF token extraction for F5 Distributed Cloud console
            if (details.url.includes("console.ves.volterra.io")) {
                console.log("F5XC console request detected for tab", details.tabId, "URL:", details.url);

                try {
                    const isManagedTenant = details.url.includes("/managed_tenant/");

                    // Method 1: Check URL parameters for csrf token
                    if (details.url.includes("csrf=")) {
                        const urlParams = new URLSearchParams(new URL(details.url).search);
                        const csrfToken = urlParams.get("csrf");
                        if (csrfToken) {
                            if (isManagedTenant) {
                                console.log("Managed Tenant CSRF Token extracted from URL for tab", details.tabId);
                                tabData[details.tabId].managed_tenant_csrf = csrfToken;
                                logger.info("Managed tenant CSRF token captured", {
                                    tabId: details.tabId,
                                    managedTenant: tabData[details.tabId]?.managed_tenant,
                                    tokenSource: "URL parameter",
                                    url: details.url
                                });
                            } else {
                                console.log("Top-level CSRF Token extracted from URL for tab", details.tabId);
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
                                    console.log("Managed Tenant CSRF Token extracted from X-CSRF-Token header for tab", details.tabId);
                                    tabData[details.tabId].managed_tenant_csrf = header.value;
                                    logger.info("Managed tenant CSRF token captured", {
                                        tabId: details.tabId,
                                        managedTenant: tabData[details.tabId]?.managed_tenant,
                                        tokenSource: "X-CSRF-Token header",
                                        url: details.url
                                    });
                                } else {
                                    console.log("Top-level CSRF Token extracted from X-CSRF-Token header for tab", details.tabId);
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
                                            console.log("Managed Tenant CSRF Token extracted from cookie for tab", details.tabId);
                                            tabData[details.tabId].managed_tenant_csrf = match[1];
                                            logger.info("Managed tenant CSRF token captured", {
                                                tabId: details.tabId,
                                                managedTenant: tabData[details.tabId]?.managed_tenant,
                                                tokenSource: "Set-Cookie header",
                                                cookiePattern: pattern.toString(),
                                                url: details.url
                                            });
                                        } else {
                                            console.log("Top-level CSRF Token extracted from cookie for tab", details.tabId);
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
                    logger.error("Error parsing F5XC console request for CSRF token", {
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

// Comprehensive API request interceptor for capturing JSON responses
chrome.webRequest.onBeforeRequest.addListener(
    function (details) {
        // Only intercept API requests to F5XC console
        if (details.url.includes("console.ves.volterra.io") &&
            (details.url.includes("/api/") || details.url.includes("/api"))) {

            console.log(`[API-INTERCEPT] ${details.method} ${details.url}`, {
                tabId: details.tabId,
                type: details.type,
                timeStamp: details.timeStamp
            });

            // Store request info for matching with response
            if (!apiRequestMap) {
                global.apiRequestMap = new Map();
            }

            apiRequestMap.set(details.requestId, {
                url: details.url,
                method: details.method,
                tabId: details.tabId,
                timestamp: new Date().toISOString(),
                requestBody: details.requestBody
            });
        }
    },
    { urls: ["<all_urls>"] },
    ["requestBody"]
);

// Intercept responses to capture JSON data
chrome.webRequest.onCompleted.addListener(
    function (details) {
        // Check if this was an API request we're tracking
        if (apiRequestMap && apiRequestMap.has(details.requestId)) {
            const requestInfo = apiRequestMap.get(details.requestId);

            // Determine if this is likely a JSON response
            const contentType = details.responseHeaders?.find(
                header => header.name.toLowerCase() === 'content-type'
            )?.value || '';

            const isJsonResponse = contentType.includes('application/json') ||
                contentType.includes('text/json') ||
                details.url.includes('/api/');

            console.log(`📡 [API-RESPONSE] ${requestInfo.method} ${requestInfo.url}`, {
                tabId: details.tabId,
                statusCode: details.statusCode,
                contentType: contentType,
                isJsonResponse: isJsonResponse,
                responseSize: details.responseHeaders?.find(h => h.name.toLowerCase() === 'content-length')?.value
            });

            // Log the API request/response for analysis
            logger.logApiRequest(
                requestInfo.url,
                requestInfo.method,
                requestInfo.requestBody,
                {
                    statusCode: details.statusCode,
                    contentType: contentType,
                    isJson: isJsonResponse,
                    headers: details.responseHeaders
                },
                details.tabId
            );

            // Clean up tracking
            apiRequestMap.delete(details.requestId);
        }
    },
    { urls: ["<all_urls>"] },
    ["responseHeaders"]
);

// Global map to track API requests
let apiRequestMap = new Map();

// Helper function to escape domains/URLs to prevent Mermaid from interpreting as markdown links
function escapeForMermaid(text) {
    if (!text) return text;
    let escaped = text;
    // Break up patterns that Mermaid might interpret as markdown links
    escaped = escaped.replace(/^www\./gi, 'www\u200B.');
    escaped = escaped.replace(/^https?:\/\//gi, (match) => match.replace('://', ':\u200B//'));
    escaped = escaped.replace(/\.com/gi, '.\u200Bcom');
    escaped = escaped.replace(/\.org/gi, '.\u200Borg');
    escaped = escaped.replace(/\.net/gi, '.\u200Bnet');
    escaped = escaped.replace(/\.test/gi, '.\u200Btest');
    escaped = escaped.replace(/\.io/gi, '.\u200Bio');
    escaped = escaped.replace(/\.cloud/gi, '.\u200Bcloud');
    escaped = escaped.replace(/\.example/gi, '.\u200Bexample');
    return escaped;
}

// Helper function to notify content script of CSRF token with retry logic
function notifyContentScript(tabId, csrfToken, isManagedTenant = false) {
    // Ensure tabData[tabId] exists
    if (!tabData[tabId]) {
        tabData[tabId] = { urls: [], csrf_token: null, managed_tenant_csrf: null, managed_tenant: null };
    }
    
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
            managedTenant: tabData[tabId]?.managed_tenant
        }).then(() => {
            const tokenType = isManagedTenant ? "managed tenant" : "top-level";
            console.log(` Successfully notified content script of ${tokenType} CSRF token`);
            logger.info("Content script notification successful", {
                tabId: tabId,
                tokenType: tokenType,
                managedTenant: tabData[tabId]?.managed_tenant
            });
        }).catch((error) => {
            if (attempts < maxAttempts) {
                console.log(` Content script not ready, retrying (${attempts}/${maxAttempts})...`);
                setTimeout(attemptNotification, retryDelay);
            } else {
                // Only log warning after all attempts failed, and it's not critical since content script can request token
                const tokenType = isManagedTenant ? "managed tenant" : "top-level";
                console.log(` Content script notification failed after retries - ${tokenType} token is stored and available on request`);
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
                                console.log("Managed Tenant CSRF Token extracted from request header for tab", details.tabId);
                                tabData[details.tabId].managed_tenant_csrf = header.value;
                                logger.info("Managed tenant CSRF token captured", {
                                    tabId: details.tabId,
                                    managedTenant: tabData[details.tabId]?.managed_tenant,
                                    tokenSource: "Request header",
                                    headerName: headerName,
                                    url: details.url
                                });
                            } else {
                                console.log("Top-level CSRF Token extracted from request header for tab", details.tabId);
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
    console.log("Cleaned up data for closed tab:", tabId);
});

// Listen for tab navigation updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Only process when navigation is complete
    if (changeInfo.status === 'complete' && tab.url) {
        // Keep CSRF tokens but clear other data when URL changes
        if (tabData[tabId] && changeInfo.url) {
            console.log("Tab navigation detected, keeping CSRF tokens for tab:", tabId);
            // Keep CSRF tokens across navigation
            const existingCsrf = tabData[tabId]?.csrf_token;
            const existingManagedCsrf = tabData[tabId]?.managed_tenant_csrf;
            const existingTenant = tabData[tabId]?.managed_tenant;

            tabData[tabId] = {
                urls: [],
                csrf_token: existingCsrf,
                managed_tenant_csrf: existingManagedCsrf,
                managed_tenant: existingTenant
            };
            // Clear stored load balancers for this tab
            chrome.storage.local.remove(`loadBalancers_${tabId}`);
        }
    }
});

// Function to extract CSRF token from current page
async function extractCsrfFromCurrentPage(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab.url || !tab.url.includes('console.ves.volterra.io')) {
            return null;
        }

        // Try to extract from URL parameters
        const url = new URL(tab.url);
        const csrfFromUrl = url.searchParams.get('csrf');
        if (csrfFromUrl) {
            console.log(` [BACKGROUND] Found CSRF token in URL`);

            // Store the token
            if (!tabData[tabId]) {
                tabData[tabId] = { urls: [], csrf_token: null, managed_tenant_csrf: null, managed_tenant: null };
            }

            const isManagedTenant = tab.url.includes('/managed_tenant/');
            if (isManagedTenant) {
                tabData[tabId].managed_tenant_csrf = csrfFromUrl;
                const managedTenantMatch = tab.url.match(/\/managed_tenant\/([^\/]+)/);
                if (managedTenantMatch) {
                    tabData[tabId].managed_tenant = managedTenantMatch[1];
                }
            } else {
                tabData[tabId].csrf_token = csrfFromUrl;
            }

            return csrfFromUrl;
        }

        // Try to inject a small script to get CSRF token from page
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: () => {
                    // Look for CSRF tokens in various places
                    const metaToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
                    const inputToken = document.querySelector('input[name="_token"]')?.value;
                    const formToken = document.querySelector('input[name="csrf_token"]')?.value;

                    // Also check for tokens in script tags or window objects
                    let scriptToken = null;
                    const scripts = document.querySelectorAll('script');
                    for (const script of scripts) {
                        const content = script.textContent;
                        const tokenMatch = content.match(/(?:csrf[_-]?token|_token)["']?\s*:\s*["']([^"']+)["']/i);
                        if (tokenMatch) {
                            scriptToken = tokenMatch[1];
                            break;
                        }
                    }

                    return metaToken || inputToken || formToken || scriptToken || null;
                }
            });

            const pageToken = results[0]?.result;
            if (pageToken) {
                console.log(` [BACKGROUND] Found CSRF token in page content`);

                if (!tabData[tabId]) {
                    tabData[tabId] = { urls: [], csrf_token: null, managed_tenant_csrf: null, managed_tenant: null };
                }

                const isManagedTenant = tab.url.includes('/managed_tenant/');
                if (isManagedTenant) {
                    tabData[tabId].managed_tenant_csrf = pageToken;
                    const managedTenantMatch = tab.url.match(/\/managed_tenant\/([^\/]+)/);
                    if (managedTenantMatch) {
                        tabData[tabId].managed_tenant = managedTenantMatch[1];
                    }
                } else {
                    tabData[tabId].csrf_token = pageToken;
                }

                return pageToken;
            }
        } catch (err) {
            console.log(` [BACKGROUND] Could not inject script to find CSRF token:`, err.message);
        }

    } catch (error) {
        console.error(` [BACKGROUND] Error extracting CSRF token:`, error);
    }

    return null;
}

// Function to fetch CDN load balancers for a namespace
async function fetchCDNLoadBalancers(tabId, namespace) {
    console.log(`[BACKGROUND] Fetching CDN load balancers for namespace: ${namespace}`);

    const tabInfo = tabData[tabId];
    if (!tabInfo) {
        console.log('[BACKGROUND] No tab data found for CDN fetch');
        return [];
    }

    // Get the current tab URL to determine the base URL
    const tab = await chrome.tabs.get(tabId);
    const url = new URL(tab.url);
    const baseUrl = url.origin;

    // Determine if we're in managed tenant context
    const managedTenantMatch = tab.url.match(/\/managed_tenant\/([^\/]+)/);
    const managedTenant = managedTenantMatch ? managedTenantMatch[1] : null;

    // Use appropriate CSRF token
    let csrfToken = null;
    if (managedTenant && tabInfo?.managed_tenant_csrf) {
        csrfToken = tabInfo?.managed_tenant_csrf;
    } else if (tabInfo?.csrf_token) {
        csrfToken = tabInfo?.csrf_token;
    } else {
        console.log('[BACKGROUND] No CSRF token available for CDN fetch');
        return [];
    }

    // Construct API URL for CDN load balancers
    let apiUrl;
    if (managedTenant) {
        apiUrl = `${baseUrl}/managed_tenant/${managedTenant}/api/config/namespaces/${namespace}/cdn_loadbalancers?report_fields&csrf=${csrfToken}`;
    } else {
        apiUrl = `${baseUrl}/api/config/namespaces/${namespace}/cdn_loadbalancers?report_fields&csrf=${csrfToken}`;
    }

    console.log(`[BACKGROUND] Fetching CDN load balancers from: ${apiUrl}`);

    try {
        const response = await fetch(apiUrl, {
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
                'X-CSRF-Token': csrfToken
            }
        });

        if (!response.ok) {
            console.log(`[BACKGROUND] CDN API returned ${response.status}: ${response.statusText}`);
            return [];
        }

        const data = await response.json();
        console.log(`[BACKGROUND] Received ${data.items?.length || 0} CDN load balancers`);
        return data.items || [];
    } catch (error) {
        console.error('[BACKGROUND] Error fetching CDN load balancers:', error);
        return [];
    }
}

// Function to fetch origin pools for a specific load balancer
async function fetchOriginPoolsForLoadBalancer(tabId, namespace, loadBalancer) {
    console.log(` [BACKGROUND] Fetching origin pools for load balancer: ${loadBalancer.name}`);

    // Extract all origin pool names referenced by this load balancer
    const referencedPoolNames = new Set();

    // Check default route pools
    if (loadBalancer.get_spec?.default_route_pools) {
        loadBalancer.get_spec.default_route_pools.forEach(pool => {
            referencedPoolNames.add(pool.pool.name);
        });
    }

    // Check route origin pools
    if (loadBalancer.get_spec?.routes) {
        loadBalancer.get_spec.routes.forEach(route => {
            if (route.simple_route?.origin_pools) {
                route.simple_route.origin_pools.forEach(pool => {
                    referencedPoolNames.add(pool.pool.name);
                });
            }
        });
    }

    console.log(` [BACKGROUND] Found ${referencedPoolNames.size} referenced pools:`, Array.from(referencedPoolNames));

    if (referencedPoolNames.size === 0) {
        console.log(` [BACKGROUND] No origin pools to fetch`);
        return {
            pools: [],
            baseUrl: null,
            csrfToken: null,
            managedTenant: null
        };
    }

    const tabInfo = tabData[tabId];
    if (!tabInfo) {
        throw new Error('No tab data found');
    }

    // Get the current tab URL to determine the base URL
    const tab = await chrome.tabs.get(tabId);
    const url = new URL(tab.url);
    const baseUrl = url.origin;

    // Determine if we're in managed tenant context
    const managedTenantMatch = tab.url.match(/\/managed_tenant\/([^\/]+)/);
    const managedTenant = managedTenantMatch ? managedTenantMatch[1] : null;

    // Use appropriate CSRF token
    let csrfToken = null;
    if (managedTenant && tabInfo?.managed_tenant_csrf) {
        csrfToken = tabInfo?.managed_tenant_csrf;
    } else if (tabInfo?.csrf_token) {
        csrfToken = tabInfo?.csrf_token;
    } else {
        throw new Error('No CSRF token available');
    }

    // Construct API URL for origin pools
    let apiUrl;
    if (managedTenant) {
        apiUrl = `${baseUrl}/managed_tenant/${managedTenant}/api/config/namespaces/${namespace}/origin_pools?report_fields&csrf=${csrfToken}`;
    } else {
        apiUrl = `${baseUrl}/api/config/namespaces/${namespace}/origin_pools?report_fields&csrf=${csrfToken}`;
    }

    console.log(`[BACKGROUND] Fetching origin pools from: ${apiUrl}`);

    try {
        const response = await fetch(apiUrl, {
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
                'X-CSRF-Token': csrfToken
            }
        });

        if (!response.ok) {
            throw new Error(`Origin pools API returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log(` [BACKGROUND] Received ${data.items?.length || 0} total origin pools`);

        // Filter to only the pools referenced by this load balancer
        const relevantPools = (data.items || []).filter(pool =>
            referencedPoolNames.has(pool.name)
        );

        console.log(` [BACKGROUND] Filtered to ${relevantPools.length} relevant origin pools`);
        return {
            pools: relevantPools,
            baseUrl,
            csrfToken,
            managedTenant
        };

    } catch (error) {
        console.error(` [BACKGROUND] Origin pools fetch failed:`, error);
        // Don't fail the whole diagram generation if origin pools fail
        console.log(` [BACKGROUND] Continuing diagram generation without origin pool details`);
        return {
            pools: [],
            baseUrl: null,
            csrfToken: null,
            managedTenant: null
        };
    }
}

// Direct API fetching function
async function fetchLoadBalancersDirectly(tabId, namespace) {
    console.log(`[BACKGROUND] Direct API fetch for namespace: ${namespace}`);

    const tabInfo = tabData[tabId];
    if (!tabInfo) {
        throw new Error('No tab data found');
    }

    // Get the current tab URL to determine the base URL
    const tab = await chrome.tabs.get(tabId);
    const url = new URL(tab.url);
    const baseUrl = url.origin;

    // Determine if we're in managed tenant context
    const managedTenantMatch = tab.url.match(/\/managed_tenant\/([^\/]+)/);
    const managedTenant = managedTenantMatch ? managedTenantMatch[1] : null;

    // Use appropriate CSRF token
    let csrfToken = null;
    if (managedTenant && tabInfo?.managed_tenant_csrf) {
        csrfToken = tabInfo?.managed_tenant_csrf;
        console.log(` Using managed tenant CSRF token`);
    } else if (tabInfo?.csrf_token) {
        csrfToken = tabInfo?.csrf_token;
        console.log(` Using top-level CSRF token`);
    } else {
        throw new Error('No CSRF token available');
    }

    // Construct API URL
    let apiUrl;
    if (managedTenant) {
        apiUrl = `${baseUrl}/managed_tenant/${managedTenant}/api/config/namespaces/${namespace}/http_loadbalancers?report_fields&csrf=${csrfToken}`;
    } else {
        apiUrl = `${baseUrl}/api/config/namespaces/${namespace}/http_loadbalancers?report_fields&csrf=${csrfToken}`;
    }

    console.log(`📡 [BACKGROUND] Fetching from: ${apiUrl}`);

    try {
        const response = await fetch(apiUrl, {
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
                'X-CSRF-Token': csrfToken
            }
        });

        if (!response.ok) {
            throw new Error(`API returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log(` [BACKGROUND] Fetched ${data.items?.length || 0} load balancers`);

        // Store the load balancers
        if (data.items && data.items.length > 0) {
            chrome.storage.local.set({ [`loadBalancers_${tabId}`]: data.items });
        }

        return data.items || [];
    } catch (error) {
        console.error(` [BACKGROUND] API fetch failed:`, error);
        throw error;
    }
}

// Listener for retrieving stored URLs and data per tab
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    if (message.action === "fetchLoadBalancersAPI") {
        const tabId = message.tabId || sender.tab?.id;
        const namespace = message.namespace;

        if (!namespace) {
            sendResponse({ error: 'Namespace is required' });
            return true;
        }

        console.log(`📡 [BACKGROUND] Direct API fetch request for tab ${tabId}, namespace: ${namespace}`);

        fetchLoadBalancersDirectly(tabId, namespace)
            .then(loadBalancers => {
                sendResponse({ success: true, loadBalancers });
            })
            .catch(error => {
                sendResponse({ success: false, error: error.message });
            });

        return true; // Keep channel open for async response
    }

    if (message.action === "getCapturedUrls") {
        const tabId = message.tabId || sender.tab?.id;
        const urls = tabData[tabId]?.urls || [];
        console.log("Sending captured URLs for tab", tabId, ":", urls);
        sendResponse({ urls });
        return true; // Keeps the response channel open for async sendResponse
    }

    if (message.action === "logApiData") {
        const apiData = message.data;
        console.log(` [API-DATA] Received API data from content script:`, {
            url: apiData.url,
            method: apiData.method,
            status: apiData.status,
            dataSize: JSON.stringify(apiData.responseData).length,
            hasItems: !!apiData.responseData.items,
            itemCount: apiData.responseData.items?.length || 0
        });

        // Enhanced logging for origin pool related APIs
        if (apiData.url.includes('origin_pools') || apiData.url.includes('pool') ||
            apiData.url.includes('member') || apiData.url.includes('server') ||
            apiData.url.includes('endpoint') || apiData.url.includes('backend')) {

            console.log(` [ORIGIN-POOL-API] Captured potential origin pool data:`, apiData.responseData);

            // Log specific structure for analysis
            if (apiData.responseData.items) {
                apiData.responseData.items.forEach((item, index) => {
                    console.log(` [POOL-ITEM-${index}] Structure:`, {
                        name: item.name || item.id || 'unknown',
                        keys: Object.keys(item),
                        hasMembers: !!(item.members || item.origin_servers || item.servers),
                        hasTargets: !!(item.targets || item.endpoints)
                    });
                });
            }
        }

        // Store in detailed API logs
        logger.logApiRequest(
            apiData.url,
            apiData.method,
            null, // request data not available from content script
            {
                statusCode: apiData.status,
                isJson: true,
                data: apiData.responseData,
                contentType: 'application/json',
                duration: apiData.duration
            },
            sender.tab?.id
        );

        sendResponse({ success: true });
        return true;
    }

    if (message.action === "getCsrfToken") {
        const tabId = message.tabId || sender.tab?.id;
        let csrfToken = tabData[tabId]?.csrf_token || null;
        let managedTenantCsrf = tabData[tabId]?.managed_tenant_csrf || null;
        let managedTenant = tabData[tabId]?.managed_tenant || null;

        // If no token found, try to extract from current page
        if (!csrfToken && !managedTenantCsrf) {
            console.log(` [BACKGROUND] No CSRF token found, trying to extract from current page`);
            extractCsrfFromCurrentPage(tabId)
                .then((extractedToken) => {
                    if (extractedToken) {
                        // Re-read the data after extraction
                        const updatedCsrfToken = tabData[tabId]?.csrf_token || null;
                        const updatedManagedTenantCsrf = tabData[tabId]?.managed_tenant_csrf || null;
                        const updatedManagedTenant = tabData[tabId]?.managed_tenant || null;

                        console.log("[BACKGROUND] Extracted CSRF token, sending updated response");
                        sendResponse({
                            csrfToken: updatedCsrfToken,
                            managedTenantCsrf: updatedManagedTenantCsrf,
                            managedTenant: updatedManagedTenant,
                            isManagedTenant: !!updatedManagedTenant
                        });
                    } else {
                        console.log("[BACKGROUND] Could not extract CSRF token from page");
                        sendResponse({
                            csrfToken: null,
                            managedTenantCsrf: null,
                            managedTenant: null,
                            isManagedTenant: false
                        });
                    }
                })
                .catch((error) => {
                    console.error("[BACKGROUND] Error extracting CSRF token:", error);
                    sendResponse({
                        csrfToken: null,
                        managedTenantCsrf: null,
                        managedTenant: null,
                        isManagedTenant: false
                    });
                });
            return true; // Keep channel open for async response
        } else {
            console.log("Sending existing CSRF Tokens for tab", tabId, ":", {
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
            return true;
        }
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
        console.log("Content script ready for tab", tabId);

        // If we have CSRF tokens waiting for this tab, send them now
        if (tabId && tabData[tabId]) {
            const hasTopLevel = !!tabData[tabId]?.csrf_token;
            const hasManagedTenant = !!tabData[tabId]?.managed_tenant_csrf;

            if (hasTopLevel || hasManagedTenant) {
                console.log("Sending waiting CSRF tokens to ready content script", {
                    topLevel: hasTopLevel,
                    managedTenant: hasManagedTenant,
                    tenant: tabData[tabId]?.managed_tenant
                });

                chrome.tabs.sendMessage(tabId, {
                    action: "csrfTokensCaptured",
                    csrfToken: tabData[tabId]?.csrf_token,
                    managedTenantCsrf: tabData[tabId]?.managed_tenant_csrf,
                    managedTenant: tabData[tabId]?.managed_tenant,
                    isManagedTenant: !!tabData[tabId]?.managed_tenant
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

    if (message.action === "storeOriginPools") {
        const tabId = sender.tab?.id;
        if (tabId && message.originPools && message.namespace) {
            // Store minimal origin pool data to avoid quota issues
            const minimalPools = message.originPools.map(pool => ({
                name: pool.name,
                namespace: pool.namespace,
                loadbalancer_algorithm: pool.get_spec?.loadbalancer_algorithm || 'round_robin',
                server_count: pool.get_spec?.origin_servers?.length || 0,
                origin_servers: pool.get_spec?.origin_servers?.map(server => ({
                    public_name: server.public_name?.dns_name ? { dns_name: server.public_name.dns_name } : null,
                    public_ip: server.public_ip?.ip ? { ip: server.public_ip.ip } : null,
                    private_ip: server.private_ip?.ip ? { ip: server.private_ip.ip } : null,
                    private_name: server.private_name?.dns_name ? { dns_name: server.private_name.dns_name } : null,
                    k8s_service: server.k8s_service ? {
                        service_name: server.k8s_service.service_name,
                        site_name: server.k8s_service.site_locator?.site?.name
                    } : null,
                    vk8s_service: server.vk8s_service ? {
                        service_name: server.vk8s_service.service_name
                    } : null,
                    port: server.labels?.['ves.io/port']
                })).filter(server =>
                    server.public_name || server.public_ip || server.private_ip ||
                    server.private_name || server.k8s_service || server.vk8s_service
                ) || []
            }));

            chrome.storage.local.set({
                [`originPools_${tabId}_${message.namespace}`]: minimalPools
            }, () => {
                console.log(` [BACKGROUND] Minimal origin pools stored for tab ${tabId} namespace ${message.namespace}:`, minimalPools.length, "pools");

                // Log summary
                minimalPools.forEach(pool => {
                    console.log(` [STORED-POOL] ${pool.name}: ${pool.server_count} servers, Algorithm: ${pool.loadbalancer_algorithm}`);
                });

                sendResponse({ success: true });
            });
        } else {
            sendResponse({ success: false, error: "Missing tab ID, origin pools, or namespace" });
        }
        return true;
    }

    if (message.type === "getLoadBalancers") {
        const tabId = message.tabId || sender.tab?.id;
        chrome.storage.local.get(`loadBalancers_${tabId}`, (data) => {
            console.log("Sending Load Balancers for tab", tabId, ":", data[`loadBalancers_${tabId}`]);
            sendResponse({ loadBalancers: data[`loadBalancers_${tabId}`] || [] });
        });
        return true; // Keeps the response channel open for async sendResponse
    }

    if (message.type === "generateMermaid") {
        const lbObject = message.loadBalancer;

        if (!lbObject) {
            console.error("Load Balancer data is missing.");
            sendResponse({ error: "Load Balancer data is missing" });
            return;
        }

        console.log("Processing Load Balancer:", lbObject.name);
        console.log("Raw Load Balancer JSON Data:", lbObject);

        // Get the tab ID - from message, sender, or query active tab
        let tabId = message.tabId || sender.tab?.id;

        if (!tabId) {
            console.log("[BACKGROUND] No tab ID from sender, querying active tab");
            // Query for the active tab since popup doesn't provide sender.tab.id
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs[0]) {
                    console.error("No active tab found");
                    sendResponse({ error: "No active tab found" });
                    return;
                }

                tabId = tabs[0].id;
                console.log(` [BACKGROUND] Using active tab ID: ${tabId}`);

                // Extract namespace from current tab URL
                extractNamespaceAndGenerateDiagram(tabId, lbObject, sendResponse);
            });
            return;
        }

        // Extract namespace from current tab URL
        extractNamespaceAndGenerateDiagram(tabId, lbObject, sendResponse);

        function extractNamespaceAndGenerateDiagram(tabId, lbObject, sendResponse) {
            chrome.tabs.get(tabId, (tab) => {
                if (chrome.runtime.lastError) {
                    console.error("Failed to get tab info:", chrome.runtime.lastError);
                    sendResponse({ error: "Failed to get tab information" });
                    return;
                }

                const namespaceMatch = tab.url.match(/\/namespaces\/([^\/]+)/);
                const namespace = namespaceMatch ? namespaceMatch[1] : null;

                if (!namespace) {
                    console.error("Could not extract namespace from URL:", tab.url);
                    sendResponse({ error: "Could not determine namespace" });
                    return;
                }

                console.log(` [BACKGROUND] Extracted namespace: ${namespace} from URL: ${tab.url}`);

                // First fetch origin pools and CDN load balancers, then generate diagram
                Promise.all([
                    fetchOriginPoolsForLoadBalancer(tabId, namespace, lbObject),
                    fetchCDNLoadBalancers(tabId, namespace)
                ])
                    .then(([poolResult, cdnLoadBalancers]) => {
                        console.log("Fetched origin pools and CDN data, generating enhanced diagram");
                        return generateMermaidDiagramEnhanced(
                            lbObject,
                            poolResult.pools,
                            poolResult.baseUrl,
                            poolResult.csrfToken,
                            poolResult.managedTenant,
                            cdnLoadBalancers
                        );
                    })
                    .then(mermaidDiagram => {
                        if (!mermaidDiagram) {
                            throw new Error("Failed to generate diagram content");
                        }

                        console.log("**Generated Enhanced Mermaid Diagram with Origin Pools:**\n", mermaidDiagram);

                        // Store the diagram in chrome storage and open tab with ID
                        try {
                            console.log('[BACKGROUND] Storing diagram in chrome.storage, length:', mermaidDiagram.length);

                            // Generate a unique ID for this diagram
                            const diagramId = 'diagram_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);

                            // Store the raw diagram in chrome storage (no encoding needed)
                            const storageData = {};
                            storageData[diagramId] = {
                                diagram: mermaidDiagram,
                                timestamp: Date.now()
                            };

                            chrome.storage.local.set(storageData, () => {
                                if (chrome.runtime.lastError) {
                                    console.error('[BACKGROUND] Failed to store diagram:', chrome.runtime.lastError);
                                    sendResponse({ error: 'Failed to store diagram' });
                                    return;
                                }

                                console.log('[BACKGROUND] Diagram stored successfully with ID:', diagramId);

                                // Open mermaid.html with the storage ID
                                const diagramUrl = `chrome-extension://${chrome.runtime.id}/mermaid.html?storageId=${diagramId}`;
                                chrome.tabs.create({ url: diagramUrl });

                            });
                        } catch (storageError) {
                            console.error('[BACKGROUND] Error with storage approach:', storageError);
                            sendResponse({ error: 'Failed to handle diagram storage' });
                        }
                    })
                    .catch(error => {
                        console.error("Error in generating Enhanced Mermaid Diagram:", error);
                        sendResponse({ error: error.message });
                    });
            });
        }

        return true; // Keep response channel open for async response
    }

});


// Attach debugger to active tab
function attachDebugger() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
            chrome.debugger.attach({ tabId: tabs[0].id }, "1.3", () => {
                if (chrome.runtime.lastError) {
                    console.error("Failed to attach debugger:", chrome.runtime.lastError.message);
                } else {
                    console.log("Debugger Attached to Tab:", tabs[0].id);
                }
            });
        } else {
            console.error("No active tabs found.");
        }
    });
}


// Enhanced diagram generation with origin pool data
async function generateMermaidDiagramWithOriginPools(lb, tabId) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log(` [DIAGRAM] Generating enhanced diagram for ${lb.name} with origin pool data`);

            // First get the namespace from the load balancer
            const namespace = lb.namespace;

            // Get stored origin pools data
            let originPoolsData = [];
            if (tabId && namespace) {
                const storageKey = `originPools_${tabId}_${namespace}`;
                const storage = await chrome.storage.local.get(storageKey);
                originPoolsData = storage[storageKey] || [];
                console.log(` [DIAGRAM] Retrieved ${originPoolsData.length} origin pools for enhancement`);
                console.log(` [DIAGRAM] Origin pools data:`, originPoolsData);

                // Log each pool's details
                originPoolsData.forEach(pool => {
                    console.log(` [DIAGRAM] Pool ${pool.name}: ${pool.server_count} servers, algorithm: ${pool.loadbalancer_algorithm}`);
                    if (pool.origin_servers) {
                        pool.origin_servers.forEach((server, idx) => {
                            console.log(`   [DIAGRAM] Node ${idx}:`, server);
                        });
                    }
                });
            } else {
                console.warn(` [DIAGRAM] Missing tabId (${tabId}) or namespace (${namespace}) for origin pool lookup`);
            }

            // Call the original diagram generation with origin pools data
            // Note: We don't have baseUrl, csrfToken, managedTenant here, so RE connections won't be added
            const diagram = await generateMermaidDiagramEnhanced(lb, originPoolsData, null, null, null, []);
            resolve(diagram);

        } catch (error) {
            console.error("Enhanced diagram generation error:", error);
            reject(error);
        }
    });
}

// Helper function to fetch site data for connected REs
async function fetchSiteData(siteName, baseUrl, csrfToken, managedTenant) {
    if (!siteName || !baseUrl || !csrfToken) {
        console.warn('Missing required parameters for fetching site data');
        return null;
    }

    let apiUrl;
    if (managedTenant) {
        apiUrl = `${baseUrl}/managed_tenant/${managedTenant}/api/config/namespaces/system/sites/${siteName}?csrf=${csrfToken}`;
    } else {
        apiUrl = `${baseUrl}/api/config/namespaces/system/sites/${siteName}?csrf=${csrfToken}`;
    }

    console.log(`[BACKGROUND] Fetching site data for: ${siteName}`);

    try {
        const response = await fetch(apiUrl, {
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
                'X-CSRF-Token': csrfToken
            }
        });

        if (!response.ok) {
            console.warn(`Failed to fetch site data for ${siteName}: ${response.status}`);
            return null;
        }

        const data = await response.json();
        console.log(` [BACKGROUND] Received site data for ${siteName}:`, data);
        return data;
    } catch (error) {
        console.error(`Error fetching site data for ${siteName}:`, error);
        return null;
    }
}

// Helper function to generate origin server nodes (updated for full API data structure)
function generateOriginServerNodes(originPoolData, poolID, siteDataMap = null, routeType = null, startEdge = 0) {
    const servers = originPoolData.get_spec?.origin_servers || [];
    let serverNodes = '';

    // Check if this is a CDN pool based on pool name
    const isCDNPool = originPoolData.name && (
        originPoolData.name.toLowerCase().includes('cdn') ||
        originPoolData.name.toLowerCase().includes('cache')
    );

    servers.forEach((server, serverIndex) => {
        const edgeNum = startEdge + serverIndex;
        const serverID = `${poolID}_server_${serverIndex}`;
        let serverLabel = isCDNPool ? `**CDN Node ${serverIndex + 1}**` : `**Node ${serverIndex + 1}**`;

        // Determine server type and details from full API structure
        if (server.public_name?.dns_name) {
            serverLabel += `<br>DNS: ${escapeForMermaid(server.public_name.dns_name)}`;
        } else if (server.public_ip?.ip) {
            serverLabel += `<br>IP: ${server.public_ip.ip}`;
        } else if (server.private_ip?.ip) {
            serverLabel += `<br>Private IP: ${server.private_ip.ip}`;
        } else if (server.private_name?.dns_name) {
            serverLabel += `<br>Private DNS: ${escapeForMermaid(server.private_name.dns_name)}`;
        } else if (server.k8s_service) {
            serverLabel += `<br>K8s: ${server.k8s_service.service_name}`;
        } else if (server.vk8s_service) {
            serverLabel += `<br>vK8s: ${server.vk8s_service.service_name}`;
        }

        // Add site locator information for all server types
        let siteLocator = null;
        if (server.public_name?.site_locator) {
            siteLocator = server.public_name.site_locator;
        } else if (server.public_ip?.site_locator) {
            siteLocator = server.public_ip.site_locator;
        } else if (server.private_ip?.site_locator) {
            siteLocator = server.private_ip.site_locator;
        } else if (server.private_name?.site_locator) {
            siteLocator = server.private_name.site_locator;
        } else if (server.k8s_service?.site_locator) {
            siteLocator = server.k8s_service.site_locator;
        } else if (server.vk8s_service?.site_locator) {
            siteLocator = server.vk8s_service.site_locator;
        }

        // Display site locator information
        if (siteLocator) {
            if (siteLocator.site?.name) {
                const siteName = siteLocator.site.name;
                serverLabel += `<br>Site: ${siteName}`;

                // Add RE information if site data is available
                if (siteDataMap && siteDataMap.has(siteName)) {
                    const siteData = siteDataMap.get(siteName);
                    if (siteData?.spec) {
                        // Get connected REs
                        const connectedREs = siteData.spec.connected_re || [];
                        const configREs = siteData.spec.connected_re_for_config || [];

                        // Create a set of config RE names for easy lookup
                        const configRENames = new Set(configREs.map(re => re.name).filter(name => name));

                        // Add all unique REs with appropriate labels
                        const allRENames = new Set();

                        // Add connected REs
                        connectedREs.forEach(re => {
                            if (re.name) {
                                allRENames.add(re.name);
                            }
                        });

                        // Add config REs
                        configREs.forEach(re => {
                            if (re.name) {
                                allRENames.add(re.name);
                            }
                        });

                        // Display REs with Config annotation where appropriate
                        if (allRENames.size > 0) {
                            const reList = Array.from(allRENames).map(reName => {
                                if (configRENames.has(reName)) {
                                    return `${reName} (Config)`;
                                }
                                return reName;
                            });
                            serverLabel += `<br>RE: ${reList.join(', ')}`;
                        }
                    }
                }
            } else if (siteLocator.virtual_site?.name) {
                serverLabel += `<br>Virtual Site: ${siteLocator.virtual_site.name}`;
            }
        }

        // Add port if specified in labels
        const port = server.labels?.['ves.io/port'];
        if (port) {
            serverLabel += `<br>Port: ${port}`;
        }

        // Add health check info if available
        if (server.health_check) {
            serverLabel += `<br>Health Check: Enabled`;
        }

        // Always use simple connections from Pool to Nodes (Task 1: Simplify connections)
        serverNodes += `    ${poolID} --> ${serverID}["${serverLabel}"];\n`;

        // Add CDN-specific styling if this is a CDN pool
        if (isCDNPool) {
            serverNodes += `    style ${serverID} fill:#E6F3FF,stroke:#4169E1,stroke-width:2px;\n`;
        }
    });

    return serverNodes;
}

// Enhanced diagram generation based on CLI tool
async function generateMermaidDiagramEnhanced(lb, originPoolsData = [], baseUrl = null, csrfToken = null, managedTenant = null, cdnLoadBalancers = []) {
    return new Promise(async (resolve, reject) => {
        try {
            const sanitize = (str) => str.replace(/[^a-zA-Z0-9]/g, '_');
            let diagram = '';
            let edges = 0;
            const wafAdded = new Map();
            let siteDataMap = new Map(); // Store fetched site data

            // Pre-compute security controls state to avoid reference errors
            let hasSecurityControls = false;
            let securityControlsContent = '';

            // Collect all site names from origin pools upfront
            const allSiteNames = new Set();
            if (baseUrl && csrfToken) {
                originPoolsData.forEach(pool => {
                    const servers = pool.get_spec?.origin_servers || [];
                    servers.forEach(server => {
                        // Check all possible site locator locations
                        let siteLocator = null;
                        if (server.public_name?.site_locator) {
                            siteLocator = server.public_name.site_locator;
                        } else if (server.public_ip?.site_locator) {
                            siteLocator = server.public_ip.site_locator;
                        } else if (server.private_ip?.site_locator) {
                            siteLocator = server.private_ip.site_locator;
                        } else if (server.private_name?.site_locator) {
                            siteLocator = server.private_name.site_locator;
                        } else if (server.k8s_service?.site_locator) {
                            siteLocator = server.k8s_service.site_locator;
                        } else if (server.vk8s_service?.site_locator) {
                            siteLocator = server.vk8s_service.site_locator;
                        }

                        // Collect site names (not virtual sites)
                        if (siteLocator?.site?.name) {
                            allSiteNames.add(siteLocator.site.name);
                        }
                    });
                });

                // Fetch all site data upfront
                console.log(`[DIAGRAM] Found ${allSiteNames.size} unique sites to fetch data for`);
                for (const siteName of allSiteNames) {
                    const siteData = await fetchSiteData(siteName, baseUrl, csrfToken, managedTenant);
                    if (siteData) {
                        siteDataMap.set(siteName, siteData);
                    }
                }
                console.log(`[DIAGRAM] Fetched data for ${siteDataMap.size} sites`);
            }

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

            // WAF Configuration - only show if actually configured
            const wafName = lb.get_spec?.app_firewall?.name;
            let wafClass = "certValid"; // Default to valid
            let hasWAF = !!wafName;

            // Start Mermaid diagram (advanced syntax for v11.7+)
            diagram += `---\n`;
            diagram += `title: Load Balancer Service Flow - ${lb.name}\n`;
            diagram += `---\n`;
            diagram += `graph LR;\n`;

            // Check if CDN is in front of load balancer first
            let hasCDNInFront = false;
            if (cdnLoadBalancers && cdnLoadBalancers.length > 0) {
                const lbDomains = lb.get_spec?.domains || [];

                for (const cdn of cdnLoadBalancers) {
                    if (!cdn || !cdn.get_spec) continue;

                    const cdnOriginDomain = cdn.get_spec?.origin_pool?.public_name?.dns_name ||
                        cdn.get_spec?.origin_pool?.origin_servers?.[0]?.public_name?.dns_name;

                    if (cdnOriginDomain && lbDomains.includes(cdnOriginDomain)) {
                        hasCDNInFront = true;
                        break;
                    }
                }
            }

            // User and Load Balancer (skip User -> LoadBalancer if CDN is in front)
            if (!hasCDNInFront) {
                diagram += `    User --> LoadBalancer;\n`;
            }
            diagram += `    LoadBalancer["**${loadBalancerLabel}**<br>${lb.name}"];\n`;

            // Define CSS classes for styling with advanced features
            diagram += `    classDef certValid stroke:#01ba44,stroke-width:2px;\n`;
            diagram += `    classDef certWarning stroke:#DAA520,stroke-width:2px;\n`;
            diagram += `    classDef certError stroke:#FFA500,stroke-width:2px;\n`;
            diagram += `    classDef noWaf fill:#FFB347,stroke:#FFA500,stroke-width:2px;\n`;
            diagram += `    classDef animate stroke-dasharray: 9,5,stroke-dashoffset: 900,animation: dash 25s linear infinite;\n`;

            // Define route type colors (Task 3: Route type color coding)
            const routeTypeColors = {
                'default': '#808080',    // Grey
                'simple': '#6BCF7F',     // Green
                'redirect': '#7B68EE',   // Purple
                'direct_response': '#4A90E2', // Blue
                'custom': '#FFA500'      // Orange
            };

            // Create route type classes
            Object.entries(routeTypeColors).forEach(([routeType, color]) => {
                diagram += `    classDef route_${routeType} fill:${color}20,stroke:${color},stroke-width:3px;\n`;
                diagram += `    classDef routeLine_${routeType} stroke:${color},stroke-width:2px,stroke-dasharray:9 5,stroke-dashoffset:900,animation:dash 25s linear infinite;\n`;
            });

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
                    // Escape domain to prevent Mermaid from interpreting as markdown link
                    let escapedDomain = escapeForMermaid(domain);
                    const domainNode = `domain_${domainNodeID}["**Certificate**<br>${escapedDomain}<br>Status: ${certStateDisplay}<br>Exp: ${certExpiration}"]`;

                    diagram += `    LoadBalancer e${edges}@-- SNI --> ${domainNode};\n`;
                    edges++;
                    diagram += `    class domain_${domainNodeID} ${certClass};\n`;
                }
            }

            // Analyze Security Controls FIRST to set hasSecurityControls correctly
            // Build array of enabled security controls for sequential flow
            const enabledControls = [];

            // Service Policies - only show if configured
            let servicePoliciesData = null;
            if (lb.get_spec?.active_service_policies?.policies?.length > 0) {
                hasSecurityControls = true;
                servicePoliciesData = lb.get_spec.active_service_policies.policies;
                enabledControls.push({
                    id: 'sp_policies',
                    label: `**Service Policies (${lb.get_spec.active_service_policies.policies.length})**`,
                    hasPolicies: true,
                    policies: servicePoliciesData
                });
            } else if (lb.get_spec?.service_policies_from_namespace) {
                hasSecurityControls = true;
                enabledControls.push({
                    id: 'sp_policies',
                    label: '**Service Policies**<br>Namespace Policies'
                });
            }

            // IP Reputation - only show if enabled
            if (lb.get_spec?.enable_ip_reputation?.ip_threat_categories?.length > 0) {
                hasSecurityControls = true;
                const categories = lb.get_spec.enable_ip_reputation.ip_threat_categories;
                enabledControls.push({
                    id: 'ip_reputation',
                    label: `**IP Reputation**<br>Categories: ${categories.length}`
                });
            }

            // Threat Mesh - only show if enabled
            if (lb.get_spec?.threat_mesh) {
                hasSecurityControls = true;
                enabledControls.push({
                    id: 'threat_mesh',
                    label: '**Threat Mesh**<br>Enabled'
                });
            }

            // User Identifier - only show if configured
            if (lb.get_spec?.user_id_client_ip) {
                hasSecurityControls = true;
                enabledControls.push({
                    id: 'user_id',
                    label: '**User Identifier**<br>Client IP'
                });
            } else if (lb.get_spec?.user_identification) {
                hasSecurityControls = true;
                enabledControls.push({
                    id: 'user_id',
                    label: '**User Identifier**<br>Enabled'
                });
            }

            // Malicious User Detection - only show if enabled
            if (lb.get_spec?.enable_malicious_user_detection) {
                hasSecurityControls = true;
                enabledControls.push({
                    id: 'mud',
                    label: '**Malicious User Detection**<br>Enabled'
                });
            }

            // Malicious User Mitigation - only show if configured
            if (lb.get_spec?.malicious_user_mitigation &&
                !lb.get_spec.malicious_user_mitigation.disable) {
                hasSecurityControls = true;
                let mitigationType = "Enabled";
                if (lb.get_spec.malicious_user_mitigation.flag) {
                    mitigationType = "Flag";
                } else if (lb.get_spec.malicious_user_mitigation.block) {
                    mitigationType = "Block";
                }
                enabledControls.push({
                    id: 'mum',
                    label: `**Malicious User Mitigation**<br>${mitigationType}`
                });
            }

            // Rate Limiting - only show if configured (not "no rate limit")
            if (lb.get_spec?.rate_limit && !lb.get_spec.rate_limit.no_rate_limit) {
                hasSecurityControls = true;
                enabledControls.push({
                    id: 'rate_limit',
                    label: '**Rate Limiting**<br>Enabled'
                });
            }

            // Build security controls list - no internal connectors
            if (enabledControls.length > 0) {
                enabledControls.forEach((control) => {
                    // Add the main control node
                    securityControlsContent += `        ${control.id}["${control.label}"];\n`;
                    
                    // If this is service policies with individual policies, add them as a chain
                    if (control.hasPolicies && control.policies) {
                        let previousPolicyId = control.id; // Start with the main Service Policies box
                        control.policies.forEach((policy, idx) => {
                            const policyId = `sp_policy_${idx}`;
                            const policyLabel = policy.namespace === 'shared' 
                                ? `${escapeForMermaid(policy.name)}<br><i>shared</i>` 
                                : escapeForMermaid(policy.name);
                            securityControlsContent += `        ${policyId}["${policyLabel}"];\n`;
                            securityControlsContent += `        style ${policyId} fill:#f0f8ff,stroke:#4169e1,stroke-width:1px;\n`;
                            
                            // Connect to previous policy in chain (or main Service Policies box for first policy)
                            securityControlsContent += `        ${previousPolicyId} --> ${policyId};\n`;
                            previousPolicyId = policyId; // Update for next iteration
                        });
                    }
                });
            }

            // Create the security controls subgraph if there are controls to show
            if (hasSecurityControls) {
                diagram += `    subgraph CommonSecurityControls ["**Common&nbsp;Security&nbsp;Controls**"]\n`;
                diagram += `        direction TB\n`;
                diagram += securityControlsContent;
                diagram += `    end\n`;
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
                        if (hasSecurityControls) {
                            diagram += `    ${nodeID} e${edges}@--> CommonSecurityControls;\n`;
                        } else {
                            diagram += `    ${nodeID} e${edges}@--> Routes;\n`;
                        }
                        edges++;
                    });
                }
            } else if (lb.get_spec?.domains) {
                // Connect domains to appropriate next node for public LBs
                lb.get_spec.domains.forEach(domain => {
                    const domainNodeID = sanitize(domain);
                    if (hasSecurityControls) {
                        diagram += `    domain_${domainNodeID} e${edges}@--> CommonSecurityControls;\n`;
                    } else {
                        // No security controls, connect directly to Routes
                        diagram += `    domain_${domainNodeID} e${edges}@--> Routes;\n`;
                    }
                    edges++;
                });
            }


            // API Protection - only show if enabled
            let apiProtectionNode = "";
            if (lb.get_spec?.api_protection_rules) {
                apiProtectionNode = "api_protection";
                diagram += `    api_protection["**API Protection**"];\n`;
                if (hasSecurityControls) {
                    diagram += `    CommonSecurityControls e${edges}@--> api_protection;\n`;
                } else {
                    // Connect domains directly to API Protection
                    if (lb.get_spec?.domains) {
                        lb.get_spec.domains.forEach(domain => {
                            const domainNodeID = sanitize(domain);
                            diagram += `    domain_${domainNodeID} e${edges}@--> api_protection;\n`;
                            edges++;
                        });
                    }
                }
                edges++;
            }

            // Bot Defense - only show if explicitly enabled (not disabled)
            let botDefenseNode = "";
            if (lb.get_spec?.bot_defense && !lb.get_spec?.disable_bot_defense) {
                botDefenseNode = "bot_defense";
                diagram += `    ${botDefenseNode}["**Automated Fraud Protection (BOT)**"];\n`;

                if (apiProtectionNode) {
                    diagram += `    ${apiProtectionNode} e${edges}@--> ${botDefenseNode};\n`;
                } else if (hasSecurityControls) {
                    diagram += `    CommonSecurityControls e${edges}@--> ${botDefenseNode};\n`;
                } else {
                    // Connect domains directly to Bot Defense
                    if (lb.get_spec?.domains) {
                        lb.get_spec.domains.forEach(domain => {
                            const domainNodeID = sanitize(domain);
                            diagram += `    domain_${domainNodeID} e${edges}@--> ${botDefenseNode};\n`;
                            edges++;
                        });
                    }
                }
                edges++;
            }

            // WAF Processing - only show if configured
            let wafNode = "";
            if (hasWAF) {
                const wafNodeID = sanitize(wafName);
                wafNode = `waf_${wafNodeID}`;
                diagram += `    ${wafNode}["**WAAP**<br>${wafName}"];\n`;

                if (botDefenseNode) {
                    diagram += `    ${botDefenseNode} e${edges}@--> ${wafNode};\n`;
                } else if (apiProtectionNode) {
                    diagram += `    ${apiProtectionNode} e${edges}@--> ${wafNode};\n`;
                } else if (hasSecurityControls) {
                    diagram += `    CommonSecurityControls e${edges}@--> ${wafNode};\n`;
                } else {
                    // Connect domains directly to WAF
                    if (lb.get_spec?.domains) {
                        lb.get_spec.domains.forEach(domain => {
                            const domainNodeID = sanitize(domain);
                            diagram += `    domain_${domainNodeID} e${edges}@--> ${wafNode};\n`;
                            edges++;
                        });
                    }
                }
                edges++;

                diagram += `    class ${wafNodeID} ${wafClass};\n`;
            }

            // Connect to Routes
            let routesSourceNode;
            if (hasWAF) {
                routesSourceNode = wafNode;
            } else if (botDefenseNode) {
                routesSourceNode = botDefenseNode;
            } else if (apiProtectionNode) {
                routesSourceNode = apiProtectionNode;
            } else if (hasSecurityControls) {
                routesSourceNode = "CommonSecurityControls";
            } else {
                // If no security features, connect from domains to Routes
                routesSourceNode = "Domains";
            }

            diagram += `    ${routesSourceNode} e${edges}@--> Routes;\n`;
            edges++;

            diagram += `    Routes["**Routes**"];\n`;

            // Track processed pools to avoid duplicate node generation (for both default and regular routes)
            const processedPools = new Set();

            // Default Route
            if (lb.get_spec?.default_route_pools?.length > 0) {
                diagram += `    DefaultRoute["**Default Route**"];\n`;
                diagram += `    Routes e${edges}@--> DefaultRoute;\n`;
                edges++;

                for (const pool of lb.get_spec.default_route_pools) {
                    const poolID = `pool_${sanitize(pool.pool.name)}`;

                    // Find matching origin pool data
                    const originPoolData = originPoolsData.find(p => p.name === pool.pool.name);
                    console.log(` [DIAGRAM] Looking for pool '${pool.pool.name}' in fetched data:`, !!originPoolData);
                    let poolLabel = `**Pool**<br>${pool.pool.name}`;

                    if (originPoolData) {
                        console.log(` [DIAGRAM] Found origin pool data for '${pool.pool.name}':`, originPoolData);
                        const serverCount = originPoolData.get_spec?.origin_servers?.length || 0;
                        const algorithm = originPoolData.get_spec?.loadbalancer_algorithm || 'round_robin';
                        poolLabel += `<br>Nodes: ${serverCount}<br>Algorithm: ${algorithm}`;

                        // Add additional pool info if available
                        if (originPoolData.get_spec?.port) {
                            poolLabel += `<br>Port: ${originPoolData.get_spec.port}`;
                        }
                        if (originPoolData.get_spec?.endpoint_selection === 'DISTRIBUTED') {
                            poolLabel += `<br>Distributed`;
                        }
                    } else {
                        console.warn(` [DIAGRAM] No origin pool data found for '${pool.pool.name}'`);
                    }

                    diagram += `    DefaultRoute --> ${poolID}["${poolLabel}"];\n`;

                    // Add origin servers if available and not already processed (Fix: Single Pool→Node connections for default routes)
                    if (originPoolData?.get_spec?.origin_servers?.length > 0 && !processedPools.has(pool.pool.name)) {
                        console.log(`[DIAGRAM] Adding ${originPoolData.get_spec.origin_servers.length} servers for default route pool '${pool.pool.name}'`);
                        diagram += generateOriginServerNodes(originPoolData, poolID, siteDataMap);
                        processedPools.add(pool.pool.name); // Mark as processed
                    } else if (processedPools.has(pool.pool.name)) {
                        console.log(`[DIAGRAM] Skipping already processed default route pool '${pool.pool.name}'`);
                    } else {
                        console.log(`[DIAGRAM] No origin servers to add for default route pool '${pool.pool.name}'`);
                    }
                }
            }

            // Process Routes
            if (lb.get_spec?.routes) {
                lb.get_spec.routes.forEach((route, i) => {
                    // Determine route type for coloring (Task 3: Route type color coding)
                    let routeType = 'default';
                    if (route.simple_route) {
                        routeType = 'simple';
                    } else if (route.redirect_route) {
                        routeType = 'redirect';
                    } else if (route.direct_response_route) {
                        routeType = 'direct_response';
                    } else {
                        routeType = 'custom';
                    }
                    if (route.simple_route) {
                        const matchConditions = [`**Route ${i + 1}**`];

                        if (route.simple_route.path?.prefix) {
                            matchConditions.push(`Path Match: ${route.simple_route.path.prefix}`);
                        } else if (route.simple_route.path?.regex) {
                            matchConditions.push(`Path Regex: ${route.simple_route.path.regex}`);
                        }

                        route.simple_route.headers?.forEach(header => {
                            if (header.regex) {
                                matchConditions.push(`Header Regex: ${header.name} ~ ${header.regex}`);
                            }
                            else if (header.exact) {
                                matchConditions.push(`Header Exact: ${header.name} = ${header.exact}`);
                            } else {
                                matchConditions.push(`Header Match: ${header.name}`);
                            }
                        });

                        const nodeID = `route_${i}`;
                        const matchLabel = matchConditions.join(" <BR> ");
                        diagram += `    ${nodeID}["${matchLabel}"];\n`;
                        diagram += `    class ${nodeID} route_${routeType};\n`;
                        const routeEdgeId = `re${edges}`;
                        diagram += `    Routes ${routeEdgeId}@--> ${nodeID};\n`;
                        diagram += `    class ${routeEdgeId} routeLine_${routeType};\n`;
                        edges++;

                        // Route-specific WAF
                        const routeWAF = route.simple_route.advanced_options?.app_firewall?.name;
                        if (routeWAF) {
                            const routeWafNodeID = `waf_${sanitize(routeWAF)}`;
                            if (!wafAdded.has(routeWafNodeID)) {
                                diagram += `    ${routeWafNodeID}["**WAAP Override**<br>${routeWAF}"];\n`;
                                wafAdded.set(routeWafNodeID, true);
                            }
                            const wafEdgeId = `we${edges}`;
                            diagram += `    ${nodeID} ${wafEdgeId}@--> ${routeWafNodeID};\n`;
                            diagram += `    class ${wafEdgeId} routeLine_${routeType};\n`;
                            edges++;
                        }

                        // Origin Pools
                        route.simple_route.origin_pools?.forEach(pool => {
                            const poolIDName = `pool_${sanitize(pool.pool.name)}`;

                            // Find matching origin pool data
                            const originPoolData = originPoolsData.find(p => p.name === pool.pool.name);
                            console.log(` [DIAGRAM] Route pool '${pool.pool.name}' lookup:`, !!originPoolData);
                            let poolLabel = `**Pool**<br>${pool.pool.name}`;

                            if (originPoolData) {
                                console.log(` [DIAGRAM] Found route pool data for '${pool.pool.name}':`, originPoolData);
                                const serverCount = originPoolData.get_spec?.origin_servers?.length || 0;
                                const algorithm = originPoolData.get_spec?.loadbalancer_algorithm || 'round_robin';
                                poolLabel += `<br>Nodes: ${serverCount}<br>Algorithm: ${algorithm}`;

                                // Add additional pool info if available
                                if (originPoolData.get_spec?.port) {
                                    poolLabel += `<br>Port: ${originPoolData.get_spec.port}`;
                                }
                                if (originPoolData.get_spec?.endpoint_selection === 'DISTRIBUTED') {
                                    poolLabel += `<br>Distributed`;
                                }
                            } else {
                                console.warn(` [DIAGRAM] No route pool data found for '${pool.pool.name}'`);
                            }

                            const poolID = `${poolIDName}["${poolLabel}"]`;

                            if (routeWAF) {
                                const routeWafNodeID = `waf_${sanitize(routeWAF)}`;
                                const poolEdgeId = `pe${edges}`;
                                diagram += `    ${routeWafNodeID} ${poolEdgeId}@--> ${poolID};\n`;
                                diagram += `    class ${poolEdgeId} routeLine_${routeType};\n`;
                                edges++;
                            } else {
                                const poolEdgeId = `pe${edges}`;
                                diagram += `    ${nodeID} ${poolEdgeId}@--> ${poolID};\n`;
                                diagram += `    class ${poolEdgeId} routeLine_${routeType};\n`;
                                edges++;
                            }

                            // Add origin servers if available and not already processed (Fix: Single Pool→Node connections)
                            if (originPoolData?.get_spec?.origin_servers?.length > 0 && !processedPools.has(pool.pool.name)) {
                                console.log(`[DIAGRAM] Adding ${originPoolData.get_spec.origin_servers.length} servers for route pool '${pool.pool.name}'`);
                                diagram += generateOriginServerNodes(originPoolData, poolIDName, siteDataMap, routeType, edges);
                                edges += originPoolData.get_spec.origin_servers.length;
                                processedPools.add(pool.pool.name); // Mark as processed
                            } else if (processedPools.has(pool.pool.name)) {
                                console.log(`[DIAGRAM] Skipping already processed pool '${pool.pool.name}'`);
                            } else {
                                console.log(`[DIAGRAM] No origin servers to add for route pool '${pool.pool.name}'`);
                            }
                        });

                    } else if (route.redirect_route) {
                        const nodeID = `redirect_${i}`;
                        const matchConditionsRedirect = [];
                        const redirectTarget = `${route.redirect_route.route_redirect.host_redirect}${route.redirect_route.route_redirect.path_redirect || ''}`;
                        
                        // Escape the redirect target to prevent Mermaid from interpreting as markdown link
                        let escapedRedirectTarget = escapeForMermaid(redirectTarget);

                        route.redirect_route.headers?.forEach(header => {
                            if (header.regex) {
                                matchConditionsRedirect.push(`Header Regex: ${header.name} ~ ${header.regex}`);
                            } else if (header.exact) {
                                matchConditionsRedirect.push(`Header Exact: ${header.name} = ${header.exact}`);
                            } else {
                                matchConditionsRedirect.push(`Header Match: ${header.name}`);
                            }
                        });
                        const pathDisplay = (route.redirect_route.path?.prefix || route.redirect_route.path?.path) ? `Path: ${route.redirect_route.path?.prefix || route.redirect_route.path?.path}<br>` : '';
                        diagram += `    ${nodeID}["**Redirect Route ${i + 1}**<br>${pathDisplay}${matchConditionsRedirect}"];\n`;
                        diagram += `    class ${nodeID} route_${routeType};\n`;
                        const redirectEdgeId = `rde${edges}`;
                        diagram += `    Routes ${redirectEdgeId}@--> ${nodeID};\n`;
                        diagram += `    class ${redirectEdgeId} routeLine_${routeType};\n`;
                        edges++;
                        const targetEdgeId = `te${edges}`;
                        diagram += `    ${nodeID} ${targetEdgeId}@-->|Redirects to| redirect_target_${i}["${escapedRedirectTarget}"];\n`;
                        diagram += `    class ${targetEdgeId} routeLine_${routeType};\n`;
                        edges++;
                    } else if (route.direct_response_route) {
                        const nodeID = `direct_response_${i}`;
                        const pathDisplay = route.direct_response_route.path?.prefix ? `Path: ${route.direct_response_route.path.prefix}<br>` : '';
                        const responseInfo = `Response Code: ${route.direct_response_route.route_direct_response.response_code}<br>Body: ${route.direct_response_route.route_direct_response.response_body || 'Empty'}`;
                        
                        diagram += `    ${nodeID}["**Direct Response ${i + 1}**<br>${pathDisplay}${responseInfo}"];\n`;
                        diagram += `    class ${nodeID} route_${routeType};\n`;
                        const directEdgeId = `dre${edges}`;
                        diagram += `    Routes ${directEdgeId}@--> ${nodeID};\n`;
                        diagram += `    class ${directEdgeId} routeLine_${routeType};\n`;
                        edges++;
                    } else if (route.custom_route_object) {
                        const nodeID = `custom_route_${i}`;
                        const routeRef = route.custom_route_object.route_ref;
                        let customRouteLabel = `**Custom Route ${i + 1}**`;
                        if (routeRef) {
                            customRouteLabel += `<br>Reference: ${routeRef.name || 'Unknown'}`;
                            if (routeRef.namespace) {
                                customRouteLabel += `<br>Namespace: ${routeRef.namespace}`;
                            }
                        }
                        
                        diagram += `    ${nodeID}["${customRouteLabel}"];\n`;
                        diagram += `    class ${nodeID} route_${routeType};\n`;
                        const customEdgeId = `cre${edges}`;
                        diagram += `    Routes ${customEdgeId}@--> ${nodeID};\n`;
                        diagram += `    class ${customEdgeId} routeLine_${routeType};\n`;
                        edges++;
                    } else {
                        // Handle any other unknown route types
                        const nodeID = `unknown_route_${i}`;
                        diagram += `    ${nodeID}["**Unknown Route ${i + 1}**"];\n`;
                        diagram += `    class ${nodeID} route_default;\n`;
                        const unknownEdgeId = `ure${edges}`;
                        diagram += `    Routes ${unknownEdgeId}@--> ${nodeID};\n`;
                        diagram += `    class ${unknownEdgeId} routeLine_default;\n`;
                        edges++;
                    }
                });
            }

            // CDN Flow Rendering (disconnected from main flow)
            if (cdnLoadBalancers && cdnLoadBalancers.length > 0) {
                console.log(`[DIAGRAM] Processing ${cdnLoadBalancers.length} CDN load balancers`);

                try {
                    // Check for CDN in front of load balancer
                    const lbDomains = lb.get_spec?.domains || [];

                    cdnLoadBalancers.forEach((cdn, cdnIndex) => {
                        if (!cdn || !cdn.get_spec) return; // Skip invalid CDN configs

                        const cdnOriginDomain = cdn.get_spec?.origin_pool?.public_name?.dns_name ||
                            cdn.get_spec?.origin_pool?.origin_servers?.[0]?.public_name?.dns_name;

                        // Check if this CDN points to our load balancer
                        const isCDNInFront = cdnOriginDomain && lbDomains.includes(cdnOriginDomain);

                        if (isCDNInFront) {
                            // CDN in front of load balancer flow
                            const cdnNodeId = `cdn_front_${sanitize(cdn.name)}`;
                            const cdnDomains = cdn.get_spec?.domains || [];
                            // Escape domain names to prevent Mermaid syntax errors and URL encoding issues
                            const escapedDomains = cdnDomains.map(d => escapeForMermaid(d ? d.replace(/[<>\"'&%]/g, '') : '')).join(', ');
                            const escapedCDNName = cdn.name ? cdn.name.replace(/[<>\"'&%]/g, '') : 'Unknown CDN';

                            diagram += `\n    %% CDN in front of Load Balancer\n`;
                            diagram += `    User --> ${cdnNodeId};\n`;
                            diagram += `    ${cdnNodeId}["**CDN: ${escapedCDNName}**<br>Domains: ${escapedDomains}<br>Cache TTL: ${cdn.get_spec?.default_cache_action?.cache_ttl_default || 'default'}"];\n`;

                            // Show cache rules if present, then connect directly to LoadBalancer
                            if (cdn.get_spec?.cache_rules?.length > 0) {
                                const cacheRuleId = `cache_rules_${cdnIndex}`;
                                diagram += `    ${cdnNodeId} --> ${cacheRuleId}["**Cache Rules**<br>${cdn.get_spec.cache_rules.length} rules configured"];\n`;
                                diagram += `    ${cacheRuleId} --> LoadBalancer;\n`;
                            } else {
                                diagram += `    ${cdnNodeId} --> LoadBalancer;\n`;
                            }

                            diagram += `    style ${cdnNodeId} fill:#FFE4B5,stroke:#FF8C00,stroke-width:2px;\n`;
                        }
                    });

                } catch (cdnError) {
                    console.error('[DIAGRAM] Error rendering CDN flows:', cdnError);
                    // Continue with diagram generation even if CDN rendering fails
                }
            }

            // Apply animation to all regular edges (restored for Mermaid v11.7+)
            for (let edge = 0; edge < edges; edge++) {
                diagram += `    class e${edge} animate;\n`;
            }


            resolve(diagram);
        } catch (error) {
            console.error("Advanced diagram generation error:", error);
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
                console.log("Captured CSRF Token via Debugger:", csrfToken);
                chrome.storage.local.set({ csrf_token: csrfToken });
            }
        }
    }
});

// Attach debugger when extension is activated
chrome.action.onClicked.addListener(() => {
    attachDebugger();
});