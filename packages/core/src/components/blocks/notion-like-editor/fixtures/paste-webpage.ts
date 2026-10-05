// Captured from editor.api.html.deserialize on platejs@53.3.15 in the browser.
// Web page HTML: h1, a paragraph with strong and a link, and a ul of two items.
// Unmatched blocks are paragraphs. The list element is a paragraph of item paragraphs.
export const PASTE_WEBPAGE = [
  {
    type: "p",
    children: [{ text: "Title" }],
  },
  {
    type: "p",
    children: [{ text: "Para with " }, { text: "bold" }, { text: " and " }, { text: "link" }],
  },
  {
    type: "p",
    children: [
      {
        type: "p",
        children: [{ text: "One" }],
      },
      {
        type: "p",
        children: [{ text: "Two" }],
      },
    ],
  },
];
