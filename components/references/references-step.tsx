"use client";

import { useState } from "react";
import { ArrowLeft, Plus, Save, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  MAX_PENDING_REFERENCE_URLS,
  PendingReferenceUrlsSchema,
  type DesignSession,
} from "@/lib/domain";
import { useSession } from "@/lib/session";

interface ReferencesStepProps {
  onBack: () => void;
}

type SessionUpdate = (
  updater: (session: DesignSession) => DesignSession,
) => void;

function ReferencesForm({
  initialUrls,
  update,
  onBack,
}: {
  initialUrls: string[];
  update: SessionUpdate;
  onBack: () => void;
}) {
  const [urls, setUrls] = useState(
    initialUrls.length > 0 ? initialUrls : [""],
  );
  const [notice, setNotice] = useState<{
    tone: "error" | "success";
    message: string;
  } | null>(null);

  const changeUrl = (index: number, value: string) => {
    setUrls((current) =>
      current.map((url, currentIndex) =>
        currentIndex === index ? value : url,
      ),
    );
    setNotice(null);
  };

  const addUrl = () => {
    setUrls((current) =>
      current.length < MAX_PENDING_REFERENCE_URLS
        ? [...current, ""]
        : current,
    );
    setNotice(null);
  };

  const removeUrl = (index: number) => {
    setUrls((current) =>
      current.length > 1
        ? current.filter((_, currentIndex) => currentIndex !== index)
        : current,
    );
    setNotice(null);
  };

  const saveReferences = () => {
    if (urls.some((url) => url.trim().length === 0)) {
      setNotice({
        tone: "error",
        message: "Enter an HTTPS URL in every reference field.",
      });
      return;
    }

    const normalizedUrls = PendingReferenceUrlsSchema.safeParse(urls);

    if (!normalizedUrls.success) {
      setNotice({
        tone: "error",
        message:
          normalizedUrls.error.issues[0]?.message ??
          "References must be valid HTTPS URLs.",
      });
      return;
    }

    try {
      update((session) => ({
        ...session,
        pendingReferenceUrls: normalizedUrls.data,
      }));
      setUrls(normalizedUrls.data);
      setNotice({ tone: "success", message: "References saved." });
    } catch {
      setNotice({ tone: "error", message: "References could not be saved." });
    }
  };

  return (
    <Card className="shadow-xs">
      <CardHeader className="border-b">
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Step 02
          </p>
          <CardTitle className="text-lg">References</CardTitle>
          <CardDescription className="mt-1 max-w-2xl">
            Add inspiration sites now. After capture, you&apos;ll mark specific
            regions you like or dislike.
          </CardDescription>
        </div>
        <CardAction>
          <Button onClick={onBack} size="sm" type="button" variant="ghost">
            <ArrowLeft aria-hidden="true" data-icon="inline-start" />
            Source
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          {urls.map((url, index) => (
            <div className="flex items-center gap-2" key={index}>
              <div className="min-w-0 flex-1">
                <label
                  className="mb-1.5 block text-xs font-medium text-muted-foreground"
                  htmlFor={`reference-url-${index}`}
                >
                  Inspiration URL {index + 1}
                </label>
                <Input
                  autoComplete="url"
                  id={`reference-url-${index}`}
                  inputMode="url"
                  onChange={(event) => changeUrl(index, event.target.value)}
                  placeholder="https://example.com/"
                  type="url"
                  value={url}
                />
              </div>
              {index > 0 ? (
                <Button
                  aria-label={`Remove inspiration URL ${index + 1}`}
                  className="mt-5"
                  onClick={() => removeUrl(index)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <X aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          ))}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button
              disabled={urls.length >= MAX_PENDING_REFERENCE_URLS}
              onClick={addUrl}
              size="sm"
              type="button"
              variant="outline"
            >
              <Plus aria-hidden="true" data-icon="inline-start" />
              Add reference
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground">
              {urls.length} / {MAX_PENDING_REFERENCE_URLS}
            </span>
          </div>
          <Button onClick={saveReferences} type="button">
            <Save aria-hidden="true" data-icon="inline-start" />
            Save references
          </Button>
        </div>

        <div aria-live="polite" className="min-h-4">
          {notice ? (
            <p
              className={
                notice.tone === "error"
                  ? "text-xs text-destructive"
                  : "text-xs text-muted-foreground"
              }
              role={notice.tone === "error" ? "alert" : "status"}
            >
              {notice.message}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function ReferencesStep({ onBack }: ReferencesStepProps) {
  const { session, update } = useSession();

  return (
    <ReferencesForm
      initialUrls={session.pendingReferenceUrls}
      key={session.id}
      onBack={onBack}
      update={update}
    />
  );
}
