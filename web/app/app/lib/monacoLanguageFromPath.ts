/** Map file name / path to a Monaco `language` id for syntax highlighting in DiffEditor. */
export function monacoLanguageFromFilename(filename: string): string {
  const base = (filename || '').split(/[/\\]/).pop() ?? '';
  const ext = base.includes('.') ? base.split('.').pop()!.toLowerCase() : '';
  const map: Record<string, string> = {
    java: 'java',
    kt: 'kotlin',
    kts: 'kotlin',
    ts: 'typescript',
    tsx: 'typescript',
    mts: 'typescript',
    cts: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    json: 'json',
    md: 'markdown',
    py: 'python',
    go: 'go',
    rs: 'rust',
    xml: 'xml',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    sql: 'sql',
    yaml: 'yaml',
    yml: 'yaml',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    gradle: 'groovy',
    groovy: 'groovy',
    cs: 'csharp',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    h: 'cpp',
    c: 'c',
    rb: 'ruby',
    php: 'php',
    swift: 'swift',
    scala: 'scala',
    properties: 'ini'
  };
  return map[ext] ?? 'plaintext';
}
