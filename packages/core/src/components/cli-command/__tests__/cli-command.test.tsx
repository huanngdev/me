import { beforeEach, describe, expect, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { CliCommand } from "../cli-command";

function textOf(html: string): string {
  return new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
}

async function mount(
  node: ReactNode,
): Promise<{ host: HTMLElement; unmount: () => Promise<void> }> {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(node);
  });

  return {
    host,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
      Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    },
  };
}

function trigger(host: HTMLElement, name: string): HTMLElement {
  const found = [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (element) => element.textContent === name,
  );
  if (found === undefined) {
    throw new Error(`No tab named ${name}`);
  }
  return found;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("CliCommand", () => {
  test("renders one tab per package manager and defaults to bun on the server", () => {
    const markup = renderToStaticMarkup(<CliCommand install="lucide-react" />);

    expect(markup.split('role="tab"').length - 1).toBe(4);
    expect(markup).toContain("npm</button>");
    expect(markup).toContain("pnpm</button>");
    expect(markup).toContain("yarn</button>");
    expect(markup).toContain("bun</button>");
    expect(textOf(markup)).toContain("$ bun add lucide-react");
    expect(textOf(markup)).not.toContain("npm install lucide-react");
  });

  test("switching the tab changes the shown command", async () => {
    const { host, unmount } = await mount(<CliCommand install="lucide-react" />);

    expect(host.textContent).toContain("$ bun add lucide-react");
    expect(trigger(host, "bun").getAttribute("aria-selected")).toBe("true");

    await act(async () => {
      trigger(host, "pnpm").dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 }),
      );
    });

    expect(host.textContent).toContain("$ pnpm add lucide-react");
    expect(host.textContent).not.toContain("bun add lucide-react");
    expect(trigger(host, "pnpm").getAttribute("aria-selected")).toBe("true");

    await unmount();
  });

  test("hides the prompt from assistive tech and from copied text", async () => {
    const { host, unmount } = await mount(<CliCommand execute="shadcn@latest add button" />);

    const prompt = host.querySelector('pre [aria-hidden="true"]');

    expect(prompt?.textContent).toBe("$ ");
    expect(prompt?.classList.contains("select-none")).toBe(true);
    expect(host.querySelector("code")?.textContent).toBe("$ bunx --bun shadcn@latest add button");

    await unmount();
  });

  test("renders a plain command without tabs", async () => {
    const { host, unmount } = await mount(
      <CliCommand command="git clone https://example.com/repo.git" />,
    );

    expect(host.querySelectorAll('[role="tab"]').length).toBe(0);
    expect(host.querySelector('[role="tablist"]')).toBeNull();
    expect(host.textContent).toContain("$ git clone https://example.com/repo.git");

    await unmount();
  });

  test("gives the plain command form a copy button too", async () => {
    const { host, unmount } = await mount(
      <CliCommand command="git clone https://example.com/repo.git" />,
    );

    const copy = host.querySelector<HTMLButtonElement>('button[aria-label="Copy command"]');

    expect(copy).not.toBeNull();
    expect(copy?.disabled).toBe(false);

    await unmount();
  });

  test("gives the tabbed form exactly one copy button", async () => {
    const { host, unmount } = await mount(<CliCommand install="lucide-react" />);

    expect(host.querySelectorAll('button[aria-label="Copy command"]').length).toBe(1);

    await unmount();
  });

  test("remembers the selection in localStorage across components", async () => {
    const { host, unmount } = await mount(
      <>
        <CliCommand install="lucide-react" />
        <CliCommand run="build" />
      </>,
    );

    await act(async () => {
      trigger(host, "yarn").dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 }),
      );
    });

    expect(host.textContent).toContain("$ yarn add lucide-react");
    expect(host.textContent).toContain("$ yarn build");
    expect(window.localStorage.getItem("package-manager")).toBe("yarn");

    await unmount();
  });

  test("falls back to the default when the stored value is unknown", async () => {
    window.localStorage.setItem("package-manager", "cargo");

    const { host, unmount } = await mount(
      <CliCommand install="lucide-react" defaultManager="npm" />,
    );

    expect(host.textContent).toContain("$ npm install lucide-react");

    await unmount();
  });
});
