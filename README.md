# XC Service Flow Mapper - Chrome Extension

A Chrome extension that generates traffic flow diagrams from F5 Distributed Cloud (XC), helping visualize load balancer configurations, security policies, and routing rules.

## Installation

### Install as Unpacked Extension (Development Mode)

1. **Download latest Release**

   Download Release [https://github.com/Mikej81/xcshowmap-extension/releases](https://github.com/Mikej81/xcshowmap-extension/releases)

   Extract to prefered location.

2. **Open Chrome Extensions Page**
   - Navigate to `chrome://extensions/` in your Chrome browser
   - Or click the three dots menu → More tools → Extensions

3. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top-right corner

4. **Load the Extension**
   - Click "Load unpacked" button
   - Select the `xcshowmap-extension` folder from the cloned repository / downloaded release.
   - The extension should now appear in your extensions list
   - Be sure to enable "Pin to toolbar"

5. **Verify Installation**
   - Look for "XC Service Flow Mapper" in your extensions
   - The extension icon should appear in the Chrome toolbar

## Usage Instructions

### Prerequisites

- Access to F5 Distributed Cloud console
- Valid credentials for the console
- Load balancers configured in your namespace

### Using the Extension

1. **Navigate to Load Balancers**
   - Go to your F5 Distributed Cloud console
   - Navigate to: `Web Workspaces → Multi-Cloud App Connect → Load Balancers → HTTP Load Balancers`
   - (Ensure you are in the correct namespace)
   - **Supported URL patterns:**
     - Regular tenant: `https://*.console.ves.volterra.io/web/workspaces/multi-cloud-app-connect/namespaces/{namespace}/manage/load_balancers/http_loadbalancers`
     - Managed tenant: `https://*.console.ves.volterra.io/managed_tenant/{tenant}/web/workspaces/multi-cloud-app-connect/namespaces/{namespace}/manage/load_balancers/http_loadbalancers`

2. **Interact with the Page**
   - Refresh the page to capture CSRF tokens and enable the extension
   - The extension automatically detects both regular and managed tenant contexts
   - Load balancers will populate automatically when conditions are met

3. **Generate Flow Diagrams**
   - Click the extension icon in the toolbar
   - Select a load balancer from the dropdown (populates automatically)
   - Click "Generate Diagram"
   - A new tab will open with the interactive Mermaid diagram

## Troubleshooting

### Common Issues

1. **"Please refresh page" Message**
   - **Solution**: Refresh the XC console page to capture tokens and scrape fetched json.
   - The extension needs to capture CSRF tokens from the initial page load

2. **"No Load Balancers Found" Error**
   - **Solution**: Ensure you're on the correct load balancers page
   - Verify you have load balancers configured in the current namespace
   - Check that you have appropriate permissions

3. **Extension Not Working**
   - **Solution**:
     - Verify you're on a supported URL pattern
     - Check the browser console for errors
     - Use the "Download Debug Logs" button for detailed troubleshooting

### Debug Logging

The extension includes logging for troubleshooting:

1. **Access Debug Logs**
   - Click the extension icon
   - Click "Download Debug Logs" button
   - Logs are saved to your Downloads folder

2. **What's Logged**
   - CSRF token detection events
   - API request/response details
   - Managed tenant context information
   - Error conditions and stack traces

### Browser Console

For immediate debugging, check the browser console:

- **Service Worker Console**: `chrome://extensions/` → Click "service worker" under the extension
- **Content Script Console**: F12 Developer Tools on the F5XC console page

## Supported Contexts

- **Regular Tenants**: Standard F5 Distributed Cloud console access
- **Managed Tenants**: Multi-tenant service provider scenarios with separate authentication

### Diagram Features

Generated diagrams include:

- **Load Balancer Type**: Public vs Private classification
- **Certificate Status**: Valid, expiring, or expired certificates with expiration dates
- **Security Controls**: Common Security Controls grouped (Service Policies, IP Reputation, User ID, etc.) - only shows enabled features
- **API Protection & Bot Defense**: Additional security layers when configured
- **WAF Protection**: Web application firewall settings when enabled
- **Routing Logic**: Default routes, path-based routing, redirects
- **Origin Pools**: Backend service destinations with server details and health status

## Permissions Required

The extension requires these permissions:

- **debugger**: Advanced debugging capabilities for network request monitoring
- **storage**: Store tab-specific data and configuration
- **contextMenus**: Right-click context menu integration
- **activeTab**: Access current tab for data extraction
- **webRequest**: Monitor network requests for CSRF tokens
- **tabs**: Manage tab-specific data isolation
- **downloads**: Export debug logs
- **scripting**: Inject content scripts into web pages
- **Host permissions**: Access to `*.console.ves.volterra.io` and API endpoints

## License

See LICENSE file for details.
