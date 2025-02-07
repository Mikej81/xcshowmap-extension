document.addEventListener("DOMContentLoaded", function () {
    console.log("xcshowmap extension running on", window.location.href);

    // Store the load balancer JSON data
    let jsonData = null;
    let tableData = [];

    // Parse JSON data from the page
    let preElements = document.querySelectorAll("pre, script[type='application/json']");
    preElements.forEach((element) => {
        try {
            let parsedData = JSON.parse(element.textContent);
            if (parsedData.items) {
                jsonData = parsedData;
                tableData = parsedData.items;
                console.log("Extracted API Data:", tableData);
            }
        } catch (e) {
            console.debug("Skipping non-JSON element");
        }
    });

    // Listen for messages from the context menu
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === "generateDiagram") {
            const selectedName = message.selectionText;
            const matchingLB = tableData.find(item => item.name === selectedName);

            if (matchingLB) {
                console.log("Generating diagram for:", matchingLB);
                const mermaidCode = generateMermaid(matchingLB);
                displayDiagram(mermaidCode);
            } else {
                console.error("No matching load balancer found for:", selectedName);
            }
        }
    });

    function generateMermaid(lbObject) {
        let mermaidDiagram = "graph LR;\n";
        mermaidDiagram += `  User -->|SNI| LoadBalancer;\n`;

        lbObject.get_spec.default_route_pools.forEach(pool => {
            const poolName = pool.pool.name;
            mermaidDiagram += `  LoadBalancer -->|Route Pool| ${poolName};\n`;
        });

        return mermaidDiagram;
    }

    function displayDiagram(mermaidCode) {
        const diagramContainer = document.createElement("div");
        diagramContainer.id = "xcshowmap-diagram";
        diagramContainer.style.position = "fixed";
        diagramContainer.style.top = "10px";
        diagramContainer.style.right = "10px";
        diagramContainer.style.backgroundColor = "white";
        diagramContainer.style.padding = "20px";
        diagramContainer.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.1)";
        diagramContainer.innerHTML = `<pre class="mermaid">${mermaidCode}</pre>`;
        document.body.appendChild(diagramContainer);

        // Render the Mermaid diagram
        mermaid.init(undefined, diagramContainer);
    }
});
