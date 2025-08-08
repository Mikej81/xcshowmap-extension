#!/bin/bash

# Script to update mermaid.min.js to the latest version

echo "==================================="
echo "Mermaid.js Update Script"
echo "==================================="

# Function to get latest version from GitHub API
get_latest_version() {
    echo "Fetching latest version from GitHub..."
    LATEST_VERSION=$(curl -s https://api.github.com/repos/mermaid-js/mermaid/releases/latest | grep '"tag_name"' | sed -E 's/.*"mermaid@([^"]+)".*/\1/')
    
    if [ -z "$LATEST_VERSION" ]; then
        echo "Error: Could not fetch latest version"
        exit 1
    fi
    
    echo "Latest version: $LATEST_VERSION"
}

# Function to backup current file
backup_current() {
    if [ -f "xcshowmap-extension/mermaid.min.js" ]; then
        BACKUP_NAME="xcshowmap-extension/mermaid.min.js.backup.$(date +%Y%m%d_%H%M%S)"
        echo "Creating backup: $BACKUP_NAME"
        cp xcshowmap-extension/mermaid.min.js "$BACKUP_NAME"
    else
        echo "No existing mermaid.min.js found to backup"
    fi
}

# Function to download new version
download_latest() {
    URL="https://cdn.jsdelivr.net/npm/mermaid@$LATEST_VERSION/dist/mermaid.min.js"
    echo "Downloading from: $URL"
    
    curl -L -o xcshowmap-extension/mermaid.min.js.tmp "$URL"
    
    if [ $? -eq 0 ]; then
        mv xcshowmap-extension/mermaid.min.js.tmp xcshowmap-extension/mermaid.min.js
        echo "✓ Successfully downloaded version $LATEST_VERSION"
        
        # Show file size for verification
        SIZE=$(ls -lh xcshowmap-extension/mermaid.min.js | awk '{print $5}')
        echo "File size: $SIZE"
    else
        echo "Error: Download failed"
        rm -f xcshowmap-extension/mermaid.min.js.tmp
        exit 1
    fi
}

# Main execution
echo ""
echo "This script will update mermaid.min.js to the latest version"
echo "Current file will be backed up before updating"
echo ""
read -p "Do you want to continue? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    get_latest_version
    backup_current
    download_latest
    
    echo ""
    echo "==================================="
    echo "Update complete!"
    echo "==================================="
    echo ""
    echo "Next steps:"
    echo "1. Test the extension to ensure compatibility"
    echo "2. If there are issues, restore from backup"
    echo "3. Check the browser console for any errors"
    echo ""
    echo "To restore from backup if needed:"
    echo "  mv $BACKUP_NAME xcshowmap-extension/mermaid.min.js"
else
    echo "Update cancelled"
fi