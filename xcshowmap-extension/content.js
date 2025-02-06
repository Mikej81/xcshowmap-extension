document.addEventListener("DOMContentLoaded", function () {
    console.log("xcshowmap extension running on", window.location.href);

    // Try to extract JSON data from the page
    let preElements = document.querySelectorAll("pre, script[type='application/json']");
    let jsonData = null;

    preElements.forEach((element) => {
        try {
            let parsedData = JSON.parse(element.textContent);
            if (parsedData.items) {
                jsonData = parsedData;
                console.log("Extracted API Data:", jsonData);
                chrome.runtime.sendMessage({ type: "apiData", data: jsonData });
            }
        } catch (e) {
            console.debug("Skipping non-JSON element");
        }
    });

    if (!jsonData) {
        console.warn("No valid API data found on page.");
    }
});
