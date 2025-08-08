document.addEventListener("DOMContentLoaded", function () {
    const urlParams = new URLSearchParams(window.location.search);
    const diagramCode = urlParams.get("diagram");

    if (diagramCode) {
        const decodedCode = decodeURIComponent(diagramCode);
        document.getElementById("diagram").textContent = decodedCode;
        document.getElementById("rawMermaidCode").textContent = decodedCode;

        mermaid.initialize({ startOnLoad: true });
        mermaid.init(undefined, document.querySelector("#diagram"));
    } else {
        document.getElementById("diagram").textContent = "❌ No diagram data provided!";
        document.getElementById("rawMermaidCode").textContent = "❌ No diagram data provided!";
    }

    document.getElementById("copyMermaid").addEventListener("click", () => {
        navigator.clipboard.writeText(document.getElementById("rawMermaidCode").textContent)
            .then(() => alert("✅ Mermaid Code Copied to Clipboard!"))
            .catch(err => console.error("❌ Failed to copy Mermaid code:", err));
    });

    document.getElementById("savePNG").addEventListener("click", () => {
        const svg = document.querySelector("#diagram svg");
        if (!svg) {
            alert("❌ No diagram to export!");
            return;
        }

        // Extract LB name from the mermaid code
        const mermaidCode = document.getElementById("rawMermaidCode").textContent;
        let lbName = "xc-flowmap-diagram";
        
        // Try to match the LoadBalancer node format: LoadBalancer["**name (label)**"]
        const lbMatch = mermaidCode.match(/LoadBalancer\["\*\*([^*]+)\s/);
        if (lbMatch && lbMatch[1]) {
            lbName = lbMatch[1].trim().replace(/[^a-zA-Z0-9-_]/g, '_');
        } else {
            // Fallback: try to get from title
            const titleMatch = mermaidCode.match(/title:\s*([^\s]+)/);
            if (titleMatch && titleMatch[1]) {
                lbName = titleMatch[1].replace(/[^a-zA-Z0-9-_]/g, '_');
            }
        }

        // Get actual SVG dimensions from viewBox or width/height attributes
        const viewBox = svg.getAttribute("viewBox");
        let svgWidth, svgHeight;
        
        if (viewBox) {
            const [, , width, height] = viewBox.split(" ").map(Number);
            svgWidth = width;
            svgHeight = height;
        } else {
            svgWidth = parseFloat(svg.getAttribute("width")) || svg.getBBox().width;
            svgHeight = parseFloat(svg.getAttribute("height")) || svg.getBBox().height;
        }

        const svgData = new XMLSerializer().serializeToString(svg);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        
        // Use actual SVG dimensions with scale factor for quality
        const scale = 2;
        canvas.width = svgWidth * scale;
        canvas.height = svgHeight * scale;
        
        ctx.scale(scale, scale);
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, svgWidth, svgHeight);
        
        const img = new Image();
        img.onload = function() {
            ctx.drawImage(img, 0, 0, svgWidth, svgHeight);
            
            canvas.toBlob(function(blob) {
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.download = lbName + ".png";
                link.href = url;
                link.click();
                URL.revokeObjectURL(url);
            });
        };
        
        const svgBase64 = btoa(unescape(encodeURIComponent(svgData)));
        img.src = "data:image/svg+xml;base64," + svgBase64;
    });
});
