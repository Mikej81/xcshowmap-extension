document.addEventListener("DOMContentLoaded", () => {

    const loadBalancerSelect = document.getElementById("loadBalancerSelect");
    const generateButton = document.getElementById("generateBtn");
    let loadBalancers = {};

    generateButton.disabled = true;
    generateButton.style.backgroundColor = "#ccc";

    // Refresh popup when the active tab changes
    chrome.tabs.onActivated.addListener(() => {
        console.log("🔄 Active tab changed, refreshing popup...");
        location.reload();
    });

    chrome.runtime.sendMessage({ type: "getLoadBalancers" }, (response) => {
        if (chrome.runtime.lastError) {
            showErrorNotification("Runtime Error: ${ chrome.runtime.lastError.message }");
            return;
        }

        if (!response?.loadBalancers?.length) {
            showErrorNotification('No load balancers found. Refresh the page or check access.');
            return;
        }

        console.log("📨 Load Balancers Received:", response.loadBalancers);

        response.loadBalancers.forEach(lb => {
            loadBalancers[lb.name] = lb;
        });

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

        console.log("✅ Load Balancers Populated in Dropdown.");
    });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id;
        chrome.runtime.sendMessage({ action: "getCsrfToken", tabId }, (response) => {
            console.log("🔑 CSRF Token for Active Tab:", response.csrfToken);
        });

        chrome.runtime.sendMessage({ action: "getNamespace", tabId }, (response) => {
            console.log("📌 Namespace for Active Tab:", response.namespace);
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

});

chrome.tabs.onActivated.addListener(() => {
    console.log("🔄 Active tab changed, reloading popup...");
    location.reload();
});

// Error notification function
function showErrorNotification(message) {
    alert("❌ ${ message }");
}