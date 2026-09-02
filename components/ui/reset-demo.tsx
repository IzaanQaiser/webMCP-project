"use client";

import { useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { AssetCleanupError, useSession } from "@/lib/session";

interface ResetDemoProps {
  onResetSettled: () => void;
}

export function ResetDemo({ onResetSettled }: ResetDemoProps) {
  const { reset } = useSession();
  const resetInFlight = useRef(false);
  const [open, setOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (resetInFlight.current) {
      return;
    }

    resetInFlight.current = true;
    setIsResetting(true);
    setResetError(null);

    try {
      await reset();
      onResetSettled();
    } catch (error) {
      if (error instanceof AssetCleanupError) {
        onResetSettled();
        setResetError(
          "Demo reset, but some saved image assets could not be removed.",
        );
      } else {
        setResetError("Demo reset failed. Please try again.");
      }
    } finally {
      resetInFlight.current = false;
      setIsResetting(false);
      setOpen(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {resetError ? (
        <p className="max-w-52 text-right text-xs leading-4 text-destructive" role="alert">
          {resetError}
        </p>
      ) : null}
      <AlertDialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!resetInFlight.current) {
            setOpen(nextOpen);
          }
        }}
      >
        <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
          <RotateCcw aria-hidden="true" data-icon="inline-start" />
          Reset Demo
        </AlertDialogTrigger>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Reset this demo?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the current session work and returns the workspace to
              its initial state.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isResetting}
              onClick={handleConfirm}
              variant="destructive"
            >
              {isResetting ? "Resetting…" : "Reset Demo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
