import type { ReactNode } from "react";
import { Code2, Eye } from "lucide-react";

import { cn } from "../lib/utils";
import { CodeBlock } from "./code-block";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

type ComponentDemoProps = {
  children: ReactNode;
  code: string;
  language?: string;
  className?: string;
  previewClassName?: string;
};

export function ComponentDemo({
  children,
  code,
  language = "tsx",
  className,
  previewClassName,
}: ComponentDemoProps) {
  return (
    <Tabs defaultValue="preview" className={cn("gap-3", className)}>
      <TabsList className="bg-background/80 border backdrop-blur">
        <TabsTrigger value="preview">
          <Eye />
          Preview
        </TabsTrigger>
        <TabsTrigger value="code">
          <Code2 />
          Code
        </TabsTrigger>
      </TabsList>
      <TabsContent value="preview">
        <div className="bg-secondary/30 flex min-h-72 items-center justify-center rounded-xl border p-6 sm:p-10">
          <div className={cn("w-full max-w-md", previewClassName)}>{children}</div>
        </div>
      </TabsContent>
      <TabsContent value="code">
        <CodeBlock code={code} language={language} />
      </TabsContent>
    </Tabs>
  );
}
