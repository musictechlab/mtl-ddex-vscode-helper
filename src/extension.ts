// extension.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/* ─────────────── PoC: flat map helpers ─────────────── */

function getTagAtPosition(document: vscode.TextDocument, position: vscode.Position): string | undefined {
  const line = document.lineAt(position.line).text;
  const lt = line.lastIndexOf('<', position.character); // nearest '<' to the left
  if (lt === -1) return;

  const m = line.slice(lt).match(/^<\/?\s*([A-Za-z_][\w:-]*)/);
  if (!m) return;

  const raw = m[1];
  return raw.includes(':') ? raw.split(':').pop()! : raw; // strip namespace prefix
}

function loadDdexMap(context: vscode.ExtensionContext, log?: vscode.OutputChannel): Record<string, string> {
  try {
    const mapPath = path.join(context.extensionPath, 'assets', 'ddex-map.json');
    if (!fs.existsSync(mapPath)) {
      log?.appendLine(`⛔ ddex-map.json NOT FOUND at: ${mapPath}`);
      return {};
    }
    const raw = fs.readFileSync(mapPath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, string>;
    log?.appendLine(`🗺️ Loaded ddex-map.json (${raw.length} bytes)`);
    return parsed;
  } catch (err) {
    log?.appendLine(`❌ Failed to load ddex-map.json: ${String(err)}`);
    return {};
  }
}

// FLAT map lookups (no standards object)
const resolveTagUrl = (ddexMap: Record<string, string>, tagName: string): string | undefined =>
  ddexMap[tagName];

const tagExistsInMap = (ddexMap: Record<string, string>, tagName: string): boolean =>
  Object.prototype.hasOwnProperty.call(ddexMap, tagName);

/* ─────────────── decorations (highlight) ─────────────── */

let mappedTagDecoration: vscode.TextEditorDecorationType;

function ensureDecoration() {
  if (!mappedTagDecoration) {
    mappedTagDecoration = vscode.window.createTextEditorDecorationType({
      borderWidth: '1px',
      borderStyle: 'solid',
      light: { backgroundColor: 'rgba(0, 120, 215, 0.12)', borderColor: 'rgba(0,120,215,0.4)' },
      dark:  { backgroundColor: 'rgba(0, 120, 215, 0.16)', borderColor: 'rgba(0,120,215,0.45)' },
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.infoForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Right
    });
  }
}

function refreshDecorations(editor: vscode.TextEditor | undefined, ddexMap: Record<string, string>) {
  if (!editor || editor.document.languageId !== 'xml') return;
  ensureDecoration();

  const doc = editor.document;
  const text = doc.getText();
  const ranges: vscode.Range[] = [];
  const re = /<\s*([A-Za-z_][\w:-]*)/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text))) {
    const raw = m[1];
    const tag = raw.includes(':') ? raw.split(':').pop()! : raw;
    if (!tagExistsInMap(ddexMap, tag)) continue;

    const start = doc.positionAt(m.index + 1); // right after '<'
    const end = start.translate(0, raw.length);
    ranges.push(new vscode.Range(start, end));
  }

  editor.setDecorations(mappedTagDecoration, ranges);
}


/* ───────────────────────── activate ───────────────────────── */

export function activate(context: vscode.ExtensionContext) {
  const log = vscode.window.createOutputChannel('MTL DDEX Helper');
  log.appendLine('🔌 Activating MTL DDEX Helper…');

  // status bar (click = reload map)
  const sb = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  sb.text = '$(book) DDEX';
  sb.tooltip = 'MTL DDEX Helper — Reload map';
  sb.command = 'mtl-ddex-vscode-helper.reloadDdexMap';
  sb.show();
  context.subscriptions.push(sb);

  let ddexMap = loadDdexMap(context, log);
  log.appendLine('✅ Documentation DDEX map loaded!');

  // vscode.window.registerWebviewViewProvider('ddexDocsView', {
  //   resolveWebviewView(webviewView) {
  //     const html = `
  //       <html>
  //       <body style="font-family: sans-serif; padding: 10px">
  //         <input id="search" type="text" placeholder="Search tag..." style="width:100%; padding:5px"/>
  //         <ul id="list"></ul>
  //         <script>
  //           const data = ${JSON.stringify(ddexMap)};
  //           const list = document.getElementById('list');
  //           const input = document.getElementById('search');
  //           function render(filter='') {
  //             list.innerHTML = Object.entries(data)
  //               .filter(([k]) => k.toLowerCase().includes(filter.toLowerCase()))
  //               .map(([k,v]) => '<li><a href="'+v+'" target="_blank">'+k+'</a></li>')
  //               .join('');
  //           }
  //           input.oninput = () => render(input.value);
  //           render();
  //         </script>
  //       </body>
  //       </html>`;
  //     webviewView.webview.options = { enableScripts: true };
  //     webviewView.webview.html = html;
  //   }
  // });

  // HOVER: show URL or "no info provided…"
  context.subscriptions.push(
    vscode.languages.registerHoverProvider('xml', {
      provideHover(doc, pos) {
        const tag = getTagAtPosition(doc, pos);
        if (!tag) return;

        const url = resolveTagUrl(ddexMap, tag);
        const text = url
          ? `**DDEX Docs:** [${tag}](${url})`
          : `*(no info provided in the ddex-map.json for **${tag}**)*`;

        const md = new vscode.MarkdownString(text);
        md.isTrusted = true;
        return new vscode.Hover(md);
      }
    })
  );

  // Command: open docs (shortcut-friendly)
  const openDocs = vscode.commands.registerCommand(
    'mtl-ddex-vscode-helper.openDocsForTag',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const doc = editor.document;
      if (doc.languageId !== 'xml') {
        vscode.window.showInformationMessage('This command works only in XML files.');
        return;
      }

      const tag = getTagAtPosition(doc, editor.selection.active);
      if (!tag) {
        vscode.window.showInformationMessage('Place the cursor on an XML tag name.');
        return;
      }

      const url = resolveTagUrl(ddexMap, tag);
      if (!url) {
        vscode.window.showWarningMessage(`No info for "${tag}" in ddex-map.json.`);
        return;
      }

      const choice = await vscode.window.showQuickPick(
        ['🔗 Open documentation', '📋 Copy URL', '🚫 Cancel'],
        { placeHolder: `Docs for ${tag}` }
      );
      if (choice?.startsWith('🔗')) vscode.env.openExternal(vscode.Uri.parse(url));
      else if (choice?.startsWith('📋')) await vscode.env.clipboard.writeText(url);
    }
  );

  // Command: reload map
  const reloadMap = vscode.commands.registerCommand(
    'mtl-ddex-vscode-helper.reloadDdexMap',
    async () => {
      ddexMap = loadDdexMap(context, log);
      vscode.window.showInformationMessage('✅ DDEX map reloaded.');
      refreshDecorations(vscode.window.activeTextEditor, ddexMap);
    }
  );

  context.subscriptions.push(openDocs, reloadMap);

  // Auto-refresh highlights
  refreshDecorations(vscode.window.activeTextEditor, ddexMap);
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(ed => refreshDecorations(ed, ddexMap)),
    vscode.workspace.onDidChangeTextDocument(e => {
      if (vscode.window.activeTextEditor?.document === e.document) {
        refreshDecorations(vscode.window.activeTextEditor, ddexMap);
      }
    })
  );

  vscode.window.setStatusBarMessage('MTL DDEX Helper activated', 2000);
}

export function deactivate() {}