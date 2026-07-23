import { useCallback, useId, useRef, useState } from 'react'

interface FilePickerProps {
  file: File | null
  onFile: (file: File | null) => void
  label?: string
  accept?: string
  disabled?: boolean
  hint?: string
}

export function FilePicker({
  file,
  onFile,
  label = 'Choose a file on this device',
  accept,
  disabled,
  hint = 'The file is read only in this app. It is never uploaded.',
}: FilePickerProps) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const takeFile = useCallback(
    (f: File | null) => {
      onFile(f)
    },
    [onFile],
  )

  return (
    <div className="file-picker">
      <label className="file-picker-label" htmlFor={id}>
        {label}
      </label>
      <div
        className={`file-drop${dragOver ? ' file-drop--active' : ''}${disabled ? ' file-drop--disabled' : ''}`}
        onDragEnter={e => {
          e.preventDefault()
          if (!disabled) setDragOver(true)
        }}
        onDragOver={e => {
          e.preventDefault()
          if (!disabled) setDragOver(true)
        }}
        onDragLeave={e => {
          e.preventDefault()
          setDragOver(false)
        }}
        onDrop={e => {
          e.preventDefault()
          setDragOver(false)
          if (disabled) return
          const f = e.dataTransfer.files?.[0] ?? null
          if (f) takeFile(f)
        }}
      >
        <p className="file-drop-text">
          {dragOver ? 'Drop to load' : 'Drag and drop a file here, or browse'}
        </p>
        <div className="file-picker-row">
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept={accept}
            disabled={disabled}
            onChange={e => {
              const f = e.target.files?.[0] ?? null
              takeFile(f)
            }}
          />
          {file && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={disabled}
              onClick={() => {
                takeFile(null)
                if (inputRef.current) inputRef.current.value = ''
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>
      {file && (
        <p className="file-picker-meta muted">
          {file.name} · {(file.size / 1024).toFixed(1)} KB · {file.type || 'unknown type'}
        </p>
      )}
      <p className="file-picker-hint muted">{hint}</p>
    </div>
  )
}
