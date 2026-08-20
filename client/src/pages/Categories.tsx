import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { persistPreferredProjectId, preferredProjectId } from "@/lib/activeProject";
import { ArrowLeft, CircleDollarSign, Tags, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { useRoute } from "wouter";

type CategoryType = "income" | "expense";

const copy: Record<CategoryType, { eyebrow: string; title: string; description: string; icon: typeof TrendingUp; accent: string }> = {
  income: {
    eyebrow: "আয়ের ক্যাটাগরি",
    title: "আয়ের ধরনসমূহ",
    description: "আপনার আয়ের লেনদেন যোগ করার সময় এই ক্যাটাগরিগুলো বেছে নিন।",
    icon: TrendingUp,
    accent: "bg-[#e7f7ec] text-[#197341]",
  },
  expense: {
    eyebrow: "ব্যয়ের ক্যাটাগরি",
    title: "ব্যয়ের ধরনসমূহ",
    description: "আপনার ব্যয়ের লেনদেন যোগ করার সময় এই ক্যাটাগরিগুলো বেছে নিন।",
    icon: TrendingDown,
    accent: "bg-[#fff0ed] text-[#b54a35]",
  },
};

function LoadingState() {
  return <div className="finance-card p-8 text-center text-sm text-[#668076]">ক্যাটাগরি লোড হচ্ছে…</div>;
}

export default function Categories() {
  const { isAuthenticated, user } = useAuth();
  const [, params] = useRoute("/categories/:type");
  const selectedType = params?.type === "income" || params?.type === "expense" ? params.type : null;
  const projects = trpc.projects.list.useQuery(undefined, { enabled: isAuthenticated });
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const overview = trpc.finance.overview.useQuery(
    { projectId: activeProjectId ?? 0 },
    { enabled: isAuthenticated && activeProjectId !== null }
  );

  useEffect(() => {
    if (!activeProjectId && projects.data?.length) {
      const projectId = preferredProjectId(user?.id, projects.data);
      if (projectId) setActiveProjectId(projectId);
    }
  }, [activeProjectId, projects.data, user?.id]);

  function selectActiveProject(projectId: number) {
    setActiveProjectId(projectId);
    persistPreferredProjectId(user?.id, projectId);
  }

  const categories = overview.data?.categories ?? [];
  const incomeCategories = categories.filter(category => category.type === "income");
  const expenseCategories = categories.filter(category => category.type === "expense");

  const projectSelector = projects.data?.length ? (
    <label className="flex items-center gap-2 text-sm font-medium text-[#456257]">
      <span>প্রকল্প</span>
      <select
        aria-label="প্রকল্প নির্বাচন"
        value={activeProjectId ?? ""}
        onChange={event => selectActiveProject(Number(event.target.value))}
        className="h-10 max-w-[240px] rounded-xl border border-[#d7e5da] bg-white px-3 text-[#173f36] outline-none focus:ring-2 focus:ring-[#8bd5a0]"
      >
        {projects.data.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
    </label>
  ) : null;

  if (!selectedType) {
    return (
      <DashboardLayout>
        <div className="mx-auto w-full max-w-6xl space-y-7 pb-12">
          <header className="rounded-[1.75rem] bg-[#eaf3ed] p-6 sm:p-8">
            <a href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#28603c] hover:text-[#173f36]"><ArrowLeft className="h-4 w-4" />ড্যাশবোর্ডে ফিরুন</a>
            <p className="section-kicker">ক্যাটাগরি</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#173f36]">আয় ও ব্যয়ের ক্যাটাগরি</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5f786d]">সবকিছু একসঙ্গে না রেখে আয়ের ও ব্যয়ের ক্যাটাগরিগুলো আলাদা পৃষ্ঠায় সাজানো হয়েছে।</p>
            <div className="mt-5">{projectSelector}</div>
          </header>
          {overview.isLoading || projects.isLoading ? <LoadingState /> : (
            <section className="grid gap-5 md:grid-cols-2">
              <CategoryLink type="income" count={incomeCategories.length} />
              <CategoryLink type="expense" count={expenseCategories.length} />
            </section>
          )}
        </div>
      </DashboardLayout>
    );
  }

  const details = copy[selectedType];
  const Icon = details.icon;
  const selectedCategories = selectedType === "income" ? incomeCategories : expenseCategories;
  const otherType: CategoryType = selectedType === "income" ? "expense" : "income";

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-6xl space-y-7 pb-12">
        <header className="rounded-[1.75rem] bg-[#eaf3ed] p-6 sm:p-8">
          <div className="flex flex-wrap gap-4 text-sm font-semibold text-[#28603c]">
            <a href="/" className="inline-flex items-center gap-2 hover:text-[#173f36]"><ArrowLeft className="h-4 w-4" />ড্যাশবোর্ডে ফিরুন</a>
            <a href="/categories" className="inline-flex items-center gap-2 hover:text-[#173f36]"><Tags className="h-4 w-4" />সব ক্যাটাগরি</a>
          </div>
          <div className="mt-5 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="section-kicker">{details.eyebrow}</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#173f36]">{details.title}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5f786d]">{details.description}</p>
            </div>
            {projectSelector}
          </div>
        </header>

        {overview.isLoading || projects.isLoading ? <LoadingState /> : selectedCategories.length ? (
          <section aria-label={details.title} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {selectedCategories.map(category => (
              <article key={category.id} className="finance-card flex min-h-32 items-center gap-4 p-5">
                <span className={`grid h-11 w-11 place-items-center rounded-2xl ${details.accent}`}><Icon className="h-5 w-5" /></span>
                <div>
                  <p className="font-semibold text-[#183d34]">{category.name}</p>
                  <p className="mt-1 text-sm text-[#668076]">{selectedType === "income" ? "আয়ের লেনদেন" : "ব্যয়ের লেনদেন"}</p>
                </div>
              </article>
            ))}
          </section>
        ) : <div className="finance-card p-8 text-center text-sm text-[#668076]">এই প্রকল্পে এখনো কোনো ক্যাটাগরি নেই।</div>}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d7e5da] bg-white p-4">
          <p className="text-sm text-[#5f786d]">অন্য ধরনের ক্যাটাগরিও আলাদা পৃষ্ঠায় দেখুন।</p>
          <Button asChild variant="outline" className="rounded-xl border-[#b8d8be] text-[#28603c]"><a href={`/categories/${otherType}`}>{otherType === "income" ? "আয়ের ক্যাটাগরি" : "ব্যয়ের ক্যাটাগরি"}</a></Button>
        </div>
      </div>
    </DashboardLayout>
  );
}

function CategoryLink({ type, count }: { type: CategoryType; count: number }) {
  const details = copy[type];
  const Icon = details.icon;
  return (
    <a href={`/categories/${type}`} className="finance-card group block p-6 transition hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(21,64,51,.10)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#54b86a]">
      <span className={`grid h-12 w-12 place-items-center rounded-2xl ${details.accent}`}><Icon className="h-5 w-5" /></span>
      <p className="mt-5 section-kicker">{details.eyebrow}</p>
      <h2 className="mt-2 text-xl font-semibold text-[#173f36]">{details.title}</h2>
      <p className="mt-2 text-sm text-[#668076]">{count}টি ক্যাটাগরি দেখুন</p>
      <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#28603c]">আলাদা পৃষ্ঠায় যান <ArrowLeft className="h-4 w-4 rotate-180" /></span>
    </a>
  );
}
