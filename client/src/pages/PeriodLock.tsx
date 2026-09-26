import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useActiveProject } from "@/lib/activeProject";
import { Lock, Unlock, Loader2, Calendar } from "lucide-react";
import { useState, useMemo } from "react";
import { format, addMonths, subMonths, startOfMonth } from "date-fns";

interface PeriodLock {
  id: number;
  monthKey: string;
  lockedAt: Date;
  lockedBy: number;
  reason?: string | null;
}

export default function PeriodLock() {
  const { isAuthenticated } = useAuth();
  const {
    activeProjectId,
    projects,
    isLoading: projectsLoading,
    selectProject,
  } = useActiveProject();

  const utils = trpc.useUtils();

  const overview = trpc.finance.overview.useQuery(
    { projectId: activeProjectId ?? 0 },
    { enabled: isAuthenticated && activeProjectId !== null }
  );

  const periodLocksQuery = trpc.finance.getPeriodLocks.useQuery(
    { projectId: activeProjectId ?? 0 },
    { enabled: isAuthenticated && activeProjectId !== null }
  );

  const lockPeriodMutation = trpc.finance.lockPeriod.useMutation({
    onSuccess: () => {
      toast.success("পিরিয়ড লক করা হয়েছে");
      utils.finance.getPeriodLocks.invalidate({ projectId: activeProjectId! });
    },
    onError: err => toast.error(err.message || "লক করা যায়নি"),
  });

  const unlockPeriodMutation = trpc.finance.unlockPeriod.useMutation({
    onSuccess: () => {
      toast.success("পিরিয়ড আনলক করা হয়েছে");
      utils.finance.getPeriodLocks.invalidate({ projectId: activeProjectId! });
    },
    onError: err => toast.error(err.message || "আনলক করা যায়নি"),
  });

  const [lockMonth, setLockMonth] = useState<string>("");
  const [lockReason, setLockReason] = useState("");
  const [unlockConfirmMonth, setUnlockConfirmMonth] = useState<string | null>(
    null
  );

  const currentMonthKey = format(new Date(), "yyyy-MM");

  const monthRange = useMemo(() => {
    const months: string[] = [];
    const start = startOfMonth(subMonths(new Date(), 12));
    for (let i = 0; i < 24; i++) {
      const d = addMonths(start, i);
      months.push(format(d, "yyyy-MM"));
    }
    return months;
  }, []);

  const locks = periodLocksQuery.data ?? [];
  const lockedMonths = new Set(locks.map(l => l.monthKey));

  const formatMonth = (key: string) => {
    const [year, month] = key.split("-");
    return `${month}/${year}`;
  };

  const getMonthStatus = (key: string) => {
    if (lockedMonths.has(key))
      return { label: "লক করা", variant: "destructive" as const, icon: Lock };
    if (key === currentMonthKey)
      return { label: "চলতি", variant: "default" as const, icon: Calendar };
    return { label: "খোলা", variant: "secondary" as const, icon: Unlock };
  };

  const handleLock = (monthKey: string) => {
    setLockMonth(monthKey);
    setLockReason("");
  };

  const handleUnlock = (monthKey: string) => {
    setUnlockConfirmMonth(monthKey);
  };

  const confirmLock = () => {
    if (!lockMonth) return;
    lockPeriodMutation.mutate(
      {
        projectId: activeProjectId!,
        monthKey: lockMonth,
        reason: lockReason.trim() || undefined,
      },
      {
        onSuccess: () => {
          setLockMonth("");
          setLockReason("");
        },
      }
    );
  };

  const confirmUnlock = () => {
    if (!unlockConfirmMonth) return;
    unlockPeriodMutation.mutate(
      { projectId: activeProjectId!, monthKey: unlockConfirmMonth },
      { onSuccess: () => setUnlockConfirmMonth(null) }
    );
  };

  const projectSelector = projects.length ? (
    <label className="flex items-center gap-2 text-sm font-medium text-[#456257]">
      <span>প্রকল্প</span>
      <select
        aria-label="প্রকল্প নির্বাচন"
        value={activeProjectId ?? ""}
        onChange={event => selectProject(Number(event.target.value))}
        className="h-10 max-w-[240px] rounded-xl border border-[#d7e5da] bg-white px-3 text-[#173f36] outline-none focus:ring-2 focus:ring-[#8bd5a0]"
      >
        {projects.map((project: { id: number; name: string }) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
    </label>
  ) : null;

  if (overview.isLoading || projectsLoading || periodLocksQuery.isLoading) {
    return (
      <DashboardLayout>
        <main className="mx-auto w-full max-w-6xl space-y-7 pb-12">
          <div className="finance-card p-8 text-center text-sm text-[#668076]">
            পিরিয়ড লক লোড হচ্ছে…
          </div>
        </main>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <main className="mx-auto w-full max-w-6xl space-y-7 pb-12">
        <header className="rounded-[1.75rem] bg-[#eaf3ed] p-6 sm:p-8">
          <div className="flex flex-wrap gap-4 text-sm font-semibold text-[#28603c]">
            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-lg hover:text-[#173f36] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#54b86a]"
            >
              <Calendar className="h-4 w-4" />
              ড্যাশবোর্ডে ফিরুন
            </a>
          </div>
          <p className="section-kicker">অ্যাকাউন্টিং</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#173f36]">
            পিরিয়ড লক / আনলক
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5f786d]">
            হিসাবের পিরিয়ড লক করুন যাতে পুরনো লেনদেন পরিবর্তন করা যাবে না। শুধু
            অ্যাডমিন আনলক করতে পারবেন।
          </p>
          <div className="mt-5 flex flex-wrap gap-3">{projectSelector}</div>
        </header>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>মাস অনুযায়ী লক স্ট্যাটাস</CardTitle>
              <CardDescription>
                লাল = লক করা, নীল = চলতি মাস, ধূসর = খোলা
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {monthRange.map((monthKey: string) => {
                const status = getMonthStatus(monthKey);
                const isLocked = lockedMonths.has(monthKey);
                const isCurrent = monthKey === currentMonthKey;
                const isFuture = monthKey > currentMonthKey;

                return (
                  <div
                    key={monthKey}
                    className={`
                      p-3 rounded-xl border text-center transition-all
                      ${isLocked ? "border-red-200 bg-red-50" : isCurrent ? "border-blue-200 bg-blue-50" : "border-[#d8f2dd] bg-white"}
                      ${isFuture ? "opacity-60" : ""}
                    `}
                  >
                    <div className="font-mono text-sm font-semibold text-[#173f36]">
                      {formatMonth(monthKey)}
                    </div>
                    <Badge
                      variant={status.variant}
                      className="mt-1 w-full gap-1"
                    >
                      <status.icon className="h-3 w-3" /> {status.label}
                    </Badge>
                    <div className="mt-2 flex gap-1 justify-center">
                      {!isLocked && !isFuture && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => handleLock(monthKey)}
                          disabled={lockPeriodMutation.isPending}
                        >
                          <Lock className="h-3 w-3 mr-1" /> লক
                        </Button>
                      )}
                      {isLocked && (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => handleUnlock(monthKey)}
                          disabled={unlockPeriodMutation.isPending}
                        >
                          <Unlock className="h-3 w-3 mr-1" /> আনলক
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {lockMonth && (
          <Dialog
            open
            onOpenChange={open => {
              if (!open) {
                setLockMonth("");
                setLockReason("");
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  পিরিয়ড লক করুন: {formatMonth(lockMonth)}
                </DialogTitle>
                <DialogDescription>
                  এই মাসের লেনদেন আর কোনোভাবে যোগ/সংশোধন/মুছে ফেলা যাবে না।
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label htmlFor="lockReason">কারণ (ঐচ্ছিক)</Label>
                  <Input
                    id="lockReason"
                    placeholder="লক করার কারণ লিখুন..."
                    value={lockReason}
                    onChange={e => setLockReason(e.target.value)}
                    maxLength={300}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setLockMonth("");
                    setLockReason("");
                  }}
                  disabled={lockPeriodMutation.isPending}
                >
                  বাতিল
                </Button>
                <Button
                  variant="destructive"
                  onClick={confirmLock}
                  disabled={lockPeriodMutation.isPending}
                >
                  {lockPeriodMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Lock className="h-4 w-4 mr-2" />
                  )}{" "}
                  লক করুন
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {unlockConfirmMonth && (
          <Dialog
            open
            onOpenChange={open => {
              if (!open) setUnlockConfirmMonth(null);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  পিরিয়ড আনলক করুন: {formatMonth(unlockConfirmMonth)}
                </DialogTitle>
                <DialogDescription>
                  এই কাজটি hiruo করতে হবে। শুধু অ্যাডমিন করণীয়।
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setUnlockConfirmMonth(null)}
                >
                  বাতিল
                </Button>
                <Button
                  variant="destructive"
                  onClick={confirmUnlock}
                  disabled={unlockPeriodMutation.isPending}
                >
                  {unlockPeriodMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Unlock className="h-4 w-4 mr-2" />
                  )}{" "}
                  আনলক করুন
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>লক করা পিরিয়ডের বিস্তারিত</CardTitle>
          </CardHeader>
          <CardContent>
            {locks.length === 0 ? (
              <div className="text-center py-8 text-[#668076]">
                কোনো পিরিয়ড লক করা নেই
              </div>
            ) : (
              <div className="space-y-2">
                {locks.map(lock => (
                  <div
                    key={lock.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-red-100 bg-red-50"
                  >
                    <div className="flex items-center gap-3">
                      <Lock className="h-5 w-5 text-red-600" />
                      <div>
                        <div className="font-mono font-semibold text-[#173f36]">
                          {formatMonth(lock.monthKey)}
                        </div>
                        <div className="text-xs text-[#5f786d]">
                          লক করা:{" "}
                          {format(new Date(lock.lockedAt), "dd/MM/yyyy HH:mm")}
                        </div>
                        {lock.reason && (
                          <div className="text-xs text-[#5f786d] mt-1">
                            কারণ: {lock.reason}
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleUnlock(lock.monthKey)}
                      disabled={unlockPeriodMutation.isPending}
                    >
                      <Unlock className="h-3.5 w-3.5 mr-1" /> আনলক
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </DashboardLayout>
  );
}
