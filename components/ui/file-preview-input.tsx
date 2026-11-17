"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";

type PreviewFile = { name: string; type: string; size: number; url?: string };

export function FilePreviewInput({
  label,
  name,
  accept,
  multiple = false,
  required = false,
}: {
  label: string;
  name: string;
  accept?: string;
  multiple?: boolean;
  required?: boolean;
}) {
  const [files, setFiles] = useState<PreviewFile[]>([]);
  useEffect(() => {
    const urls = files.map((file) => file.url).filter((url): url is string => Boolean(url));
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-ink">{label}</label>
      <input
        id={name}
        name={name}
        type="file"
        accept={accept}
        multiple={multiple}
        required={required}
        onChange={(event) => {
          const selected = Array.from(event.currentTarget.files ?? []);
          setFiles(selected.map((file) => ({
            name: file.name,
            type: file.type,
            size: file.size,
            url: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
          })));
        }}
        className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-surface-sunken file:px-2 file:py-1"
      />
      {files.length > 0 && <ul className="mt-2 flex flex-wrap gap-2" aria-live="polite">
        {files.map((file, index) => <li key={`${file.name}:${index}`} className="flex max-w-full items-center gap-2 rounded border border-border bg-surface p-2 text-xs">
          {file.url ? <img src={file.url} alt={`Preview of ${file.name}`} className="size-12 rounded object-cover" /> : <span aria-hidden className="grid size-12 place-items-center rounded bg-surface-sunken text-[10px]">{file.type.startsWith("video/") ? "VIDEO" : file.type === "application/pdf" ? "PDF" : "FILE"}</span>}
          <span className="max-w-48 truncate">{file.name}<span className="block text-ink-faint">{(file.size / 1024 / 1024).toFixed(2)} MB</span></span>
        </li>)}
      </ul>}
    </div>
  );
}
