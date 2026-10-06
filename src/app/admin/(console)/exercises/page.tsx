import Link from "next/link";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
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
import { activeExerciseSuggestion, exerciseUpdateReasons } from "@/lib/exercise-rules";
import { listExercises, listExerciseUpdateEvidence } from "@/lib/exercises";
import { ListPager } from "@/components/admin/list-pager";
import { ListFilterForm } from "@/components/list-filter-form";
import { filterOptions, matchesFilters, paginate, parseListFilters } from "@/lib/list-filters";

export const metadata = { title: "Exercises" };

function range(start: Date | null, end: Date | null): string {
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");
  return start || end ? `${day(start)} → ${day(end)}` : "—";
}

/** Start month (observed, else announced) as YYYY-MM, for the month filter (as on /exercises). */
function startMonth(x: { observed_start_date: Date | null; announced_start_date: Date | null }): string | null {
  const d = x.observed_start_date ?? x.announced_start_date;
  return d ? d.toISOString().slice(0, 7) : null;
}

export default async function AdminExercisesPage({ searchParams }: PageProps<"/admin/exercises">) {
  await requireAdminPage();
  await connection();
  const [params, all, evidence] = await Promise.all([
    searchParams,
    listExercises(),
    listExerciseUpdateEvidence(),
  ]);
  // Exercises that need an update first; otherwise the list keeps its date order.
  const flagged = all
    .map((x) => ({
      ...x,
      updateReasons: exerciseUpdateReasons(x, activeExerciseSuggestion(x, evidence.get(x.id) ?? [])),
    }))
    .sort((a, b) => Number(b.updateReasons.length > 0) - Number(a.updateReasons.length > 0));
  const needUpdate = flagged.filter((x) => x.updateReasons.length > 0).length;

  const keyed = flagged.map((x) => ({ exercise: x, countries: x.countries, month: startMonth(x) }));
  const options = filterOptions(keyed);
  const filters = parseListFilters(params, options);
  const page = paginate(
    keyed.filter((k) => matchesFilters(k, filters)).map((k) => k.exercise),
    params.page,
  );
  const exercises = page.items;
  const searching = filters.country !== null || filters.month !== null;

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="meta-label mb-2">Admin · exercises</p>
          <h1 className="text-2xl font-semibold tracking-tight">Exercises</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {all.length === 1 ? "1 exercise" : `${all.length} exercises`}
            {needUpdate > 0 ? (
              <span className="text-foreground">
                {` · ${needUpdate} need${needUpdate === 1 ? "s" : ""} an update`}
              </span>
            ) : null}
          </p>
        </div>
        <Link href="/admin/exercises/new" className={buttonVariants()}>
          Add exercise
        </Link>
      </div>

      {all.length > 0 ? (
        <div className="mt-6">
          <ListFilterForm
            action="/admin/exercises"
            filters={filters}
            countries={options.countries}
            months={options.months}
          />
        </div>
      ) : null}

      {all.length === 0 ? (
        <div className="mt-8 border border-dashed border-border bg-surface-dark px-6 py-10 text-center">
          <p className="text-sm text-text-secondary">No exercises yet.</p>
        </div>
      ) : exercises.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">
          {searching ? "No exercises for this search." : "No exercises on this page."}
        </p>
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
                    {x.updateReasons.length > 0 ? (
                      <Badge variant="outline" className="ml-2 border-teal-blue text-foreground">
                        Needs update
                      </Badge>
                    ) : null}
                    {x.updateReasons.map((reason) => (
                      <span key={reason} className="mt-1 block text-text-muted">
                        {reason}
                      </span>
                    ))}
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
      <ListPager base="/admin/exercises" filters={filters} page={page} noun="exercises" />
    </section>
  );
}
