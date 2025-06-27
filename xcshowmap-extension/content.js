chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "refreshData") {
        console.log("🔄 Received refresh request, reloading data...");
        fetchLoadBalancers();
    }
});

chrome.runtime.sendMessage({ action: "getCsrfToken" }, async (response) => {
    const csrfToken = response?.csrfToken;
    console.log("🔑 CSRF Token Retrieved for Current Tab:", csrfToken);

    chrome.runtime.sendMessage({ action: "getNamespace" }, async (namespaceResponse) => {
        const namespace = namespaceResponse?.namespace;
        console.log("📌 Extracted Namespace for Current Tab:", namespace);

        if (!csrfToken || !namespace) {
            console.error("❌ Missing CSRF Token or Namespace.");
            return;
        }

        const apiUrl = `${window.location.origin}/api/config/namespaces/${namespace}/http_loadbalancers?report_fields&csrf=${csrfToken}`;
        console.log("🌐 Fetching Load Balancers from:", apiUrl);

        try {
            const apiResponse = await fetch(apiUrl, {
                credentials: "include",
            });

            if (!apiResponse.ok) {
                chrome.runtime.sendMessage({
                    type: 'errorNotification',
                    message: `API fetch failed: ${apiResponse.status}`
                });
                return;
            }

            const data = await apiResponse.json();
            console.log("✅ API Response:", data);

            // Store load balancers in tab-specific storage
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const tabId = tabs[0]?.id;
                if (tabId) {
                    chrome.storage.local.set({ [`loadBalancers_${tabId}`]: data.items }, () => {
                        console.log("✅ Stored Load Balancers for tab", tabId, ":", data.items);
                    });
                }
            });

        } catch (error) {
            console.error("❌ API Fetch Error:", error);
        }
    });
});


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

        console.log("📌 Extracted Namespace:", namespace);
        console.log("📌 Extracted Managed Tenant:", managedTenant);

        if (!csrfToken || !namespace) {
            console.error("❌ Missing CSRF Token or Namespace.");
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

            // ✅ Store load balancers in tab-specific storage
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const tabId = tabs[0]?.id;
                if (tabId) {
                    chrome.storage.local.set({ [`loadBalancers_${tabId}`]: data.items }, () => {
                        console.log("✅ Stored Load Balancers for tab", tabId, ":", data.items);
                    });
                }
            });

        } catch (error) {
            console.error("❌ API Fetch Error:", error);
        }
    });
}

// 🟢 Initial Fetch on Page Load
fetchLoadBalancers();

// 🟢 Detect Navigation Changes (Works for Single Page Apps)
// let lastUrl = window.location.href;
// setInterval(() => {
//     if (window.location.href !== lastUrl) {
//         console.log("🔄 Detected Navigation Change, Refreshing Data...");
//         lastUrl = window.location.href;
//         fetchLoadBalancers();
//     }
// }, 1000);