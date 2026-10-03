import Link from "next/link";
import { connection } from "next/server";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdminPage } from "@/lib/admin-session";
import {
  EXERCISE_STATUS_LABELS,
  RESET_STATUS_LABELS,
  REVIEW_STATUS_LABELS,
} from "@/lib/event-labels";
import { listExercises } from "@/lib/exercises";

export const metadata = { title: "Exercises" };

function range(start: Date | null, end: Date | null): string {
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");
  return start || end ? `${day(start)} → ${day(end)}` : "—";
}

export default async function AdminExercisesPage() {
  await requireAdminPage();
  await connection();
  const exercises = await listExercises();

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="meta-label mb-2">Admin · exercises</p>
          <h1 className="text-2xl font-semibold tracking-tight">Exercises</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {exercises.length === 1 ? "1 exercise" : `${exercises.length} exercises`}
          </p>
        </div>
        <Link href="/admin/exercises/new" className={buttonVariants()}>
          Add exercise
        </Link>
      </div>

      {exercises.length === 0 ? (
        <div className="mt-8 border border-dashed border-border bg-surface-dark px-6 py-10 text-center">
          <p className="text-sm text-text-secondary">No exercises yet.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto border border-border bg-surface-dark">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="meta-label">Name</TableHead>
                <TableHead className="meta-label">Actor</TableHead>
                <TableHead className="meta-label">Status</TableHead>
                <TableHead className="meta-label">Review</TableHead>
                <TableHead className="meta-label">Announced</TableHead>
                <TableHead className="meta-label">Observed</TableHead>
                <TableHead className="meta-label">Overall reset</TableHead>
                <TableHead className="meta-label sr-only">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exercises.map((x) => (
                <TableRow key={x.id}>
                  <TableCell className="font-medium">{x.exercise_name}</TableCell>
                  <TableCell className="text-xs">{x.actor ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {EXERCISE_STATUS_LABELS[x.exercise_status]}
                  </TableCell>
                  <TableCell className="text-xs">{REVIEW_STATUS_LABELS[x.review_status]}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {range(x.announced_start_date, x.announced_end_date)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {range(x.observed_start_date, x.observed_end_date)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {RESET_STATUS_LABELS[x.post_exercise_reset]}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/admin/exercises/${x.id}/edit`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Edit
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
