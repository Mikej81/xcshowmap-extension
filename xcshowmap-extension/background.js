chrome.runtime.onInstalled.addListener(() => {
    console.log("✅ Extension Installed: xcshowmap is ready!");
});

let capturedUrls = []; // Store captured URLs

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
        if (details.url) {
            console.log("🌐 Captured URL:", details.url);

            // Prevent duplicates
            if (!capturedUrls.includes(details.url)) {
                capturedUrls.push(details.url);
                chrome.storage.local.set({ urls: capturedUrls });

                // Extract CSRF token if it exists in the URL
                if (details.url.includes("csrf=")) {
                    const urlParams = new URLSearchParams(new URL(details.url).search);
                    const csrfToken = urlParams.get("csrf");

                    if (csrfToken) {
                        console.log("🔑 Extracted CSRF Token:", csrfToken);

                        // Store CSRF token
                        chrome.storage.local.set({ csrf_token: csrfToken }, () => {
                            console.log("✅ CSRF Token Stored Successfully:", csrfToken);
                        });
                    } else {
                        console.warn("⚠️ CSRF token detected but not extracted.");
                    }
                }
            }
        }
    },
    { urls: ["<all_urls>"] }
);

// Listener for retrieving stored URLs
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    if (message.action === "getCapturedUrls") {
        chrome.storage.local.get("urls", (data) => {
            console.log("📨 Sending captured URLs:", data.urls);
            sendResponse({ urls: data.urls || [] });
        });
        return true; // Keeps the response channel open for async sendResponse
    }

    if (message.action === "getCsrfToken") {
        chrome.storage.local.get("csrf_token", (data) => {
            console.log("📨 Sending CSRF Token:", data.csrf_token);
            sendResponse({ csrfToken: data.csrf_token || null });
        });
        return true; // Keeps the response channel open for async sendResponse
    }

    if (message.type === "getLoadBalancers") {
        chrome.storage.local.get("loadBalancers", (data) => {
            console.log("📨 Sending Load Balancers:", data.loadBalancers);
            sendResponse({ loadBalancers: data.loadBalancers || [] });
        });
        return true; // Keeps the response channel open for async sendResponse
    }

    if (message.type === "generateMermaid") {
        const lbObject = message.loadBalancer;

        if (!lbObject) {
            console.error("❌ Load Balancer data is missing.");
            return;
        }

        console.log("📊 Processing Load Balancer:", lbObject.name);
        console.log("🔍 Raw Load Balancer JSON Data:", lbObject);

        try {
            const lb = new APIResponse(lbObject);

            let mermaidDiagram = `graph LR;\n`;

            // 🔹 Connect the User to each Domain
            lb.domains.forEach(domain => {
                mermaidDiagram += `  User --> ${domain};\n`;
            });

            // 🔹 Connect Domains to ServicePolicies
            const servicePolicyBox = lb.activeServicePolicies.length > 0
                ? `"**Service Policies**<br>${lb.activeServicePolicies.map(policy => policy.name).join("<br>")}"`
                : `"**Service Policies**<br>None Configured"`;

            // // 🔹 Connect Domains to Service Policies
            lb.domains.forEach(domain => {
                mermaidDiagram += `  ${domain} --> ServicePolicies[${servicePolicyBox}];\n`;
            });

            // 🔹 Add a WAF box if configured
            if (lb.appFirewall) {
                const wafBox = `"**WAF**<br>${lb.appFirewall}"`;
                mermaidDiagram += `  ServicePolicies --> WAF[${wafBox}];\n`;
                mermaidDiagram += `  WAF --> Routes;\n`;  // WAF sits between ServicePolicies and Routes
            } else {
                mermaidDiagram += `  ServicePolicies --> Routes;\n`; // No WAF, ServicePolicies links directly to Routes
            }

            // 🔹 Create a Routes box
            mermaidDiagram += `  Routes["**Routes**"];\n`;

            // 🔹 Process Default Route Pool (if exists)
            if (lb.defaultRoutePools.length > 0) {
                mermaidDiagram += `  Routes --> DefaultRoute["**Default Route Pool**"];\n`;
                lb.defaultRoutePools.forEach(pool => {
                    mermaidDiagram += `  DefaultRoute --> Pool["${pool.name}"];`; // ✅ Fixed by accessing `name`
                });
            }

            // 🔹 Process Individual Routes
            lb.routes.forEach((route, index) => {
                const routeLabel = route.type === "redirect" ? `RedirectRoute${index + 1}` : `Route${index + 1}`;

                // 🔹 Extract Path and Headers
                const path = route.path || "/";
                const headers = route.headers?.map(header => `${header.name}=${header.value}`).join("<br>") || "None";

                // 🔹 Construct Route Box with Path and Headers
                const routeBox = route.type === "redirect"
                    ? `"**Redirect Route**<br>Path: ${path}<br>Header: ${headers}"`
                    : `"**Route**<br>Path: ${path}<br>Header: ${headers}"`;

                mermaidDiagram += `  Routes --> ${routeLabel}[${routeBox}];\n`;

                // 🔹 Handle Simple Routes
                if (route.type === "simple") {
                    route.originPools.forEach(pool => {
                        mermaidDiagram += `  ${routeLabel} --> Pool["${pool}"];\n`;
                    });
                }

                // 🔹 Handle Redirect Routes
                else if (route.type === "redirect") {
                    mermaidDiagram += `  ${routeLabel} -->|Redirects to| Redirect["${route.hostRedirect}${route.pathRedirect}"];`;
                }

                // 🔹 Handle Direct Response Routes
                else if (route.type === "direct_response") {
                    const escapedResponse = route.responseBody.replace(/"/g, "'"); // Replace quotes
                    mermaidDiagram += `  ${routeLabel} -->|Returns ${route.responseCode}| Response["${escapedResponse}"];`;
                }
            });

            console.log("🖼️ **Generated Mermaid Diagram:**\n", mermaidDiagram);

            // ✅ Encode the diagram and open a new tab
            const encodedDiagram = encodeURIComponent(mermaidDiagram);
            const diagramUrl = `chrome-extension://${chrome.runtime.id}/mermaid.html?diagram=${encodedDiagram}`;

            chrome.tabs.create({ url: diagramUrl });

            sendResponse({ mermaidDiagram });
        } catch (error) {
            console.error("❌ Error in generating Mermaid Diagram:", error);
        }
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


// Enhanced diagram generation
function generateMermaidDiagram(lb) {
    try {
        let diagram = `graph LR;\n`;
        const sanitize = (str) => str.replace(/[^a-zA-Z0-9]/g, '_');

        // User to Domains
        lb.domains.forEach(domain => {
            const safeDomain = sanitize(domain);
            diagram += `  User --> ${safeDomain}["${domain}"];\n`;
        });

        // Service Policies
        const policyBox = lb.activeServicePolicies.length > 0
            ? `"**Service Policies**<br>${lb.activeServicePolicies.map(p => p.name).join("<br>")}"`
            : `"**Service Policies**<br>None"`;
        lb.domains.forEach(domain => {
            const safeDomain = sanitize(domain);
            diagram += `  ${safeDomain} --> ServicePolicies[${policyBox}];\n`;
        });

        // WAF and Routes
        if (lb.appFirewall) {
            diagram += `  ServicePolicies --> WAF["**WAF**<br>${lb.appFirewall}"];\n`;
            diagram += `  WAF --> Routes;\n`;
        } else {
            diagram += `  ServicePolicies --> Routes;\n`;
        }
        diagram += `  Routes["**Routes**"];\n`;

        // Default Route Pool
        if (lb.defaultRoutePools.length) {
            diagram += `  Routes --> DefaultRoute["**Default Route Pool**"];\n`;
            lb.defaultRoutePools.forEach(pool => {
                const safePoolName = sanitize(pool.name);
                diagram += `  DefaultRoute --> ${safePoolName}["${pool.name}"];\n`;
            });
        }

        // Routes
        const processedPools = new Set();
        lb.routes.forEach((route, i) => {
            const routeId = `Route_${i + 1}`;
            const label = route.type === "redirect" ? `RedirectRoute_${i + 1}` : routeId;
            const box = route.type === "redirect"
                ? `"**Redirect Route**<br>${route.path}"`
                : `"**Route**<br>${route.path}"`;
            diagram += `  Routes --> ${label}[${box}];\n`;

            if (route.type === "simple") {
                route.originPools.forEach(pool => {
                    const safePoolName = sanitize(pool);
                    if (!processedPools.has(pool)) {
                        processedPools.add(pool);
                        diagram += `  ${label} --> ${safePoolName}["${pool}"];\n`;
                    }
                });
            } else if (route.type === "redirect") {
                const target = `${route.hostRedirect}${route.pathRedirect}`;
                diagram += `  ${label} --> Redirect_${i}["${target}"];\n`;
            } else if (route.type === "direct_response") {
                const response = route.responseBody.replace(/"/g, "'");
                diagram += `  ${label} -->|${route.responseCode}| Response_${i}["${response}"];\n`;
            }
        });

        return diagram;
    } catch (error) {
        console.error("❌ Diagram generation error:", error);
        throw new Error(`Failed to generate diagram: ${error.message}`);
    }
}

// Enhanced Mermaid generation handler
async function handleMermaidGeneration(message, sendResponse) {
    try {
        console.log("🎨 Generating Mermaid diagram...");
        const lb = new APIResponse(message.loadBalancer);
        const diagram = generateMermaidDiagram(lb);
        if (!diagram) {
            throw new Error("Failed to generate diagram content");
        }
        const url = `chrome-extension://${chrome.runtime.id}/mermaid.html?diagram=${encodeURIComponent(diagram)}`;
        chrome.tabs.create({ url }, (tab) => {
            if (chrome.runtime.lastError) {
                console.error("❌ Error creating tab for diagram:", chrome.runtime.lastError.message);
            }
        });
        console.log("✅ Diagram generated successfully");
        sendResponse({
            success: true,
            mermaidDiagram: diagram
        });
    } catch (error) {
        console.error("❌ Mermaid generation error:", error);
        sendResponse({
            success: false,
            error: error.message
        });
    }
}


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