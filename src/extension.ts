import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { XMLValidator } from 'fast-xml-parser';

/* ───────────────────────── MAP HELPERS ───────────────────────── */

function getTagAtPosition(document: vscode.TextDocument, position: vscode.Position): string | undefined {
  const line = document.lineAt(position.line).text;
  const lt = line.lastIndexOf('<', position.character);
  if (lt === -1) return;

  const m = line.slice(lt).match(/^<\/?\s*([A-Za-z_][\w:-]*)/);
  if (!m) return;

  const raw = m[1];
  return raw.includes(':') ? raw.split(':').pop()! : raw;
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

const resolveTagUrl = (ddexMap: Record<string, string>, tagName: string): string | undefined =>
  ddexMap[tagName];

const tagExistsInMap = (ddexMap: Record<string, string>, tagName: string): boolean =>
  Object.prototype.hasOwnProperty.call(ddexMap, tagName);

/* ───────────────────────── DECORATIONS ───────────────────────── */

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

function refreshDecorations(editor: vscode.TextEditor | undefined, ddexMap: Record<string, string>, log?: vscode.OutputChannel) {
  if (!editor || editor.document.languageId !== 'xml') return;
  ensureDecoration();

  const doc = editor.document;
  const text = doc.getText();
  const ranges: vscode.Range[] = [];
  const re = /<\s*([A-Za-z_][\w:-]*)/g;
  let m: RegExpExecArray | null;
  let matched = 0;

  while ((m = re.exec(text))) {
    const raw = m[1];
    const tag = raw.includes(':') ? raw.split(':').pop()! : raw;
    if (!tagExistsInMap(ddexMap, tag)) continue;

    const start = doc.positionAt(m.index + 1);
    const end = start.translate(0, raw.length);
    ranges.push(new vscode.Range(start, end));
    matched++;
  }

  editor.setDecorations(mappedTagDecoration, ranges);
  log?.appendLine(`🎨 Decorations refreshed: ${matched} mapped tags highlighted.`);
}

/* ─────────────────────── ERN SCHEMA DETECTION ─────────────────────── */

function detectErnVersionFromText(text: string): { ns?: string; version?: string; xsdUrl?: string } {
  const first = text.slice(0, 8000);

  // try schemaLocation first: "namespace URL  XSD URL"
  const mLoc = first.match(/schemaLocation\s*=\s*"([^"]+)"/i);
  if (mLoc) {
    const parts = mLoc[1].trim().split(/\s+/);
    if (parts.length >= 2) {
      const ns = parts[0];
      const xsdUrl = parts[1];
      const ver = ns.match(/\/ern\/(\d+)\b/i)?.[1];
      if (ver) return { ns, version: ver, xsdUrl };
    }
  }

  // fallback: xmlns:ern="http://ddex.net/xml/ern/382"
  const mNs = first.match(/xmlns:(?:ern|ddex)\s*=\s*"(https?:\/\/ddex\.net\/xml\/ern\/(\d+))"/i);
  if (mNs) {
    const ns = mNs[1];
    const version = mNs[2];
    const xsdUrl = `http://ddex.net/xml/ern/${version}/release-notification.xsd`;
    return { ns, version, xsdUrl };
  }

  // default unknown
  return {};
}

/* ─────────────────────── RED HAT XML INTEGRATION ─────────────────────── */

async function ensureRedHatXmlInstalled(log: vscode.OutputChannel) {
  const extId = 'redhat.vscode-xml';
  const ext = vscode.extensions.getExtension(extId);
  if (ext) {
    log.appendLine(`✅ Red Hat XML detected: ${ext.packageJSON?.version ?? '(unknown version)'}`);
    return true;
  }
  log.appendLine('⚠️ Red Hat XML not installed.');
  const choice = await vscode.window.showWarningMessage(
    'MTL DDEX: XML by Red Hat extension is required for XSD validation. Install now?',
    'Install', 'Skip'
  );
  if (choice === 'Install') {
    await vscode.commands.executeCommand('workbench.extensions.installExtension', extId);
    const ok = !!vscode.extensions.getExtension(extId);
    log.appendLine(ok ? '✅ Installed Red Hat XML.' : '❌ Failed to install Red Hat XML.');
    return ok;
  }
  return false;
}

/** Associate ERN schema with current workspace (updates xml.fileAssociations) */
async function associateErnSchema(version: string, log: vscode.OutputChannel) {
  const cfg = vscode.workspace.getConfiguration();
  const current = cfg.get<any[]>('xml.fileAssociations', []) ?? [];
  const pattern = '**/*.xml'; // możesz zawęzić np. do **/*ERN*.xml

  const systemId = `http://ddex.net/xml/ern/${version}`;
  const xsd = `http://ddex.net/xml/ern/${version}/release-notification.xsd`;

  // usuń stare wpisy dla ddex/ern
  const filtered = current.filter(e => !(e?.systemId?.includes('/xml/ern/')));

  filtered.push({
    pattern,
    systemId: xsd,           // Red Hat XML: jeśli podasz XSD, to jej użyje; jeśli podasz namespace, też zadziała – ale XSD jest bardziej bezpośrednie
    rootUri: systemId        // hint dla namespace
  });

  await cfg.update('xml.fileAssociations', filtered, vscode.ConfigurationTarget.Workspace);
  log.appendLine(`🔗 Associated ERN ${version} → ${xsd}`);
  vscode.window.showInformationMessage(`DDEX: Associated ERN ${version} schema for workspace.`);
}

/* ───────────────────────── LIVE VALIDATOR (Red Hat-driven) ───────────────────────── */

function createLiveValidator(context: vscode.ExtensionContext, log: vscode.OutputChannel) {
  const diagnostics = vscode.languages.createDiagnosticCollection('mtl-ddex-xml');
  context.subscriptions.push(diagnostics);

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
  status.text = '$(shield) DDEX: ❔';
  status.tooltip = 'DDEX XML Validation Status';
  status.show();
  context.subscriptions.push(status);

  let debounce: NodeJS.Timeout | undefined;

  async function evaluate(doc: vscode.TextDocument | undefined) {
    if (!doc || doc.languageId !== 'xml') {
      status.text = '$(shield) DDEX: N/A';
      diagnostics.clear();
      return;
    }

    const text = doc.getText();
    log.appendLine(`🔎 Evaluating ${doc.uri.fsPath}`);

    // 1) quick syntax (well-formed) check
    let syntaxOk = true;
    const v = XMLValidator.validate(text, { allowBooleanAttributes: true });
    const ourDiags: vscode.Diagnostic[] = [];
    if (v !== true) {
      syntaxOk = false;
      const e = v as any;
      const line = Math.max(0, (e?.err?.line ?? 1) - 1);
      const col  = Math.max(0, (e?.err?.col  ?? 1) - 1);
      const d = new vscode.Diagnostic(
        new vscode.Range(line, col, line, col + 1),
        `XML syntax error: ${e?.err?.msg ?? 'Unknown'}`,
        vscode.DiagnosticSeverity.Error
      );
      d.source = 'MTL DDEX';
      ourDiags.push(d);
      diagnostics.set(doc.uri, ourDiags);
      status.text = '$(error) DDEX: INVALID';
      status.tooltip = d.message;
      log.appendLine(`❌ Syntax error: ${d.message}`);
      return; // nie zbieramy zewnętrznych, bo parser i tak nie przejdzie
    }

    // 2) Red Hat XML diagnostics (XSD + inne)
    //    Pobieramy aktualną listę diagnostyk z całego VS Code i filtrujemy nasz dokument
    const all = vscode.languages.getDiagnostics(doc.uri);
    const foreignErrors = all.filter(d => d.source !== 'MTL DDEX' && d.severity === vscode.DiagnosticSeverity.Error);
    const foreignWarnings = all.filter(d => d.source !== 'MTL DDEX' && d.severity === vscode.DiagnosticSeverity.Warning);

    // 3) Header info: znajdź wersję ERN i XSD
    const { version, xsdUrl } = detectErnVersionFromText(text);
    if (!version) {
      // pokaż przyjazną podpowiedź – pomóż skojarzyć schemat
      ourDiags.push(new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, Math.min(100, doc.lineAt(0).text.length)),
        'No ERN version/schema detected. Use "MTL DDEX: Associate ERN Schema" to set xml.fileAssociations.',
        vscode.DiagnosticSeverity.Information
      ));
    }

    // 4) Merge our + foreign diagnostics (nasze: tylko informacyjne/syntax)
    const merged = [...foreignErrors, ...foreignWarnings, ...ourDiags];
    diagnostics.set(doc.uri, merged);

    // 5) Status
    if (foreignErrors.length > 0) {
      status.text = '$(error) DDEX: INVALID';
      const preview = foreignErrors.slice(0, 5).map(d => '• ' + d.message);
      status.tooltip = [
        version ? `ERN ${version}${xsdUrl ? ` · XSD: ${xsdUrl}` : ''}` : 'ERN: unknown',
        ...preview
      ].join('\n');
      log.appendLine(`🚨 INVALID: ${foreignErrors.length} error(s) from LSP.`);
    } else {
      status.text = '$(pass) DDEX: VALID';
      status.tooltip = version ? `ERN ${version}${xsdUrl ? ` · XSD: ${xsdUrl}` : ''}` : 'No schema issues';
      log.appendLine('✅ VALID (no LSP errors).');
    }
  }

  function schedule(doc?: vscode.TextDocument) {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => evaluate(doc ?? vscode.window.activeTextEditor?.document), 400);
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(e => {
      if (vscode.window.activeTextEditor?.document === e.document) schedule(e.document);
    }),
    vscode.window.onDidSaveTextDocument(doc => schedule(doc)),
    vscode.window.onDidChangeActiveTextEditor(ed => schedule(ed?.document)),
    vscode.commands.registerCommand('mtl-ddex-vscode-helper.validateNow', () => schedule())
  );

  schedule(vscode.window.activeTextEditor?.document);
}

/* ───────────────────────── ACTIVATE ───────────────────────── */

export function activate(context: vscode.ExtensionContext) {
  const log = vscode.window.createOutputChannel('MTL DDEX Helper');
  log.show(true);
  log.appendLine('🔌 Activating MTL DDEX Helper…');

  // 1) Upewnij się, że Red Hat XML jest dostępne
  ensureRedHatXmlInstalled(log).then(installed => {
    if (!installed) {
      vscode.window.showWarningMessage('MTL DDEX: Red Hat XML not installed – XSD validation will be unavailable.');
    }
  });

  // 2) Załaduj mapę
  let ddexMap = loadDdexMap(context, log);

  // 3) Hover: link do dokumentacji
  context.subscriptions.push(
    vscode.languages.registerHoverProvider('xml', {
      provideHover(doc, pos) {
        const tag = getTagAtPosition(doc, pos);
        if (!tag) return;
        const url = resolveTagUrl(ddexMap, tag);
        const text = url ? `**DDEX Docs:** [${tag}](${url})` : `*(no info for **${tag}** in ddex-map.json)*`;
        const md = new vscode.MarkdownString(text);
        md.isTrusted = true;
        log.appendLine(`🪶 Hover tag=${tag}, url=${url ?? '(none)'}`);
        return new vscode.Hover(md);
      }
    })
  );

  // 4) Komendy
  const openDocs = vscode.commands.registerCommand('mtl-ddex-vscode-helper.openDocsForTag', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const tag = getTagAtPosition(editor.document, editor.selection.active);
    if (!tag) return;
    const url = resolveTagUrl(ddexMap, tag);
    if (!url) {
      vscode.window.showWarningMessage(`No info for "${tag}" in ddex-map.json`);
      return;
    }
    vscode.env.openExternal(vscode.Uri.parse(url));
  });

  const reloadMap = vscode.commands.registerCommand('mtl-ddex-vscode-helper.reloadDdexMap', async () => {
    ddexMap = loadDdexMap(context, log);
    vscode.window.showInformationMessage('DDEX map reloaded.');
    refreshDecorations(vscode.window.activeTextEditor, ddexMap, log);
  });

  // Nowa komenda: Associate ERN Schema (ustawia xml.fileAssociations wg wykrytej wersji)
  const associateSchema = vscode.commands.registerCommand('mtl-ddex-vscode-helper.associateErnSchema', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const text = editor.document.getText();
    const { version } = detectErnVersionFromText(text);
    if (!version) {
      const picked = await vscode.window.showQuickPick(
        ['382', '381', '380', '375', '374', '373'],
        { placeHolder: 'Pick ERN version to associate (from schemaLocation or xmlns)' }
      );
      if (!picked) return;
      await associateErnSchema(picked, log);
    } else {
      await associateErnSchema(version, log);
    }
  });

  context.subscriptions.push(openDocs, reloadMap, associateSchema);

  // 5) Dekoracje
  refreshDecorations(vscode.window.activeTextEditor, ddexMap, log);
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(ed => refreshDecorations(ed, ddexMap, log)),
    vscode.workspace.onDidChangeTextDocument(e => {
      if (vscode.window.activeTextEditor?.document === e.document) {
        refreshDecorations(vscode.window.activeTextEditor, ddexMap, log);
      }
    })
  );

  // 6) Walidator (zbiera diagnostics Red Hat XML)
  createLiveValidator(context, log);
}

export function deactivate() {}