import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/core/components/table";

export type DocProp = {
  name: string;
  type: string;
  default: string;
  description: string;
};

export type DocPropsProps = {
  /** The rows. Order is the order shown. */
  props: readonly DocProp[];
  /** Wraps the table to a screen reader, for example "NotionLikeEditorBlock props". */
  label: string;
};

/** A props table on the app's `Table` primitive. Types and defaults are monospace. */
export function DocProps({ props, label }: DocPropsProps) {
  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <Table aria-label={label}>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[30%]">Name</TableHead>
            <TableHead className="w-[30%]">Type</TableHead>
            <TableHead className="w-[22%]">Default</TableHead>
            <TableHead>Description</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.map((prop) => (
            <TableRow key={prop.name}>
              <TableCell className="text-foreground font-mono text-xs">{prop.name}</TableCell>
              <TableCell className="text-muted-foreground font-mono text-xs whitespace-normal">
                {prop.type}
              </TableCell>
              <TableCell className="text-muted-foreground font-mono text-xs whitespace-normal">
                {prop.default}
              </TableCell>
              <TableCell className="text-foreground/80 text-sm whitespace-normal">
                {prop.description}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
