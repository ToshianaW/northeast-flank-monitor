import { connection } from "next/server";
import { ExerciseLogEntry } from "@/components/exercise-log-entry";
import { PageShell } from "@/components/page-shell";
import type { ExerciseStatus } from "@/lib/event-labels";
import { listPublishedExercises } from "@/lib/public-exercises";

export const metadata = { title: "Exercises" };

const GROUPS: Array<{ id: string; label: string; statuses: ExerciseStatus[] }> = [
  { id: "under-way", label: "Under way", statuses: ["ACTIVE", "EXTENDED", "CONCLUDING"] },
  { id: "announced", label: "Announced and upcoming", statuses: ["ANNOUNCED", "UPCOMING"] },
  { id: "concluded", label: "Concluded", statuses: ["CONCLUDED"] },
  { id: "unclear", label: "Unclear", statuses: ["UNCLEAR"] },
];

export default async function ExercisesPage() {
  await connection();
  const exercises = await listPublishedExercises();

  return (
    <PageShell
      eyebrow="Activity"
      title="Exercise tracker"
      intro={
        <p>
          Announced and observed exercises, with post-exercise reset status. Statuses are
          set by a reviewer and never change on their own when a date passes.
        </p>
      }
    >
      {exercises.length === 0 ? (
        <p className="text-base text-text-secondary">No exercises are published yet.</p>
      ) : (
        <div className="grid gap-10">
          {GROUPS.map((group) => {
            const items = exercises.filter((x) => group.statuses.includes(x.exercise_status));
            if (items.length === 0) return null;
            return (
              <section key={group.id} aria-labelledby={`group-${group.id}`}>
                <h2
                  id={`group-${group.id}`}
                  className="mb-4 text-base font-semibold text-foreground"
                >
                  {group.label}
                  <span className="ml-2 font-mono text-xs font-normal text-text-muted">
                    {items.length}
                  </span>
                </h2>
                <div className="grid gap-4">
                  {items.map((exercise) => (
                    <ExerciseLogEntry key={exercise.id} exercise={exercise} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
