// Built the way slate-dom setFragmentData does: JSON.stringify(editor.getFragment()),
// then btoa(encodeURIComponent(string)). Captured from this editor before paste.
export const PASTE_SLATE_FRAGMENT = [
  {
    type: "p",
    id: "src-a",
    children: [{ text: "Hello\nworld" }],
  },
  {
    type: "p",
    id: "src-b",
    children: [{ text: "Next" }],
  },
];
