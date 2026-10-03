import type { ReactNode } from "react";
import { Code2, Eye, FileText } from "lucide-react";

import { cn } from "../lib/utils";
import { CodeBlock } from "./code-block";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

type ComponentDemoProps = {
  children: ReactNode;
  code: string;
  language?: string;
  className?: string;
  previewClassName?: string;
  llm?: string;
};

export function ComponentDemo({
  children,
  code,
  language = "tsx",
  className,
  previewClassName,
  llm,
}: ComponentDemoProps) {
  return (
    <Tabs defaultValue="preview" className={className}>
      <TabsList variant="line">
        <TabsTrigger value="preview">
          <Eye />
          Preview
        </TabsTrigger>
        <TabsTrigger value="code">
          <Code2 />
          Code
        </TabsTrigger>
        {llm ? (
          <TabsTrigger value="llm">
            <FileText />
            llm.txt
          </TabsTrigger>
        ) : null}
      </TabsList>
      <TabsContent value="preview" className="mt-2">
        <div className="flex min-h-72 items-center justify-center rounded-lg border p-6 sm:p-10">
          <div className={cn("w-full max-w-md", previewClassName)}>{children}</div>
        </div>
      </TabsContent>
      <TabsContent value="code" className="mt-2">
        <CodeBlock code={code} language={language} />
      </TabsContent>
      {llm ? (
        <TabsContent value="llm" className="mt-2">
          <CodeBlock code={llm} language="txt" />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
