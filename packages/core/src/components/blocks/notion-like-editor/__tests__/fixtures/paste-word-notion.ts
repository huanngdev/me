// Captured from editor.api.html.deserialize on platejs@53.3.15 in the browser.
// Word/Notion HTML: a paragraph with <br>, nested divs, and a sibling div.
export const PASTE_WORD_NOTION = [
  {
    type: "p",
    children: [
      {
        type: "p",
        children: [{ text: "Hello " }, { text: "bold" }, { text: "\nnext line" }],
      },
      {
        type: "p",
        children: [
          {
            type: "p",
            children: [{ text: "Nested inner" }],
          },
        ],
      },
      {
        type: "p",
        children: [{ text: "Sibling div" }],
      },
    ],
  },
];
