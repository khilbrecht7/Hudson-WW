import { useCallback } from "react";
import { useDropzone } from "react-dropzone";

interface Props {
  onFiles: (files: File[]) => void;
  existingFiles: File[];
  onRemoveFile: (index: number) => void;
  disabled?: boolean;
}

export default function UploadArea({ onFiles, existingFiles, onRemoveFile, disabled }: Props) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length > 0) onFiles(accepted);
    },
    [onFiles]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    disabled,
    multiple: true,
  });

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={[
          "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors",
          isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-400 hover:bg-gray-50",
          disabled ? "opacity-50 cursor-not-allowed" : "",
        ].join(" ")}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <UploadIcon />
          {isDragActive ? (
            <p className="text-blue-600 font-medium">Drop files here</p>
          ) : (
            <>
              <p className="font-medium text-gray-700">Drag & drop PDF files here</p>
              <p className="text-sm">or click to browse — supports multi-file and combined PDFs</p>
            </>
          )}
        </div>
      </div>

      {existingFiles.length > 0 && (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {existingFiles.map((file, i) => (
            <li key={`${file.name}-${i}`} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <div className="flex items-center gap-2 text-gray-700 min-w-0">
                <PdfIcon />
                <span className="truncate">{file.name}</span>
                <span className="text-gray-400 shrink-0">({formatBytes(file.size)})</span>
              </div>
              <button
                onClick={() => onRemoveFile(i)}
                className="ml-4 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                aria-label={`Remove ${file.name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadIcon() {
  return (
    <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg className="w-4 h-4 text-red-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
    </svg>
  );
}
