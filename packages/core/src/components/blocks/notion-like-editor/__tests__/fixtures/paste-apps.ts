// Hand-written clipboard HTML. These are not captures from the apps.
// Each one follows the wrapper that app is known to put on the clipboard.

export const NOTION_FIXTURE = `
<div class="notion-page">
  <h1>Notion heading</h1>
  <p>A <strong>bold</strong> <em>italic</em> <u>under</u> <s>strike</s> <code>code</code> <a href="https://example.com/docs">link</a> paragraph.</p>
  <ul>
    <li>Parent</li>
    <ul><li>Nested</li></ul>
  </ul>
  <ol><li>First</li><li>Second</li></ol>
  <ul><li role="checkbox" aria-checked="true">Done</li></ul>
  <blockquote>Quoted</blockquote>
  <pre><code class="language-typescript">const n = 1;</code></pre>
  <table>
    <thead><tr><th>Head</th></tr></thead>
    <tbody><tr><td>Cell</td></tr></tbody>
  </table>
  <img alt="Notion shot" src="https://example.com/notion.png">
</div>`.trim();

export const WORD_FIXTURE = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="utf-8">
<style>
p.MsoNormal { margin: 0; mso-style-name: "Normal"; }
</style>
</head>
<body>
<!--[if gte mso 9]><xml><o:OfficeDocumentSettings></o:OfficeDocumentSettings></xml><![endif]-->
<h1 style="mso-style-name:Heading1">Word heading</h1>
<p class="MsoNormal">A <b>bold</b> <i>italic</i> <u>under</u> <s>strike</s> <code>code</code> <a href="https://example.com/docs">link</a> paragraph.</p>
<ul style="mso-list:l0 level1 lfo1">
  <li>Parent</li>
  <ul style="mso-list:l0 level2 lfo1"><li>Nested</li></ul>
</ul>
<ol style="mso-list:l1 level1 lfo2"><li>First</li><li>Second</li></ol>
<blockquote style="mso-border-left-alt:solid">Quoted</blockquote>
<pre style="mso-element:code"><code>const n = 1;</code></pre>
<table>
  <tr><th>Head</th></tr>
  <tr><td>Cell</td></tr>
</table>
<img alt="Word shot" src="https://example.com/word.png">
</body>
</html>`.trim();

export const GOOGLE_DOCS_FIXTURE = `
<b id="docs-internal-guid-dev126" style="font-weight:normal">
  <h1 style="font-weight:normal"><span style="font-weight:400">Docs heading</span></h1>
  <p>
    <span>A </span>
    <span style="font-weight:700">bold</span>
    <span> </span>
    <span style="font-style:italic">italic</span>
    <span> </span>
    <span style="text-decoration:underline">under</span>
    <span> </span>
    <span style="text-decoration:line-through">strike</span>
    <span> </span>
    <span style="font-family:Consolas">code</span>
    <span> </span>
    <a href="https://example.com/docs"><span>link</span></a>
    <span> paragraph.</span>
  </p>
  <ul><li>Parent</li><ul><li>Nested</li></ul></ul>
  <ol><li>First</li><li>Second</li></ol>
  <blockquote>Quoted</blockquote>
  <pre><code>const n = 1;</code></pre>
  <table><tr><th>Head</th></tr><tr><td>Cell</td></tr></table>
  <img alt="Docs shot" src="https://example.com/docs.png">
</b>`.trim();

function nestedDivs(depth: number, core: string): string {
  let html = core;
  for (let index = 0; index < depth; index += 1) {
    html = `<div>${html}</div>`;
  }
  return html;
}

export const MALICIOUS_FIXTURE = `
<div>
  <script>alert("xss")</script>
  <img src="x" onerror="alert(1)" alt="picture">
  <span onclick="alert(2)">click</span>
  <a href="javascript:alert(1)">js</a>
  <a href="data:text/html,hi">data</a>
  <iframe src="https://evil.example"></iframe>
  <p style="background:url(javascript:alert(1))">styled</p>
  <svg><script>alert("svg")</script><text>svgtext</text></svg>
  ${nestedDivs(1000, "deep safe")}
</div>`.trim();
