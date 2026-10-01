"use client";

import { deleteSourceAction } from "@/app/admin/(console)/sources/actions";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  sourceId: string;
  sourceName: string;
};

export function SourceDeleteButton({ sourceId, sourceName }: Props) {
  return (
    <form
      action={deleteSourceAction}
      className="inline"
      onSubmit={(event) => {
        const message = `Delete “${sourceName}” from the registry? This cannot be undone.`;
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      <input type="hidden" name="source_id" value={sourceId} />
      <button
        type="submit"
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive",
        )}
      >
        Delete
      </button>
    </form>
  );
}
