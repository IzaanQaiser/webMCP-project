"use client";

import { useMemo } from "react";
import { Monitor } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSession } from "@/lib/session";

import { buildSourcePreviewDocument } from "./build-preview-document";

export function SourcePreview() {
  const { session } = useSession();
  const source = session.sourceSite;
  const previewDocument = useMemo(
    () => (source ? buildSourcePreviewDocument(source) : null),
    [source],
  );

  return (
    <Card className="shadow-xs">
      <CardHeader className="border-b">
        <div>
          <CardTitle>Source preview</CardTitle>
          <CardDescription className="mt-1">
            Sandboxed desktop canvas from the last saved source.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {previewDocument ? (
          <div className="overflow-x-auto rounded-lg border bg-muted/50 p-3">
            <div className="min-w-[60rem] overflow-hidden rounded-md border bg-white shadow-xs">
              <iframe
                className="block h-[38rem] w-full bg-white"
                referrerPolicy="no-referrer"
                sandbox=""
                srcDoc={previewDocument}
                title="Saved source site preview"
              />
            </div>
          </div>
        ) : (
          <div className="flex min-h-36 items-center justify-center rounded-lg border border-dashed bg-muted/30 px-6 text-center">
            <div className="max-w-sm">
              <Monitor
                aria-hidden="true"
                className="mx-auto size-5 text-muted-foreground"
              />
              <p className="mt-3 text-sm font-medium">No saved source yet</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Save HTML and CSS in the Source editor to see it here.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
