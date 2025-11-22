
import React, { useState, useRef, useCallback } from 'react';
import type { SVGProps } from 'react';

// --- Helper Functions ---

/**
 * A utility function to combine class names, similar to `clsx` or `classnames`.
 * This is a common helper in Shadcn UI.
 */
type ClassValue = string | number | boolean | null | undefined | { [key: string]: boolean | undefined | null };

function cn(...inputs: ClassValue[]): string {
  const classes: string[] = [];

  inputs.forEach((input) => {
    if (!input) {
      return;
    }

    if (typeof input === 'string' || typeof input === 'number') {
      classes.push(String(input));
    } else if (typeof input === 'object' && !Array.isArray(input)) {
      // This handles the object syntax: { 'class-name': true }
      Object.keys(input).forEach((key) => {
        if (input[key]) {
          classes.push(key);
        }
      });
    }
  });

  return classes.join(' ');
}

/**
 * Formats a file size from bytes to a human-readable string (KB, MB, etc.).
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// --- Icons (Inlined SVGs from lucide-react) ---

const UploadCloud: React.FC<SVGProps<SVGSVGElement>> = ({ className, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cn('lucide lucide-upload-cloud', className)}
    {...props}
  >
    <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
    <path d="M12 12v9" />
    <path d="m16 16-4-4-4 4" />
  </svg>
);

const FileText: React.FC<SVGProps<SVGSVGElement>> = ({ className, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cn('lucide lucide-file-text', className)}
    {...props}
  >
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
    <path d="M10 9H8" />
  </svg>
);

const X: React.FC<SVGProps<SVGSVGElement>> = ({ className, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cn('lucide lucide-x', className)}
    {...props}
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

// --- Shadcn-like Components (Recreated with Tailwind) ---

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'rounded-lg border border-zinc-200 bg-white text-zinc-950 shadow-sm',
      'dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50',
      className,
    )}
    {...props}
  />
));
Card.displayName = 'Card';

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline';
  size?: 'default' | 'sm';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        'dark:ring-offset-zinc-950 dark:focus-visible:ring-zinc-300',
        {
          'bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-50/90':
            variant === 'default',
          'border border-zinc-200 bg-white hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-zinc-50':
            variant === 'outline',
        },
        {
          'h-10 px-4 py-2': size === 'default',
          'h-9 rounded-md px-3': size === 'sm',
        },
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

// --- Core Dropzone Component ---

// Define the allowed file types
const ALLOWED_FILE_TYPES: Record<string, string[]> = {
  'text/csv': ['.csv'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
};
const allowedTypesString = ".csv, .xls, .xlsx";

interface MultiFileDropzoneProps {
  value: File[];
  onChange: (files: File[]) => void;
  className?: string;
}

/**
 * Main component to handle file drop and selection.
 */
const MultiFileDropzone: React.FC<MultiFileDropzoneProps> = ({
  value,
  onChange,
  className,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --- File Validation Logic ---
  const validateAndSetFiles = (files: FileList) => {
    const accepted: File[] = [];
    const rejected: string[] = [];

    Array.from(files).forEach((file) => {
      // Check if file type is allowed
      if (ALLOWED_FILE_TYPES[file.type]) {
        accepted.push(file);
      } else {
        rejected.push(
          `File '${file.name}' is not allowed. Only .csv, .xls, or .xlsx files are accepted.`,
        );
      }
    });

    // Update the parent state with the new list of accepted files
    onChange?.([...(value || []), ...accepted]);
    // Set local state for rejected files to show errors
    setRejectedFiles(rejected);
  };

  // --- Event Handlers ---

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files) {
      validateAndSetFiles(files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      validateAndSetFiles(files);
    }
  };

  const removeFile = (index: number) => {
    if (!value) return;
    const newFiles = value.filter((_, i) => i !== index);
    onChange?.(newFiles);
  };

  return (
    <Card
      className={cn(
        'border-2 border-dashed border-zinc-300 dark:border-zinc-700',
        'transition-colors',' w-[80%]',
        isDragging && 'border-blue-500 dark:border-blue-400',
        className,
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <CardContent>
        <div className="flex flex-col items-center justify-center space-y-2 text-center">
          <UploadCloud className="h-12 w-12 text-zinc-400" />
          <div className="space-y-2">
            <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
              Drag 'n' drop files here
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Only {allowedTypesString} files are allowed.
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={allowedTypesString}
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            Or browse files
          </Button>
        </div>
      </CardContent>

      {value && value.length > 0 && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 p-4 w-full">
          <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-50 mb-2">
            Uploaded Files:
          </h4>
          <ul className="space-y-2">
            {value.map((file, index) => (
              <li
                key={index}
                className="flex items-center justify-between space-x-2 rounded-lg border border-zinc-200 dark:border-zinc-800 p-2"
              >
                <div className="flex items-center space-x-2 min-w-0">
                  <FileText className="h-5 w-5 shrink-0 text-zinc-500" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="p-1 rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                  aria-label="Remove file"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}




// --- Main App Component (Example Usage) ---

/**
 * This is the main component you will export and use in your application.
 * It holds the state for the files.
 */
export default function FileDropZone() {
    // This state will hold the list of accepted files
    const [files, setFiles] = useState<File[]>([]);
    
    const HandleCurrentStockFileUpload = async () => {
        const formData = new FormData();
        files.forEach( async (file) => {
        formData.append("current_stock_files", file);

        try {
        const response = await fetch('/api/update_undefined_strategies', {
            method: 'POST',
            body:formData
        });
        const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || "Failed to Update UNDEFINED strategies");
            }
          

        } catch (error) {
            console.error("Error in STI processing:", error);
        }
    });
    }


    const onFilesAdded = (newFiles: File[]) => {
        // 'newFiles' is the complete list of files
        setFiles(newFiles);
        // You can also perform uploads or other actions here
        console.log('Accepted files:', newFiles);
    };

    return (
        <div className="bg-zinc-50 dark:bg-zinc-900 h-auto w-full">
        <div className="mx-auto flex flex-col items-center">
            <MultiFileDropzone
            value={files}
            onChange={onFilesAdded}
            />
            
            <Button 
            className="mt-4" 
            onClick={HandleCurrentStockFileUpload}
            disabled={files.length === 0}
            >
            Upload {files.length} File(s)
            </Button>
        </div>
        </div>
    );
}