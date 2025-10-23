# 🎵 MTL DDEX Helper

**MTL DDEX Helper** is a VS Code extension that makes working with **DDEX XML metadata** (e.g. ERN, MLC, MWDR, Party ID) faster and easier.  
It provides quick access to documentation, tag lookups, and metadata validation helpers — directly from your editor.

---

## ✨ Features

- 🔗 **Jump to documentation** — place your cursor on any XML tag (e.g. `<PartyID>`) and press `Ctrl+Alt+D` to open the official DDEX documentation in your browser.  
- ⚙️ **Namespace aware** — works even with prefixed tags like `<ddex:ReleaseList>`.  
- 📁 **Customizable tag map** — edit `assets/ddex-map.json` to define your own tag-to-doc mappings.  
- 🧠 **Schema-agnostic** — works with ERN, MWDR, MLC, and any other XML-based DDEX message.  
- 🪶 Lightweight — no network calls or heavy dependencies.  
- 💡 Future-ready — architecture prepared for validation and auto-completion support.

### Example

```xml
<NewReleaseMessage>
  <ReleaseList>
    <Release>
      <DisplayArtist>John Doe</DisplayArtist>
    </Release>
  </ReleaseList>
</NewReleaseMessage>
```

➡️ Place cursor on `<ReleaseList>` → press **Ctrl+Alt+D** → browser opens the [ReleaseList documentation](https://support.google.com/youtube/answer/3506114?sjid=9804191667439814450-EU).

---

## 🧩 Requirements

- Visual Studio Code **1.80.0+**
- Node.js **18+** for development
- Internet access (for documentation links)

To build and run locally:
```bash
npm install
npm run compile
F5   # Launch Extension Development Host
```

---

## ⚙️ Extension Settings

Currently, there are no user-facing VS Code settings.  
Tag-to-URL mappings can be edited directly in:

```
assets/ddex-map.json
```

Example:
```json
{
    ...
    "PartyId": "https://ddex.net/standards/party-id/",
    "NewReleaseMessage": "https://ern.ddex.net/electronic-release-notification-message-suite-part-1-definitions-of-messages/6-message-definition/6.2-structure-of-the-newreleasemessage/",
    "ReleaseList": "https://support.google.com/youtube/answer/3506114?sjid=9804191667439814450-EU",
    "TechnicalDetails": "https://service.ddex.net/dd/ERN38/dd/ern_TechnicalTextDetails.html"
    ...
}
```

---

## 🧱 Roadmap

- ✅ Tag → Documentation mapping  
- 🔜 XML Schema validation (ERN 3.8.3)  
- 🔜 Hover tooltips with DDEX tag descriptions  
- 🔜 CodeLens: “Open Docs” above tag definitions  
- 🔜 Auto-completion for DDEX tag names

---

## 🐞 Known Issues

- Namespaced tags with unusual prefixes may require manual mapping.
- Documentation URLs are static and may change with new DDEX releases.

Report issues or contribute via [MusicTech Lab on GitHub](https://github.com/musictechlab/mtl-ddex-vscode-helper).

---

## 🧾 Release Notes

### 0.1.0

- Initial release of **MTL DDEX Helper**  
- Added `Ctrl+Alt+D` command to open docs for XML tags  
- Included customizable tag map in `assets/ddex-map.json`

## 📚 Learn More

- [DDEX Official Site](https://ddex.net)
- [Visual Studio Code API Docs](https://code.visualstudio.com/api)
- [VSCE Publishing Guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)

---

## License

This project is licensed under the MIT License.

**Enjoy faster DDEX development. Built with ❤️ by [MusicTech Lab](https://musictechlab.io).**