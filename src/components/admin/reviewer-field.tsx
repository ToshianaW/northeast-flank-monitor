import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  defaultValue?: string | null;
  error?: string;
};

export function ReviewerField({ defaultValue, error }: Props) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="reviewer">Reviewer name</Label>
      <Input
        id="reviewer"
        name="reviewer"
        defaultValue={defaultValue ?? ""}
        required
        maxLength={120}
        autoComplete="name"
        aria-invalid={error ? true : undefined}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
