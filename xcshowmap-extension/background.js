chrome.runtime.onInstalled.addListener(() => {
    console.log("✅ Extension Installed: xcshowmap is ready!");
});

let capturedUrls = []; // Store captured URLs

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
        const lbData = message.loadBalancer;

        console.log("📊 Processing Load Balancer Data for Mermaid:", lbData);

        // Extract necessary information
        const lbName = lbData.metadata.name;
        const domains = lbData.get_spec.domains || [];
        const servicePolicy = "ServicePolicy"; // Placeholder, adjust as needed
        const routes = lbData.get_spec.routes || [];
        const defaultRoutePools = lbData.get_spec.default_route_pools || [];

        // Start building the Mermaid diagram flow
        let mermaidDiagram = `graph LR;\n`;
        mermaidDiagram += `  User -->|Traffic| ${lbName};\n`;

        // Connect Load Balancer to Domains
        domains.forEach(domain => {
            mermaidDiagram += `  ${lbName} -->|Hosts| ${domain};\n`;
        });

        // Connect Domains to Service Policy (placeholder for now)
        domains.forEach(domain => {
            mermaidDiagram += `  ${domain} -->|Evaluates| ${servicePolicy};\n`;
        });

        // Connect Service Policy to Routes
        routes.forEach((route, index) => {
            const routeName = `Route${index + 1}`;
            mermaidDiagram += `  ${servicePolicy} -->|Matches| ${routeName};\n`;

            // Connect Routes to Origin Pools
            if (route.simple_route && route.simple_route.origin_pools) {
                route.simple_route.origin_pools.forEach((pool, poolIndex) => {
                    const originPoolName = pool.pool.name;
                    mermaidDiagram += `  ${routeName} -->|Forwards| ${originPoolName};\n`;
                });
            }
        });

        // If no explicit routes, connect Service Policy to Default Route
        if (routes.length === 0 && defaultRoutePools.length > 0) {
            mermaidDiagram += `  ${servicePolicy} -->|Default Route| DefaultRoute;\n`;
            defaultRoutePools.forEach((pool, poolIndex) => {
                const originPoolName = pool.pool.name;
                mermaidDiagram += `  DefaultRoute -->|Forwards| ${originPoolName};\n`;
            });
        }

        console.log("🖼️ Generated Mermaid Diagram:\n", mermaidDiagram);

        // Send the diagram back to the popup or content script
        sendResponse({ mermaidDiagram });
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

// Helper function for Mermaid generation
async function handleMermaidGeneration(message, sendResponse) {
    try {
        if (!message.loadBalancer) {
            throw new Error("Load Balancer data is missing");
        }

        const lb = new APIResponse(message.loadBalancer);
        const mermaidDiagram = generateMermaidDiagram(lb);

        // Create new tab with diagram
        const encodedDiagram = encodeURIComponent(mermaidDiagram);
        const diagramUrl = `chrome-extension://${chrome.runtime.id}/mermaid.html?diagram=${encodedDiagram}`;
        await chrome.tabs.create({ url: diagramUrl });

        sendResponse({ mermaidDiagram });
    } catch (error) {
        console.error("❌ Error generating diagram:", error);
        sendResponse({ error: error.message });
    }
}

// Helper function for generating Mermaid diagram
function generateMermaidDiagram(lb) {
    // ... Your existing Mermaid diagram generation logic ...
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