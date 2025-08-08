document.addEventListener("DOMContentLoaded", function () {
    const urlParams = new URLSearchParams(window.location.search);
    const diagramCode = urlParams.get("diagram");
    const b64DiagramCode = urlParams.get("b64diagram");
    const storageId = urlParams.get("storageId");

    let decodedCode = null;

    // Method 1: Try storage-based approach first
    if (storageId) {
        console.log('[MERMAID] Using storage-based diagram retrieval, ID:', storageId);
        
        chrome.storage.local.get([storageId], (result) => {
            if (chrome.runtime.lastError) {
                console.error('[MERMAID] Storage retrieval error:', chrome.runtime.lastError);
                handleDiagramFailure();
                return;
            }
            
            const diagramData = result[storageId];
            if (diagramData && diagramData.diagram) {
                console.log('[MERMAID] Successfully retrieved diagram from storage, length:', diagramData.diagram.length);
                
                decodedCode = diagramData.diagram;
                renderDiagram(decodedCode);
                
                // Clean up old storage entries (keep only recent ones)
                cleanupOldDiagrams();
            } else {
                console.error('[MERMAID] No diagram found in storage for ID:', storageId);
                handleDiagramFailure();
            }
        });
        return; // Exit early for storage-based approach
    }

    if (diagramCode) {
        try {
            decodedCode = decodeURIComponent(diagramCode);
        } catch (error) {
            console.error("Failed to decode URI diagram:", error);
            // Try base64 fallback if URI decoding fails
            if (b64DiagramCode) {
                console.log('[MERMAID] URI decoding failed, trying base64 fallback...');
                try {
                    // Use the same UTF-8 decoding function
                    function base64ToUtf8(base64) {
                        const binaryString = atob(base64);
                        const bytes = new Uint8Array(binaryString.length);
                        for (let i = 0; i < binaryString.length; i++) {
                            bytes[i] = binaryString.charCodeAt(i);
                        }
                        return new TextDecoder('utf-8').decode(bytes);
                    }
                    
                    let cleanB64 = b64DiagramCode.trim().replace(/[^A-Za-z0-9+/=]/g, '');
                    while (cleanB64.length % 4 !== 0) { cleanB64 += '='; }
                    decodedCode = base64ToUtf8(cleanB64);
                    console.log('[MERMAID] UTF-8 base64 fallback succeeded');
                } catch (b64Error) {
                    console.error("Base64 fallback also failed:", b64Error);
                }
            }
        }
    } else if (b64DiagramCode) {
        console.log(`[MERMAID] Processing base64 diagram, original length: ${b64DiagramCode.length}`);
        
        try {
            // Clean the base64 string first
            let cleanB64 = b64DiagramCode.trim();
            console.log(`[MERMAID] Original base64 length: ${b64DiagramCode.length}`);
            console.log(`[MERMAID] After trim length: ${cleanB64.length}`);
            
            // Check for invalid characters
            const invalidChars = cleanB64.match(/[^A-Za-z0-9+/=]/g);
            if (invalidChars) {
                console.log(`[MERMAID] Found invalid base64 characters:`, invalidChars);
            }
            
            cleanB64 = cleanB64.replace(/[^A-Za-z0-9+/=]/g, '');
            console.log(`[MERMAID] After cleaning invalid chars: ${cleanB64.length}`);
            
            while (cleanB64.length % 4 !== 0) {
                cleanB64 += '=';
            }
            console.log(`[MERMAID] After padding: ${cleanB64.length}`);
            
            // Method 1: Try UTF-8 decoding
            try {
                console.log(`[MERMAID] Attempting UTF-8 base64 decoding...`);
                const binaryString = atob(cleanB64);
                console.log(`[MERMAID] Base64 decoded to binary string, length: ${binaryString.length}`);
                
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                console.log(`[MERMAID] Converted to byte array, length: ${bytes.length}`);
                
                decodedCode = new TextDecoder('utf-8').decode(bytes);
                console.log(`[MERMAID] UTF-8 decoding succeeded, result length: ${decodedCode.length}`);
                
            } catch (utf8Error) {
                console.error("UTF-8 decoding step failed:", utf8Error);
                console.error("Error details:", utf8Error.message);
                throw utf8Error;
            }
            
        } catch (error) {
            console.error("UTF-8 base64 decoding failed:", error);
            
            // Method 2: Try simple ASCII decoding
            try {
                console.log(`[MERMAID] Trying simple ASCII base64 decoding...`);
                let cleanB64 = b64DiagramCode.trim().replace(/[^A-Za-z0-9+/=]/g, '');
                while (cleanB64.length % 4 !== 0) { cleanB64 += '='; }
                
                decodedCode = atob(cleanB64);
                console.log(`[MERMAID] ASCII decoding succeeded, result length: ${decodedCode.length}`);
                
                // Check for garbage characters
                const hasGarbage = /[\x80-\xFF]/.test(decodedCode);
                if (hasGarbage) {
                    console.warn(`[MERMAID] Detected non-ASCII characters in decoded result - may contain garbage`);
                    // Try to clean up garbage characters
                    decodedCode = decodedCode.replace(/[\x80-\xFF]/g, '?');
                    console.log(`[MERMAID] Cleaned up garbage characters with '?'`);
                }
                
            } catch (fallbackError) {
                console.error("All decoding methods failed:", fallbackError);
                
                // Method 3: Last resort - try to extract whatever we can
                try {
                    console.log(`[MERMAID] Last resort: trying partial decoding...`);
                    // Try to decode just the first part to see what we get
                    let testB64 = b64DiagramCode.substring(0, 100);
                    while (testB64.length % 4 !== 0) { testB64 += '='; }
                    const partialResult = atob(testB64);
                    console.log(`[MERMAID] Partial decode sample:`, partialResult.substring(0, 50));
                } catch (lastError) {
                    console.error("Even partial decoding failed:", lastError);
                }
            }
        }
    }

    // Method 2 & 3: Handle URI and base64 parameters (fallback)
    handleFallbackParameters();
    
    function renderDiagram(diagramContent) {
        console.log('[MERMAID] Rendering diagram, length:', diagramContent.length);
        console.log('[MERMAID] Diagram preview (first 200 chars):', diagramContent.substring(0, 200));
        
        // Set the diagram content
        document.getElementById("diagram").textContent = diagramContent;
        document.getElementById("rawMermaidCode").textContent = diagramContent;

        function tryLegacyRendering(diagramElement, diagramContent, previousError = null) {
            try {
                console.log('[MERMAID] Attempting legacy mermaid.init...');
                
                // Reset the element
                diagramElement.innerHTML = diagramContent;
                diagramElement.removeAttribute('data-processed');
                
                // Use legacy API
                mermaid.init(undefined, diagramElement);
                console.log('[MERMAID] Legacy API: Diagram rendered successfully!');
                
            } catch (legacyError) {
                console.error('[MERMAID] Legacy rendering also failed:', legacyError);
                
                const errorDetails = [];
                if (previousError) errorDetails.push(`Modern API: ${previousError.message}`);
                errorDetails.push(`Legacy API: ${legacyError.message}`);
                
                // Show comprehensive error
                document.getElementById("diagram").innerHTML = `
                    <div style="color: red; padding: 20px; border: 1px solid red; margin: 10px;">
                        <h3>Mermaid Rendering Failed</h3>
                        <p>Both modern and legacy rendering methods failed:</p>
                        <ul>
                            ${errorDetails.map(err => `<li>${err}</li>`).join('')}
                        </ul>
                        <p>Please check the diagram syntax in the "Mermaid Code" section below.</p>
                        <details>
                            <summary>First 500 characters of diagram:</summary>
                            <pre style="background: #f5f5f5; padding: 10px; margin: 10px 0; font-size: 12px;">${diagramContent.substring(0, 500)}${diagramContent.length > 500 ? '...' : ''}</pre>
                        </details>
                    </div>
                `;
            }
        }

        try {
            // Initialize Mermaid with better error handling
            mermaid.initialize({ 
                startOnLoad: false,  // We'll manually trigger
                theme: 'default',
                logLevel: 'error',   // Only show errors, suppress warnings
                securityLevel: 'loose', // Allow more diagram features
                fontFamily: 'arial',
                suppressErrors: true  // Suppress Mermaid warnings and errors
            });
            
            console.log('[MERMAID] Mermaid initialized, attempting to render...');
            
            // Clear any existing content and render
            const diagramElement = document.querySelector("#diagram");
            diagramElement.removeAttribute('data-processed');
            
            // Try modern Mermaid API first
            if (mermaid.run) {
                console.log('[MERMAID] Using modern mermaid.run API...');
                mermaid.run({
                    querySelector: "#diagram"
                }).then(() => {
                    console.log('[MERMAID] Modern API: Diagram rendered successfully!');
                }).catch((error) => {
                    console.error('[MERMAID] Modern API failed:', error);
                    tryLegacyRendering(diagramElement, diagramContent, error);
                });
            } else {
                console.log('[MERMAID] Modern API not available, using legacy method...');
                tryLegacyRendering(diagramElement, diagramContent);
            }
            
        } catch (initError) {
            console.error('[MERMAID] Initialization failed:', initError);
            document.getElementById("diagram").innerHTML = `
                <div style="color: red; padding: 20px;">
                    <h3>Mermaid Initialization Error</h3>
                    <p>${initError.message}</p>
                </div>
            `;
        }
    }
    
    function handleDiagramFailure() {
        console.error('[MERMAID] No diagram data could be loaded');
        document.getElementById("diagram").textContent = "No diagram data provided or loading failed!";
        document.getElementById("rawMermaidCode").textContent = "No diagram data provided or loading failed!";
    }
    
    function cleanupOldDiagrams() {
        // Clean up diagrams older than 1 hour
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        
        chrome.storage.local.get(null, (allItems) => {
            const keysToRemove = [];
            
            for (const [key, value] of Object.entries(allItems)) {
                if (key.startsWith('diagram_') && value.timestamp && value.timestamp < oneHourAgo) {
                    keysToRemove.push(key);
                }
            }
            
            if (keysToRemove.length > 0) {
                chrome.storage.local.remove(keysToRemove, () => {
                    console.log(`[MERMAID] Cleaned up ${keysToRemove.length} old diagram(s)`);
                });
            }
        });
    }
    
    function handleFallbackParameters() {
        if (decodedCode) {
            renderDiagram(decodedCode);
            return;
        }
        
        // Only process fallback parameters if storage method wasn't used
        if (!storageId) {
            if (decodedCode) {
                renderDiagram(decodedCode);
            } else {
                handleDiagramFailure();
            }
        }
    }

    document.getElementById("copyMermaid").addEventListener("click", () => {
        navigator.clipboard.writeText(document.getElementById("rawMermaidCode").textContent)
            .then(() => alert("Mermaid Code Copied to Clipboard!"))
            .catch(err => console.error("Failed to copy Mermaid code:", err));
    });

    document.getElementById("savePNG").addEventListener("click", () => {
        const svg = document.querySelector("#diagram svg");
        if (!svg) {
            alert("No diagram to export!");
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
        
        // Convert SVG to base64
        const svgBase64 = btoa(svgData);
        img.src = "data:image/svg+xml;base64," + svgBase64;
    });
});
