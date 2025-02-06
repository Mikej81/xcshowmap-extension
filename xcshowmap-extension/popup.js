document.addEventListener("DOMContentLoaded", function () {
    const diagramContainer = document.getElementById("diagram");

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === "apiData") {
            console.log("Received API Data:", message.data);
            const mermaidCode = generateMermaid(message.data);
            diagramContainer.innerHTML = `<pre class="mermaid">${mermaidCode}</pre>`;
            mermaid.init(undefined, diagramContainer);
        }
    });

    function generateMermaid(data) {
        let mermaidDiagram = "graph LR;\n";
        mermaidDiagram += `  User -->|SNI| LoadBalancer;\n`;

        data.items.forEach(item => {
            const lbName = item.name;
            mermaidDiagram += `  LoadBalancer -->|${lbName}| ${lbName}_Routes;\n`;

            item.get_spec.default_route_pools.forEach(pool => {
                const poolName = pool.pool.name;
                mermaidDiagram += `  ${lbName}_Routes -->|Origin Pool| ${poolName};\n`;
            });
        });

        return mermaidDiagram;
    }
});
