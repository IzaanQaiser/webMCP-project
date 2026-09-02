"use client";

import { useState } from "react";
import { CircleDot, Layers3 } from "lucide-react";

import { SourceEditor } from "@/components/source/source-editor";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ResetDemo } from "@/components/ui/reset-demo";
import {
  WorkspaceContainer,
  WorkspaceHeader,
  WorkspaceMain,
  WorkspaceShell,
} from "@/components/ui/workspace-shell";

const workflowSteps = [
  "Source",
  "References",
  "Calibrate",
  "Contract",
  "Redesign",
  "Refine",
] as const;

type WorkflowStep = (typeof workflowSteps)[number];

export function WorkspaceContent({
  initialStep = "Source",
}: {
  initialStep?: WorkflowStep;
}) {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>(initialStep);

  return (
    <WorkspaceShell>
      <WorkspaceHeader>
        <WorkspaceContainer className="flex h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-foreground text-background shadow-xs">
              <Layers3 aria-hidden="true" className="size-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">
                Design workspace
              </p>
              <p className="truncate text-xs text-muted-foreground">
                Visual direction system
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="hidden bg-background text-muted-foreground sm:inline-flex"
            >
              Static preview
            </Badge>
            <ResetDemo onResetSettled={() => setCurrentStep("Source")} />
          </div>
        </WorkspaceContainer>
      </WorkspaceHeader>

      <WorkspaceContainer>
        <WorkspaceMain>
          <section className="max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              Workspace
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Shape a clear visual direction.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              Move from raw source material to a refined design through one
              focused, deliberate workflow.
            </p>
          </section>

          <nav aria-label="Workflow progress" className="mt-8 border-y py-4">
            <ol className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6 lg:gap-2">
              {workflowSteps.map((step, index) => {
                const isCurrent = step === currentStep;

                return (
                  <li
                    key={step}
                    aria-current={isCurrent ? "step" : undefined}
                    className="flex min-w-0 items-center gap-2.5"
                  >
                    <span
                      className={
                        isCurrent
                          ? "flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background"
                          : "flex size-6 shrink-0 items-center justify-center rounded-full border bg-background text-[11px] font-medium text-muted-foreground"
                      }
                    >
                      {index + 1}
                    </span>
                    <span
                      className={
                        isCurrent
                          ? "truncate text-sm font-medium"
                          : "truncate text-sm text-muted-foreground"
                      }
                    >
                      {step}
                    </span>
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="mt-8 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <Card className="min-h-[26rem] shadow-xs">
              <CardHeader className="border-b">
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Step 01
                  </p>
                  <CardTitle className="text-lg">Source</CardTitle>
                  <CardDescription className="mt-1">
                    Establish the material that anchors the workflow.
                  </CardDescription>
                </div>
                <CardAction>
                  <Badge>Current</Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="flex-1 py-5">
                <SourceEditor />
              </CardContent>
            </Card>

            <Card size="sm" className="shadow-xs">
              <CardHeader className="border-b">
                <CardTitle>Workflow status</CardTitle>
                <CardDescription>Your current position at a glance.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="font-medium">Progress</span>
                    <span className="tabular-nums text-muted-foreground">1 of 6</span>
                  </div>
                  <div
                    aria-label="Workflow is one of six steps complete"
                    className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                    role="img"
                  >
                    <div className="h-full w-1/6 rounded-full bg-foreground" />
                  </div>
                </div>
                <div className="border-t pt-4">
                  <div className="flex items-start gap-2.5">
                    <CircleDot
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-foreground"
                    />
                    <div>
                      <p className="text-sm font-medium">Source is active</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        The remaining stages are queued in sequence.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </WorkspaceMain>
      </WorkspaceContainer>
    </WorkspaceShell>
  );
}

export default function Home() {
  return <WorkspaceContent />;
}
