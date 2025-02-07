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
});
