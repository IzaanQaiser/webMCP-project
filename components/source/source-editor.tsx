"use client";

import { useState, type ChangeEvent } from "react";
import { FileUp, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  SourceSiteSchema,
  type DesignSession,
  type SourceSite,
} from "@/lib/domain";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import { SAMPLE_SOURCE_SITE } from "./sample-site";

type SessionUpdate = (
  updater: (session: DesignSession) => DesignSession,
) => void;

interface SourceEditorFormProps {
  initialSource: SourceSite | null;
  update: SessionUpdate;
}

interface EditorNotice {
  tone: "error" | "success";
  message: string;
}

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsText(file);
  });
}

function SourceEditorForm({ initialSource, update }: SourceEditorFormProps) {
  const [html, setHtml] = useState(initialSource?.html ?? "");
  const [css, setCss] = useState(initialSource?.css ?? "");
  const [notice, setNotice] = useState<EditorNotice | null>(null);

  const changeDraft = (
    setter: (value: string) => void,
    value: string,
  ) => {
    setter(value);
    setNotice(null);
  };

  const importFile = async (
    event: ChangeEvent<HTMLInputElement>,
    extension: ".html" | ".css",
    setter: (value: string) => void,
  ) => {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(extension)) {
      setNotice({
        tone: "error",
        message: `Choose a ${extension} file for this editor.`,
      });
      input.value = "";
      return;
    }

    try {
      setter(await readFileText(file));
      setNotice({
        tone: "success",
        message: `${file.name} loaded. Save source to keep it.`,
      });
    } catch {
      setNotice({ tone: "error", message: `Could not read ${file.name}.` });
    } finally {
      input.value = "";
    }
  };

  const saveSource = () => {
    const trimmedHtml = html.trim();
    const trimmedCss = css.trim();

    if (!trimmedHtml) {
      setNotice({ tone: "error", message: "HTML is required." });
      return;
    }

    if (!trimmedCss) {
      setNotice({ tone: "error", message: "CSS is required." });
      return;
    }

    const source = SourceSiteSchema.safeParse({
      html: trimmedHtml,
      css: trimmedCss,
    });

    if (!source.success) {
      setNotice({ tone: "error", message: "Source HTML and CSS are invalid." });
      return;
    }

    try {
      update((session) => ({ ...session, sourceSite: source.data }));
      setHtml(source.data.html);
      setCss(source.data.css);
      setNotice({ tone: "success", message: "Source saved." });
    } catch {
      setNotice({ tone: "error", message: "Source could not be saved." });
    }
  };

  const loadSample = () => {
    setHtml(SAMPLE_SOURCE_SITE.html);
    setCss(SAMPLE_SOURCE_SITE.css);
    setNotice({
      tone: "success",
      message: "Sample loaded. Save source to keep it.",
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-xs leading-5 text-muted-foreground">
          Static single-page HTML + CSS only. JavaScript and framework projects
          are not supported in this MVP.
        </p>
        <Button onClick={loadSample} size="sm" type="button" variant="outline">
          Load sample site
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-medium" htmlFor="source-html">
              HTML
            </label>
            <label
              className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              htmlFor="source-html-file"
            >
              <FileUp aria-hidden="true" className="size-3.5" />
              Import .html
            </label>
          </div>
          <Input
            accept=".html,text/html"
            aria-label="Import HTML file"
            className="sr-only"
            id="source-html-file"
            onChange={(event) => importFile(event, ".html", setHtml)}
            type="file"
          />
          <Textarea
            className="min-h-72 resize-y font-mono text-xs leading-5"
            id="source-html"
            onChange={(event) => changeDraft(setHtml, event.target.value)}
            placeholder="<main>...</main>"
            spellCheck={false}
            value={html}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-medium" htmlFor="source-css">
              CSS
            </label>
            <label
              className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              htmlFor="source-css-file"
            >
              <FileUp aria-hidden="true" className="size-3.5" />
              Import .css
            </label>
          </div>
          <Input
            accept=".css,text/css"
            aria-label="Import CSS file"
            className="sr-only"
            id="source-css-file"
            onChange={(event) => importFile(event, ".css", setCss)}
            type="file"
          />
          <Textarea
            className="min-h-72 resize-y font-mono text-xs leading-5"
            id="source-css"
            onChange={(event) => changeDraft(setCss, event.target.value)}
            placeholder="body { ... }"
            spellCheck={false}
            value={css}
          />
        </div>
      </div>

      <div className="flex min-h-8 flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div aria-live="polite">
          {notice ? (
            <p
              className={cn(
                "text-xs",
                notice.tone === "error"
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
              role={notice.tone === "error" ? "alert" : "status"}
            >
              {notice.message}
            </p>
          ) : null}
        </div>
        <Button onClick={saveSource} type="button">
          <Save aria-hidden="true" data-icon="inline-start" />
          Save source
        </Button>
      </div>
    </div>
  );
}

export function SourceEditor() {
  const { session, update } = useSession();

  return (
    <SourceEditorForm
      initialSource={session.sourceSite}
      key={session.id}
      update={update}
    />
  );
}
