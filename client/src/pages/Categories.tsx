import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { useActiveProject } from "@/lib/activeProject";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Plus, Tags, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Link, useRoute } from "wouter";

type CategoryType = "income" | "expense";

const copy: Record<
  CategoryType,
  {
    eyebrow: string;
    title: string;
    description: string;
    icon: typeof TrendingUp;
    accent: string;
  }
> = {
  income: {
    eyebrow: "আয়ের ক্যাটাগরি",
    title: "আয়ের ধরনসমূহ",
    description: "আপনার আয়ের লেনদেন যোগ করার সময় এই ক্যাটাগরিগুলো বেছে নিন।",
    icon: TrendingUp,
    accent: "bg-muted text-positive",
  },
  expense: {
    eyebrow: "ব্যয়ের ক্যাটাগরি",
    title: "ব্যয়ের ধরনসমূহ",
    description: "আপনার ব্যয়ের লেনদেন যোগ করার সময় এই ক্যাটাগরিগুলো বেছে নিন।",
    icon: TrendingDown,
    accent: "bg-[#fff0ed] text-destructive",
  },
};

function LoadingState() {
  return (
    <div className="finance-card p-8 text-center text-sm text-muted-foreground">
      ক্যাটাগরি লোড হচ্ছে…
    </div>
  );
}

export default function Categories() {
  const { isAuthenticated } = useAuth();
  const [, params] = useRoute("/categories/:type");
  const selectedType =
    params?.type === "income" || params?.type === "expense"
      ? params.type
      : null;
  const {
    activeProjectId,
    projects,
    isLoading: projectsLoading,
    selectProject,
  } = useActiveProject();
  const overview = trpc.finance.overview.useQuery(
    { projectId: activeProjectId ?? 0 },
    { enabled: isAuthenticated && activeProjectId !== null }
  );

  const categories = overview.data?.categories ?? [];
  const incomeCategories = categories.filter(
    category => category.type === "income"
  );
  const expenseCategories = categories.filter(
    category => category.type === "expense"
  );
  const utils = trpc.useUtils();
  const [newName, setNewName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const addCategory = trpc.finance.addCategory.useMutation({
    onSuccess: () => {
      setNewName("");
      setFormError(null);
      void utils.finance.overview.invalidate();
    },
    onError: error => setFormError(error.message),
  });
  const deleteCategory = trpc.finance.deleteCategory.useMutation({
    onSuccess: () => {
      setFormError(null);
      void utils.finance.overview.invalidate();
    },
    onError: error => setFormError(error.message),
  });

  const projectSelector = projects.length ? (
    <label className="flex items-center gap-2 text-sm font-medium text-foreground">
      <span>প্রকল্প</span>
      <select
        aria-label="প্রকল্প নির্বাচন"
        value={activeProjectId ?? ""}
        onChange={event => selectProject(Number(event.target.value))}
        className="h-10 max-w-[240px] rounded-xl border border-border bg-card px-3 text-foreground outline-none focus:ring-2 focus:ring-ring"
      >
        {projects.map((project: { id: number; name: string }) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
    </label>
  ) : null;

  if (!selectedType) {
    return (
      <DashboardLayout>
        <main className="mx-auto w-full max-w-6xl space-y-7 pb-12">
          <header className="rounded-[1.75rem] bg-muted p-6 sm:p-8">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-positive hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="h-4 w-4" />
              ড্যাশবোর্ডে ফিরুন
            </Link>
            <p className="section-kicker">ক্যাটাগরি</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
              আয় ও ব্যয়ের ক্যাটাগরি
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              সবকিছু একসঙ্গে না রেখে আয়ের ও ব্যয়ের ক্যাটাগরিগুলো আলাদা পৃষ্ঠায়
              সাজানো হয়েছে।
            </p>
            <div className="mt-5">{projectSelector}</div>
          </header>
          {overview.isLoading || projectsLoading ? (
            <LoadingState />
          ) : (
            <section className="grid gap-5 md:grid-cols-2">
              <CategoryLink type="income" count={incomeCategories.length} />
              <CategoryLink type="expense" count={expenseCategories.length} />
            </section>
          )}
        </main>
      </DashboardLayout>
    );
  }

  const details = copy[selectedType];
  const Icon = details.icon;
  const selectedCategories =
    selectedType === "income" ? incomeCategories : expenseCategories;
  const otherType: CategoryType =
    selectedType === "income" ? "expense" : "income";

  return (
    <DashboardLayout>
      <main className="mx-auto w-full max-w-6xl space-y-7 pb-12">
        <header className="rounded-[1.75rem] bg-muted p-6 sm:p-8">
          <div className="flex flex-wrap gap-4 text-sm font-semibold text-positive">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="h-4 w-4" />
              ড্যাশবোর্ডে ফিরুন
            </Link>
            <Link
              href="/categories"
              className="inline-flex items-center gap-2 rounded-lg hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Tags className="h-4 w-4" />
              সব ক্যাটাগরি
            </Link>
          </div>
          <div className="mt-5 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="section-kicker">{details.eyebrow}</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                {details.title}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                {details.description}
              </p>
            </div>
            {projectSelector}
          </div>
        </header>

        <section
          aria-label="নতুন ক্যাটাগরি যোগ করুন"
          className="finance-card space-y-3 p-5"
        >
          <h2 className="font-semibold text-foreground">
            নতুন {selectedType === "income" ? "আয়ের" : "ব্যয়ের"} ক্যাটাগরি যোগ
            করুন
          </h2>
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={event => {
              event.preventDefault();
              if (activeProjectId === null) return;
              addCategory.mutate({
                projectId: activeProjectId,
                type: selectedType,
                name: newName,
              });
            }}
          >
            <input
              aria-label="ক্যাটাগরির নাম"
              value={newName}
              onChange={event => setNewName(event.target.value)}
              placeholder="যেমন: ফ্রিল্যান্সিং"
              maxLength={120}
              className="h-11 flex-1 rounded-xl border border-border bg-card px-3 text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
            <Button
              type="submit"
              disabled={addCategory.isPending || !newName.trim()}
              className="h-11 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="mr-2 h-4 w-4" />
              যোগ করুন
            </Button>
          </form>
          {formError ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {formError}
            </p>
          ) : null}
        </section>

        {overview.isLoading || projectsLoading ? (
          <LoadingState />
        ) : selectedCategories.length ? (
          <section
            aria-label={details.title}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {selectedCategories.map(category => (
              <article
                key={category.id}
                className="finance-card flex min-h-32 items-center gap-4 p-5"
              >
                <span
                  className={`grid h-11 w-11 place-items-center rounded-2xl ${details.accent}`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">
                    {category.name}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedType === "income"
                      ? "আয়ের লেনদেন"
                      : "ব্যয়ের লেনদেন"}
                  </p>
                </div>
                {category.isDefault ? null : (
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={`${category.name} মুছুন`}
                    disabled={deleteCategory.isPending}
                    onClick={() => {
                      if (activeProjectId === null) return;
                      deleteCategory.mutate({
                        projectId: activeProjectId,
                        id: category.id,
                      });
                    }}
                    className="rounded-xl border-[#f0d4cd] text-destructive hover:bg-[#fff0ed]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </article>
            ))}
          </section>
        ) : (
          <div className="finance-card p-8 text-center text-sm text-muted-foreground">
            এই প্রকল্পে এখনো কোনো ক্যাটাগরি নেই।
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            অন্য ধরনের ক্যাটাগরিও আলাদা পৃষ্ঠায় দেখুন।
          </p>
          <Button
            asChild
            variant="outline"
            className="rounded-xl border-border text-positive"
          >
            <Link href={`/categories/${otherType}`}>
              {otherType === "income" ? "আয়ের ক্যাটাগরি" : "ব্যয়ের ক্যাটাগরি"}
            </Link>
          </Button>
        </div>
      </main>
    </DashboardLayout>
  );
}

function CategoryLink({ type, count }: { type: CategoryType; count: number }) {
  const details = copy[type];
  const Icon = details.icon;
  return (
    <Link
      href={`/categories/${type}`}
      className="finance-card group block p-6 transition hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(21,64,51,.10)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className={`grid h-12 w-12 place-items-center rounded-2xl ${details.accent}`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-5 section-kicker">{details.eyebrow}</p>
      <h2 className="mt-2 text-xl font-semibold text-foreground">
        {details.title}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{count}টি ক্যাটাগরি দেখুন</p>
      <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-positive">
        আলাদা পৃষ্ঠায় যান <ArrowLeft className="h-4 w-4 rotate-180" />
      </span>
    </Link>
  );
}
