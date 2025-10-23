# Change Log

## [0.2.0] – 2025-10-23

### ✨ Added
- Integrated **Red Hat XML** language server for automatic **XSD validation**  
  → Now DDEX XML files (e.g. ERN 3.8.x) are validated live with official schemas.
- Added **status bar indicator** for DDEX XML validity (✅ VALID / ❌ INVALID)
- Added **command:** `MTL DDEX: Associate ERN Schema`  
  → Detects `schemaLocation` or `xmlns` version and automatically sets
  `xml.fileAssociations` for your workspace.
- Added **extension dependency** on `redhat.vscode-xml`
  to ensure the XML LSP is installed.

### 🧰 Improved
- Simplified validator — replaced native `libxml2` calls with VS Code diagnostics
  from the Red Hat XML language server.
- Added better detection of `schemaLocation` and ERN version.
- Enhanced output logging for better debugging.
- Improved hover tooltips and tag decorations from `ddex-map.json`.

### 🧹 Removed
- Removed all native dependencies (`xmllint`, `xsd-schema-validator`).
- Removed blocking schema download logic — validation is now handled by Red Hat XML.

---

## [0.0.1]

- Initial release  
- Demo, license  
- Basic tag-to-documentation mapping  
- Examples and usage instructions