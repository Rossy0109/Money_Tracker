import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveProject } from "@/lib/activeProject";
import { trpc } from "@/lib/trpc";
import { Loader2, ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

const roleLabel: Record<string, string> = {
  owner: "মালিক",
  maker: "প্রস্তুতকারক",
  checker: "অনুমোদনকারী",
};

const statusLabel: Record<string, string> = {
  pending: "অপেক্ষমাণ",
  active: "সক্রিয়",
  declined: "প্রত্যাখ্যাত",
  revoked: "বাতিল",
};

export default function ProjectMembers() {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const { activeProjectId, selectProject } = useActiveProject();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"maker" | "checker">("checker");
  const projectId = activeProjectId ?? 0;

  const { data: projects = [] } = trpc.projects.list.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const ownedProjects = useMemo(
    () => projects.filter(project => project.role === "owner"),
    [projects]
  );
  const sharedProjects = useMemo(
    () => projects.filter(project => project.role !== "owner"),
    [projects]
  );

  const invitations = trpc.finance.projectInvitations.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const members = trpc.finance.projectMembers.useQuery(
    { projectId },
    { enabled: isAuthenticated && projectId > 0 }
  );

  const inviteMember = trpc.finance.inviteProjectMember.useMutation({
    onSuccess: async () => {
      toast.success("আমন্ত্রণ পাঠানো হয়েছে");
      setEmail("");
      setDisplayName("");
      await utils.finance.projectMembers.invalidate({ projectId });
    },
    onError: error => toast.error(error.message || "আমন্ত্রণ পাঠানো যায়নি"),
  });
  const acceptInvitation = trpc.finance.acceptProjectInvitation.useMutation({
    onSuccess: async () => {
      toast.success("আমন্ত্রণ গৃহীত হয়েছে");
      await Promise.all([
        utils.finance.projectInvitations.invalidate(),
        utils.projects.list.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message || "আমন্ত্রণ গ্রহণ করা যায়নি"),
  });
  const updateMember = trpc.finance.updateProjectMember.useMutation({
    onSuccess: async () => {
      toast.success("সদস্য হালনাগাদ হয়েছে");
      await utils.finance.projectMembers.invalidate({ projectId });
    },
    onError: error => toast.error(error.message || "হালনাগাদ করা যায়নি"),
  });

  const submitInvite = (event: FormEvent) => {
    event.preventDefault();
    if (!projectId) return;
    inviteMember.mutate({
      projectId,
      email: email.trim(),
      displayName: displayName.trim() || undefined,
      role,
    });
  };

  return (
    <DashboardLayout>
      <main className="space-y-5 sm:space-y-7">
        <header className="rounded-[1.75rem] bg-primary p-5 text-primary-foreground shadow-[0_20px_50px_rgba(18,60,50,.16)] sm:p-7">
          <p className="text-xs font-bold tracking-[.18em] text-positive">
            চার-চোখ নীতি
          </p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
            ভাউচার সদস্য
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#d6e9dc]">
            প্রস্তুতকারক ভাউচার তৈরি ও জমা দেয়; অনুমোদনকারী আলাদা অ্যাকাউন্ট
            থেকে অনুমোদন ও পোস্ট করে। হিসাবের তথ্য মালিকের হিসাবেই থাকে।
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersRound className="size-5" aria-hidden /> আমন্ত্রণ
            </CardTitle>
            <CardDescription>
              আপনার ইমেইলে আসা প্রজেক্ট আমন্ত্রণ গ্রহণ করুন।
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {invitations.data?.length ? (
              invitations.data.map(invite => (
                <div
                  key={invite.membershipId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{invite.projectName}</p>
                    <p className="text-sm text-muted-foreground">
                      ভূমিকা: {roleLabel[invite.role] ?? invite.role}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() =>
                      acceptInvitation.mutate({
                        membershipId: invite.membershipId,
                      })
                    }
                    disabled={acceptInvitation.isPending}
                  >
                    গ্রহণ করুন
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                কোনো অপেক্ষমাণ আমন্ত্রণ নেই।
              </p>
            )}
          </CardContent>
        </Card>

        {sharedProjects.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-5" aria-hidden /> শেয়ার করা
                হিসাবখাতা
              </CardTitle>
              <CardDescription>
                আপনি যে হিসাবখাতায় প্রস্তুতকারক বা অনুমোদনকারী হিসেবে যুক্ত।
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {sharedProjects.map(project => (
                <div
                  key={project.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
                >
                  <div>
                    <p className="font-semibold">{project.name}</p>
                    <Badge variant="secondary">
                      {roleLabel[project.role] ?? project.role}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => selectProject(project.id)}
                  >
                    <Link href="/vouchers">ভাউচার খুলুন</Link>
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {ownedProjects.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="size-5" aria-hidden /> সদস্য পরিচালনা
              </CardTitle>
              <CardDescription>
                আপনার হিসাবখাতায় প্রস্তুতকারক বা অনুমোদনকারী যোগ করুন।
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-1.5">
                <Label>হিসাবখাতা</Label>
                <Select
                  value={projectId ? String(projectId) : ""}
                  onValueChange={value => selectProject(Number(value))}
                >
                  <SelectTrigger aria-label="হিসাবখাতা নির্বাচন">
                    <SelectValue placeholder="হিসাবখাতা বাছুন" />
                  </SelectTrigger>
                  <SelectContent>
                    {ownedProjects.map(project => (
                      <SelectItem key={project.id} value={String(project.id)}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <form onSubmit={submitInvite} className="grid gap-3 sm:grid-cols-4">
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="member-email">ইমেইল</Label>
                  <Input
                    id="member-email"
                    type="email"
                    required
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    placeholder="member@example.com"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="member-name">নাম (ঐচ্ছিক)</Label>
                  <Input
                    id="member-name"
                    value={displayName}
                    onChange={event => setDisplayName(event.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>ভূমিকা</Label>
                  <Select
                    value={role}
                    onValueChange={value =>
                      setRole(value as "maker" | "checker")
                    }
                  >
                    <SelectTrigger aria-label="সদস্যের ভূমিকা">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="maker">প্রস্তুতকারক</SelectItem>
                      <SelectItem value="checker">অনুমোদনকারী</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-4">
                  <Button
                    type="submit"
                    disabled={
                      inviteMember.isPending || !projectId || !email.trim()
                    }
                  >
                    {inviteMember.isPending && (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    )}
                    আমন্ত্রণ পাঠান
                  </Button>
                </div>
              </form>

              <div className="space-y-2">
                {members.isLoading ? (
                  <p className="text-sm text-muted-foreground">
                    সদস্য তালিকা লোড হচ্ছে…
                  </p>
                ) : members.data?.length ? (
                  members.data.map(member => (
                    <div
                      key={member.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {member.userName ||
                            member.displayName ||
                            member.inviteeEmail}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {member.inviteeEmail}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">
                          {roleLabel[member.role] ?? member.role}
                        </Badge>
                        <Badge variant="outline">
                          {statusLabel[member.status] ?? member.status}
                        </Badge>
                        {member.status !== "revoked" && (
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={updateMember.isPending}
                            onClick={() =>
                              updateMember.mutate({
                                projectId,
                                membershipId: member.id,
                                status: "revoked",
                              })
                            }
                          >
                            বাতিল
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    এখনও কোনো সদস্য নেই।
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </DashboardLayout>
  );
}
