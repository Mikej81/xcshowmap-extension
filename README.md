# XC Service Flow Mapper - Chrome Extension

A Chrome extension that generates interactive traffic flow diagrams from F5 Distributed Cloud console API responses, helping visualize load balancer configurations, security policies, and routing rules.

## Installation

### Install as Unpacked Extension (Development Mode)

1. **Download/Clone the Repository**

   ```bash
   git clone https://github.com/your-repo/xcshowmap_chrome.git
   cd xcshowmap_chrome
   ```

2. **Open Chrome Extensions Page**
   - Navigate to `chrome://extensions/` in your Chrome browser
   - Or click the three dots menu → More tools → Extensions

3. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top-right corner

4. **Load the Extension**
   - Click "Load unpacked" button
   - Select the `xcshowmap-extension` folder from the cloned repository
   - The extension should now appear in your extensions list

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
   - **Supported URL patterns:**
     - Regular tenant: `https://*.console.ves.volterra.io/web/workspaces/multi-cloud-app-connect/namespaces/{namespace}/manage/load_balancers/http_loadbalancers`
     - Managed tenant: `https://*.console.ves.volterra.io/managed_tenant/{tenant}/web/workspaces/multi-cloud-app-connect/namespaces/{namespace}/manage/load_balancers/http_loadbalancers`

2. **Interact with the Page**
   - Refresh the page or navigate within the console to capture CSRF tokens
   - The extension automatically detects both regular and managed tenant contexts

3. **Generate Flow Diagrams**
   - Click the extension icon in the toolbar
   - Select a load balancer from the dropdown
   - Click "Generate Diagram"
   - A new tab will open with the interactive Mermaid diagram

### Features

- **Tab-Specific Data Isolation**: Each browser tab maintains separate data
- **Managed Tenant Support**: Automatic detection and handling of managed tenant contexts
- **Advanced CSRF Token Detection**: Multiple detection methods for robust authentication
- **Interactive Diagrams**: Horizontal flow charts with certificate status, security controls, and routing details
- **Debug Logging**: Comprehensive logging system for troubleshooting

## 🔧 Troubleshooting

### Common Issues

1. **"Missing CSRF Token" Error**
   - **Solution**: Refresh the F5XC console page or navigate to trigger API requests
   - The extension needs to capture authentication tokens from network requests

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

The extension includes comprehensive logging for troubleshooting:

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

## Architecture

### Supported Contexts

- **Regular Tenants**: Standard F5 Distributed Cloud console access
- **Managed Tenants**: Multi-tenant service provider scenarios with separate authentication

### CSRF Token Handling

The extension uses intelligent token detection:

- **Regular Context**: Uses top-level CSRF tokens
- **Managed Tenant Context**: Prefers managed tenant CSRF tokens, falls back to top-level
- **Detection Methods**: URL parameters, response headers, cookies, request headers

### Diagram Features

Generated diagrams include:

- **Load Balancer Type**: Public vs Private classification
- **Certificate Status**: Valid, expiring, or expired certificates
- **Security Controls**: WAF, service policies, API protection, bot defense
- **Routing Logic**: Default routes, path-based routing, redirects
- **Origin Pools**: Backend service destinations

## Permissions Required

The extension requires these permissions:

- **activeTab**: Access current tab for data extraction
- **storage**: Store tab-specific data
- **webRequest**: Monitor network requests for CSRF tokens
- **tabs**: Manage tab-specific data isolation
- **downloads**: Export debug logs
- **Host permissions**: Access to `*.console.ves.volterra.io`

## Contributing

This extension is designed for F5 Distributed Cloud console integration. When contributing:

1. Test with both regular and managed tenant scenarios
2. Ensure tab isolation works correctly
3. Verify CSRF token detection across different authentication methods
4. Test diagram generation with various load balancer configurations

## License

See LICENSE file for details.
