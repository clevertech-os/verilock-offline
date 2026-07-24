import { useCallback, useId, useRef, useState } from 'react'
import { FileText, Replace, Trash2, Upload } from 'lucide-react'

interface FilePickerProps {
  file: File | null
  onFile: (file: File | null) => void
  disabled?: boolean
}

const iconMd = { size: 28, strokeWidth: 1.75 } as const
const iconSm = { size: 16, strokeWidth: 2.25 } as const

export function FilePicker({ file, onFile, disabled }: FilePickerProps) {
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
      <div
        className={`file-drop${dragOver ? ' file-drop--active' : ''}${disabled ? ' file-drop--disabled' : ''}${file ? ' file-drop--has-file' : ''}`}
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
        {!file ? (
          <div className="file-drop-idle">
            <Upload className="file-drop-icon" {...iconMd} aria-hidden />
            <p className="file-drop-text">
              {dragOver ? 'Drop to check' : 'Drop a file here, or browse'}
            </p>
            <input
              ref={inputRef}
              id={id}
              type="file"
              disabled={disabled}
              onChange={e => {
                const f = e.target.files?.[0] ?? null
                takeFile(f)
              }}
            />
          </div>
        ) : (
          <div className="file-drop-selected">
            <div className="file-drop-selected-row">
              <FileText className="file-drop-icon" {...iconSm} aria-hidden />
              <div className="file-drop-selected-meta">
                <strong className="file-drop-name">{file.name}</strong>
                <span className="muted">{(file.size / 1024).toFixed(1)} KB</span>
              </div>
            </div>
            <div className="file-picker-row">
              <label className="btn btn-ghost file-replace-label">
                <Replace {...iconSm} aria-hidden />
                Replace
                <input
                  ref={inputRef}
                  id={id}
                  type="file"
                  className="visually-hidden"
                  disabled={disabled}
                  onChange={e => {
                    const f = e.target.files?.[0] ?? null
                    takeFile(f)
                  }}
                />
              </label>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={disabled}
                onClick={() => {
                  takeFile(null)
                  if (inputRef.current) inputRef.current.value = ''
                }}
              >
                <Trash2 {...iconSm} aria-hidden />
                Clear
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
