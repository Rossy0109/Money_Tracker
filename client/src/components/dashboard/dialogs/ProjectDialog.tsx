import { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/dashboard/DashboardMetrics";

interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  setProjectName: (name: string) => void;
  onSubmit: (event: FormEvent) => void;
  isPending: boolean;
  /** Inline failure message (e.g. duplicate name) — keeps the dialog open. */
  error?: string | null;
}

export function ProjectDialog({
  open,
  onOpenChange,
  projectName,
  setProjectName,
  onSubmit,
  isPending,
  error,
}: ProjectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>নতুন আলাদা প্রজেক্ট</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <Field label="প্রজেক্টের নাম">
            <Input
              value={projectName}
              onChange={event => {
                setProjectName(event.target.value);
              }}
              placeholder="যেমন: নতুন ব্যবসা"
            />
          </Field>
          {error ? (
            <p className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            disabled={isPending}
            className="rounded-xl bg-primary hover:bg-primary/90"
          >
            তৈরি করুন
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
